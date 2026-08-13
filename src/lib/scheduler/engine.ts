// GoKoreaMate / gokoreamate.com — Scheduler Engine
// TASK-013: Rule-based Scheduler v1
// 7-module pipeline orchestrator: Anchor → Event → Greedy → Affiliate → Timeline

import type {
  SchedulerInput,
  SchedulerResult,
  ScheduledItem,
  NearMeCandidate,
  Coordinate,
} from "./types.ts";
import { SCHEDULER_VERSION } from "./constants.ts";
import { timeToMinutes, minutesToTime } from "./utils.ts";
import { placeAnchors, placeFixedEvents, collectAnchorPlaceIds } from "./anchor-placer.ts";
import { prepareGreedyCandidates } from "./candidate-filter.ts";
import { ZoneTracker } from "./zone-tracker.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";
import { resolveStayMinutes } from "./slot-allocator.ts";
import { PriorityQueue } from "./priority-queue.ts";
import { profileBias, PROFILE_MAX_BONUS } from "./profile-bias.ts";
import {
  activeMealWindows, canPlaceAutoMeal, isFoodCategory, mealWindowAt, type MealKind,
} from "./meal-opportunity.ts";
import { injectAffiliates } from "./affiliate-injector.ts";
import { buildTimeline, findFreeGaps } from "./timeline-builder.ts";
import {
  hc1NoDuplicate,
  hc3TravelFits,
  hc4StayFits,
  hc6WithinDayWindow,
  hc7MaxItems,
  hc8FixedEgressFits,
} from "./constraint-validator.ts";

// ─── Greedy Candidate with adjusted score ────────────────────────────────────

interface ScoredCandidate extends NearMeCandidate {
  /** 실제 배치 시각(분). 식사 기회로 미뤄진 경우 gap 앞머리가 아니다. */
  start_minutes_resolved?: number;
  adjusted_score: number;
  travel_minutes: number;
  stay_minutes_resolved: number;
}

// TASK-057-A: Penalise candidates far from the previous placed item so the
// scheduler naturally clusters nearby places. Uses travel time (already computed
// for HC-3/HC-4) as a distance proxy — avoids a second haversine call.
// My Picks (score=999) remain above NearMe even at max penalty (999-90 = 909
// vs NearMe max ≈ 205), so they are never deprioritised below NearMe items.
function consecutiveDistancePenalty(travelMinutes: number): number {
  if (travelMinutes <=  8) return   0;  // ≤500m  — walkable, no penalty
  if (travelMinutes <= 15) return  20;  //  ~1km  — short ride
  if (travelMinutes <= 20) return  40;  //  ~3km  — medium ride
  if (travelMinutes <= 30) return  60;  //  ~7km  — long ride
  return 90;                            //   7km+ — far destination
}

// ─── Gap 기준 항목 찾기 ───────────────────────────────────────────────────────
//
// gap 은 greedyLoop 에 들어올 때 한 번만 계산되고, 바깥 while 이 그것을 최대 20회
// 다시 부른다. 그래서 이른 gap 을 채우는 시점에 이미 늦은 항목이 placed 에 들어와
// 있을 수 있다. "그날 가장 늦은 항목" 을 직전 장소로 쓰면 오전 후보의 거리를
// 저녁 장소 기준으로 재게 되고, 거리 페널티가 정반대로 작동한다.

/** gap 이 시작하기 전에 끝난 항목 중 시간축상 가장 가까운 것. */
function itemBeforeGap(placed: ScheduledItem[], gapStart: number): ScheduledItem | undefined {
  let best: ScheduledItem | undefined;
  let bestEnd = -1;
  for (const it of placed) {
    const end = timeToMinutes(it.end_time);
    if (end <= gapStart && end > bestEnd) {
      bestEnd = end;
      best    = it;
    }
  }
  return best;
}

/** gap 이 끝난 뒤 처음 오는 고정 항목. 없으면 undefined. */
function fixedItemAfterGap(placed: ScheduledItem[], gapEnd: number): ScheduledItem | undefined {
  let best: ScheduledItem | undefined;
  let bestStart = Infinity;
  for (const it of placed) {
    if (!it.is_fixed) continue;
    const start = timeToMinutes(it.start_time);
    if (start >= gapEnd && start < bestStart) {
      bestStart = start;
      best      = it;
    }
  }
  return best;
}

/**
 * 배치된 항목의 좌표. ScheduledItem 자체는 좌표를 들고 다니지 않으므로
 * 입력에서 되찾는다. 찾지 못하면 null 이다 — 모르는 위치를 지어내지 않는다.
 */
function itemCoordinate(
  item:  ScheduledItem | undefined,
  input: SchedulerInput,
): Coordinate | null {
  if (!item) return null;
  if (item.item_type === "place" && item.place_id) {
    return input.candidates.find((c) => c.place_id === item.place_id)?.coordinate ?? null;
  }
  if (item.item_type === "event" && item.event_id) {
    return input.fixed_events?.find((e) => e.event_id === item.event_id)?.coordinate ?? null;
  }
  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runScheduler(input: SchedulerInput): SchedulerResult {
  const placed: ScheduledItem[] = [];

  // ── P1: Place Anchors ──────────────────────────────────────────────────────

  const { items: anchorItems, error: anchorError } = placeAnchors(input, placed);
  if (anchorError) return { success: false, error: anchorError };
  placed.push(...anchorItems);

  // ── P2: Place Fixed Events ─────────────────────────────────────────────────

  const { items: eventItems, error: eventError } = placeFixedEvents(input, placed);
  if (eventError) return { success: false, error: eventError };
  placed.push(...eventItems);

  // ── P3: Greedy Slot Fill ───────────────────────────────────────────────────

  const anchorPlaceIds = collectAnchorPlaceIds(input);
  const zoneTracker    = new ZoneTracker();

  // Seed zone tracker with the first placed item's zone (if any)
  const firstWithZone = placed.find((it) => it.zone_id !== undefined);
  if (firstWithZone?.zone_id) zoneTracker.update(firstWithZone.zone_id);

  // 그날 실제로 존재하는 식사 기회. start_time/end_time 에 도착·출발이 이미 반영돼 있다.
  // 비율이 아니라 기회다 — 고정 percentage 는 어디에도 없다.
  const mealWindows  = activeMealWindows(timeToMinutes(input.start_time), timeToMinutes(input.end_time));
  const filledMeals  = new Set<MealKind>();
  /** 사용자가 직접 고른 장소인가 — Selected 에는 끼니 상한을 적용하지 않는다(§6) */
  const isUserSelected = (placeId: string, score: number): boolean =>
    score === 999 || Boolean(input.preferred_items?.some(p => p.place_id === placeId));

  const pq = new PriorityQueue<NearMeCandidate & { score: number }>();
  for (const c of prepareGreedyCandidates(input.candidates, placed, anchorPlaceIds)) {
    pq.enqueue(c);
  }

  // Iterate over free gaps, greedily filling each one.
  // cartFallbackMode=true: high-priority cart items (score=999) skip the preferred_time_slot
  // constraint so they get a second chance after the first pass.
  const greedyLoop = (cartFallbackMode = false) => {
    const gaps = findFreeGaps(placed, input);

    for (const gap of gaps) {
      if (pq.isEmpty()) break;

      const hc7 = hc7MaxItems(placed);
      if (hc7) break;

      // 이 gap 의 직전 항목에서 출발한다. 좌표를 못 찾으면 기준점으로 돌아간다.
      const predecessor = itemBeforeGap(placed, gap.start_minutes);
      const fromCoord   = itemCoordinate(predecessor, input) ?? input.base_coordinate;

      // 이 gap 바로 뒤에 고정 일정이 있으면 거기까지 갈 시간도 남겨야 한다.
      const nextFixed      = fixedItemAfterGap(placed, gap.end_minutes);
      const nextFixedCoord = nextFixed ? itemCoordinate(nextFixed, input) : null;
      const nextFixedStart = nextFixed ? timeToMinutes(nextFixed.start_time) : null;

      // Score candidates with zone bonus applied, then pick best fit for this gap
      const candidates = pq.toArray();
      const scored: ScoredCandidate[] = [];

      for (const c of candidates) {
        const zoneBonus = c.zone_id !== undefined ? zoneTracker.calculateBonus(c.zone_id) : 0;

        const travelMin = estimateTravelMinutes(fromCoord, c.coordinate);
        const { stay_minutes: stayMin } = resolveStayMinutes(c, input);

        const needed = travelMin + stayMin;
        if (needed > gap.duration_minutes) continue;

        // HC-3 / HC-4
        if (hc3TravelFits(travelMin, gap.duration_minutes) !== null) continue;
        if (hc4StayFits(travelMin, stayMin, gap.duration_minutes) !== null) continue;

        // Cart preferred_time_slot 제약 (소프트 — 슬롯 미부합 시 건너뜀).
        // In cartFallbackMode, high-priority cart items (score=999) skip this check —
        // they already had their preferred window in the first pass and can now go
        // into any remaining gap within the day window.
        // 자동으로 채우는 식당은 실제 식사 기회 안에서만, 끼니당 하나만 놓는다.
        // 후보가 많다는 이유로 non-food 슬롯을 침범하지 못한다.
        //
        // 앞자리가 식사 시간이 아니면 **버리지 않고 미룬다** — 사람은 10시에 점심을
        // 먹지 않고 12시에 먹는다. 같은 gap 안에 아직 안 채운 식사 창이 있으면
        // 그 시작 시각으로 놓는다.
        let placeStart = gap.start_minutes + travelMin;
        if (isFoodCategory(c.category) && !isUserSelected(c.place_id, c.score)) {
          if (!canPlaceAutoMeal(placeStart, mealWindows, filledMeals).allowed) {
            const later = mealWindows.find(w =>
              !filledMeals.has(w.kind) &&
              w.start_minutes >= placeStart &&
              w.start_minutes + stayMin <= gap.end_minutes);
            if (!later) continue;
            placeStart = later.start_minutes;
          }
        }

        // ── HC-8: 다음 고정 일정까지 이동할 시간 ──────────────────────────────
        // 체류가 gap 을 꽉 채우면 공연 시작 시각에 이동시간이 0 분이 된다.
        // 좌표를 모르면 검사하지 않는다 — 모르는 이동시간을 지어내는 대신
        // 기존 동작을 그대로 둔다.
        if (nextFixedStart !== null && nextFixedCoord) {
          const egressMin = estimateTravelMinutes(c.coordinate, nextFixedCoord);
          if (hc8FixedEgressFits(placeStart + stayMin, egressMin, nextFixedStart) !== null) continue;
        }

        const preferredItem = input.preferred_items?.find(p => p.place_id === c.place_id);
        if (preferredItem?.preferred_time_slot) {
          const isCartFallback = cartFallbackMode && c.score === 999;
          if (!isCartFallback) {
            const gapHour = Math.floor(gap.start_minutes / 60);
            const slotOk =
              (preferredItem.preferred_time_slot === "morning"   && gapHour < 12) ||
              (preferredItem.preferred_time_slot === "afternoon" && gapHour >= 12 && gapHour < 17) ||
              (preferredItem.preferred_time_slot === "evening"   && gapHour >= 17);
            if (!slotOk) continue;
          }
        }

        scored.push({
          ...c,
          // AI 프로필 보정은 여기서만 얹는다. 위의 HC 검사를 모두 통과한
          // 후보들 사이의 순서만 바뀌고, 프로필이 없으면 0 이라 기존과 같다.
          adjusted_score:       c.score + zoneBonus - consecutiveDistancePenalty(travelMin)
                                + profileBias(input.personalization_profile, {
                                    place_id:     c.place_id,
                                    category:     c.category,
                                    startMinutes: gap.start_minutes,
                                  }),
          travel_minutes:       travelMin,
          stay_minutes_resolved: stayMin,
          start_minutes_resolved: placeStart,
        });
      }

      if (scored.length === 0) continue;

      // Pick the highest adjusted_score candidate
      scored.sort((a, b) => b.adjusted_score - a.adjusted_score);

      // ── Meal Coverage ────────────────────────────────────────────────────
      // 식사 기회가 남아 있는데 취향 보정이 강한 non-food 후보가 그 자리를 계속
      // 가져가면 하루에 밥이 한 끼도 없는 일정이 나온다. 실제 Gemini 프로필에서
      // 관측됐다 — attraction 1.0 이면 종일 식사 0.
      //
      // 점수를 키워 이기게 하지 않는다. restaurant 에 +100 을 주면 Selected 999,
      // 거리 페널티, zone 보너스가 전부 흔들린다. 대신 **고르는 단계에서 역할을
      // 나눈다** — 아직 못 채운 식사창에 놓을 수 있는 식음 후보가 있으면 이 자리는
      // 그 후보들 중에서 고른다. 없으면 평소대로 고른다(빈 끼니를 허용한다).
      //
      // Selected 가 이 규칙보다 위다. 사용자가 직접 고른 장소를 식사 때문에 미루지 않는다.
      let pickPool = scored;
      if (!isUserSelected(scored[0].place_id, scored[0].score)) {
        const openMeal = mealWindows.find(w =>
          !filledMeals.has(w.kind) &&
          w.start_minutes < gap.end_minutes && w.end_minutes > gap.start_minutes);
        if (openMeal) {
          // 밥 먹으러 멀리 가지는 않는다.
          // 식사 보장은 **취향**을 이기되 **동선**은 이기지 못한다.
          // 취향 보정의 최대치가 ±PROFILE_MAX_BONUS 이므로, 최고 후보보다 그만큼
          // 안쪽에 있는 식음 후보만 받는다. 거리 페널티(최대 -90)로 크게 밀린
          // 후보는 여기서 걸러지고 그 끼니는 비워 둔다.
          const mealFloor = scored[0].adjusted_score - PROFILE_MAX_BONUS;
          const mealPicks = scored.filter(c =>
            isFoodCategory(c.category) && !isUserSelected(c.place_id, c.score) &&
            c.adjusted_score >= mealFloor &&
            mealWindowAt(
              c.start_minutes_resolved ?? gap.start_minutes + c.travel_minutes,
              mealWindows,
            )?.kind === openMeal.kind);
          if (mealPicks.length > 0) pickPool = mealPicks;
        }
      }
      const best = pickPool[0];

      // HC-1: no duplicate
      const hc1 = hc1NoDuplicate(best, placed);
      if (hc1) continue;

      // Compute start/end times
      const startMin  = best.start_minutes_resolved ?? (gap.start_minutes + best.travel_minutes);
      const slotStart = minutesToTime(startMin);
      const slotEnd   = minutesToTime(startMin + best.stay_minutes_resolved);

      // HC-6: within day window
      if (
        hc6WithinDayWindow(startMin + best.stay_minutes_resolved, input) !== null
      ) continue;

      const newItem: ScheduledItem = {
        slot_order:               0,
        item_type:                "place",
        source:                   "greedy",
        place_id:                 best.place_id,
        start_time:               slotStart,
        end_time:                 slotEnd,
        stay_minutes:             best.stay_minutes_resolved,
        travel_minutes_from_prev: best.travel_minutes,
        is_fixed:                 false,
        zone_id:                  best.zone_id,
        stay_source:              resolveStayMinutes(best, input).stay_source,
      };

      placed.push(newItem);
      if (isFoodCategory(best.category) && !isUserSelected(best.place_id, best.score)) {
        const meal = canPlaceAutoMeal(startMin, mealWindows, filledMeals).meal;
        if (meal) filledMeals.add(meal);
      }
      if (best.zone_id !== undefined) zoneTracker.update(best.zone_id);

      // Remove placed candidate from the queue
      pq.rebuild(
        pq.toArray().filter((c) => c.place_id !== best.place_id)
      );
    }
  };

  // Iterative greedy: repeat until no new items are placed (progress stalls),
  // the candidate queue is empty, or a hard iteration cap is hit.
  // Safety: capped at 20 iterations and exits immediately when placed.length
  // does not increase, preventing infinite loops on unsatisfiable constraints.
  const MAX_GREEDY_ITERATIONS = 20;
  let prevCount  = -1;
  let iterations = 0;
  while (
    placed.length !== prevCount &&
    !pq.isEmpty() &&
    iterations < MAX_GREEDY_ITERATIONS
  ) {
    prevCount = placed.length;
    greedyLoop();
    iterations++;
  }

  // Cart-fallback pass: cart items (score=999) that could not be placed in their
  // preferred time slot get one final attempt in any remaining gap.
  greedyLoop(true);

  // ── P4: Affiliate Injection ────────────────────────────────────────────────

  const affiliateItems = injectAffiliates(placed, input);
  placed.push(...affiliateItems);

  // ── P5: Build Final Timeline ───────────────────────────────────────────────

  const finalItems = buildTimeline(placed);

  return {
    success: true,
    data: {
      trip_date:         input.trip_date,
      items:             finalItems,
      ai_used:           false,
      scheduler_version: SCHEDULER_VERSION,
      generated_at:      new Date().toISOString(),
    },
  };
}

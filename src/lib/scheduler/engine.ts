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
import { reorderFlexibleSegments } from "./segment-reorder.ts";
import { buildClusters, clustersAdjacent, auditDayRoute, computeScheduleConfidence, type AuditStop, type MealLocality, type PinKind } from "./route-quality.ts";
import type { DayQuality } from "./types.ts";
import { buildTimeline, findFreeGaps } from "./timeline-builder.ts";
import {
  hc1NoDuplicate,
  hc3TravelFits,
  hc4StayFits,
  hc6WithinDayWindow,
  hc7MaxItems,
  hc8InsertionEgressFits,
  hc9FixedPairReachable,
} from "./constraint-validator.ts";

// ─── Greedy Candidate with adjusted score ────────────────────────────────────

interface ScoredCandidate extends NearMeCandidate {
  /** 실제 배치 시각(분). 식사 기회로 미뤄진 경우 gap 앞머리가 아니다. */
  start_minutes_resolved?: number;
  /** 식사 창까지 미룬 분(자동 식당). closure V2 — 앞자리를 채울 다른 후보가 있으면 크게 미룬 식당은 이번 gap 에서 고르지 않는다 */
  deferred_minutes?: number;
  adjusted_score: number;
  travel_minutes: number;
  stay_minutes_resolved: number;
}

// TASK-057-A: Penalise candidates far from the previous placed item so the
// scheduler naturally clusters nearby places. Uses travel time (already computed
// for HC-3/HC-4) as a distance proxy — avoids a second haversine call.
// My Picks (score=999) remain above NearMe even at max penalty (999-90 = 909
// vs NearMe max ≈ 205), so they are never deprioritised below NearMe items.
//
// P0 route quality (TASK-SCHEDULER-V2-P0-ROUTE-QUALITY-AND-RELEASE-BLOCKERS-V1, 실측 2026-08-30 부산 10일·해운대 숙소):
// 예전 값(0/20/40/60/90)은 NearMe 점수 차(최대 ≈205)보다 작아 2–3 km 떨어진 고점수 후보가 옆 동네 후보를 계속 이겼고,
// 하루가 해운대 → 청사포 → 해운대 → 센텀 처럼 권역을 되돌아왔다(6/10일, 대안 순서 대비 20–38% 낭비).
// 값을 올리고(≤1km 30 · ≤3km 70 · ≤7km 110 · 그 밖 150) **다음 핀까지의 이탈 거리**도 절반 가중으로 본다(아래).
// This Trip 픽(999)은 최대 페널티를 다 받아도(999−150−75=774) NearMe 최대(≈205)보다 위다 — 사용자 선택은 그대로 우선한다.
function consecutiveDistancePenalty(travelMinutes: number): number {
  if (travelMinutes <=  8) return   0;  // ≤500m  — walkable, no penalty
  if (travelMinutes <= 15) return  30;  //  ~1km  — short ride
  if (travelMinutes <= 20) return  70;  //  ~3km  — medium ride
  if (travelMinutes <= 30) return 110;  //  ~7km  — long ride
  return 150;                           //   7km+ — far destination
}

/** 다음 배치 항목(핀)까지의 이탈 — 두 핀 사이에 끼울 후보는 가는 길에 있는 쪽이 낫다. 직전 거리 페널티의 절반 가중. */
function egressDistancePenalty(travelMinutes: number | null): number {
  if (travelMinutes === null) return 0;
  return Math.round(consecutiveDistancePenalty(travelMinutes) / 2);
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

/**
 * gap 이 끝난 뒤 처음 오는 배치 항목. 없으면 undefined — 하루 마지막 gap 이다.
 *
 * 고정 항목만 보지 않는다. 식사 이연이 일반 항목 앞에 구멍을 만들면 그 구멍도
 * "이미 배치된 두 항목 사이" 이고, 거기에 후보를 끼워 넣을 때 다음 항목까지
 * 갈 수 있는지 따져야 하는 것은 똑같다.
 */
function nextPlacedItemAfterGap(placed: ScheduledItem[], gapEnd: number): ScheduledItem | undefined {
  let best: ScheduledItem | undefined;
  let bestStart = Infinity;
  for (const it of placed) {
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

// ── P1 권역(neighborhood) 가중치 ─────────────────────────────────────────────
//
// 좌표만으로 만든 권역(route-quality.buildClusters, 리더 반경 1 km) 을 greedy 점수에 얹는다.
//   affinity : 직전 장소와 같은 권역 +same, 인접 권역(리더 3 km 안) +adjacent
//   reentry  : 오늘 이미 떠난 권역으로 되돌아가는 후보 −reentry (A → B → A 를 미리 막는다)
// This Trip 픽(999)·고정·anchor 는 점수와 무관하게 먼저 놓이므로 영향이 없다. 자동 식당도 후보라 같은 규칙을 받는다
// (meal-aware: 식사 창 안에서 같은/인접 권역 식당이 멀리 있는 고점수 식당을 이긴다). 도시 이름은 어디에도 없다.
export interface ClusterWeights { same: number; adjacent: number; reentry: number; focusSame: number; focusAdjacent: number; focusOther: number }
export const CLUSTER_WEIGHTS_DEFAULT: ClusterWeights = { same: 25, adjacent: 10, reentry: 90,  focusSame: 20, focusAdjacent: 5, focusOther: 40 };
export const CLUSTER_WEIGHTS_STRICT:  ClusterWeights = { same: 40, adjacent: 15, reentry: 150, focusSame: 30, focusAdjacent: 8, focusOther: 80 };
/** 자동 식당을 식사 창까지 미루는 대신 앞자리를 먼저 채우는 기준 — 한 stop(이동+최소 체류) 이 들어갈 만한 여유 */
export const MEAL_DEFER_FILL_FIRST_MINUTES = 60;

export function runScheduler(input: SchedulerInput): SchedulerResult {
  const first = scheduleOnce(input, CLUSTER_WEIGHTS_DEFAULT);
  if (!first.success) return first;
  // ── Route Quality Gate: 초기 결과 1회 감사 → 걸리면 강한 권역 가중치로 딱 한 번 다시 짠다(무한 재시도 없음) ──
  const q1 = first.data.quality!;
  if (q1.status !== "GOOD" && (q1.unjustifiedBacktracks > 0 || q1.clusterReentries > 0 || q1.localZigzags > 0)) {
    const second = scheduleOnce(input, CLUSTER_WEIGHTS_STRICT);
    if (second.success) {
      const verdict = repairAcceptable(first, second, input);
      if (verdict.accept) {
        const q2 = second.data.quality!;
        second.data.quality = { ...q2, repaired: true, reasonCodes: [...q2.reasonCodes, ...verdict.codes] };
        return second;
      }
      // 채택 안 한 이유도 남긴다(내부 explainability) — 낮은 품질을 숨기지 않는다
      first.data.quality = { ...q1, reasonCodes: [...q1.reasonCodes, `REPAIR_REJECTED:${verdict.reason.replace(/\s+/g, "_")}`] };
    }
  }
  return first;
}

/**
 * 보호 stop 서명 — repair 전후로 100% 같아야 하는 것들: 고정(is_fixed) · anchor · fixed_event(도착/출발/숙소) ·
 * This Trip 사용자 선택(999) · 시간대 선호가 있는 픽(preferred_items). key 와 시각을 함께 본다(다른 Day 로 옮기거나 시각을 바꾸면 다른 서명).
 */
export function protectedSignature(r: SchedulerResult, input: SchedulerInput): string[] {
  if (!r.success) return [];
  return r.data.items
    .filter(it => it.item_type !== "affiliate")
    .filter(it => {
      if (it.is_fixed || it.source === "anchor" || it.source === "fixed_event") return true;
      if (!it.place_id) return false;
      const cand = input.candidates.find(c => c.place_id === it.place_id);
      return cand?.score === 999 || Boolean(input.preferred_items?.some(p => p.place_id === it.place_id));
    })
    .map(it => `${it.place_id ?? it.event_id ?? it.slot_order}@${it.start_time}-${it.end_time}`)
    .sort();
}

export type RepairCode = "REENTRY_REPAIRED" | "LOCAL_ZIGZAG_REPAIRED" | "BACKTRACK_REPAIRED";

/**
 * repair 채택 조건(closure V2 §12) — 전부 만족할 때만 두 번째 결과를 쓴다:
 *   · 보호 stop 집합·시각 100% 동일(silent drop / 이동 / 다른 Day 이동 / 자동 후보와 교체 금지)
 *   · 하드 제약 위반 0, 좌표 품질 악화 0
 *   · unjustified backtrack · local zigzag · 권역 재진입이 하나도 늘지 않고, (unjustified + zigzag) 가 줄거나 0
 *   · 총 이동(분)이 의미 있게 나빠지지 않음(≤ +5%)
 *   · 자동 추천 장소는 최대 1곳까지만 substitute/unplaced 허용
 * "총 거리만 좋아졌다" 는 이유로 사용자 선택 장소를 잃는 결과는 채택하지 않는다.
 */
export function repairAcceptable(first: SchedulerResult, second: SchedulerResult, input: SchedulerInput): { accept: boolean; codes: RepairCode[]; reason: string } {
  if (!first.success || !second.success) return { accept: false, codes: [], reason: "not both successful" };
  const q1 = first.data.quality!, q2 = second.data.quality!;
  const p1 = protectedSignature(first, input), p2 = protectedSignature(second, input);
  if (p1.length !== p2.length || p1.some((k, i) => k !== p2[i])) return { accept: false, codes: [], reason: "protected stops differ" };
  if (q2.hardConstraintFeasibility < 100 || q2.coordinateQuality < q1.coordinateQuality) return { accept: false, codes: [], reason: "hard/coordinate worse" };
  if (q2.unjustifiedBacktracks > q1.unjustifiedBacktracks || q2.localZigzags > q1.localZigzags || q2.clusterReentries > q1.clusterReentries) return { accept: false, codes: [], reason: "a route defect increased" };
  const d1 = q1.unjustifiedBacktracks + q1.localZigzags, d2 = q2.unjustifiedBacktracks + q2.localZigzags;
  if (!(d2 < d1 || d2 === 0)) return { accept: false, codes: [], reason: "defects not reduced" };
  if (q2.totalMinutes > q1.totalMinutes * 1.05 + 1) return { accept: false, codes: [], reason: "route cost worse" };
  const placedCount = (r: SchedulerResult) => r.success ? r.data.items.filter(it => it.item_type !== "affiliate").length : 0;
  if (placedCount(second) < placedCount(first) - 1) return { accept: false, codes: [], reason: "too many stops lost" };
  if (d2 === d1 && q2.clusterReentries === q1.clusterReentries && q2.totalMinutes >= q1.totalMinutes) return { accept: false, codes: [], reason: "no improvement" };
  const codes: RepairCode[] = [];
  if (q2.clusterReentries < q1.clusterReentries) codes.push("REENTRY_REPAIRED");
  if (q2.localZigzags < q1.localZigzags) codes.push("LOCAL_ZIGZAG_REPAIRED");
  if (q2.unjustifiedBacktracks < q1.unjustifiedBacktracks) codes.push("BACKTRACK_REPAIRED");
  return { accept: true, codes, reason: "ok" };
}

function scheduleOnce(input: SchedulerInput, weights: ClusterWeights): SchedulerResult {
  const placed: ScheduledItem[] = [];
  // 권역: 후보 + 고정/anchor 좌표 전부로 만든다 — 핀이 있는 권역도 "오늘 가는 곳" 이다
  const clusterPoints = [
    ...input.candidates.map(c => ({ key: c.place_id, coordinate: c.coordinate, score: c.score })),
    ...(input.fixed_events ?? []).filter(e => e.coordinate && Number.isFinite(e.coordinate.lat) && Number.isFinite(e.coordinate.lng)).map(e => ({ key: `event:${e.event_id}`, coordinate: e.coordinate, score: 1000 })),
  ];
  const { clusters, clusterOf } = buildClusters(clusterPoints);
  // 권역 → Day: 오늘의 주 권역 = 쓸 수 있는 후보 점수 합이 가장 큰 권역. 하루가 한 권역(과 그 인접)에 머물도록 편향한다.
  // 핀(고정·픽)이 다른 권역에 있으면 거기로 가는 것은 허용된다 — 이 항은 자동 추천 후보에만 붙는다.
  const clusterMass = new Map<number, number>();
  for (const c of input.candidates) { if (c.score === 999) continue; const cid = clusterOf.get(c.place_id); if (cid === undefined) continue; clusterMass.set(cid, (clusterMass.get(cid) ?? 0) + Math.max(0, c.score)); }
  let primaryCluster: number | undefined; let primaryMass = -1;
  // 동률이면 작은 cluster id(= 점수순 리더, 입력 순서 독립) — 후보 순서에 따라 주 권역이 바뀌지 않는다 (실측 2026-08-31 부산 Day 6: c2 = c5 = 1022.000)
  for (const [cid, mass] of clusterMass) if (mass > primaryMass || (mass === primaryMass && primaryCluster !== undefined && cid < primaryCluster)) { primaryCluster = cid; primaryMass = mass; }
  const clusterOfItem = (it: ScheduledItem | undefined): number | undefined => {
    if (!it) return undefined;
    if (it.item_type === "place" && it.place_id) return clusterOf.get(it.place_id);
    if (it.item_type === "event" && it.event_id) return clusterOf.get(`event:${it.event_id}`);
    return undefined;
  };
  const visitedClusters = new Set<number>();
  const clusterBonus = (candidateCluster: number | undefined, predecessor: ScheduledItem | undefined, isSelected: boolean): number => {
    if (candidateCluster === undefined || isSelected) return 0;
    const prev = clusterOfItem(predecessor);
    let bonus = 0;
    if (prev !== undefined) {
      if (prev === candidateCluster) bonus += weights.same;
      else if (clustersAdjacent(clusters[prev]!, clusters[candidateCluster]!)) bonus += weights.adjacent;
    }
    // 이미 떠난 권역으로 되돌아가는 후보 — 직전 장소가 그 권역이 아닐 때만 "되돌아감" 이다
    if (visitedClusters.has(candidateCluster) && prev !== candidateCluster) bonus -= weights.reentry;
    if (primaryCluster !== undefined) {
      if (candidateCluster === primaryCluster) bonus += weights.focusSame;
      else if (clustersAdjacent(clusters[primaryCluster]!, clusters[candidateCluster]!)) bonus += weights.focusAdjacent;
      else bonus -= weights.focusOther;
    }
    return bonus;
  };
  /** 같은 권역이거나 인접 권역인가 — 식사 locality 판정 */
  const nearCluster = (a: number | undefined, b: number | undefined): boolean =>
    a !== undefined && b !== undefined && (a === b || clustersAdjacent(clusters[a]!, clusters[b]!));
  /** 오늘 이미 떠난 권역으로 되돌아가는가(직전 권역 자체는 제외) */
  const reentersCluster = (c: number | undefined, prev: number | undefined): boolean =>
    c !== undefined && c !== prev && visitedClusters.has(c);

  // ── P1: Place Anchors ──────────────────────────────────────────────────────

  const { items: anchorItems, error: anchorError } = placeAnchors(input, placed);
  if (anchorError) return { success: false, error: anchorError };
  placed.push(...anchorItems);

  // ── P2: Place Fixed Events ─────────────────────────────────────────────────

  const { items: eventItems, error: eventError } = placeFixedEvents(input, placed);
  if (eventError) return { success: false, error: eventError };
  placed.push(...eventItems);

  // ── P2.5: 연속된 고정 일정 사이를 실제로 이동할 수 있는가 ──────────────────
  //
  // HC-5 는 시간이 겹치는지만 본다. 시계가 안 겹친다고 갈 수 있는 것은 아니다.
  //
  // 배열에 들어온 순서가 아니라 **시간순** 으로 이웃한 쌍을 본다. anchors 가
  // C, A, B 순으로 들어와도 확인해야 하는 것은 A→B 와 B→C 다.
  //
  // 좌표를 모르면 확인하지 않는다. 모르는 이동시간을 지어내지 않고, 확인하지
  // 못했다는 이유로 사용자가 정한 고정 일정을 막지도 않는다.
  const fixedInOrder = placed
    .filter((it) => it.is_fixed)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  for (let i = 1; i < fixedInOrder.length; i++) {
    const earlier = fixedInOrder[i - 1]!;
    const later   = fixedInOrder[i]!;
    const from = itemCoordinate(earlier, input);
    const to   = itemCoordinate(later,   input);
    if (!from || !to) continue;

    const pairError = hc9FixedPairReachable(
      timeToMinutes(earlier.end_time),
      estimateTravelMinutes(from, to),
      timeToMinutes(later.start_time),
    );
    if (pairError) return { success: false, error: pairError };
  }

  // ── P3: Greedy Slot Fill ───────────────────────────────────────────────────

  const anchorPlaceIds = collectAnchorPlaceIds(input);
  const zoneTracker    = new ZoneTracker();

  for (const it of placed) { const cid = clusterOfItem(it); if (cid !== undefined) visitedClusters.add(cid); }
  // Seed zone tracker with the first placed item's zone (if any)
  const firstWithZone = placed.find((it) => it.zone_id !== undefined);
  if (firstWithZone?.zone_id) zoneTracker.update(firstWithZone.zone_id);

  // 그날 실제로 존재하는 식사 기회. start_time/end_time 에 도착·출발이 이미 반영돼 있다.
  // 비율이 아니라 기회다 — 고정 percentage 는 어디에도 없다.
  const mealWindows  = activeMealWindows(timeToMinutes(input.start_time), timeToMinutes(input.end_time));
  const filledMeals  = new Set<MealKind>();
  /** 자동 식당의 공급 기준 locality(감사용) — 선택 시점에 기록한다 */
  const mealLocalityOf = new Map<string, MealLocality>();
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

      // 이 gap 뒤에 다음 항목이 있으면 거기까지 갈 시간도 남겨야 한다.
      // 없으면 하루 마지막 gap 이고, 그때는 기존대로 진입+체류만 본다.
      const nextPlaced      = nextPlacedItemAfterGap(placed, gap.end_minutes);
      const nextPlacedCoord = nextPlaced ? itemCoordinate(nextPlaced, input) : null;
      const nextPlacedStart = nextPlaced ? timeToMinutes(nextPlaced.start_time) : null;

      // fail-closed — 다음 항목이 있는데 그 위치를 모르면 이 gap 은 비워 둔다.
      // 이동 가능성을 확인할 수 없는 자리에 장소를 끼워 넣느니 빈 시간이 낫다.
      // 모르는 이동시간을 지어내는 선택지는 없다.
      if (nextPlaced && !nextPlacedCoord) continue;

      // Score candidates with zone bonus applied, then pick best fit for this gap
      const candidates = pq.toArray();
      const scored: ScoredCandidate[] = [];

      for (const c of candidates) {
        const zoneBonus = c.zone_id !== undefined ? zoneTracker.calculateBonus(c.zone_id) : 0;
        const clusterAdj = clusterBonus(clusterOf.get(c.place_id), predecessor, isUserSelected(c.place_id, c.score));

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
        let placeStart = gap.start_minutes + travelMin; let deferredMinutes = 0;
        if (isFoodCategory(c.category) && !isUserSelected(c.place_id, c.score)) {
          if (!canPlaceAutoMeal(placeStart, mealWindows, filledMeals).allowed) {
            const later = mealWindows.find(w =>
              !filledMeals.has(w.kind) &&
              w.start_minutes >= placeStart &&
              w.start_minutes + stayMin <= gap.end_minutes);
            if (!later) continue;
            deferredMinutes = later.start_minutes - placeStart;   // closure V2: 아래 fill-first 규칙이 본다
            placeStart = later.start_minutes;
          }
        }

        // ── HC-8: 다음 배치 항목까지 이동할 시간 ──────────────────────────────
        // 체류가 gap 을 꽉 채우면 다음 항목 시작 시각에 이동시간이 0 분이 된다.
        // This Trip 이든 일반 추천이든, 고정이든 아니든 똑같이 적용한다 —
        // 우선순위가 높다고 순간이동할 수 있는 것은 아니다.
        let egressMinForScore: number | null = null;
        if (nextPlacedStart !== null && nextPlacedCoord) {
          const egressMin = estimateTravelMinutes(c.coordinate, nextPlacedCoord);
          if (hc8InsertionEgressFits(placeStart + stayMin, egressMin, nextPlacedStart) !== null) continue;
          egressMinForScore = egressMin;
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
          adjusted_score:       c.score + zoneBonus + clusterAdj - consecutiveDistancePenalty(travelMin) - egressDistancePenalty(egressMinForScore)
                                + profileBias(input.personalization_profile, {
                                    place_id:     c.place_id,
                                    category:     c.category,
                                    startMinutes: gap.start_minutes,
                                  }),
          travel_minutes:       travelMin,
          stay_minutes_resolved: stayMin,
          start_minutes_resolved: placeStart,
          deferred_minutes:     deferredMinutes,
        });
      }

      if (scored.length === 0) continue;

      // Pick the highest adjusted_score candidate
      // 동점은 place_id 사전순 — 후보 입력 순서에 따라 결과가 달라지지 않는다(closure V2 §7 실측: 순서 셔플 20회 중 0–5회만 같은 일정)
      scored.sort((a, b) => b.adjusted_score - a.adjusted_score || a.place_id.localeCompare(b.place_id));
      // closure V2 (AUTO_MEAL_SELECTION 원인): 식사 창까지 한 stop 이상 비어 있고 그 앞자리를 채울 다른 후보가 있으면,
      // 크게 미뤄진 식당은 이번 gap 에서 고르지 않는다. 앞자리를 먼저 채운 뒤 다음 gap 에서 **실제 직전 장소** 기준으로 식당을
      // 고른다 — 아니면 점심 직후(숙소 권역)를 기준으로 저녁을 골라 오후 권역에서 되돌아오는 재진입이 생긴다(실측 2026-08-31 Day 6/10).
      // 식당밖에 없으면(다른 후보 0) 그대로 둔다 — 식사 계약은 그대로다.
      const isFarDeferred = (c: ScoredCandidate) => (c.deferred_minutes ?? 0) >= MEAL_DEFER_FILL_FIRST_MINUTES;
      if (scored.some(c => !isFarDeferred(c))) for (let k = scored.length - 1; k >= 0; k--) if (isFarDeferred(scored[k]!)) scored.splice(k, 1);

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
          const mealWindowOk = (c: ScoredCandidate) => mealWindowAt(c.start_minutes_resolved ?? gap.start_minutes + c.travel_minutes, mealWindows)?.kind === openMeal.kind;
          // P1 meal-aware (§7): 직전 장소와 같은/인접 권역에 route-valid 식당이 있으면 그 안에서 고른다 —
          // 멀리 있는 고점수 식당이 하루 동선을 동서로 찢지 않게. 없을 때만 기존 점수 floor 규칙으로 돌아간다.
          const prevCluster = clusterOfItem(predecessor);
          const autoMealOk = (c: ScoredCandidate) => isFoodCategory(c.category) && !isUserSelected(c.place_id, c.score) && mealWindowOk(c);
          // closure V2 (§10–11 AUTO_MEAL_SELECTION): 같은 권역 > 인접·미방문 권역 > 인접이지만 오늘 이미 떠난 권역(재진입).
          // "인접" 이라는 이유로 오늘 떠난 숙소 권역으로 되돌아가 저녁을 먹는 것이 Day 6/7/9/10 재진입의 원인이었다
          // (실측 2026-08-31: 4/4 모두 같은 권역 식당이 공급에 4–17곳 있었다). 도시 이름·장소 예외 없음.
          const sameMeals     = scored.filter(c => autoMealOk(c) && clusterOf.get(c.place_id) === prevCluster);
          const adjacentMeals = scored.filter(c => autoMealOk(c) && nearCluster(clusterOf.get(c.place_id), prevCluster) && !reentersCluster(clusterOf.get(c.place_id), prevCluster));
          const localMeals    = sameMeals.length > 0 ? sameMeals : adjacentMeals.length > 0 ? adjacentMeals : scored.filter(c => autoMealOk(c) && nearCluster(clusterOf.get(c.place_id), prevCluster));
          const mealPicks = localMeals.length > 0 ? localMeals : scored.filter(c => autoMealOk(c) && c.adjusted_score >= mealFloor);
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
        // 공급 기준 locality 기록(감사·reason code 용). dataset 기준(MEAL_SUPPLY_GAP vs NO_LOCAL_FEASIBLE_MEAL)은 QA harness 가 증명한다.
        const pc = clusterOfItem(predecessor), bc = clusterOf.get(best.place_id);
        const okLocal = (c: number | undefined) => nearCluster(c, pc) && !reentersCluster(c, pc);
        mealLocalityOf.set(best.place_id, pc === undefined || okLocal(bc) ? "LOCAL_MEAL"
          : scored.some(c => c.place_id !== best.place_id && isFoodCategory(c.category) && !isUserSelected(c.place_id, c.score) && okLocal(clusterOf.get(c.place_id))) ? "AUTO_MEAL_SELECTION"
          : "NO_LOCAL_IN_SUPPLY");
      }
      if (best.zone_id !== undefined) zoneTracker.update(best.zone_id);
      { const cid = clusterOf.get(best.place_id); if (cid !== undefined) visitedClusters.add(cid); }

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
  const runUntilStable = (pass: () => void) => {
    let prevCount  = -1;
    let iterations = 0;
    while (
      placed.length !== prevCount &&
      !pq.isEmpty() &&
      iterations < MAX_GREEDY_ITERATIONS
    ) {
      prevCount = placed.length;
      pass();
      iterations++;
    }
  };

  // 시간대 선호를 푼 pass 가 먼저다.
  //
  // 예전에는 이 pass 가 맨 뒤에 있었다. 시간대를 정해 둔 This Trip 은 앞 pass 의
  // 슬롯 검사에서 계속 밀려나고, 그동안 추천이 하루치 자리와 HC-7(20개) 예산을
  // 다 써 버려서, 정작 슬롯을 풀어 주는 이 차례가 왔을 때는 넣을 자리가 없었다.
  // 실측: 저녁 선호 3곳 + 추천 30곳 → This Trip 0곳. 자리가 넉넉해도(추천 5곳)
  // 1곳만 들어갔다.
  //
  // 그래서 순서를 바꾼다. `preferred_time_slot` 은 지키면 좋은 값이지 지키려고
  // 장소를 버릴 값이 아니다 — 시간을 반드시 지켜야 하는 장소는 Date/Start/End
  // 로 고정하면 P2 가 hard constraint 로 다룬다.
  runUntilStable(() => greedyLoop(true));
  runUntilStable(() => greedyLoop());

  // ── P3.5: 핀 사이 유연 구간 재정렬 (P0 route quality) ──────────────────────
  //
  // greedy 가 고른 장소 집합은 그대로 두고, 고정·픽·식당 사이의 일반 추천 순서만 스케줄러 비용
  // (estimateTravelMinutes) 기준으로 다시 정한다. 어떤 HC 도 새로 어기지 않을 때만 적용한다.
  const reordered = reorderFlexibleSegments(placed, input);
  if (reordered.reorderedSegments > 0) { placed.length = 0; placed.push(...reordered.items); }

  // ── P4: Affiliate Injection ────────────────────────────────────────────────

  const affiliateItems = injectAffiliates(placed, input);
  placed.push(...affiliateItems);

  // ── P5: Build Final Timeline ───────────────────────────────────────────────

  const finalItems = buildTimeline(placed);

  // ── P1 내부 품질 감사 (사용자 노출 없음) ──
  const auditStops: AuditStop[] = finalItems
    .filter(it => it.item_type !== "affiliate")
    .map(it => {
      const coord = itemCoordinate(it, input);
      const cand = it.place_id ? input.candidates.find(c => c.place_id === it.place_id) : undefined;
      const pinned = it.is_fixed || it.source === "anchor" || it.source === "fixed_event" || cand?.score === 999 || Boolean(it.place_id && input.preferred_items?.some(p => p.place_id === it.place_id));
      const pinKind: PinKind | undefined = !pinned ? undefined : it.is_fixed ? "USER_FIXED" : (cand?.score === 999 || (it.place_id && input.preferred_items?.some(p => p.place_id === it.place_id))) ? "USER_SELECTED" : "ANCHOR";
      const meal = Boolean(cand && isFoodCategory(cand.category) && !pinned);
      const startMinutes = timeToMinutes(it.start_time);
      const w = meal ? mealWindowAt(startMinutes, mealWindows) : null;
      return {
        key: it.place_id ?? it.event_id ?? String(it.slot_order),
        coordinate: coord ?? { lat: NaN, lng: NaN },
        pinned, pinKind, meal,
        mealLocality: meal && it.place_id ? mealLocalityOf.get(it.place_id) : undefined,
        mealWindow: w ? [w.start_minutes, w.end_minutes] as [number, number] : undefined,
        startMinutes, stayMinutes: it.stay_minutes,
        clusterId: clusterOfItem(it),
      };
    });
  const coordinateFailures = auditStops.filter(s => !Number.isFinite(s.coordinate.lat) || !Number.isFinite(s.coordinate.lng)).length;
  const metrics = auditDayRoute(auditStops.filter(s => Number.isFinite(s.coordinate.lat)), clusters);
  // 하드 제약 재검사: 시간축 순서로 이웃한 두 항목 사이에 이동시간이 들어가는가 (HC-3/HC-8 사후 검증)
  let hardConstraintViolations = 0;
  const seq = auditStops.map((s, k) => ({ s, it: finalItems.filter(it => it.item_type !== "affiliate")[k]! }));
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1]!, b = seq[k]!;
    if (!Number.isFinite(a.s.coordinate.lat) || !Number.isFinite(b.s.coordinate.lat)) continue;
    if (timeToMinutes(a.it.end_time) + estimateTravelMinutes(a.s.coordinate, b.s.coordinate) > timeToMinutes(b.it.start_time) + 1) hardConstraintViolations++;
  }
  const conf = computeScheduleConfidence({ metrics, coordinateFailures, hardConstraintViolations });
  const quality: DayQuality = {
    status: conf.status, scheduleConfidence: conf.scheduleConfidence, coordinateQuality: conf.coordinateQuality,
    hardConstraintFeasibility: conf.hardConstraintFeasibility, routeQuality: conf.routeQuality, backtrackingQuality: conf.backtrackingQuality,
    clusterCoherence: conf.clusterCoherence,
    totalMinutes: metrics.totalMinutes, totalMeters: metrics.totalMeters, clusterReentries: metrics.clusterReentries,
    unjustifiedBacktracks: metrics.unjustifiedBacktracks, justifiedBacktracks: metrics.justifiedBacktracks, localZigzags: metrics.localZigzags.length,
    betterOrderRatio: metrics.betterOrderRatio, protectedStops: auditStops.filter(s => s.pinned).length,
    repaired: false, reasons: conf.reasons, reasonCodes: [...conf.reasonCodes],
  };

  return {
    success: true,
    data: {
      trip_date:         input.trip_date,
      items:             finalItems,
      ai_used:           false,
      scheduler_version: SCHEDULER_VERSION,
      generated_at:      new Date().toISOString(),
      quality,
    },
  };
}

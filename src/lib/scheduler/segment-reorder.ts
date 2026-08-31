// GoKoreaMate — P3.5 flexible-segment reorder (TASK-SCHEDULER-V2-P0-ROUTE-QUALITY-AND-RELEASE-BLOCKERS-V1)
//
// 왜 필요한가 (실측 2026-08-30, 부산 10일·해운대 숙소): greedy 는 gap 마다 "점수 − 직전 장소 거리 페널티" 로
// 하나씩 고른다. 그래서 같은 장소 집합이라도 순서가 지그재그가 된다 — 해운대 → 청사포 → 해운대 → 센텀 처럼
// 권역을 되돌아오는 하루가 10일 중 6일, 같은 고정 제약에서 스케줄러 비용(TRAVEL_TIME_TABLE 분) 20–38% 짧은
// 순서가 존재했다. 고정 일정 때문이 아니었다(fixed 0).
//
// 무엇을 하는가: **장소 집합은 그대로 두고, 핀 사이의 유연한 구간 순서만** 다시 정한다.
//   핀(움직이지 않음): is_fixed · anchor · fixed_event · affiliate · 사용자가 고른 장소(score 999 / preferred_items) ·
//                    자동 배치 식당(식사 창에 맞춰 놓인 것) · 좌표를 모르는 항목
//   이동 가능:         source "greedy" 이고 위에 해당하지 않는 일반 추천 장소
// 비용은 스케줄러가 쓰는 그 함수(estimateTravelMinutes) 의 합이고, 같은 분이면 haversine 미터로 가른다.
// 구간이 7개 이하면 전수(≤5,040), 그보다 크면 2-opt. 새 순서는 시각을 앞에서부터 다시 계산하고
// HC-6(하루 창)·HC-8(다음 핀까지 도달) 을 다시 검사한다 — 하나라도 어기면 **원래 순서를 그대로 둔다**.
// 사용자가 고른 장소·고정 시각·식사 시각은 이 pass 가 절대 건드리지 않는다. 장소를 버리지도 않는다.

import type { ScheduledItem, SchedulerInput, Coordinate } from "./types.ts";
import { timeToMinutes, minutesToTime, haversineDistance } from "./utils.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";
import { isFoodCategory } from "./meal-opportunity.ts";

export const REORDER_BRUTE_FORCE_MAX = 7;

interface Node { item: ScheduledItem; coord: Coordinate; movable: boolean }

function coordOf(item: ScheduledItem, input: SchedulerInput): Coordinate | null {
  if (item.item_type === "place" && item.place_id) return input.candidates.find(c => c.place_id === item.place_id)?.coordinate ?? null;
  if (item.item_type === "event" && item.event_id) return input.fixed_events?.find(e => e.event_id === item.event_id)?.coordinate ?? null;
  return null;
}

function isMovable(item: ScheduledItem, input: SchedulerInput): boolean {
  if (item.source !== "greedy" || item.is_fixed || item.item_type !== "place" || !item.place_id) return false;
  const cand = input.candidates.find(c => c.place_id === item.place_id);
  if (!cand) return false;
  if (cand.score === 999) return false;                                             // This Trip 픽
  if (input.preferred_items?.some(p => p.place_id === item.place_id)) return false; // 시간대 선호가 있는 픽
  if (isFoodCategory(cand.category)) return false;                                  // 식사 창에 맞춘 식당
  return true;
}

/** 구간 비용 — 스케줄러 분 합 (동률은 미터로) */
function segmentCost(from: Coordinate, order: Node[], to: Coordinate | null): { minutes: number; meters: number } {
  let minutes = 0, meters = 0, prev = from;
  for (const n of order) { minutes += estimateTravelMinutes(prev, n.coord); meters += haversineDistance(prev, n.coord); prev = n.coord; }
  if (to) { minutes += estimateTravelMinutes(prev, to); meters += haversineDistance(prev, to); }
  return { minutes, meters };
}

function better(a: { minutes: number; meters: number }, b: { minutes: number; meters: number }): boolean {
  return a.minutes < b.minutes || (a.minutes === b.minutes && a.meters < b.meters - 1);
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((x, i) => { for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]); });
  return out;
}

function bestOrder(from: Coordinate, seg: Node[], to: Coordinate | null): Node[] {
  if (seg.length < 2) return seg;
  let best = seg, bc = segmentCost(from, seg, to);
  if (seg.length <= REORDER_BRUTE_FORCE_MAX) {
    for (const p of permutations(seg)) { const c = segmentCost(from, p, to); if (better(c, bc)) { best = p; bc = c; } }
    return best;
  }
  // 2-opt
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
      const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
      const c = segmentCost(from, cand, to);
      if (better(c, bc)) { best = cand; bc = c; improved = true; }
    }
  }
  return best;
}

export interface ReorderResult { items: ScheduledItem[]; reorderedSegments: number; minutesBefore: number; minutesAfter: number }

/**
 * 핀 사이 유연 구간을 재정렬한 새 배열을 돌려준다. 어떤 구간도 개선·검증되지 않으면 입력을 그대로 돌려준다.
 * 시각은 구간 시작(직전 핀 종료 또는 하루 시작)부터 이동시간을 더해 앞에서부터 다시 계산한다.
 */
export function reorderFlexibleSegments(placed: ScheduledItem[], input: SchedulerInput): ReorderResult {
  const byTime = [...placed].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const nodes: Node[] = byTime.map(item => { const coord = coordOf(item, input); return { item, coord: coord ?? { lat: NaN, lng: NaN }, movable: Boolean(coord) && isMovable(item, input) }; });
  const dayEnd = timeToMinutes(input.end_time);
  const out: ScheduledItem[] = [];
  let reordered = 0, minutesBefore = 0, minutesAfter = 0;

  let i = 0;
  while (i < nodes.length) {
    if (!nodes[i]!.movable) { out.push(nodes[i]!.item); i++; continue; }
    let j = i; while (j < nodes.length && nodes[j]!.movable) j++;
    const seg = nodes.slice(i, j);
    const prevPin = i > 0 ? nodes[i - 1]! : null;
    const nextPin = j < nodes.length ? nodes[j]! : null;
    const from = prevPin?.coord && Number.isFinite(prevPin.coord.lat) ? prevPin.coord : input.base_coordinate;
    const to   = nextPin?.coord && Number.isFinite(nextPin.coord.lat) ? nextPin.coord : null;
    const before = segmentCost(from, seg, to);
    const ordered = bestOrder(from, seg, to);
    const after = segmentCost(from, ordered, to);
    minutesBefore += before.minutes; minutesAfter += before.minutes;

    if (ordered !== seg && better(after, before)) {
      // 시각 재계산 + HC-6 / HC-8 재검사. 원래 구간의 시작 시각보다 앞당기지 않는다(식사 이연 등 앞 핀 규칙 존중).
      const segStartOriginal = timeToMinutes(seg[0]!.item.start_time) - seg[0]!.item.travel_minutes_from_prev;
      const base = prevPin ? Math.max(timeToMinutes(prevPin.item.end_time), segStartOriginal) : segStartOriginal;
      let t = base, prev = from, ok = true; const rebuilt: ScheduledItem[] = [];
      for (const n of ordered) {
        const travel = estimateTravelMinutes(prev, n.coord);
        const start = t + travel, end = start + n.item.stay_minutes;
        if (end > dayEnd) { ok = false; break; }                                    // HC-6
        rebuilt.push({ ...n.item, start_time: minutesToTime(start), end_time: minutesToTime(end), travel_minutes_from_prev: travel });
        t = end; prev = n.coord;
      }
      if (ok && nextPin && to) {
        if (t + estimateTravelMinutes(prev, to) > timeToMinutes(nextPin.item.start_time)) ok = false; // HC-8
      }
      if (ok) { out.push(...rebuilt); reordered++; minutesAfter += after.minutes - before.minutes; i = j; continue; }
    }
    out.push(...seg.map(n => n.item));
    i = j;
  }
  return reordered > 0 ? { items: out, reorderedSegments: reordered, minutesBefore, minutesAfter } : { items: placed, reorderedSegments: 0, minutesBefore, minutesAfter: minutesBefore };
}

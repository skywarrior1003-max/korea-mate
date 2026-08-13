// This Trip 의 고정 일정을 스케줄러 `anchors` 로 옮기는 규칙.
//
// 스케줄러는 하루 단위로 돈다. 그래서 고정 일정은 **자기 날짜의 요청에만**
// anchor 로 실린다. 다른 날 요청에 실으면 그 날 일정이 통째로 뒤틀린다.
//
// 좌표를 남기는 것이 핵심이다. `TripAnchor` 에는 좌표가 없어서 엔진은
// `input.candidates` 에서 place_id 로 되찾는다. 고정 장소를 cart hint 에서
// 빼 버리면 엔진이 그 장소의 위치를 모르게 되고, 지금의 fail-closed 규칙에
// 걸려 그 앞뒤 시간이 통째로 비워진다.

import { fixedEndTime, fixedFitsDayWindow } from "./fixed-core.ts";
import type { CartFixed } from "../cart.ts";

/** 이 계층이 필요로 하는 것만. 화면의 CartItem 전체를 알 필요가 없다. */
export interface FixedHintLike {
  place_id: string;
  lat:      number;
  lng:      number;
  fixed?:   CartFixed | null;
}

export interface BuiltAnchor {
  place_id:   string;
  start_time: string;
  end_time:   string;
  is_fixed:   true;
}

export interface DayAnchorPlan<T extends FixedHintLike> {
  /** 이 날짜에 anchor 로 보낼 것. */
  anchors: BuiltAnchor[];
  /** 이 날짜의 cart hint 에 **반드시** 남겨야 하는 항목 (좌표 해석용). */
  keep: T[];
  /** 이 날짜에서 후보로 쓰면 안 되는 항목 — 다른 날짜에 고정된 장소다. */
  drop: T[];
  /** 하루 창을 벗어나 배치할 수 없는 고정 일정. 조용히 무시하지 않는다. */
  outOfWindow: T[];
}

/**
 * 하루치 계획을 만든다.
 *
 * - 오늘 고정된 장소 → anchor + hint 유지
 * - 다른 날 고정된 장소 → 오늘 후보에서 제외. 오늘 일반 후보로 써 버리면
 *   정작 그 날짜에 anchor 로 부를 때 이미 소비돼 있다
 * - 고정이 없는 장소 → 지금까지와 똑같이 둔다
 */
export function planDayAnchors<T extends FixedHintLike>(
  hints:    readonly T[],
  tripDate: string,
  dayStart: string,
  dayEnd:   string,
): DayAnchorPlan<T> {
  const anchors: BuiltAnchor[] = [];
  const keep: T[] = [];
  const drop: T[] = [];
  const outOfWindow: T[] = [];

  for (const h of hints) {
    const f = h.fixed;
    if (!f) continue;                       // 평범한 장소는 이 계층이 손대지 않는다
    if (f.date !== tripDate) { drop.push(h); continue; }
    if (!fixedFitsDayWindow(f, dayStart, dayEnd)) { outOfWindow.push(h); continue; }

    anchors.push({
      place_id:   h.place_id,
      start_time: f.startTime,
      end_time:   fixedEndTime(f),
      is_fixed:   true,
    });
    keep.push(h);
  }

  return { anchors, keep, drop, outOfWindow };
}

/**
 * 오늘 보낼 cart hint 목록을 만든다.
 *
 * 거리 필터는 "오늘 가기엔 너무 먼 픽" 을 다음 날로 미루는 장치다. 하지만
 * 오늘로 고정된 장소는 미룰 수 있는 것이 아니므로 거리와 무관하게 남긴다.
 * 좌표가 사라지면 엔진이 그 앞뒤를 비워 버린다.
 */
export function mergeDayHints<T extends FixedHintLike>(
  distanceFiltered: readonly T[],
  plan:             DayAnchorPlan<T>,
): T[] {
  const dropped = new Set(plan.drop.map(h => h.place_id));
  const out = distanceFiltered.filter(h => !dropped.has(h.place_id));
  const present = new Set(out.map(h => h.place_id));
  for (const h of plan.keep) {
    if (!present.has(h.place_id)) out.push(h);
  }
  return out;
}

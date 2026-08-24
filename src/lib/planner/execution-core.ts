// 오늘 여행(같은 /itinerary 안의 사용 상태)의 NOW/NEXT 판정 — 화면 없이.
// (TASK-MY-TRIP-EXECUTION-MODE-V1)
//
// 기준은 시각 하나다. 실제 시각(timeSource scheduler/user, planning-view-core 의
// shouldShowClock)이 있는 항목만 판정에 쓰고, 사실이 아닌 값은 만들지 않는다:
//   - 가짜 시각·추정 이동시간을 생성하지 않는다.
//   - GPS·시간만으로 "방문 완료"를 확정하지 않는다 — NOW 는 "가장 최근에 시작
//     시각이 지난 항목"일 뿐이고, 다음 timed 항목이 시작되면 넘어간다.
//   - 시간 없는 항목은 판정에서 제외한다. 목록에는 그대로 남는다.
//   - 마지막 항목 뒤는 체류시간을 알 때만, 그 예정 시간이 지나면 after(오늘 예정
//     시간이 모두 지남)로 마감한다. 체류시간을 모르면 during 으로 남긴다 — 끝났다는
//     사실을 지어내지 않는다.

import { shouldShowClock, timeToMinutes, parseDurationMinutes, type TimedLike } from "./planning-view-core.ts";

export type TodayPhase = "none" | "before" | "during" | "after";

export interface TodayPosition {
  phase:   TodayPhase;
  /** places 배열에서 NOW 항목의 index — during 일 때만 */
  nowIdx:  number | null;
  /** places 배열에서 다음 timed 항목의 index — before/during 에서 남은 것이 있을 때만 */
  nextIdx: number | null;
}

/** 저장된 Day 목록에서 한국 달력의 오늘에 해당하는 Day index. 없으면 null. */
export function findTodayDayIndex(
  days: ReadonlyArray<{ date?: string | null }>,
  todayISO: string,
): number | null {
  const i = days.findIndex(d => (d.date ?? "") === todayISO);
  return i >= 0 ? i : null;
}

export function todayPosition(places: readonly TimedLike[], nowHHMM: string): TodayPosition {
  const now = timeToMinutes(nowHHMM);
  const timed = places
    .map((p, i) => ({ p, i, start: shouldShowClock(p) ? timeToMinutes(p.time)! : null }))
    .filter((x): x is { p: TimedLike; i: number; start: number } => x.start !== null);
  if (now === null || timed.length === 0) return { phase: "none", nowIdx: null, nextIdx: null };

  const started  = timed.filter(x => x.start <= now);
  const upcoming = timed.filter(x => x.start > now);
  if (started.length === 0) return { phase: "before", nowIdx: null, nextIdx: upcoming[0]!.i };

  // 가장 최근에 시작한 항목 — 같은 시각이면 나중 index (순서 계약상 뒤가 나중이다)
  const cur = started.reduce((a, b) => (b.start >= a.start ? b : a));
  if (upcoming.length === 0) {
    const stay = parseDurationMinutes(cur.p.duration);
    if (stay !== null && now >= cur.start + stay) return { phase: "after", nowIdx: null, nextIdx: null };
    return { phase: "during", nowIdx: cur.i, nextIdx: null };
  }
  return { phase: "during", nowIdx: cur.i, nextIdx: upcoming[0]!.i };
}

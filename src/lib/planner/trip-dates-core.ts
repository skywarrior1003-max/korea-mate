// My Trip 여행 날짜 수정 — 화면 없이. (TASK-MY-TRIP-PICKS-TO-TRIP-JOURNEY-RESTORE-V1)
//
// Day 의 장소 구성은 그대로 두고 **달력 날짜만** 다시 맞춘다.
//   같은 일수  Day 1..N 의 date 를 새 시작일부터 하루씩 재매핑 — fixed/user 시각과
//              각 Day 안 순서(순서 계약)가 그대로 남는다.
//   기간 증가  기존 Day 전부 유지 + 빈 Day 를 뒤에 추가한다.
//   기간 감소  잘려 나가는 Day 를 `removedDayList` 로 그대로 돌려준다 — 여기서 지우지 않는다.
//              화면은 그 Day 의 장소를 This Trip 미배정으로 옮긴다(unplace-core) —
//              사용자 장소 데이터 손실 0 (Owner 확정, FINAL-PRODUCT-CORRECTION-V1).

export interface DayLike {
  date: string;
  dayNumber: number;
  places: unknown[];
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseUTC(iso: string): number | null {
  const m = ISO.exec(iso ?? "");
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function shiftDateISO(iso: string, offsetDays: number): string {
  const t = parseUTC(iso);
  if (t === null) return iso;
  return new Date(t + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** 시작~끝(포함) 일수. 형식이 틀리거나 끝이 시작보다 앞서면 null. */
export function tripDateSpan(startDate: string, endDate: string): number | null {
  const s = parseUTC(startDate), e = parseUTC(endDate);
  if (s === null || e === null || e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}

export interface RemappedTrip<T extends DayLike> {
  days: T[];
  /** 기간 감소로 잘려 나갈 Day 수 — 0 이면 손실 없음 */
  removedDays: number;
  /** 그 Day 들에 들어 있던 장소 수 — "미배정으로 옮겼어요" 안내 문구에 쓴다 */
  removedPlaces: number;
  /** 잘려 나간 Day 자체(날짜·장소 포함) — 화면이 장소를 미배정으로 옮길 때 쓴다 */
  removedDayList: T[];
}

export function remapTripDays<T extends DayLike>(
  days: readonly T[],
  newStart: string,
  newEnd: string,
): RemappedTrip<T> | null {
  const span = tripDateSpan(newStart, newEnd);
  if (span === null) return null;
  const kept: T[] = [];
  for (let i = 0; i < span; i++) {
    const date = shiftDateISO(newStart, i);
    const prev = days[i];
    kept.push(prev
      ? { ...prev, date, dayNumber: i + 1 }
      : ({ date, dayNumber: i + 1, places: [] } as unknown as T));
  }
  const removed = days.slice(span);
  return {
    days: kept,
    removedDays: removed.length,
    removedPlaces: removed.reduce((n, d) => n + (d.places?.length ?? 0), 0),
    removedDayList: removed,
  };
}

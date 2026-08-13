// This Trip 의 고정 일정에 대한 순수 규칙.
//
// 사용자가 "10월 17일 19시, 2시간" 이라고 적으면 그것이 사실이다. 우리는
// 종료시각을 추정하지 않고 그 소요시간으로만 계산한다. 공연이 언제 끝나는지
// 아는 척하면 그 순간부터 일정은 지어낸 것이 된다.
//
// 이 계층은 저장소도 화면도 스케줄러도 모른다. 문자열과 숫자만 다룬다.

import type { CartFixed } from "../cart.ts";

/** 소요시간 상한. 하루를 넘는 고정 일정은 이 제품이 다루는 대상이 아니다. */
export const FIXED_MAX_DURATION_MINUTES = 12 * 60;

export type FixedErrorCode =
  | "missingDate"
  | "missingTime"
  | "missingDuration"
  | "durationTooLong"
  | "dateOutOfTrip"
  | "endsPastMidnight";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function timeToMinutes(hhmm: string): number {
  const m = TIME_RE.exec(hhmm);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60), m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 여행 날짜 목록. 로컬 날짜 문자열만 더한다 — Date 로 바꿔 UTC 를 거치면
 * 시간대에 따라 하루가 밀린다.
 */
export function addOneDayISO(dateStr: string): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const y = parseInt(yStr ?? "2026", 10);
  const m = parseInt(mStr ?? "1",    10);
  const d = parseInt(dStr ?? "1",    10);
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim    = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let nd = d + 1, nm = m, ny = y;
  if (nd > (dim[m] ?? 31)) { nd = 1; nm += 1; }
  if (nm > 12)              { nm = 1; ny += 1; }
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function tripDates(startDate: string, numDays: number): string[] {
  if (!DATE_RE.test(startDate) || !Number.isInteger(numDays) || numDays < 1) return [];
  const out: string[] = [];
  let cur = startDate;
  for (let i = 0; i < numDays; i++) { out.push(cur); cur = addOneDayISO(cur); }
  return out;
}

export interface FixedDraft {
  date:            string;
  startTime:       string;
  durationMinutes: number | null;
}

/**
 * 사용자가 적은 값이 저장해도 되는 고정 일정인가.
 *
 * 잘못된 값을 조용히 버리고 평범한 장소로 두지 않는다. 그러면 사용자는
 * 자기가 지정한 약속이 일정에 들어간 줄 알게 된다.
 */
export function validateFixedDraft(
  draft:     FixedDraft,
  tripDays:  readonly string[],
): { ok: true; value: CartFixed } | { ok: false; error: FixedErrorCode } {
  const date = draft.date.trim();
  if (!DATE_RE.test(date)) return { ok: false, error: "missingDate" };

  const startTime = draft.startTime.trim();
  const start = timeToMinutes(startTime);
  if (Number.isNaN(start)) return { ok: false, error: "missingTime" };

  const dur = draft.durationMinutes;
  if (dur === null || !Number.isFinite(dur) || dur <= 0) {
    return { ok: false, error: "missingDuration" };
  }
  if (dur > FIXED_MAX_DURATION_MINUTES) return { ok: false, error: "durationTooLong" };

  // 여행 기간 밖의 날짜는 어느 날의 스케줄러에도 전달되지 않는다.
  // 저장을 허용하면 사용자는 넣었다고 믿는데 아무 날에도 나타나지 않는다.
  if (tripDays.length > 0 && !tripDays.includes(date)) {
    return { ok: false, error: "dateOutOfTrip" };
  }

  // 자정을 넘기면 그 다음 날짜의 일정이 되어 버린다. 하루 단위 스케줄러가
  // 다룰 수 없으므로 입력에서 막는다.
  if (start + dur > 24 * 60) return { ok: false, error: "endsPastMidnight" };

  return { ok: true, value: { date, startTime, durationMinutes: dur } };
}

/** 저장된 고정 일정의 종료시각. 소요시간으로만 계산한다. */
export function fixedEndTime(fixed: CartFixed): string {
  return minutesToTime(timeToMinutes(fixed.startTime) + fixed.durationMinutes);
}

/**
 * 하루의 시간 창 안에 들어가는가.
 *
 * 창은 도착·출발 시각이 반영된 값이라 화면에서는 알 수 없다. 그래서 이 검사는
 * 일정 생성 시점에 한 번 더 한다.
 */
export function fixedFitsDayWindow(
  fixed:     CartFixed,
  dayStart:  string,
  dayEnd:    string,
): boolean {
  const s = timeToMinutes(fixed.startTime);
  const e = s + fixed.durationMinutes;
  const ws = timeToMinutes(dayStart), we = timeToMinutes(dayEnd);
  if ([s, ws, we].some(Number.isNaN)) return false;
  return s >= ws && e <= we;
}

/** 서로 시간이 겹치는 고정 일정 쌍이 있는가. 같은 날짜끼리만 본다. */
export function hasFixedOverlap(list: readonly CartFixed[]): boolean {
  const byDate = new Map<string, { s: number; e: number }[]>();
  for (const f of list) {
    const s = timeToMinutes(f.startTime);
    if (Number.isNaN(s)) continue;
    const slot = { s, e: s + f.durationMinutes };
    const arr = byDate.get(f.date);
    if (arr) arr.push(slot); else byDate.set(f.date, [slot]);
  }
  for (const slots of byDate.values()) {
    slots.sort((a, b) => a.s - b.s);
    for (let i = 1; i < slots.length; i++) {
      if (slots[i]!.s < slots[i - 1]!.e) return true;
    }
  }
  return false;
}

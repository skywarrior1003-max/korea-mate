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
  | "missingEnd"
  | "endBeforeStart"
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

// ── 화면이 쓰는 형태 ─────────────────────────────────────────────────────────
//
// 사용자는 "몇 분 걸리나요" 를 생각하지 않는다. 시작과 끝을 안다. 그래서
// 화면은 Date / Start / End 만 묻고, 저장 구조는 기존 그대로 둔다.
// duration 은 두 시각의 차이일 뿐이며 사용자에게 보여주지 않는다.

export interface FixedRangeDraft {
  date:      string;
  startTime: string;
  endTime:   string;
}

export function validateFixedRange(
  draft:    FixedRangeDraft,
  tripDays: readonly string[],
): { ok: true; value: CartFixed } | { ok: false; error: FixedErrorCode } {
  const start = timeToMinutes(draft.startTime.trim());
  if (Number.isNaN(start)) return { ok: false, error: "missingTime" };

  const end = timeToMinutes(draft.endTime.trim());
  // 끝나는 시각이 없거나 시작보다 이르면 우리가 고쳐 주지 않는다.
  // "아마 다음 날이겠지" 같은 추측은 사용자가 적지 않은 일정을 만드는 것이다.
  if (Number.isNaN(end)) return { ok: false, error: "missingEnd" };
  if (end <= start)      return { ok: false, error: "endBeforeStart" };

  return validateFixedDraft(
    { date: draft.date, startTime: draft.startTime, durationMinutes: end - start },
    tripDays,
  );
}

/** 저장값을 화면 입력 형태로 되돌린다. */
export function toRangeDraft(fixed: CartFixed): FixedRangeDraft {
  return { date: fixed.date, startTime: fixed.startTime, endTime: fixedEndTime(fixed) };
}

/**
 * 하루의 시간 창 안에 들어가는가.
 *
 * ⚠ 이 창은 **자동 추천이 채우는 범위**(보통 09:00~21:00)다. 사용자가 직접
 * 정한 일정을 이 값으로 막으면 안 된다 — 21시에 끝나는 기본값 때문에 19시
 * 공연을 못 넣는 일이 그래서 생겼다. 그 판정에는 아래 hard boundary 를 쓴다.
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

/**
 * 실제로 그 시각에 있을 수 있는가.
 *
 * 자동 추천 범위와 다르다. 09:00~21:00 은 "이 시간대에 알아서 채워 준다" 는
 * 기본값일 뿐이고, 진짜 못 넘는 선은 그날 도착 시각과 출발 시각이다.
 * 비행기가 22시에 뜨는데 21시 공연을 잡을 수는 없지만, 단지 기본값이 21시라는
 * 이유로 19시 공연을 거절해서는 안 된다.
 *
 * 경계가 없는 쪽은 null 이다. 중간 날들에는 대개 양쪽 다 없다.
 */
export function fixedFitsHardBoundary(
  fixed:     CartFixed,
  hardStart: string | null,
  hardEnd:   string | null,
): boolean {
  const s = timeToMinutes(fixed.startTime);
  if (Number.isNaN(s)) return false;
  const e = s + fixed.durationMinutes;

  if (hardStart !== null) {
    const hs = timeToMinutes(hardStart);
    if (Number.isNaN(hs) || s < hs) return false;
  }
  if (hardEnd !== null) {
    const he = timeToMinutes(hardEnd);
    if (Number.isNaN(he) || e > he) return false;
  }
  // 자정을 넘기는 값은 입력 단계에서 이미 막혔지만 여기서도 한 번 더 본다.
  return e <= 24 * 60;
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

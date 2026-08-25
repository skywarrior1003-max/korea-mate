// My Trip Planning 화면의 표시 규칙 — 화면 없이 (TASK-MY-TRIP-PLANNING-FINAL-V1).
//
// 시안(my_trip_planning_final)은 항목마다 **실제 시작 시각**·체류시간·이동정보를 보여 준다.
// 여기서 지키는 한 가지: **시각을 지어내지 않는다.** 스케줄러가 준 시각(`timeSource: "scheduler"`)만
// 표시하고, 보관함 추가·내 장소 추가처럼 기본값이 채워진 시각은 시간대 라벨로만 보여 준다.
// 이동정보도 새로 추정하지 않는다 — 두 항목의 스케줄러 시각 사이의 빈 시간을 읽어 낼 뿐이다.

export interface TimedLike {
  time?: string | null;
  duration?: string | null;
  timeSource?: string | null;
}

/** "90m" · "1.5h" · "120" → 분. 모르면 null — 0 으로 꾸미지 않는다. */
export function parseDurationMinutes(d: string | null | undefined): number | null {
  if (!d) return null;
  const s = String(d).trim().toLowerCase();
  const h = s.match(/^(\d+(?:\.\d+)?)\s*h(?:r|rs|ours?)?$/);
  if (h) return Math.round(parseFloat(h[1]!) * 60);
  const m = s.match(/^(\d+)\s*(?:m|min|mins|minutes?)?$/);
  if (m) return parseInt(m[1]!, 10);
  return null;
}

export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1]!, 10), mi = parseInt(m[2]!, 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 실제로 정해진 시각만 화면에 낸다 — 스케줄러가 배정했거나(`"scheduler"`) 사용자가 직접 고친(`"user"`) 시각. 기본값으로 채워진 시각은 내지 않는다. */
export const REAL_TIME_SOURCES: readonly string[] = ["scheduler", "user"];
export function shouldShowClock(p: TimedLike): boolean {
  return REAL_TIME_SOURCES.includes(p.timeSource ?? "") && timeToMinutes(p.time) !== null;
}

/** "14:00" → locale 시각 문자열("오후 2:00" · "2:00 PM"). 날짜는 표시에 쓰이지 않는 고정값이다. */
export function formatClock(hhmm: string | null | undefined, locale: string): string | null {
  const mins = timeToMinutes(hhmm);
  if (mins === null) return null;
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(mins / 60), mins % 60));
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
  } catch {
    return hhmm ?? null;
  }
}

export interface DurationLabels {
  hours:        (h: number) => string;
  hoursMinutes: (h: number, m: number) => string;
  minutes:      (m: number) => string;
}

/** 분 → "1시간 30분" / "45분". 0 이하·null 은 표시하지 않는다. */
export function formatDuration(minutes: number | null, labels: DurationLabels): string | null {
  if (minutes === null || !(minutes > 0)) return null;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h > 0 && m > 0) return labels.hoursMinutes(h, m);
  if (h > 0) return labels.hours(h);
  return labels.minutes(m);
}

/** 이동 시간 표시 상한 — 그 이상 비면 "이동" 이 아니라 빈 시간이다. */
export const MAX_TRANSIT_MINUTES = 120;

/**
 * 앞 항목이 끝난 시각과 다음 항목이 시작하는 시각 사이의 빈 시간 — 둘 다 스케줄러 시각일 때만.
 * 체류시간을 모르거나 순서가 어긋나면 null. 0 은 "바로 이어짐" 이라 표시하지 않는다.
 */
export function transitMinutes(prev: TimedLike, next: TimedLike): number | null {
  if (!shouldShowClock(prev) || !shouldShowClock(next)) return null;
  const start = timeToMinutes(prev.time)!, stay = parseDurationMinutes(prev.duration), nextStart = timeToMinutes(next.time)!;
  if (stay === null) return null;
  const gap = nextStart - (start + stay);
  if (gap <= 0 || gap > MAX_TRANSIT_MINUTES) return null;
  return gap;
}

/**
 * 하루 안 순서 계약 (TASK-MY-TRIP-EDIT-ORDER-TIME-CONTRACT-FIX-V1).
 *
 * 실제 시각이 있는 항목(shouldShowClock: scheduler/user 시각)은 **시각**이 순서를 정한다.
 * 시각이 없는 항목(보관함·내 장소 추가처럼 기본값만 채워진 것)은 **사용자가 둔 자리**가
 * 순서다 — 배열 위치를 그대로 지키고, 시각 있는 항목들만 나머지 자리에 시간 오름차순으로
 * 재배치한다. 같은 시각은 원래 순서를 유지한다(stable). 결과는 멱등이다.
 */
export function orderDayPlaces<T extends TimedLike>(places: readonly T[]): T[] {
  const timed: { p: T; i: number }[] = [];
  places.forEach((p, i) => { if (shouldShowClock(p)) timed.push({ p, i }); });
  if (timed.length < 2) return [...places];
  const sorted = [...timed].sort((a, b) =>
    (timeToMinutes(a.p.time)! - timeToMinutes(b.p.time)!) || (a.i - b.i));
  const out = [...places];
  timed.forEach(({ i }, k) => { out[i] = sorted[k]!.p; });
  return out;
}

/** 카테고리 문자열을 화면용으로 — "HISTORICAL_SITE" 같은 내부 표기를 사람이 읽게 */
export function humanizeCategory(category: string | null | undefined): string {
  if (!category) return "";
  return category.replace(/[_-]+/g, " ").trim().replace(/\s+/g, " ")
    .split(" ").map(w => (w.length > 1 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(" ");
}

// ── B안 표시 규칙 (TASK-MY-TRIP-TIMELINE-B-AND-DEDUP-V1-R1) ───────────────────
// 화면에 정확 시각을 내는 것은 **지정한 시간뿐**이다: fixed 이거나 사용자가 직접
// 고친 시각(timeSource "user"). 스케줄러 추정 시각은 저장·판정에는 남지만 화면에는
// 내지 않는다 — 지킬 수 없는 정밀도를 보여 주지 않기 위해서다.
export interface ExactTimeLike extends TimedLike { isFixed?: boolean | null; }

export function showsExactTime(p: ExactTimeLike): boolean {
  return (Boolean(p.isFixed) || p.timeSource === "user") && timeToMinutes(p.time) !== null;
}

/**
 * 지정 시각 표기. fixed 는 체류시간을 알면 `20:00–21:00`, 모르면 `20:00`.
 * 사용자가 고친 시각은 시작만 안다 — `20:00`. 숫자는 locale 공통이라 그대로 쓴다.
 */
export function exactTimeLabel(p: ExactTimeLike): string | null {
  if (!showsExactTime(p)) return null;
  const start = timeToMinutes(p.time)!;
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const stay = p.isFixed ? parseDurationMinutes(p.duration) : null;
  return stay !== null && stay > 0 ? `${hhmm(start)}–${hhmm(start + stay)}` : hhmm(start);
}

/**
 * KO 화면의 장소명 — 데이터에 한국어 제목이 **실제로 있을 때만** 우선한다.
 * 없으면 원문 그대로. 번역을 만들지 않는다.
 */
export function localizedPlaceName(
  name: string,
  l10n: { ko?: string | null } | null | undefined,
  locale: string,
): string {
  if (locale.toLowerCase().startsWith("ko")) {
    const ko = l10n?.ko?.trim();
    if (ko) return ko;
  }
  return name;
}

/**
 * 방문 순번 — 숙소(체크인) 항목은 방문지가 아니라 "머무는 곳" 이라 번호를 받지 않는다(null).
 * 그래서 정상 신규 일정에서는 타임라인·편집 리스트·지도(숙소는 좌표를 저장하지 않아
 * 지도에 없다)의 번호가 같은 1..N 이다.
 */
export function visitOrdinals(places: ReadonlyArray<{ isAccommodation?: boolean | null }>): (number | null)[] {
  let n = 0;
  return places.map(p => (p.isAccommodation ? null : ++n));
}

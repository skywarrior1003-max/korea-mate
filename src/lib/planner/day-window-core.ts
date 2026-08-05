// 플래너 상세의 날짜 탐색 계산.
//
// 지도 관련 결함(913430d)이 단위 테스트를 전부 통과하고도 운영에 나간 이유는
// 판단이 렌더 콜백 안에 섞여 있었기 때문이다. 날짜 창 계산도 같은 성격이라
// 화면 없이 결정되는 부분만 여기로 뺀다.
//
// 승인 디자인은 모바일에서 날짜 3개를 **완전히** 보여준다. 다음 날짜를 반쯤
// 잘라 보여주는 방식은 쓰지 않는다(사용자 확정 결정).

/** 모바일에서 한 번에 완전 노출할 날짜 수. */
export const DAY_WINDOW_SIZE = 3;

/**
 * 현재 Day 를 가운데 두는 3일 창을 만든다.
 *
 * 전체가 3일 미만이면 있는 만큼만 돌려준다 — 빈 칸을 만들어 3개를 억지로
 * 채우지 않는다. 시작·마지막 구간에서는 가운데 배치가 불가능하므로 경계에
 * 붙인다(1·2·3 / total-2·total-1·total).
 *
 * 반환값은 **1-based Day 번호** 배열이다. 화면이 쓰는 단위와 같아야 off-by-one
 * 이 생기지 않는다.
 */
export function dayWindow(totalDays: number, currentDay: number, size = DAY_WINDOW_SIZE): number[] {
  const total = Math.max(0, Math.floor(totalDays));
  if (total === 0) return [];
  const n = Math.min(size, total);
  const cur = clampDay(total, currentDay);

  // 가운데 정렬 시작점 → 양 끝으로 밀어 넣는다
  let start = cur - Math.floor(n / 2);
  if (start < 1) start = 1;
  if (start + n - 1 > total) start = total - n + 1;

  return Array.from({ length: n }, (_, i) => start + i);
}

/** Day 번호를 유효 범위로 자른다. 잘못된 입력은 1일차로 본다. */
export function clampDay(totalDays: number, day: number): number {
  const total = Math.max(1, Math.floor(totalDays));
  if (!Number.isFinite(day)) return 1;
  return Math.min(total, Math.max(1, Math.floor(day)));
}

/** 이전/다음 Day. 경계를 넘지 않는다 — 순환하지 않는다. */
export function stepDay(totalDays: number, current: number, dir: -1 | 1): number {
  return clampDay(totalDays, clampDay(totalDays, current) + dir);
}

export function canStep(totalDays: number, current: number, dir: -1 | 1): boolean {
  const cur = clampDay(totalDays, current);
  return dir === -1 ? cur > 1 : cur < Math.max(1, Math.floor(totalDays));
}

// ── 날짜 표기 ────────────────────────────────────────────────────────────────

/**
 * 일정의 날짜 문자열을 하루 밀리지 않게 다룬다.
 *
 * `new Date("2026-10-15")` 는 UTC 자정으로 파싱되어 KST 보다 뒤에 있는
 * 타임존에서는 전날로 표시된다. 저장된 값은 달력 날짜(YYYY-MM-DD)이므로
 * 시간대를 붙이지 않고 숫자로 직접 읽는다.
 */
export function parsePlainDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** 시작일 + N일. 월·연 경계를 넘어가도 정확해야 한다. */
export function addPlainDays(start: string, days: number): string | null {
  const p = parsePlainDate(start);
  if (p === null) return null;
  // UTC 기준으로만 더하고 UTC 로만 읽는다 — 로컬 시간대가 끼어들 여지를 없앤다.
  const t = Date.UTC(p.y, p.m - 1, p.d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * 날짜 칩에 넣을 짧은 표기.
 *
 * 320px 에서 폭을 3등분하면 한 칸이 100px 이 안 된다. 요일·연도를 넣으면
 * 잘리므로 월·일만 쓴다. CJK 는 "10월 15일" 대신 "10/15" 로 더 짧게 간다 —
 * 세 칸이 모두 완전히 보여야 한다는 결정이 우선이다.
 */
export function formatDayChipDate(dateValue: string | null | undefined, locale: string): string {
  const p = parsePlainDate(dateValue);
  if (p === null) return "";
  if (locale === "en") return `${MONTH_SHORT_EN[p.m - 1]} ${p.d}`;
  return `${p.m}/${p.d}`;
}

/** 전체 Day 목록 dialog 에서 쓰는 조금 더 긴 표기. */
export function formatDayListDate(dateValue: string | null | undefined, locale: string): string {
  const p = parsePlainDate(dateValue);
  if (p === null) return "";
  if (locale === "en") return `${MONTH_SHORT_EN[p.m - 1]} ${p.d}, ${p.y}`;
  if (locale === "ko") return `${p.y}년 ${p.m}월 ${p.d}일`;
  if (locale === "ja") return `${p.y}年${p.m}月${p.d}日`;
  return `${p.y}年${p.m}月${p.d}日`;   // zh
}

// ── 스와이프 판정 ────────────────────────────────────────────────────────────

/** 수평 이동으로 인정할 최소 거리(px). 짧은 탭이 스와이프로 오인되지 않게 한다. */
export const SWIPE_MIN_DISTANCE = 48;
/** 세로 스크롤을 방해하지 않도록, 수평이 수직보다 이만큼 커야 한다. */
export const SWIPE_AXIS_RATIO = 1.4;

/**
 * 스와이프 제스처를 Day 이동으로 해석한다.
 *
 * 세로 스크롤 우선이 원칙이다. 손가락이 비스듬히 움직이면 대부분 스크롤
 * 의도이므로, 수평 성분이 수직 성분보다 확실히 클 때만 Day 를 옮긴다.
 */
export function swipeIntent(dx: number, dy: number): -1 | 1 | 0 {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SWIPE_MIN_DISTANCE) return 0;
  if (ax < ay * SWIPE_AXIS_RATIO) return 0;   // 세로 스크롤로 본다
  return dx < 0 ? 1 : -1;                      // 왼쪽으로 밀면 다음 Day
}

// ── 장소 유형 → 아이콘 ───────────────────────────────────────────────────────

export type TimelineIconKind =
  | "food" | "camera" | "nature" | "event" | "stay" | "transit" | "pin";

/** 공백·하이픈·대소문자 차이를 없앤다. "Cafe  Street" 와 "cafe-street" 가 같아진다. */
function normalizeKind(v: string): string {
  return v.toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 값 전체가 정확히 일치할 때 쓰는 alias 표.
 *
 * 부분 문자열 매칭만 쓰면 우연히 걸린다 — 실제로 "Theme Park" 가 "park" 때문에
 * nature 로, "Transit Landmark" 가 "landmark" 때문에 camera 로 잡혔다.
 * 운영에 실제로 들어 있는 값은 여기서 먼저 확정하고, 표에 없는 값만 키워드
 * 추정으로 넘긴다.
 */
const KIND_ALIASES: Readonly<Record<string, TimelineIconKind>> = Object.freeze({
  // food
  "market": "food", "cafe": "food", "cafe street": "food",
  "restaurant": "food", "food": "food", "dining": "food", "bakery": "food",
  // nature
  "park": "nature", "walking trail": "nature", "hiking": "nature",
  "beach": "nature", "island": "nature", "nature": "nature", "garden": "nature",
  // attraction
  "landmark": "camera", "viewpoint": "camera", "history": "camera",
  "shopping": "camera", "observatory": "camera", "resort area": "camera",
  "art": "camera", "theme park": "camera", "museum": "camera",
  "temple": "camera", "culture": "camera", "attraction": "camera",
  "sightseeing": "camera", "photo spot": "camera", "palace": "camera",
  // transportation
  "transit landmark": "transit", "transportation": "transit",
  "transit": "transit", "bus": "transit", "train": "transit",
  "airport": "transit", "station": "transit", "subway": "transit",
  // event
  "event": "event", "festival": "event", "concert": "event",
  // accommodation
  "accommodation": "stay", "hotel": "stay", "stay": "stay",
  "hostel": "stay", "guesthouse": "stay", "resort": "stay",
});

/**
 * 표에 없는 값을 위한 키워드 추정. 구체적인 것부터 본다 —
 * transit 을 attraction 보다 먼저 봐야 "transit landmark" 류가 교통으로 간다.
 */
const KIND_PATTERNS: ReadonlyArray<readonly [RegExp, TimelineIconKind]> = Object.freeze([
  [/transport|transit|airport|station|subway|\bbus\b|\btrain\b|교통|공항|역/, "transit"],
  [/accommodation|hotel|hostel|guesthouse|\bstay\b|숙박|호텔/,               "stay"],
  [/event|festival|concert|k-?pop|공연|축제/,                                "event"],
  [/restaurant|\bfood\b|cafe|coffee|dining|market|bakery|음식|식당|카페/,     "food"],
  [/theme park|attraction|culture|sightsee|photo|museum|landmark|temple|palace|viewpoint|observatory|history|shopping|\bart\b|관광|명소/, "camera"],
  [/nature|\bpark\b|beach|mountain|garden|trail|hiking|island|자연|공원/,     "nature"],
]);

/**
 * 실제 category·subcategory 문자열에서 아이콘 종류를 고른다.
 *
 * 운영에서 이 함수가 받는 값은 5종 enum 이 아니다. Pages Function 이
 * `row.subcategory || row.category` 로 내보내기 때문에 city_spots 의 자유
 * 문자열(Park, Cafe Street, Transit Landmark …)이 그대로 들어온다.
 *
 * 새 DB category 를 만들지 않는다 — 지금 저장돼 있는 값을 그대로 읽는다.
 * 판단이 서지 않으면 지도 핀으로 둔다. 없는 의미를 지어내지 않는다.
 */
export function timelineIconKind(category?: string | null, subcategory?: string | null): TimelineIconKind {
  // 구체적인 값(subcategory)을 먼저 본다
  for (const raw of [subcategory, category]) {
    if (typeof raw !== "string") continue;
    const k = normalizeKind(raw);
    if (!k) continue;
    const hit = KIND_ALIASES[k];
    if (hit) return hit;
  }

  const joined = normalizeKind(`${subcategory ?? ""} ${category ?? ""}`);
  if (!joined) return "pin";
  for (const [re, kind] of KIND_PATTERNS) {
    if (re.test(joined)) return kind;
  }
  return "pin";
}

// 공개된 여행을 받는 사람의 일정으로 만든다.
//
// 공개물과 무엇이 다른가
//   공개 Story 는 감상하라고 내보내는 것이라 좌표가 필요 없다. 복사본은 받은
//   사람이 **실제로 그 여행을 다니는** 일정이다 — 지도에 핀이 찍혀야 하고
//   스케줄러가 다시 계산할 수 있어야 한다. 그래서 좌표를 남긴다.
//
//   두 통로의 요구가 반대라서 함수도 둘이다. 하나로 합치면 공개물에 좌표가
//   새거나 복사본의 지도가 비어 버린다. `public-story.ts` 참조.
//
// 그래도 가져오지 않는 것
//   원작성자가 자기 My Place 에 적어 둔 메모. 그건 여행 계획이 아니라 일기다.
//   그리고 `user_spot:<원작성자 uuid>` 라는 열쇠 — 받은 사람 기기에서 그 값은
//   "내 My Place" 로 오인되고(Saved 해제와 개인화 힌트가 이 접두사로 갈린다),
//   남의 장소 id 를 굳이 건네줄 이유도 없다. 이름·분류·좌표·시각만 남기면
//   받은 사람이 그 여행을 다니는 데 부족한 것이 없다.
//
// 사진과 감성 기록
//   `trip_moments` 에 있고 `days` 에 들어오지 않는다. 복사 API 는 그 테이블을
//   읽지도 쓰지도 않으므로 여기서 따로 지울 것이 없다.

type RawPlace = Record<string, unknown>;
type RawDay   = Record<string, unknown>;

/** `src/lib/place-identity.ts` 가 만드는 접두사. 여기서는 읽기만 한다. */
const USER_SPOT_PREFIX = "user_spot:";

function isUserSpot(p: RawPlace): boolean {
  if (p.source === "user_spot") return true;
  const key = p.sourceKey;
  return typeof key === "string" && key.startsWith(USER_SPOT_PREFIX);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function put(into: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) into[key] = value;
}

const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ── 장소 ─────────────────────────────────────────────────────────────────────
export function copiedPlace(raw: unknown): Record<string, unknown> {
  const p: RawPlace = (raw && typeof raw === "object") ? raw as RawPlace : {};
  const mine = isUserSpot(p);

  const out: Record<string, unknown> = {
    name:     str(p.name),
    category: str(p.category),
    location: str(p.location),
    time:     str(p.time),
    duration: str(p.duration),
  };
  if (typeof p.slot === "string") put(out, "slot", p.slot);
  if (p.isAccommodation === true) out.isAccommodation = true;

  // 지도와 스케줄러가 쓰는 값 — 남긴다
  if (isCoord(p.lat)) out.lat = p.lat;
  if (isCoord(p.lng)) out.lng = p.lng;

  if (mine) {
    // 원작성자의 메모는 가져오지 않는다. 원작성자의 열쇠도 가져오지 않는다.
    return out;
  }

  if (typeof p.tips === "string" && p.tips.length > 0)          out.tips = p.tips;
  if (typeof p.googleMapsUrl === "string" && p.googleMapsUrl)   out.googleMapsUrl = p.googleMapsUrl;
  if (typeof p.place_id === "string" || typeof p.place_id === "number") out.place_id = p.place_id;
  if (p.source === "city_spot")                                 out.source = "city_spot";
  if (typeof p.sourceKey === "string" && p.sourceKey)           out.sourceKey = p.sourceKey;
  return out;
}

// ── 하루 ─────────────────────────────────────────────────────────────────────
export function copiedDay(raw: unknown): Record<string, unknown> {
  const d: RawDay = (raw && typeof raw === "object") ? raw as RawDay : {};
  const out: Record<string, unknown> = {
    places: Array.isArray(d.places) ? d.places.map(copiedPlace) : [],
  };
  put(out, "dayNumber", typeof d.dayNumber === "number" ? d.dayNumber : undefined);
  // COMMUNITY-V1 §2: 원 여행 **날짜**는 복사하지 않는다. 받은 사람의 일정은
  // 복사 시점 기준으로 다시 시작하고(아래 copiedDateRange), day 안의 원 날짜
  // 라벨이 남으면 새 날짜와 어긋난 채 노출된다. dayNumber 만으로 충분하다.
  return out;
}

// ── days ─────────────────────────────────────────────────────────────────────
/**
 * 저장 형식은 그대로 둔다 — 받은 사람의 일정 화면도 같은 파서로 읽는다.
 * `unscheduled` 는 비운다. 그 자리에 있던 것은 원작성자의 This Trip 이지
 * 받은 사람의 것이 아니다.
 */
export function buildCopiedItinerary(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(copiedDay);

  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2) {
      return {
        __v: 2,
        scheduled:   Array.isArray(v2.scheduled) ? v2.scheduled.map(copiedDay) : [],
        unscheduled: [],
      };
    }
  }
  return [];
}

// ── 복사본의 제목·날짜 (COMMUNITY-RECOMMENDATION-…-V1 §2) ────────────────────
//
// 원작자의 Story 제목과 원 여행 날짜는 복사 금지 항목이다.
//  · 제목: 도시명 기반의 중립 제목을 받은 사람의 locale 로 만든다. 사용자는
//    자기 일정 화면에서 언제든 바꿀 수 있다(기존 제목 편집 기능 그대로).
//  · 날짜: 일수(구조)만 유지하고 시작일을 복사 시점(KST 오늘)으로 옮긴다.

import { CITY_DISPLAY_NAMES, resolveCitySlug, type CityLocale } from "../../data/cities/identity.ts";

const COPY_LOCALES: readonly CityLocale[] = ["ko", "en", "ja", "zh"];

export function normalizeCopyLocale(v: unknown): CityLocale {
  return typeof v === "string" && (COPY_LOCALES as readonly string[]).includes(v)
    ? (v as CityLocale) : "en";
}

/** 도시명 기반 중립 제목 — 원 제목을 쓰지 않는다. 도시 해석 실패 시 locale 일반형. */
export function copiedTripTitle(city: string | null | undefined, locale: CityLocale): string {
  const slug = resolveCitySlug(city ?? null);
  const name = slug ? CITY_DISPLAY_NAMES[slug][locale] : null;
  switch (locale) {
    case "ko": return name ? `${name} 여행` : "나의 여행";
    case "ja": return name ? `${name}の旅` : "私の旅";
    case "zh": return name ? `${name}之旅` : "我的旅行";
    default:   return name ? `${name} Trip` : "My Trip";
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 오늘 — 한국 여행 서비스라 사용자 체감 날짜와 맞춘다 */
export function kstToday(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 원 기간의 **길이만** 유지해 복사 시점부터 다시 편다.
 * 원 날짜가 깨져 있으면 1일짜리로 시작한다 — 원 값을 흘려보내지 않는다.
 */
export function copiedDateRange(
  sourceStart: unknown, sourceEnd: unknown, now: number = Date.now(),
): { start_date: string; end_date: string } {
  const start = kstToday(now);
  let durationDays = 0;
  if (typeof sourceStart === "string" && typeof sourceEnd === "string"
      && DATE_RE.test(sourceStart) && DATE_RE.test(sourceEnd)) {
    const diff = Math.round((Date.parse(sourceEnd) - Date.parse(sourceStart)) / DAY_MS);
    if (Number.isFinite(diff) && diff >= 0 && diff <= 60) durationDays = diff;
  }
  const end = new Date(Date.parse(start) + durationDays * DAY_MS).toISOString().slice(0, 10);
  return { start_date: start, end_date: end };
}

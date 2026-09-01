// V1-A — Place Detail 순수 로직
//
// 왜 분리했나
//   화면 컴포넌트 안에 두면 브라우저 없이는 검증할 수 없다. locale fallback·
//   provenance 분류·JSON-LD 누락 필드 처리는 조합 경우의 수가 많아 눈으로 확인할
//   수 없으므로, node --experimental-strip-types 로 돌릴 수 있게 순수 함수로 뺀다.
//   (cover-core.ts · memo-patch-core.ts 와 같은 패턴)
//
// 이 파일이 지키는 계약
//   - 없는 값을 만들어내지 않는다. 추정 주소·추정 좌표·추정 영업시간·평점 금지.
//   - 일정 입력 객체에 상업 문맥을 넣지 않는다 (Product Constitution §14).
//   - 운영 테이블에 있다는 이유만으로 공식 기관 정보라고 표시하지 않는다 (§8).

import { stripIngestAnnotation } from "../place-display-name.ts";
import type { CitySpotRow } from "@/lib/city-spots";
import type { EventItem } from "@/lib/cart";
import { citySpotSourceKey } from "../place-identity.ts";

export const SITE_ORIGIN = "https://gokoreamate.com";

// ── 0. 클라이언트 전달 뷰 ────────────────────────────────────────────────────
//
// 실측(2026-07-29): city_spots 86행 중 79행이 affiliate_url·affiliate_provider 에
// 값을 가진다. 서버 컴포넌트가 CitySpotRow 전체를 클라이언트 props 로 넘기면 그
// 값이 정적 HTML 의 RSC 페이로드에 그대로 직렬화돼 모든 방문자 브라우저로 나간다.
// 화면에 그리지 않아도 기계가 읽을 수 있는 상업 문맥이므로 애초에 보내지 않는다.
//
// Product Constitution §14 — 상품 연결은 일정 확정 이후 추천·렌더링 계층에서만
// 수행한다. 장소 상세는 그 계층이 아니다.
//
// DB·타입에서 제휴 원본 필드를 삭제하지 않는다. 전달 경계만 좁힌다.

export type PlaceView = Omit<
  CitySpotRow,
  "affiliate_url" | "affiliate_provider" | "rating" | "difficulty" | "created_at" | "updated_at"
>;

const PLACE_VIEW_KEYS = [
  "id", "city", "name", "name_l10n", "category", "subcategory", "district",
  "address", "description", "desc_l10n", "why_it_matters", "why_l10n",
  "image_url", "map_url", "naver_map_url", "lat", "lng", "duration_minutes",
  "best_time_slot", "opening_hours", "tags", "solo_friendly",
  "foreign_card_accepted", "cash_only", "source_type", "external_id",
  "official_url", "entry_fee",
] as const satisfies readonly (keyof PlaceView)[];

/** l10n 객체에서 내부 메모인 값만 제거한다 (다른 locale 값은 보존) */
function sanitizeL10n(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && isInternalMemo(val)) continue;
    out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * 허용 목록 기반 projection — 컬럼이 추가돼도 자동으로 새 나가지 않는다.
 *
 * 추가로 내부 운영 메모를 **전달 단계에서 제거**한다. 화면에서 가리는 것만으로는
 * 부족하다 — 원본 값이 props 로 넘어가면 정적 HTML 의 RSC 페이로드에 그대로
 * 직렬화돼 기계가 읽을 수 있다. affiliate 컬럼을 뺀 것과 같은 이유다.
 */
export function toPlaceView(row: CitySpotRow): PlaceView {
  const src = row as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PLACE_VIEW_KEYS) out[k] = src[k];

  for (const k of ["why_it_matters", "description"]) {
    if (typeof out[k] === "string" && isInternalMemo(out[k] as string)) out[k] = null;
  }
  for (const k of ["why_l10n", "desc_l10n"]) {
    out[k] = sanitizeL10n(out[k]);
  }

  return out as unknown as PlaceView;
}

// ── 1. 다국어 fallback ───────────────────────────────────────────────────────
//
// city_spots 의 name_l10n / desc_l10n / why_l10n 은 현재 전부 NULL 이다.
// 보조 데이터 보강으로 값이 채워지는 순간 화면 코드를 다시 쓰지 않고 켜지도록
// 지금 fallback 체인만 만들어 둔다. 값이 없는 동안 영어 표시가 회귀하면 안 된다.

/** 문자열이 실제 내용을 가지는가 (빈 문자열·공백만인 값은 없는 것으로 본다) */
function hasText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * l10n 객체에서 locale 값을 꺼내고, 없으면 fallback 을 쓴다.
 * 객체 자체가 null · locale 키 없음 · 빈 문자열 · 공백 문자열 · 미지원 locale 을
 * 모두 "없음" 으로 처리한다. 최종 fallback 까지 없으면 null.
 */
export function pickLocalized(
  l10n: unknown,
  locale: string,
  fallback: string | null,
): string | null {
  if (l10n && typeof l10n === "object" && !Array.isArray(l10n)) {
    const v = (l10n as Record<string, unknown>)[locale];
    if (hasText(v)) return v.trim();
  }
  return hasText(fallback) ? fallback.trim() : null;
}

export interface LocalizedPlaceText {
  name:          string | null;
  description:   string | null;
  whyItMatters:  string | null;
}

/** 장소의 표시 텍스트 3종을 locale 기준으로 해석한다 */
export function resolvePlaceText(spot: PlaceView, locale: string): LocalizedPlaceText {
  return {
    name:         (() => { const n = pickLocalized(spot.name_l10n, locale, spot.name); return n ? stripIngestAnnotation(n) : n; })(),
    description:  pickLocalized(spot.desc_l10n, locale, spot.description),
    whyItMatters: pickLocalized(spot.why_l10n,  locale, spot.why_it_matters),
  };
}

/**
 * 한 줄 소개. why_it_matters 가 있으면 그것을, 없으면 설명의 첫 문장을 쓴다.
 * 둘 다 없으면 null — 호출부는 블록 자체를 렌더하지 않는다 (빈 셸 금지).
 *
 * 주의: 이 함수는 내부 메모를 거르지 않는다. 공개 화면·metadata 에는 반드시
 * resolvePublicPlaceSummary 를 쓴다.
 */
export function resolveOneLiner(text: LocalizedPlaceText): string | null {
  if (hasText(text.whyItMatters)) return text.whyItMatters;
  if (hasText(text.description)) {
    const first = text.description.split(/(?<=\.)\s/)[0];
    return hasText(first) ? first : text.description;
  }
  return null;
}

// ── 1-B. 내부 운영 메모 차단 ─────────────────────────────────────────────────
//
// 실측(2026-07-29): city_spots.why_it_matters 19/86 행이 사용자 문구가 아니라
// 내부 사업 메모다. 예) "High value nightlife and accommodation zone for
// affiliate traffic". 이 필드는 화면 한 줄 소개이자 meta/OG/Twitter description
// 이므로 구글 검색 스니펫과 SNS 미리보기에 그대로 실린다.
//
// Product Constitution §16 — 제품 신뢰보다 단기 수익을 우선하지 않는다.
// DB 정정 전까지 렌더링 계층에서 막는다. 장소 ID 를 하드코딩하지 않는다.
//
// 오탐 주의: "paid" 단독으로는 막지 않는다. 유료 관광지의 정상적인 설명까지
// 걸러내기 때문이다. 내부 수익·판매 최적화 의도가 직접 드러나는 표현만 잡는다.

const INTERNAL_MEMO_PATTERNS: readonly RegExp[] = [
  /\baffiliate\b/i,
  /\bconversion\b/i,
  /\bfunnel(s)?\b/i,
  /\bmonetiz(e|ation|ing)\b/i,
  /\bupsell\b/i,
  /\bcommercial\s+(base|anchor|stop|value)\b/i,
  /\bhigh[-\s]value\b/i,
  /\brevenue\b/i,
  /\bARPU\b/,
  /\bCTR\b/,
  /\bpaid\s+(product|attraction\s+product)s?\b/i,
];

/** 사용자에게 보여선 안 되는 내부 운영·수익화 메모인가 */
export function isInternalMemo(s: string | null | undefined): boolean {
  if (!hasText(s)) return false;
  return INTERNAL_MEMO_PATTERNS.some(re => re.test(s));
}

/**
 * 공개 화면과 metadata 가 **함께** 쓰는 소개 문구.
 *
 * 순서
 *   1. why_it_matters 가 안전하면 사용
 *   2. 내부 메모면 사용 금지 → description 첫 문장으로 fallback
 *   3. description 도 안전하지 않거나 없으면 null → 블록·description 생략
 *
 * 새로운 사실을 지어내지 않는다.
 */
export function resolvePublicPlaceSummary(text: LocalizedPlaceText): string | null {
  if (hasText(text.whyItMatters) && !isInternalMemo(text.whyItMatters)) {
    return text.whyItMatters;
  }
  if (hasText(text.description) && !isInternalMemo(text.description)) {
    const first = text.description.split(/(?<=\.)\s/)[0];
    return hasText(first) ? first : text.description;
  }
  return null;
}

/**
 * 후보 문구 중 **공개해도 되는 첫 번째**를 원문 그대로 고른다.
 *
 * resolvePublicPlaceSummary 와 역할이 다르다
 *   저쪽은 metadata·검색 스니펫용 **요약 문장**을 만든다. 그래서 description 을
 *   첫 문장으로 정형화하고 후보 순서가 (why → description) 로 고정돼 있다.
 *   일정 tips 는 요약이 아니라 화면에 그대로 싣는 안내문이고, 호출부마다
 *   어떤 문구를 먼저 보여줄지가 이미 정해져 있다. 그 순서를 함수 시그니처가
 *   강제하면 안 된다.
 *
 * 그래서 이 함수는 **판정만** 한다
 *   - 무엇이 내부 메모인가 → isInternalMemo (정책 SSOT, 이 파일 한 곳)
 *   - 무엇을 먼저 보여줄까 → 호출부가 인자 순서로 표현
 *
 * 통과한 후보는 자르지 않고, 마침표를 붙이지 않고, 다시 쓰지 않는다.
 * trim 은 "값이 있는가" 판정에만 쓰고 반환값에는 적용하지 않는다 — 여기서
 * 또 다듬으면 같은 데이터가 화면마다 다르게 보인다.
 *
 * 모든 후보가 없거나 내부 메모면 빈 문자열. 호출부는 빈 값일 때 블록을
 * 렌더하지 않는다. 없는 문구를 지어내지 않는다.
 */
export function firstPublicText(
  ...candidates: Array<string | null | undefined>
): string {
  for (const c of candidates) {
    if (hasText(c) && !isInternalMemo(c)) return c;
  }
  return "";
}

// ── 1-C. metadata 이미지 ─────────────────────────────────────────────────────
//
// <img onError> fallback 은 브라우저에서만 동작한다. OG·Twitter·JSON-LD 를 읽는
// 크롤러에는 적용되지 않으므로, 죽은 URL 을 metadata 에 넣으면 공유 썸네일이
// 계속 깨진다.
//
// 실측(2026-07-29): image_url 86건 중 source.unsplash.com 79건이 HTTP 503,
// images.unsplash.com 7건이 200. 죽은 호스트는 metadata 에서 제외하고, 우리가
// 직접 생성해 권리가 확실한 도시·브랜드 OG 이미지로 떨어뜨린다.
//
// DB image_url 은 이 파일에서 수정하지 않는다. 새 외부 이미지를 가져오지 않는다.

/** 실측으로 죽은 것이 확인된 호스트 */
const DEAD_IMAGE_HOSTS: readonly string[] = ["source.unsplash.com"];

/** 자체 생성 OG 이미지가 있는 도시 (src/app/og/<city>/opengraph-image) */
const CITY_OG_ROUTES: readonly string[] = ["busan", "seoul", "jeju", "gyeongju"];

function imageHost(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** 화면 <img> 에 시도해도 되는 URL 인가 — 죽은 호스트는 애초에 시도하지 않는다 */
export function resolveDisplayImage(imageUrl: string | null): string | null {
  if (!hasText(imageUrl)) return null;
  const host = imageHost(imageUrl);
  if (!host || DEAD_IMAGE_HOSTS.includes(host)) return null;
  return imageUrl;
}

/**
 * OG · Twitter · JSON-LD 가 **함께** 쓰는 절대 URL 이미지.
 * 죽은 호스트면 우리가 만든 도시 OG → 사이트 OG 순으로 떨어진다.
 */
export function resolvePublicMetadataImage(city: string, imageUrl: string | null): string {
  const safe = resolveDisplayImage(imageUrl);
  if (safe && safe.startsWith("https://")) return safe;
  const key = (city ?? "").toLowerCase().trim();
  if (CITY_OG_ROUTES.includes(key)) return `${SITE_ORIGIN}/og/${key}/opengraph-image`;
  return `${SITE_ORIGIN}/opengraph-image`;
}

// ── 2. provenance 분류 ───────────────────────────────────────────────────────
//
// Product Constitution §8: 공개 카탈로그 장소 / 공식 원천 장소 / 큐레이션·manual /
// 승인된 사용자 제보를 구분한다. 운영 테이블에 들어갔다는 사실이 공식 기관
// 데이터를 뜻하지 않는다.
//
// 현재 스키마의 한계 — source_type 은 manual·tourapi·google·user 4값뿐이고
// city_spot_sources 는 아직 없다. 확신할 수 없는 경우 추측하지 말고 일반
// catalog 로 떨어뜨린다. 향후 city_spot_sources 를 붙일 때 이 함수만 고치면 된다.

export type ProvenanceKind = "official" | "curated" | "community" | "catalog";

/** i18n 메시지 키 — 화면 문구는 messages/*.json 이 갖는다 */
export const PROVENANCE_MESSAGE_KEY: Record<ProvenanceKind, string> = {
  official:  "provenanceOfficial",
  curated:   "provenanceCurated",
  community: "provenanceCommunity",
  catalog:   "provenanceCatalog",
};

export function resolveProvenance(spot: PlaceView): ProvenanceKind {
  switch (spot.source_type) {
    case "tourapi":
      // 공식 관광 API 원천. external_id 가 있어야 원천 추적이 가능하다.
      return hasText(spot.external_id) ? "official" : "catalog";
    case "user":
      // publish_user_spot 승인을 거쳐야만 city_spots 에 들어온다.
      return "community";
    case "manual":
      return "curated";
    default:
      // google 등 분류가 확실치 않은 값은 추측하지 않는다.
      return "catalog";
  }
}

// ── 3. 지도 링크 ─────────────────────────────────────────────────────────────
//
// Product Constitution §11: 실제 이동은 외부 지도 앱으로 연결한다. 자체 실시간
// 내비게이션은 만들지 않는다. Naver 를 한국 현지 기준으로 우선한다.

export interface MapLinks {
  naver:  string | null;
  google: string | null;
}

const HANGUL = /[가-힣]/;

/**
 * 저장된 naver_map_url 이 "이름 검색" 주소일 때 그 검색어. 검색 주소가 아니면(naver.me 단축·place entry) null.
 * 실측(2026-09-01, Production 직접 클릭): `/p/search/Jangsan Mountain Busan` 은 "조건에 맞는 업체가 없습니다",
 * `/p/search/Gwangalli Beach Busan` 은 광안동 식당·요트 업체 목록(해수욕장 아님) — 영문 검색어는 엉뚱한 곳이나
 * 빈 화면으로 간다. 한글 검색어(`광안리해수욕장`·`해운대해수욕장`)는 첫 결과가 그 장소다.
 */
export function naverSearchQuery(url: string | null | undefined): string | null {
  if (!hasText(url)) return null;
  const m = url.match(/^https:\/\/map\.naver\.com\/(?:v5|p)\/search\/([^?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]!).trim(); } catch { return m[1]!.trim(); }
}

/**
 * Naver 지도 검색어. 한글 이름만 쓴다 — 주소를 이어 붙인 긴 검색어는 Naver 에서 결과가 없고
 * (실측: `장산 (부산 국가지질공원) 부산광역시 해운대구 장산로 331-18` → "검색 결과가 없습니다"),
 * 영문 이름은 위와 같이 다른 업체로 간다. 한글 이름이 없으면 null — Naver 버튼을 만들지 않는다.
 * 좌표·id 별 분기·도시명 덧붙이기는 하지 않는다(검증되지 않은 Naver URL 형식은 쓰지 않는다).
 */
export function naverQueryFor(spot: PlaceView, displayName: string | null): string | null {
  const candidates = [pickLocalized(spot.name_l10n, "ko", null), displayName, spot.name];
  for (const c of candidates) {
    if (!hasText(c)) continue;
    const n = stripIngestAnnotation(c).trim();
    if (HANGUL.test(n)) return n;
  }
  return null;
}

/**
 * 검증된 exact URL 이 있으면 그것을, 없으면 검색 URL 을 만든다. 이름도 좌표도 없으면 null — 버튼을 렌더하지 않는다.
 *   Naver : 저장 URL 이 한글 검색 또는 검색이 아닌 exact 주소일 때만 신뢰. 영문 검색 저장 URL 은 버리고 한글 이름으로 다시 만든다.
 *   Google: 저장 URL → 이름+주소 검색 → 좌표 검색 (Google 은 영문·주소 결합 검색이 실제로 그 장소에 닿는다).
 */
export function resolveMapLinks(spot: PlaceView, displayName: string | null): MapLinks {
  const q = [displayName ?? spot.name, spot.address].filter(hasText).join(" ").trim();
  const hasCoord = typeof spot.lat === "number" && typeof spot.lng === "number";

  const storedNaverQuery = naverSearchQuery(spot.naver_map_url);
  const storedNaverUsable = hasText(spot.naver_map_url) && (storedNaverQuery === null || HANGUL.test(storedNaverQuery));
  let naver: string | null = storedNaverUsable ? spot.naver_map_url : null;
  if (!naver) {
    const nq = naverQueryFor(spot, displayName);
    if (nq) naver = `https://map.naver.com/p/search/${encodeURIComponent(nq)}`;
  }

  let google: string | null = hasText(spot.map_url) ? spot.map_url : null;
  if (!google && hasText(q)) {
    google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  } else if (!google && hasCoord) {
    google = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  }

  return { naver, google };
}

/**
 * 공식/홈페이지 링크로 내보내도 되는 절대 주소. scheme 이 빠진 값(`www.aechae.com`)은 그대로 href 에
 * 넣으면 우리 사이트의 상대 경로(`/place/www.aechae.com`)가 돼 404 로 간다(Production 실측: 서울 21행).
 * 호스트로 보이면 https:// 를 붙이고, http(s) 가 아닌 것(javascript:·mailto:·빈 값)은 null.
 */
export function normalizeOfficialUrl(url: string | null | undefined): string | null {
  if (!hasText(url)) return null;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#]|$)/i.test(u)) return `https://${u}`;
  return null;
}

// ── 4. 일정 입력 어댑터 (비상업) ─────────────────────────────────────────────
//
// Product Constitution §14 — 스케줄러는 provider ID·offer ID·commission·상업
// 우선순위를 입력받지 않는다.
//
// 실측(2026-07-29): /itinerary 의 cartHints 가 Cart 항목의 commerce 에서
// affiliate_url·affiliate_provider·booking_url 을 꺼내 plan API 로 보낸다.
// 상세페이지에서 담은 장소가 그 값을 갖지 않도록, 일정 입력 전용 어댑터에서
// commerce 를 전부 null 로 고정한다.
//
// EventItem.commerce 는 필수 필드라 키를 뺄 수 없다. 값을 비우는 것이 정답이다.
// DB·타입에서 제휴 원본 필드를 삭제하지 않는다 — 향후 렌더링 계층이 쓴다.

/** Explore(toEventItem)·Saved 와 같은 id 체계 */
export function placeEventId(spotId: number): string {
  return `local-${spotId}`;
}

export function toItineraryEvent(spot: PlaceView, text?: LocalizedPlaceText): EventItem {
  const name = text?.name ?? spot.name;
  return {
    id:                          placeEventId(spot.id),
    // Place Detail 은 항상 city_spots 행이다. Explore 에서 같은 장소를 담았을 때와
    // 반드시 같은 sourceKey 여야 두 경로가 서로를 중복으로 인식한다.
    sourceKey:                   citySpotSourceKey(spot.id),
    type:                        spot.category as EventItem["type"],
    isAnchor:                    false,
    journeyCluster:              `${spot.city.toLowerCase()}-explore`,
    stage:                       "Standalone",
    anchorEventId:               null,
    relatedSpotIds:              [],
    relatedSurvivalGuides:       [],
    transitFromAnchor:           null,
    name,
    shortName:                   name,
    nameL10n:                    spot.name_l10n ?? null,
    tags:                        spot.tags ?? [],
    city:                        spot.city,
    district:                    spot.district ?? "",
    address:                     spot.address ?? "",
    mapUrl:                      spot.map_url ?? "",
    naverMapUrl:                 spot.naver_map_url ?? undefined,
    description:                 text?.description ?? spot.description ?? "",
    whyItMatters:                text?.whyItMatters ?? spot.why_it_matters ?? "",
    recommendedDurationMinutes:  spot.duration_minutes ?? 60,
    bestTimeSlot:                spot.best_time_slot ?? "anytime",
    openingHours:                spot.opening_hours,
    image:                       spot.image_url,
    startDate:                   null,
    endDate:                     null,
    isTrending:                  false,
    soloFriendly:                spot.solo_friendly,
    foreignCardAccepted:         spot.foreign_card_accepted,
    cashOnly:                    spot.cash_only ?? false,
    englishMenu:                 false, // 확인되지 않은 사실 — 긍정 값 하드코딩 금지
    barrierFree:                 false,
    koreanSurvivalScore:         0,
    notice:                      null,
    lat:                         spot.lat ?? undefined,
    lng:                         spot.lng ?? undefined,
    // ── 상업 문맥 차단 지점 ──
    // commerce 키 자체를 만들지 않는다. null 로 채우면 JSON 직렬화 결과와
    // localStorage 에 affiliateUrl·bookingUrl 같은 키 이름이 그대로 남는다.
    // 키가 없어야 Cart → cartHints → plan API 경로에 상업 문맥이 실릴 수 없다.
  };
}

/** 일정·저장 객체에 존재해선 안 되는 키 (재귀 검사용) */
export const FORBIDDEN_COMMERCE_KEYS: readonly string[] = [
  "commerce", "affiliate_url", "affiliateUrl", "affiliate_provider", "affiliatePartner",
  "affiliateType", "booking_url", "bookingUrl", "hasAffiliate", "hasTicketing",
  "hasMerchandise", "offer_id", "offerId", "commission", "commercial_priority",
  "commercialPriority",
];

/** 객체 트리 어디에도 상업 키가 없는지 검사 — 테스트와 저장 직전 가드가 함께 쓴다 */
export function findCommercialKeys(value: unknown, seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) found.push(...findCommercialKeys(v, seen));
    return found;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_COMMERCE_KEYS.includes(k)) found.push(k);
    found.push(...findCommercialKeys(v, seen));
  }
  return [...new Set(found)];
}

/**
 * 저장 직전 allowlist projection.
 * 다른 화면에서 만들어진 항목(explore·Saved 등)이 상업 키를 갖고 들어와도
 * 상세페이지 경로로 저장될 때는 제거된다. 기존 Cart 항목을 일괄 migration 하지는
 * 않는다 — 그건 별도 판단이 필요하다.
 */
export function stripCommercialKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(v => stripCommercialKeys(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_COMMERCE_KEYS.includes(k)) continue;
    out[k] = stripCommercialKeys(v);
  }
  return out as T;
}

/** 일정 입력 객체에 상업 문맥이 남아 있지 않은지 검사 (테스트·런타임 가드용) */
export function hasCommercialContext(event: EventItem): boolean {
  return findCommercialKeys(event).length > 0;
}

// ── 5. 구조화 데이터 ─────────────────────────────────────────────────────────
//
// 화면에 실제로 표시되는 값만 넣는다. rating·reviewCount·priceRange·영업시간
// 추정·주소 추정·좌표 추정·공식 기관 소유 주장은 생성하지 않는다.
// 구조화 데이터는 리치 결과를 보장하지 않는다 — 색인 힌트일 뿐이다.

export type PlaceSchemaType = "Restaurant" | "TouristAttraction" | "Place";

export function placeSchemaType(category: string): PlaceSchemaType {
  switch (category) {
    case "restaurant":              return "Restaurant";
    case "attraction":
    case "nature":                  return "TouristAttraction";
    default:                        return "Place"; // event·accommodation·미상
  }
}

export function placeUrl(id: number | string): string {
  return `${SITE_ORIGIN}/place/${id}/`;
}

export function buildPlaceJsonLd(
  spot: PlaceView,
  text: LocalizedPlaceText,
): Record<string, unknown> | null {
  const name = text.name ?? (hasText(spot.name) ? spot.name : null);
  if (!name) return null; // 이름 없는 구조화 데이터는 만들지 않는다

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type":    placeSchemaType(spot.category),
    name,
    url:        placeUrl(spot.id),
  };

  // 화면·metadata 와 같은 공개 요약을 쓴다 (내부 메모 차단)
  const summary = resolvePublicPlaceSummary(text);
  if (hasText(summary)) ld.description = summary;

  // 죽은 원격 URL 을 구조화 데이터에 넣지 않는다
  ld.image = resolvePublicMetadataImage(spot.city, spot.image_url);

  // 주소는 있는 값만. 국가는 city_spots 가 한국 장소만 담으므로 확정 사실이다.
  if (hasText(spot.address) || hasText(spot.district)) {
    const addr: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: "KR" };
    if (hasText(spot.address))  addr.streetAddress   = spot.address;
    if (hasText(spot.district)) addr.addressLocality = spot.district;
    if (hasText(spot.city))     addr.addressRegion   = spot.city;
    ld.address = addr;
  }

  if (typeof spot.lat === "number" && typeof spot.lng === "number") {
    ld.geo = { "@type": "GeoCoordinates", latitude: spot.lat, longitude: spot.lng };
  }

  // official_url 은 "우리가 참조한 공식 문서" 이지 우리 소유 주장이 아니다.
  if (hasText(spot.official_url)) ld.sameAs = spot.official_url;

  return ld;
}

export function buildBreadcrumbJsonLd(
  spot: PlaceView,
  displayName: string | null,
): Record<string, unknown> {
  const cityKey = spot.city.toLowerCase();
  const cityLabel = spot.city.charAt(0).toUpperCase() + spot.city.slice(1);
  const items = [
    { name: "gokoreamate", item: `${SITE_ORIGIN}/` },
    { name: cityLabel,     item: `${SITE_ORIGIN}/explore/${cityKey}/` },
    { name: displayName ?? spot.name, item: placeUrl(spot.id) },
  ];
  return {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: items.map((x, i) => ({
      "@type":   "ListItem",
      position:  i + 1,
      name:      x.name,
      item:      x.item,
    })),
  };
}

// ── 6. 공유 ──────────────────────────────────────────────────────────────────

export interface ShareContent {
  title: string;
  text:  string;
  url:   string;
}

/**
 * 공유 문구. 개인 데이터·affiliate URL 을 넣지 않는다.
 * url 은 canonical 과 동일해야 한다.
 */
export function buildShareContent(
  spot: PlaceView,
  displayName: string | null,
): ShareContent {
  const name = displayName ?? spot.name;
  const cityLabel = spot.city.charAt(0).toUpperCase() + spot.city.slice(1);
  return {
    title: `${name} — ${cityLabel}`,
    text:  `${name} · ${cityLabel} · gokoreamate`,
    url:   placeUrl(spot.id),
  };
}

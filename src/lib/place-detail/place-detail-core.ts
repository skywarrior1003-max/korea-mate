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

import type { CitySpotRow } from "@/lib/city-spots";
import type { EventItem } from "@/lib/cart";

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

/** 허용 목록 기반 projection — 컬럼이 추가돼도 자동으로 새 나가지 않는다 */
export function toPlaceView(row: CitySpotRow): PlaceView {
  const src = row as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PLACE_VIEW_KEYS) out[k] = src[k];
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
    name:         pickLocalized(spot.name_l10n, locale, spot.name),
    description:  pickLocalized(spot.desc_l10n, locale, spot.description),
    whyItMatters: pickLocalized(spot.why_l10n,  locale, spot.why_it_matters),
  };
}

/**
 * 한 줄 소개. why_it_matters 가 있으면 그것을, 없으면 설명의 첫 문장을 쓴다.
 * 둘 다 없으면 null — 호출부는 블록 자체를 렌더하지 않는다 (빈 셸 금지).
 */
export function resolveOneLiner(text: LocalizedPlaceText): string | null {
  if (hasText(text.whyItMatters)) return text.whyItMatters;
  if (hasText(text.description)) {
    const first = text.description.split(/(?<=\.)\s/)[0];
    return hasText(first) ? first : text.description;
  }
  return null;
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

/**
 * 검증된 exact URL 이 있으면 그것을, 없으면 이름+주소 또는 좌표로 검색 URL 을
 * 만든다. 이름도 좌표도 없으면 null — 버튼을 렌더하지 않는다.
 */
export function resolveMapLinks(spot: PlaceView, displayName: string | null): MapLinks {
  const q = [displayName ?? spot.name, spot.address].filter(hasText).join(" ").trim();
  const hasCoord = typeof spot.lat === "number" && typeof spot.lng === "number";

  let naver: string | null = hasText(spot.naver_map_url) ? spot.naver_map_url : null;
  if (!naver && hasText(q)) naver = `https://map.naver.com/p/search/${encodeURIComponent(q)}`;

  let google: string | null = hasText(spot.map_url) ? spot.map_url : null;
  if (!google && hasText(q)) {
    google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  } else if (!google && hasCoord) {
    google = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
  }

  return { naver, google };
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
    // 여기에 affiliate_url·affiliate_provider·booking_url 을 넣지 않는다.
    // 넣으면 Cart → cartHints → plan API 로 상업 문맥이 흘러간다.
    commerce: {
      affiliateType:    null,
      hasAffiliate:     false,
      affiliatePartner: null,
      affiliateUrl:     null,
      hasMerchandise:   false,
      hasTicketing:     false,
      bookingUrl:       null,
    },
  };
}

/** 일정 입력 객체에 상업 문맥이 남아 있지 않은지 검사 (테스트·런타임 가드용) */
export function hasCommercialContext(event: EventItem): boolean {
  const c = event.commerce;
  if (!c) return false;
  return Boolean(
    c.affiliateUrl || c.affiliatePartner || c.affiliateType || c.bookingUrl ||
    c.hasAffiliate || c.hasTicketing || c.hasMerchandise,
  );
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

  if (hasText(text.description)) ld.description = text.description;
  if (hasText(spot.image_url))   ld.image       = spot.image_url;

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
    { name: "GoKoreaMate", item: `${SITE_ORIGIN}/` },
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
    text:  `${name} · ${cityLabel} · GoKoreaMate`,
    url:   placeUrl(spot.id),
  };
}

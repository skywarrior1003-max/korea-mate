// ─────────────────────────────────────────────────────────────────────────────
//  gokoreamate · Affiliate Partner Configuration  (compatibility shim)
//
//  링크의 출처는 이제 affiliate-registry.ts 하나다. 이 파일은 아직 남아 있는
//  호출부를 위한 얇은 재노출 계층일 뿐이고, 여기에 URL 을 새로 적지 않는다.
//  값을 바꿔야 하면 registry 를, 어떤 파트너를 쓸지는 policy 를 고친다.
//
//  화면은 이 파일을 쓰지 않는다 — resolveOffers 를 쓴다. 남은 사용처는
//  EventDetailModal 하나이며 TRIP_FLOW_COMMERCE_ENABLED 로 막혀 렌더되지
//  않는다. 그 화면이 정리되면 이 파일은 지울 수 있다.
// ─────────────────────────────────────────────────────────────────────────────

import { REGISTRY, entryUrl, type OfferContext } from "./affiliate-registry";

const url = (product: keyof typeof REGISTRY, variant: string, ctx: OfferContext = {}) =>
  entryUrl(REGISTRY[product][variant]!, ctx);

export const VIATOR = {
  searchUrl: (query: string, city = "Busan") => url("activities", "search", { query, city }),
  busanHub:  () => url("activities", "busanHub"),
  seoulHub:  () => url("activities", "seoulHub"),
  isReady:   () => (process.env.NEXT_PUBLIC_VIATOR_AFFILIATE_ID ?? "").length > 0,
};

export const BOOKING = {
  cityUrl: (city = "Busan") => url("accommodation", "city", { city }),
  nearUrl: (location: string, city = "Busan") => url("accommodation", "near", { query: location, city }),
  isReady: () => (process.env.NEXT_PUBLIC_BOOKING_HOTEL_ID ?? "").length > 0,
};

export const KLOOK = {
  get transferUrl()      { return url("airport_transfer", "default"); },
  get esimUrl()          { return url("esim", "default"); },
  get cableCarUrl()      { return url("cable_car", "songdo"); },
  get jejuCarRentalUrl() { return url("car_rental", "jeju"); },
};

export const KTX = {
  get seoulBusanUrl()    { return url("rail", "seoulBusan"); },
  get seoulGyeongjuUrl() { return url("rail", "seoulGyeongju"); },
};

// ── 이벤트 타입 → 적합한 제휴 파트너 판별 ──────────────────────────────────

/** Viator 투어 예약이 적합한 타입 */
export function isViatorEligible(type: string): boolean {
  return ["event", "festival", "concert", "attraction", "nature",
          "pilgrimage", "heritage", "museum", "cultural", "permanent"
  ].some(t => type.toLowerCase().includes(t) || type === t);
}

/** Booking.com 숙박 검색이 적합한 타입 (레스토랑·교통 제외) */
export function isBookingEligible(type: string): boolean {
  return !["restaurant", "food", "transport", "connectivity"].some(
    t => type.toLowerCase().includes(t)
  );
}

/** Klook 전용 교통 타입 */
export function isKlookTransportOnly(type: string): boolean {
  return ["transport", "connectivity"].some(t => type.toLowerCase().includes(t));
}

// ─────────────────────────────────────────────────────────────────────────────
//  KoreaMate · Affiliate Partner Configuration
//
//  수익화 파이프라인 3-tier 구조:
//    Tier 1 — Viator   : 투어 / 액티비티 / 체험 (영미권 메인)
//    Tier 2 — Booking  : 호텔 / 숙박 예약 (영미권 메인)
//    Tier 3 — Klook    : 공항 리무진 / 케이블카 / eSIM (로컬 교통 전용)
//
//  .env.local 에 실제 ID를 채우면 즉시 전 페이지 동시 반영.
// ─────────────────────────────────────────────────────────────────────────────

const VIATOR_ID  = process.env.NEXT_PUBLIC_VIATOR_AFFILIATE_ID  ?? "";
const BOOKING_ID = process.env.NEXT_PUBLIC_BOOKING_HOTEL_ID     ?? "";

// ── Viator ───────────────────────────────────────────────────────────────────
//  실제 PID 예시: "P00123456" (Viator 파트너 대시보드에서 발급)
//  Travelpayouts 통합 사용 시 marker 값을 VIATOR_AFFILIATE_ID에 입력
export const VIATOR = {
  /** 특정 키워드로 Viator 투어 검색 페이지 */
  searchUrl: (query: string, city = "Busan") =>
    `https://www.viator.com/searchResults/all?pid=${VIATOR_ID}&mcid=42383&medium=link&text=${encodeURIComponent(`${query} ${city} Korea`)}`,

  /** 부산 투어 허브 랜딩 페이지 */
  busanHub: () =>
    `https://www.viator.com/Busan/d4482-ttd?pid=${VIATOR_ID}&mcid=42383&medium=link`,

  /** 서울 투어 허브 랜딩 페이지 */
  seoulHub: () =>
    `https://www.viator.com/Seoul/d973-ttd?pid=${VIATOR_ID}&mcid=42383&medium=link`,

  /** ID가 채워졌는지 여부 */
  isReady: () => VIATOR_ID.length > 0,
};

// ── Booking.com ───────────────────────────────────────────────────────────────
//  실제 AID 예시: "1234567" (Booking.com Affiliate Partner Centre에서 발급)
export const BOOKING = {
  /** 도시명으로 호텔 검색 */
  cityUrl: (city = "Busan") =>
    `https://www.booking.com/searchresults.html?aid=${BOOKING_ID}&ss=${encodeURIComponent(city + " Korea")}&lang=en-us`,

  /** 특정 지역/명소 근처 호텔 검색 */
  nearUrl: (location: string, city = "Busan") =>
    `https://www.booking.com/searchresults.html?aid=${BOOKING_ID}&ss=${encodeURIComponent(`${location} ${city} Korea`)}&lang=en-us`,

  /** ID가 채워졌는지 여부 */
  isReady: () => BOOKING_ID.length > 0,
};

// ── Klook (로컬 교통 전용) ───────────────────────────────────────────────────
//  주의: Klook은 공항 리무진 / eSIM / 케이블카 구역에만 사용.
//  투어·숙박 구역에는 Viator / Booking.com 사용.
export const KLOOK = {
  /** 공항 픽업 / 리무진 */
  transferUrl: process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL
    ?? "https://affiliate.klook.com/sl/21FkAvj",

  /** 한국 eSIM 데이터 */
  esimUrl: "https://affiliate.klook.com/sl/KiT3U74",

  /** 송도 케이블카 */
  cableCarUrl: process.env.NEXT_PUBLIC_CABLE_CAR_URL
    ?? "https://www.klook.com/en-US/search-results/?query=busan+songdo+cable+car",
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

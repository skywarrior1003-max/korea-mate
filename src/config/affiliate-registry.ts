// ─────────────────────────────────────────────────────────────────────────────
//  gokoreamate · Affiliate Registry — 구세대 링크 원장 (LEGACY-CLEANUP-V1 무해화)
//
//  PARTNER-AFFILIATE-LEGACY-LINK-CLEANUP-V1 (2026-09-23):
//  구세대 URL 전량을 제거했다. 이유:
//   · Klook 구 AID(41763)·단축링크(sl/*) 는 신규 AID(123610) 이전 세대라
//     클릭이 유실된다 — readiness v2 §2 가 "운영 사용 금지·전면 교체/비활성"
//     으로 판정한 자산이다.
//   · Booking.com 은 CJ 신청 거절(2026-09-17, APAC·NA) — placeholder 금지.
//   · Viator·Airalo 는 거절·제외 — 링크 생성 금지.
//   · 모듈 상수는 게이트가 false 여도 번들·SSG HTML 에 문자열로 남으므로,
//     렌더 차단만으로는 부족하고 값 자체를 지워야 한다.
//
//  이 파일이 남아 있는 이유는 타입(ProductKey·LinkKind 등)과 PARTNER_LABEL 을
//  참조하는 게이트 뒤 legacy 호출부(EventDetailModal·itinerary 배너 등)의
//  컴파일 호환뿐이다. REGISTRY 는 전 상품 빈 표다 — resolver 는 항상 null 을
//  돌려주고, 화면은 카드를 그리지 않는다.
//
//  현재 승인 파트너(Agoda·Trip.com·Klook aid=123610·KKday)의 링크는 이 파일이
//  아니라 src/config/partner-links.ts 가 유일한 출처다. 여기에 URL 을 다시
//  적지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

export type ProductKey =
  | "esim"
  | "airport_transfer"
  | "rail"
  | "activities"
  | "car_rental"
  | "accommodation"
  | "cable_car";

export type PartnerId = "klook" | "viator" | "booking";

/** affiliate = 실제 수익 제휴 · external = 제휴 없는 유용한 외부 서비스 */
export type LinkKind = "affiliate" | "external";

/** 빌더가 받는 문맥. 필요한 상품만 쓴다. */
export interface OfferContext {
  city?:     string;
  query?:    string;
  checkin?:  string;
  checkout?: string;
}

export interface RegistryEntry {
  partner: PartnerId;
  kind:    LinkKind;
  url:     string | ((ctx: OfferContext) => string);
}

//  전 상품 빈 표 — 구세대 링크는 존재하지 않는다. 항목을 되살리려면 Owner
//  승인 TASK 와 신규 partner-links 검증 절차를 거쳐야 하며, 이 파일에 URL 을
//  직접 적는 방식으로는 하지 않는다.
export const REGISTRY: {
  [P in ProductKey]: Record<string, RegistryEntry>;
} = {
  esim: {},
  airport_transfer: {},
  rail: {},
  activities: {},
  car_rental: {},
  accommodation: {},
  cable_car: {},
};

/** 화면에 찍는 파트너 이름. 브랜드 표기라 번역하지 않는다. */
export const PARTNER_LABEL: Record<PartnerId, string> = {
  klook:   "Klook",
  viator:  "Viator",
  booking: "Booking.com",
};

/** registry 항목 하나를 실제 URL 로 편다. */
export function entryUrl(entry: RegistryEntry, ctx: OfferContext = {}): string {
  return typeof entry.url === "function" ? entry.url(ctx) : entry.url;
}

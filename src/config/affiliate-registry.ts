// ─────────────────────────────────────────────────────────────────────────────
//  gokoreamate · Affiliate Registry — 실제 링크의 유일한 출처
//
//  화면은 링크를 소유하지 않는다. 상품 키를 넘기면 resolver 가 policy 를 보고
//  파트너를 고른 뒤 여기서 URL 을 꺼낸다. 링크를 바꿀 일이 생기면 이 파일만
//  고친다.
//
//  ── 왜 partner + product 만으로 부족한가 ───────────────────────────────────
//  같은 파트너의 같은 상품인데 URL 이 여러 개인 경우가 실제로 있다.
//    rail          서울→부산 · 서울→경주 가 서로 다른 링크다
//    accommodation 도시별 검색 URL 이고, 날짜가 호출부에서 덧붙는다
//    activities    도시별 허브가 따로 있고 검색 URL 은 질의어를 받는다
//  그래서 항목의 키는 product + variant 다. variant 가 하나뿐인 상품은
//  "default" 를 쓴다.
//
//  ── url 이 세 가지 형태인 이유 ─────────────────────────────────────────────
//  현재 코드에 실제로 존재하는 형태를 그대로 옮겼다. 하나로 정규화하면
//  env 가 채워졌을 때 링크가 달라진다. 이번 작업은 배치만 바꾸는 것이므로
//  형태를 유지한다.
//    1) 고정 문자열
//    2) env override + fallback
//    3) 인자를 받는 빌더 (도시·질의어·체크인 날짜)
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

const VIATOR_ID  = process.env.NEXT_PUBLIC_VIATOR_AFFILIATE_ID ?? "";
const BOOKING_ID = process.env.NEXT_PUBLIC_BOOKING_HOTEL_ID    ?? "";

// variant 키는 상품 안에서만 의미를 가진다. 하나뿐이면 "default".
export const REGISTRY: {
  [P in ProductKey]: Record<string, RegistryEntry>;
} = {
  // ── eSIM ────────────────────────────────────────────────────────────────
  //  variant 가 둘인 이유는 순전히 기존 코드가 그랬기 때문이다. 설정 파일은
  //  고정 문자열이었고 일정 화면만 env 를 봤다. env 가 비어 있으면 결과가
  //  같지만, 채워지면 달라진다. 이번 작업은 배치만 옮기는 것이라 통합하지
  //  않았다 — 어느 쪽으로 통일할지는 별도 판단이 필요하다.
  esim: {
    default: {
      partner: "klook",
      kind: "affiliate",
      url: "https://affiliate.klook.com/sl/KiT3U74",
    },
    envOverride: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KLOOK_ESIM_URL || "https://affiliate.klook.com/sl/KiT3U74",
    },
  },

  // ── 공항 이동 ───────────────────────────────────────────────────────────
  //  같은 사정으로 variant 가 셋이다. default 와 literal 은 env 가 채워졌을
  //  때만 갈리고, gimhae 는 fallback 자체가 다른 전용 상품이다.
  airport_transfer: {
    default: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL || "https://affiliate.klook.com/sl/21FkAvj",
    },
    literal: {
      partner: "klook",
      kind: "affiliate",
      url: "https://affiliate.klook.com/sl/21FkAvj",
    },
    gimhae: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL
        || "https://affiliate.klook.com/redirect?aid=41763&aff_adid=944297&k_site=https%3A%2F%2Fwww.klook.com%2Factivity%2F21049-busan-gimhae-airport-private-transfer%2F",
    },
  },

  // ── 철도 ────────────────────────────────────────────────────────────────
  rail: {
    seoulBusan: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KTX_BUSAN_URL
        || "https://www.klook.com/en-US/search-results/?query=seoul+busan+ktx+train",
    },
    seoulGyeongju: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KTX_GYEONGJU_URL
        || "https://www.klook.com/en-US/search-results/?query=seoul+gyeongju+ktx+train",
    },
  },

  // ── 렌터카 ──────────────────────────────────────────────────────────────
  car_rental: {
    jeju: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_KLOOK_JEJU_CAR_URL
        || "https://www.klook.com/en-US/search-results/?query=jeju+car+rental",
    },
  },

  // ── 케이블카 ────────────────────────────────────────────────────────────
  cable_car: {
    songdo: {
      partner: "klook",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_CABLE_CAR_URL
        || "https://www.klook.com/en-US/search-results/?query=busan+songdo+cable+car",
    },
  },

  // ── 투어·액티비티 ───────────────────────────────────────────────────────
  //  Viator 는 현재 승인 파트너가 아니다. policy 가 어떤 locale 에서도 고르지
  //  않으므로 사용자에게 노출되지 않는다. 값은 게이트로 막힌 legacy 호출부가
  //  아직 참조하므로 남겨 둔다 — 되살리려면 policy 를 고쳐야 한다.
  activities: {
    seoulHub: {
      partner: "viator",
      kind: "affiliate",
      url: `https://www.viator.com/Seoul/d973-ttd?pid=${VIATOR_ID}&mcid=42383&medium=link`,
    },
    busanHub: {
      partner: "viator",
      kind: "affiliate",
      url: `https://www.viator.com/Busan/d4482-ttd?pid=${VIATOR_ID}&mcid=42383&medium=link`,
    },
    koreaHub: {
      partner: "viator",
      kind: "affiliate",
      url: () => process.env.NEXT_PUBLIC_VIATOR_BUSAN_URL || "https://www.viator.com/en-KR/Korea/d4431-ttd/",
    },
    search: {
      partner: "viator",
      kind: "affiliate",
      url: ({ query = "tours", city = "Busan" }: OfferContext) =>
        `https://www.viator.com/searchResults/all?pid=${VIATOR_ID}&mcid=42383&medium=link&text=${encodeURIComponent(`${query} ${city} Korea`)}`,
    },
  },

  // ── 숙박 ────────────────────────────────────────────────────────────────
  //  Booking 도 현재 policy 밖이다. 위 activities 와 같은 이유로 값만 남긴다.
  accommodation: {
    city: {
      partner: "booking",
      kind: "affiliate",
      url: ({ city = "Busan" }: OfferContext) =>
        `https://www.booking.com/searchresults.html?aid=${BOOKING_ID}&ss=${encodeURIComponent(city + " Korea")}&lang=en-us`,
    },
    near: {
      partner: "booking",
      kind: "affiliate",
      url: ({ query = "", city = "Busan" }: OfferContext) =>
        `https://www.booking.com/searchresults.html?aid=${BOOKING_ID}&ss=${encodeURIComponent(`${query} ${city} Korea`)}&lang=en-us`,
    },
    // 일정 화면이 쓰던 부산 전용 fallback 두 개. 날짜는 호출부가 아니라
    // 여기서 붙인다 — 화면이 URL 문자열을 조립하지 않게 하는 것이 이 작업의
    // 목적이다.
    busanNampo: {
      partner: "booking",
      kind: "affiliate",
      url: ({ checkin = "", checkout = "" }: OfferContext) =>
        `${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Nampo-dong+Busan+Korea"}&checkin=${checkin}&checkout=${checkout}`,
    },
    busanCity: {
      partner: "booking",
      kind: "affiliate",
      url: ({ checkin = "", checkout = "" }: OfferContext) =>
        `${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Busan+Korea"}&checkin=${checkin}&checkout=${checkout}`,
    },
  },
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

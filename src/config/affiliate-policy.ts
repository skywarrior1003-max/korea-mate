// ─────────────────────────────────────────────────────────────────────────────
//  gokoreamate · Affiliate Policy — 어떤 파트너를 보여줄지 정하는 유일한 곳
//
//  registry 가 "링크가 무엇인가" 라면 policy 는 "누구를 고를 것인가" 다.
//  파트너를 갈아끼울 때 화면을 찾아다니지 않으려면 이 파일만 고치면 된다.
//
//  ── 판단 근거는 사용자가 고른 언어뿐이다 ──────────────────────────────────
//  회원가입이 없어 국가를 알 수 없다. IP·브라우저 지역 추론은 하지 않는다 —
//  틀릴 때 조용히 틀리고, 사용자가 고치지도 못한다. 국가 기반 맞춤화는 회원
//  개념이 생긴 뒤에 다룬다. 그래서 지금 이 파일에는 country 필드가 없다.
//
//  ── alternative 를 억지로 만들지 않는다 ───────────────────────────────────
//  현재 승인 파트너는 Klook 하나다. 두 번째 자리를 채우려고 승인되지 않은
//  파트너를 넣지 않는다. 자리는 비워 둔다.
// ─────────────────────────────────────────────────────────────────────────────

import type { PartnerId, ProductKey } from "./affiliate-registry";

export const SUPPORTED_LOCALES = ["en", "ko", "ja", "zh"] as const;
export type AffiliateLocale = typeof SUPPORTED_LOCALES[number];

export interface Choice {
  recommended: PartnerId;
  /** 승인된 두 번째 파트너가 실제로 있을 때만 채운다. */
  alternative?: PartnerId;
}

/** locale 별 예외가 없으면 default 만 둔다. */
interface ProductPolicy {
  default: Choice | null;
  byLocale?: Partial<Record<AffiliateLocale, Choice | null>>;
}

//  null = 이 상품에 승인된 파트너가 없다 = 아무것도 노출하지 않는다.
//  Viator·Booking 값이 registry 에 남아 있어도 여기서 고르지 않으면
//  사용자에게 도달하지 않는다. 되살리려면 이 표를 고쳐야 한다.
export const POLICY: Record<ProductKey, ProductPolicy> = {
  esim:             { default: { recommended: "klook" } },
  airport_transfer: { default: { recommended: "klook" } },
  rail:             { default: { recommended: "klook" } },
  car_rental:       { default: { recommended: "klook" } },
  cable_car:        { default: { recommended: "klook" } },

  // Viator 는 현재 파트너가 아니다.
  activities:       { default: null },
  // Booking 도 활성 파트너가 아니다. 일반 숙박은 제품 방향에서도 제외돼 있다.
  accommodation:    { default: null },
};

export function choiceFor(product: ProductKey, locale: string): Choice | null {
  const p = POLICY[product];
  if (!p) return null;
  const key = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as AffiliateLocale)
    : null;
  if (key && p.byLocale && key in p.byLocale) return p.byLocale[key] ?? null;
  return p.default;
}

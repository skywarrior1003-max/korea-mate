// ─────────────────────────────────────────────────────────────────────────────
//  gokoreamate · Affiliate Resolver
//
//  화면이 아는 것은 상품 키와 현재 언어뿐이다. 어떤 파트너인지, 링크가
//  무엇인지는 여기서 policy 와 registry 를 읽어 정한다.
//
//    resolveOffers("esim", locale)  →  [{ partner, url, kind, product, variant }]
//
//  반환은 최대 2개다 — 추천 1 + 선택 1. 승인된 두 번째 파트너가 없으면 1개다.
//
//  게이트는 이 파일이 알지 못한다. 노출 여부는 표면의 문제이고 화면이
//  TRIP_FLOW_COMMERCE_ENABLED / isEditorialAffiliateEnabled 로 판단한다.
//  resolver 가 게이트까지 떠맡으면 "링크를 못 찾은 것" 과 "노출하면 안 되는
//  것" 이 한 값으로 뭉개진다.
// ─────────────────────────────────────────────────────────────────────────────

import {
  REGISTRY,
  entryUrl,
  type LinkKind,
  type OfferContext,
  type PartnerId,
  type ProductKey,
} from "@/config/affiliate-registry";
import { choiceFor } from "@/config/affiliate-policy";

export interface Offer {
  product: ProductKey;
  variant: string;
  partner: PartnerId;
  kind:    LinkKind;
  url:     string;
  /** 추천 자리인지 대안 자리인지 — 화면이 강조를 다르게 줄 때 쓴다. */
  rank:    "recommended" | "alternative";
}

export interface ResolveOptions extends OfferContext {
  /**
   * 같은 상품에 URL 이 여러 개인 경우 어떤 것을 쓸지. rail 의 노선,
   * accommodation 의 도시처럼 화면이 이미 아는 정보다. 생략하면 파트너의
   * 첫 번째 항목을 쓴다.
   */
  variant?: string;
}

function pick(product: ProductKey, partner: PartnerId, variant?: string) {
  const table = REGISTRY[product];
  if (!table) return null;
  if (variant) {
    const hit = table[variant];
    return hit && hit.partner === partner ? { variant, entry: hit } : null;
  }
  for (const [v, entry] of Object.entries(table)) {
    if (entry.partner === partner) return { variant: v, entry };
  }
  return null;
}

/**
 * 상품 + 언어로 노출할 오퍼를 정한다. 승인 파트너가 없으면 빈 배열이다 —
 * 이때 화면은 카드를 그리지 않는다. 빈자리를 다른 파트너로 메우지 않는다.
 */
export function resolveOffers(
  product: ProductKey,
  locale: string,
  opts: ResolveOptions = {},
): Offer[] {
  const choice = choiceFor(product, locale);
  if (!choice) return [];

  const { variant, ...ctx } = opts;
  const wanted: [PartnerId, Offer["rank"]][] = [[choice.recommended, "recommended"]];
  if (choice.alternative) wanted.push([choice.alternative, "alternative"]);

  const out: Offer[] = [];
  for (const [partner, rank] of wanted) {
    const found = pick(product, partner, variant);
    if (!found) continue;
    out.push({
      product,
      variant: found.variant,
      partner,
      kind: found.entry.kind,
      url:  entryUrl(found.entry, ctx),
      rank,
    });
  }
  return out;
}

/** 추천 하나만 필요할 때. 없으면 null 이다. */
export function resolveOffer(
  product: ProductKey,
  locale: string,
  opts: ResolveOptions = {},
): Offer | null {
  return resolveOffers(product, locale, opts)[0] ?? null;
}

"use client";

// 이 컴포넌트는 링크를 소유하지 않는다. 카드는 상품 키만 가리키고 실제
// URL·파트너는 resolver 가 policy + registry 를 보고 정한다. 파트너를 바꾸는
// 일은 affiliate-policy.ts 에서, 링크를 바꾸는 일은 affiliate-registry.ts
// 에서 끝난다 — 이 파일을 열 필요가 없다.
//
// locale 이 필요해 client 로 내렸다. 서버 렌더 결과는 그대로 정적 HTML 에
// 남는다.

import { useLocale } from "next-intl";
import AffiliateLink from "@/components/AffiliateLink";
import { PARTNER_LABEL, type ProductKey } from "@/config/affiliate-registry";
import { resolveOffer } from "@/lib/affiliate-resolve";
import {
  isEditorialAffiliateEnabled,
  type CommerceSurface,
} from "@/config/commerce-surfaces";

interface AffiliateCard {
  emoji:    string;
  title:    string;
  desc:     string;
  product:  ProductKey;
  /** 같은 상품에 링크가 여럿일 때만 지정한다 (노선·도시). */
  variant?: string;
}

type City = "seoul" | "busan" | "jeju" | "gyeongju";

const CITY_CARDS: Record<City, AffiliateCard[]> = {
  seoul: [
    {
      emoji: "📱",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive at Incheon.",
      product: "esim",
    },
    {
      emoji: "✈️",
      title: "Incheon Airport Transfer",
      desc: "Limousine bus direct to Seoul city center. Skip the AREX queue with luggage.",
      product: "airport_transfer",
    },
  ],
  busan: [
    {
      emoji: "📱",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive.",
      product: "esim",
    },
    {
      emoji: "🚄",
      title: "Seoul → Busan KTX",
      desc: "Korea's fastest train. 2hr 15min from Seoul. Book seats in advance on weekends.",
      product: "rail",
      variant: "seoulBusan",
    },
  ],
  jeju: [
    {
      emoji: "📱",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive in Jeju.",
      product: "esim",
    },
    {
      emoji: "🚗",
      title: "Jeju Car Rental",
      desc: "Essential for Jeju island — the best spots are spread island-wide. International license accepted.",
      product: "car_rental",
      variant: "jeju",
    },
  ],
  gyeongju: [
    {
      emoji: "📱",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive.",
      product: "esim",
    },
    {
      emoji: "🚄",
      title: "Seoul → Gyeongju KTX",
      desc: "2hr 10min from Seoul Station. Book in advance — weekends sell out fast.",
      product: "rail",
      variant: "seoulGyeongju",
    },
  ],
};

// 같은 컴포넌트가 도시 랜딩과 공유 일정 두 문맥에서 쓰인다.
// Product Constitution v1.1 §14-1 — 파일이 아니라 **사용 문맥**으로 범위를 판정한다.
//   도시 랜딩   → Editorial Content Affiliate 승인 표면
//   공유 일정   → Trip-Flow Commerce (공유 일정은 §14-1-A 대상)
//
// surface 를 선택 prop 으로 두지 않는다. 선택이면 새 호출부가 조용히 통과하고
// 기본값이 "노출"이 된다. 필수 prop 이면 분류를 잊은 호출부가 컴파일되지 않는다.
interface Props {
  city:    City;
  surface: CommerceSurface;
}

export default function KoreaReadySection({ city, surface }: Props) {
  const locale = useLocale();
  // policy 가 어떤 파트너도 고르지 않는 상품은 카드 자체가 생기지 않는다.
  // 빈자리를 다른 파트너로 메우지 않는다.
  const cards = CITY_CARDS[city]
    .map((card) => ({ card, offer: resolveOffer(card.product, locale, { variant: card.variant, city }) }))
    .filter((x): x is { card: AffiliateCard; offer: NonNullable<typeof x.offer> } => x.offer !== null);
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);

  // 승인된 Editorial 표면이 아니면 상업 anchor 를 생성하지 않는다.
  // CSS 숨김이 아니라 섹션 자체를 렌더하지 않는다.
  if (!isEditorialAffiliateEnabled(surface)) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 pb-4">
      <div className="rounded-3xl border border-[#E6DFD5] bg-white overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#E6DFD5] flex items-center gap-3">
          <span className="text-2xl">🇰🇷</span>
          <div>
            {/* 브랜드 표기는 항상 소문자 gokoreamate 다. uppercase 를 걸면
                원문이 소문자여도 화면에는 GOKOREAMATE 로 나온다. */}
            <p className="text-[10px] font-black tracking-widest text-[#8C6239]">
              gokoreamate partner network
            </p>
            <p className="text-lg font-black text-[#2C2520]">
              Korea Ready for {cityLabel}
            </p>
          </div>
        </div>

        {/* Cards grid — 도시당 카드 2장이다. 3열로 두면 마지막 칸이 빈다. */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ card, offer }) => (
            <AffiliateLink
              key={`${card.product}-${offer.variant}`}
              href={offer.url}
              provider={PARTNER_LABEL[offer.partner]}
              title={card.title}
              city={city}
              kind={offer.kind}
              className="flex flex-col gap-2 p-4 rounded-2xl border border-[#E6DFD5] bg-[#FAF7F2] hover:border-[#D4AF37] hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">{card.emoji}</span>
                <span className="text-[9px] font-black uppercase tracking-wide text-[#8C6239] px-2 py-0.5 rounded-full border border-[#D4AF37]/40 bg-[#FDF8EE]">
                  {PARTNER_LABEL[offer.partner]}
                </span>
              </div>
              <p className="text-sm font-black text-[#2C2520] leading-tight">{card.title}</p>
              <p className="text-xs text-[#61554D] leading-relaxed flex-1">{card.desc}</p>
              <span className="text-[#D4AF37] text-xs font-black group-hover:underline mt-1">
                Check availability →
              </span>
            </AffiliateLink>
          ))}
        </div>

        {/* Sponsored disclosure */}
        <p className="text-center text-[9px] text-[#B8A89A] pb-3 pt-2 border-t border-[#E6DFD5]">
          Sponsored · gokoreamate partner network · Commission may be earned at no cost to you
        </p>
      </div>
    </section>
  );
}

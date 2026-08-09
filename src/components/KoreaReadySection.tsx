import AffiliateLink from "@/components/AffiliateLink";
import { KLOOK, VIATOR, KTX } from "@/config/affiliates";
import {
  isEditorialAffiliateEnabled,
  type CommerceSurface,
} from "@/config/commerce-surfaces";

interface AffiliateCard {
  emoji: string;
  provider: string;
  title: string;
  desc: string;
  url: string;
}

type City = "seoul" | "busan" | "jeju" | "gyeongju";

const CITY_CARDS: Record<City, AffiliateCard[]> = {
  seoul: [
    {
      emoji: "📱",
      provider: "Klook",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive at Incheon.",
      url: KLOOK.esimUrl,
    },
    {
      emoji: "✈️",
      provider: "Klook",
      title: "Incheon Airport Transfer",
      desc: "Limousine bus direct to Seoul city center. Skip the AREX queue with luggage.",
      url: KLOOK.transferUrl,
    },
    {
      emoji: "🎟️",
      provider: "Viator",
      title: "Seoul Tours & Experiences",
      desc: "Palace tours, K-culture, Gangnam night tours — curated by local Seoul guides.",
      url: VIATOR.seoulHub(),
    },
  ],
  busan: [
    {
      emoji: "📱",
      provider: "Klook",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive.",
      url: KLOOK.esimUrl,
    },
    {
      emoji: "🚄",
      provider: "Klook",
      title: "Seoul → Busan KTX",
      desc: "Korea's fastest train. 2hr 15min from Seoul. Book seats in advance on weekends.",
      url: KTX.seoulBusanUrl,
    },
    {
      emoji: "🎟️",
      provider: "Viator",
      title: "Busan Tours & Experiences",
      desc: "Haeundae, Gamcheon Village, seafood market tours — curated by local Busan guides.",
      url: VIATOR.busanHub(),
    },
  ],
  jeju: [
    {
      emoji: "📱",
      provider: "Klook",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive in Jeju.",
      url: KLOOK.esimUrl,
    },
    {
      emoji: "🚗",
      provider: "Klook",
      title: "Jeju Car Rental",
      desc: "Essential for Jeju island. From ₩35,000/day. International license accepted.",
      url: KLOOK.jejuCarRentalUrl,
    },
    {
      emoji: "🎟️",
      provider: "Viator",
      title: "Jeju Tours & Experiences",
      desc: "Hallasan hike, lava cave tours, Seongsan sunrise — curated by local Jeju guides.",
      url: VIATOR.searchUrl("tours", "Jeju"),
    },
  ],
  gyeongju: [
    {
      emoji: "📱",
      provider: "Klook",
      title: "Korea eSIM",
      desc: "Activate before landing. 5G/LTE data from the moment you arrive.",
      url: KLOOK.esimUrl,
    },
    {
      emoji: "🚄",
      provider: "Klook",
      title: "Seoul → Gyeongju KTX",
      desc: "2hr 10min from Seoul Station. Book in advance — weekends sell out fast.",
      url: KTX.seoulGyeongjuUrl,
    },
    {
      emoji: "🎟️",
      provider: "Viator",
      title: "Gyeongju Tours & Experiences",
      desc: "Bulguksa Temple, royal tumuli, Cheomseongdae — guided tours of Korea's ancient capital.",
      url: VIATOR.searchUrl("tours", "Gyeongju"),
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
  const cards = CITY_CARDS[city];
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

        {/* Cards grid */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((card) => (
            <AffiliateLink
              key={card.title}
              href={card.url}
              provider={card.provider}
              title={card.title}
              city={city}
              className="flex flex-col gap-2 p-4 rounded-2xl border border-[#E6DFD5] bg-[#FAF7F2] hover:border-[#D4AF37] hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xl">{card.emoji}</span>
                <span className="text-[9px] font-black uppercase tracking-wide text-[#8C6239] px-2 py-0.5 rounded-full border border-[#D4AF37]/40 bg-[#FDF8EE]">
                  {card.provider}
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

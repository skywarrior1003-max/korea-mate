// gokoreamate — AffiliateInlineSection
// TASK-026: 공유 일정 뷰어 및 일정 페이지 제휴 인젝터 컴포넌트
// 기존 affiliate-loader 파이프라인 재사용 — 외부 패키지 없음

import type { AffiliateDisplayMap } from "@/lib/affiliates/types";

const CATEGORY_EMOJI: Record<string, string> = {
  accommodation: "🏨",
  transport:     "✈️",
  esim:          "📱",
  activity:      "🎟️",
  food:          "🍽️",
  insurance:     "🛡️",
  shopping:      "🛍️",
};

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category.toLowerCase()] ?? "🇰🇷";
}

interface Props {
  affiliateMap:  AffiliateDisplayMap;
  city:          string;
  placement?:    "shared_trip_view" | "itinerary_view";
  compact?:      boolean;
}

export default function AffiliateInlineSection({
  affiliateMap,
  city,
  compact = false,
}: Props) {
  const entries = Object.entries(affiliateMap);
  if (entries.length === 0) return null;

  const cityCap = city.charAt(0).toUpperCase() + city.slice(1);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #FAF7F2 0%, #F5EFE3 100%)",
        border: "1px solid #E6DFD5",
      }}
    >
      {/* 헤더 */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-[#E6DFD5]">
        <span className="text-base">🇰🇷</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#8C6239]">
            Korea Ready Partner Deals
          </p>
          <p className="text-[11px] text-[#9C8575]">
            {cityCap} 여행을 위한 파트너 서비스
          </p>
        </div>
      </div>

      {/* 카드 목록 */}
      <div className={compact ? "divide-y divide-[#EDE7DC]" : "p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"}>
        {entries.map(([id, deal]) => (
          <a
            key={id}
            href={deal.destination_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={
              compact
                ? "flex items-center gap-3 px-5 py-3.5 hover:bg-[#F0E9DE] transition-colors"
                : "flex items-start gap-3 p-4 bg-white rounded-xl border border-[#E6DFD5] hover:border-[#D4AF37] hover:shadow-sm transition-all"
            }
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: "#EAE3D2" }}
            >
              {categoryEmoji(deal.category)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#8C6239]">
                {deal.provider}
              </p>
              <p className="text-sm font-black text-[#2C2520] leading-tight">
                {deal.title}
              </p>
              {!compact && (
                <p className="text-xs text-[#61554D] leading-relaxed mt-0.5 line-clamp-2">
                  {deal.description}
                </p>
              )}
            </div>
            <span className="text-[#D4AF37] text-sm font-black shrink-0 mt-0.5">→</span>
          </a>
        ))}
      </div>

      {/* 스폰서 레이블 */}
      <p className="text-center text-[9px] text-[#B8A89A] py-2 border-t border-[#E6DFD5]">
        Sponsored · gokoreamate partner network
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { TRIP_FLOW_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import type { CitySpot } from "@/data/cities/types";

const CATEGORY_LABEL: Record<string, string> = {
  attraction:    "🏯 Attraction",
  restaurant:    "🍜 Restaurant",
  nature:        "🌿 Nature",
  event:         "🎪 Event",
  accommodation: "🏨 Stay",
};

function getCategoryColor(category: string): string {
  switch (category) {
    case "restaurant": return "#e85d04";
    case "nature":     return "#2d6a4f";
    case "attraction": return "#1a1f36";
    case "event":      return "#7b2d8b";
    default:           return "#1a1f36";
  }
}

interface SpotCardProps {
  spot: CitySpot;
  distKm?: number;
  onClick: () => void;
  /**
   * 이미 담긴 장소인가. Cart 구독은 ExploreCity 가 한 번만 한다 —
   * 카드마다 CART_EVENT 를 구독하면 담을 때마다 158개가 전부 리렌더된다.
   */
  isAdded?: boolean;
  /** 없으면 CTA 를 렌더하지 않는다 (Explore 밖 사용처 호환) */
  onAdd?: () => void;
}

export default function SpotCard({ spot, distKm, onClick, isAdded, onAdd }: SpotCardProps) {
  const [imgError, setImgError] = useState(false);
  const tB = useTranslations("badges");
  const tM = useTranslations("map");
  const tE = useTranslations("explore");
  const tP = useTranslations("picks");
  const tMo = useTranslations("modal");

  const difficultyLabel =
    spot.difficulty === "easy"     ? tB("easy") :
    spot.difficulty === "moderate" ? tB("moderate") :
    spot.difficulty === "hard"     ? tB("hard") : null;

  const difficultyClass =
    spot.difficulty === "easy"     ? "bg-green-50 text-green-700 border-green-100" :
    spot.difficulty === "moderate" ? "bg-amber-50 text-amber-700 border-amber-100" :
                                     "bg-red-50 text-red-700 border-red-100";

  // Trip-Flow Commerce (§14-1-A) — 장소 카드는 일정 확정 전 "선택 단계"다.
  // 예약·구매 CTA 를 만들지 않는다. spot.affiliateUrl 은 조회 projection 단계에서
  // 이미 제외되지만(city-spots.ts EXPLORE_SELECT), 게이트로 한 번 더 막는다.
  const showTripCommerce = TRIP_FLOW_COMMERCE_ENABLED && !!spot.affiliateUrl;
  const hasSecondRow   = !!spot.officialUrl || showTripCommerce;
  const hasBoth        = !!spot.officialUrl && showTripCommerce;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 cursor-pointer group"
    >
      {/* 이미지 */}
      <div className="h-44 overflow-hidden relative bg-gray-200">
        {spot.image && !imgError ? (
          <Image
            src={spot.image} alt={spot.name} fill unoptimized
            onError={() => setImgError(true)}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/images/placeholder-spot.svg" alt="No image" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
            {tE("viewDetails")}
          </span>
        </div>
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: getCategoryColor(spot.category) }}
          >
            {CATEGORY_LABEL[spot.category] ?? spot.category}
          </span>
        </div>
        {distKm !== undefined && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#FF4A2D" }}>
              📍 {distKm.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 flex flex-col flex-1">
        {/* 지역 + 입장료 + 소요시간 */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400">📍 {spot.district ?? spot.city}</span>
          <div className="flex items-center gap-2">
            {spot.entryFee && (
              <span className="text-xs font-bold text-emerald-600">💰 {spot.entryFee}</span>
            )}
            {spot.durationMinutes && (
              <span className="text-xs font-semibold text-gray-400">🕐 {spot.durationMinutes}min</span>
            )}
          </div>
        </div>

        <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">{spot.name}</h3>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed flex-1">{spot.description}</p>

        {/* 배지 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {spot.soloFriendly && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{tB("soloOk")}</span>
          )}
          {spot.cashOnly && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{tB("cashOnly")}</span>
          )}
          {spot.foreignCardAccepted && !spot.cashOnly && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{tB("cardOk")}</span>
          )}
          {difficultyLabel && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${difficultyClass}`}>{difficultyLabel}</span>
          )}
        </div>

        {/* 버튼 영역 */}
        <div className="flex flex-col gap-1.5 mt-auto" onClick={e => e.stopPropagation()}>
          {/* 일정에 담기 — 이 카드의 핵심 행동이라 지도 링크보다 위에 둔다.
              onAdd 가 없으면(Explore 밖) 렌더하지 않는다. */}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              disabled={isAdded}
              aria-label={isAdded ? tP("addedAria", { name: spot.name }) : tP("addAria", { name: spot.name })}
              className={
                isAdded
                  ? "gkm-focus flex items-center justify-center gap-1.5 min-h-11 px-2 text-xs font-black rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default"
                  : "gkm-focus flex items-center justify-center gap-1.5 min-h-11 px-2 text-xs font-black rounded-xl text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              }
              style={isAdded ? undefined : { backgroundColor: "#FF4A2D" }}
            >
              {/* 색상만으로 구분하지 않는다 — 기호와 문구가 함께 바뀐다 */}
              <span aria-hidden="true">{isAdded ? "✓" : "+"}</span>
              {isAdded ? tMo("added") : tMo("addToTrip")}
            </button>
          )}

          {/* Google + Naver (항상 표시) */}
          <div className="grid grid-cols-2 gap-1.5">
            <a
              href={spot.mapUrl}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-colors"
            >
              {tM("google")}
            </a>
            <a
              href={spot.naverMapUrl ?? `https://map.naver.com/v5/search/${encodeURIComponent(spot.name)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-xl transition-colors"
            >
              {tM("naver")}
            </a>
          </div>

          {/* Official Info + Affiliate CTA (있을 때만) */}
          {hasSecondRow && (
            <div className={`grid gap-1.5 ${hasBoth ? "grid-cols-2" : "grid-cols-1"}`}>
              {spot.officialUrl && (
                <a
                  href={spot.officialUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-xl transition-colors"
                >
                  {tM("official")}
                </a>
              )}
              {showTripCommerce && (
                <a
                  href={spot.affiliateUrl}
                  target="_blank" rel="noopener noreferrer sponsored"
                  className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 rounded-xl transition-colors shadow-sm"
                >
                  {spot.affiliateProvider === "klook" ? tM("bookTour") : tM("bookStay")}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

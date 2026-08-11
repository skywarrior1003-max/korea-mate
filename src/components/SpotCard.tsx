"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { TRIP_FLOW_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import type { CitySpot } from "@/data/cities/types";

// 카테고리 배지는 활성 언어로 표시한다. 예전엔 이모지 + 영어를 상수로 박아
// 한국어·일본어·중국어 화면에서도 "🏯 Attraction" 이 그대로 나왔다.
// explore.categories.* 는 all/attraction/restaurant/nature 만 있으므로
// 그 밖의 값은 원본 category 를 그대로 쓴다 (없는 이름을 지어내지 않는다).
const TRANSLATED_CATEGORIES = new Set(["attraction", "restaurant", "nature"]);

// 배지는 사진 위에 얹히므로 어느 사진에서도 읽히는 한 가지 어두운 색만 쓴다.
// 예전엔 카테고리마다 주황·초록·보라를 따로 줘 한 화면에 색이 네 개 떴다.
const CATEGORY_BADGE_BG = "rgba(19,27,46,0.82)";

// 카드 안 메타 아이콘 — 텍스트 이모지 대신 같은 굵기의 선 아이콘으로 통일한다
const ICON = "shrink-0";
const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={ICON}
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.2" />
  </svg>
);
const TicketIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={ICON}
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V6.5h16V9a2.6 2.6 0 000 5.2v2.3H4v-2.3A2.6 2.6 0 004 9z" /><path d="M14 7v10" />
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className={ICON}
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" />
  </svg>
);

interface SpotCardProps {
  spot: CitySpot;
  distKm?: number;
  onClick: () => void;
  /**
   * 이미 저장한 장소인가. favorites 구독은 ExploreCity 가 한 번만 한다 —
   * 카드마다 FAVORITES_EVENT 를 구독하면 저장할 때마다 158개가 전부 리렌더된다.
   */
  isSaved?: boolean;
  /** 없으면 CTA 를 렌더하지 않는다 (Explore 밖 사용처 호환) */
  onSave?: () => void;
}

export default function SpotCard({ spot, distKm, onClick, isSaved, onSave }: SpotCardProps) {
  const [imgError, setImgError] = useState(false);
  const tB = useTranslations("badges");
  const tM = useTranslations("map");
  const tE = useTranslations("explore");
  const tD = useTranslations("discovery");
  const tP = useTranslations("picks");
  const tC = useTranslations("common");

  // 필터 칩("Attractions")과 배지("Attraction")는 수가 다르다 — 카드 한 장은
  // 한 곳이므로 단수 라벨을 따로 쓴다.
  const categoryLabel = TRANSLATED_CATEGORIES.has(spot.category)
    ? tD(`cat${spot.category[0].toUpperCase()}${spot.category.slice(1)}` as "catAttraction" | "catRestaurant" | "catNature")
    : spot.category;

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
          <img src="/images/placeholder-spot.svg" alt={tC("noImage")} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
            {tE("viewDetails")}
          </span>
        </div>
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: CATEGORY_BADGE_BG }}
          >
            {categoryLabel}
          </span>
        </div>
        {distKm !== undefined && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1"
                  style={{ backgroundColor: "var(--gkm-action-primary)" }}>
              <PinIcon />{distKm.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 flex flex-col flex-1">
        {/* 지역 + 입장료 + 소요시간 */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-400 inline-flex items-center gap-1 min-w-0">
            <PinIcon /><span className="truncate">{spot.district ?? spot.city}</span>
          </span>
          <div className="flex items-center gap-2">
            {spot.entryFee && (
              <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1"><TicketIcon />{spot.entryFee}</span>
            )}
            {spot.durationMinutes && (
              <span className="text-xs font-semibold text-gray-400 inline-flex items-center gap-1"><ClockIcon />{tC("minutes", { n: spot.durationMinutes })}</span>
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
          {/* 장소를 처음 보는 자리다. 여기서 "이번 여행에 넣을지" 를 묻지 않는다 —
              사용자는 아직 그 장소가 무엇인지도 다 모른다. 익숙한 저장 하나만 둔다.
              담기는 Picks > Saved 에서 This Trip 으로 보낼 때 한다.

              하트가 아니라 북마크다. 하트는 다른 사용자의 Story·Memory 에 대한
              Like 로 쓴다. 같은 기호를 두 의미로 쓰면 둘 다 읽히지 않는다.

              onSave 가 없으면(Explore 밖) 렌더하지 않는다. */}
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              aria-pressed={!!isSaved}
              aria-label={isSaved ? tP("unsaveAria", { name: spot.name }) : tP("saveAria", { name: spot.name })}
              className={
                isSaved
                  ? "gkm-focus flex items-center justify-center gap-1.5 min-h-11 px-2 text-xs font-black rounded-xl border border-action-tint bg-action-tint text-action transition-colors"
                  : "gkm-focus flex items-center justify-center gap-1.5 min-h-11 px-2 text-xs font-black rounded-xl text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              }
              style={isSaved ? undefined : { backgroundColor: "var(--gkm-action-primary)" }}
            >
              {/* 색상만으로 구분하지 않는다 — 채워진 북마크와 문구가 함께 바뀐다 */}
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden className="shrink-0"
                   fill={isSaved ? "currentColor" : "none"}
                   stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
              {isSaved ? tP("savedLabel") : tP("saveLabel")}
            </button>
          )}

          {/* Google + Naver (항상 표시) */}
          <div className="grid grid-cols-2 gap-1.5">
            <a
              href={spot.mapUrl}
              target="_blank" rel="noopener noreferrer"
              className="gkm-focus flex items-center justify-center gap-1 px-2 min-h-11 text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-gray-400 hover:text-gray-900 rounded-xl transition-colors"
            >
              {tM("google")}
            </a>
            <a
              href={spot.naverMapUrl ?? `https://map.naver.com/v5/search/${encodeURIComponent(spot.name)}`}
              target="_blank" rel="noopener noreferrer"
              className="gkm-focus flex items-center justify-center gap-1 px-2 min-h-11 text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-gray-400 hover:text-gray-900 rounded-xl transition-colors"
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
                  className="gkm-focus flex items-center justify-center gap-1 px-2 min-h-11 text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-gray-400 hover:text-gray-900 rounded-xl transition-colors"
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

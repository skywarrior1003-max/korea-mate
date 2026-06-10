"use client";

import { useState, useEffect } from "react";
import type { EventItem } from "@/lib/cart";
import { isFavorited, toggleFavorite, FAVORITES_EVENT, cacheSavedSpot, uncacheSavedSpot } from "@/lib/favorites";
import { getVerifiedImage } from "@/lib/placeImages";
import { dislikeSpot } from "@/lib/spots";
import { getDeviceId } from "@/lib/deviceId";

// ── Stage 뱃지 색상 매핑 ──────────────────────────
const STAGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  "Early-Bird":  { bg: "bg-violet-500",  text: "text-white", label: "Early Bird"  },
  "Pre-Event":   { bg: "bg-blue-500",    text: "text-white", label: "Pre-Event"   },
  "Event-Day":   { bg: "bg-red-500",     text: "text-white", label: "Event Day"   },
  "Post-Event":  { bg: "bg-emerald-500", text: "text-white", label: "Post-Event"  },
  "Standalone":  { bg: "bg-gray-500",    text: "text-white", label: "Standalone"  },
};

// koreanSurvivalScore → 색상
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-400";
}

// 가장 빠른 이동 수단 텍스트
function fastestTransit(transit: EventItem["transitFromAnchor"]): string | null {
  if (!transit) return null;
  if (transit.walkMinutes)   return `${transit.walkMinutes}min walk`;
  if (transit.subwayMinutes) return `${transit.subwayMinutes}min subway`;
  if (transit.taxiMinutes)   return `${transit.taxiMinutes}min taxi`;
  return null;
}

interface Props {
  event: EventItem;
  onClick: () => void;
  distanceBadge?: string;
}

export default function EventCard({ event, onClick, distanceBadge }: Props) {
  const [imgError,    setImgError]    = useState(false);
  const [favorited,   setFavorited]   = useState(false);
  const [disliked,    setDisliked]    = useState(false);

  // imgError 상태를 이벤트 ID 변경 시 초기화 (카테고리 전환 후 이미지 꼬임 방지)
  useEffect(() => { setImgError(false); }, [event.id]);

  // dislike 상태 localStorage 복원
  useEffect(() => {
    setDisliked(!!localStorage.getItem(`km_dislike_${event.id}`));
  }, [event.id]);

  async function handleDislike(e: React.MouseEvent) {
    e.stopPropagation();
    if (disliked) return;
    const ok = await dislikeSpot(String(event.id), getDeviceId());
    if (ok) {
      localStorage.setItem(`km_dislike_${event.id}`, "1");
      setDisliked(true);
    }
  }

  useEffect(() => {
    setFavorited(isFavorited(event.id));
    const handler = () => setFavorited(isFavorited(event.id));
    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, [event.id]);

  const stage   = STAGE_STYLE[event.stage] ?? STAGE_STYLE["Standalone"];
  const transit = fastestTransit(event.transitFromAnchor);
  // place_id(=event.id)로 레지스트리 우선 조회 → 1:1 검증 이미지 강제 매핑
  const resolvedImage = getVerifiedImage(event.id, event.image);

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-500 hover:-translate-y-1 bg-white border border-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
    >
      {/* ── 이미지 영역 ── */}
      <div className="relative h-48 w-full overflow-hidden bg-gray-100">

        {/* place_id 기반 1:1 검증 이미지 조회 (placeImages.ts 레지스트리) */}
        {resolvedImage && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedImage}
            alt={event.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/placeholder-spot.svg"
            alt="No image available"
            className="w-full h-full object-cover"
          />
        )}

        {/* 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Trending 뱃지 */}
        {event.isTrending && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white shadow">
            🔥 Trending
          </span>
        )}

        {/* Anchor 뱃지 */}
        {event.isAnchor && (
          <span className="absolute top-3 right-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-400 text-gray-900 shadow">
            ⭐ Anchor
          </span>
        )}

        {/* 하트 + Dislike 버튼 그룹 */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          {/* 찜하기 하트 */}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              const next = toggleFavorite(event.id);
              setFavorited(next);
              if (next) cacheSavedSpot(event);
              else uncacheSavedSpot(event.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                const next = toggleFavorite(event.id);
                setFavorited(next);
                if (next) cacheSavedSpot(event);
                else uncacheSavedSpot(event.id);
              }
            }}
            aria-label={favorited ? "Remove from saved spots" : "Save this spot"}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-base shadow-md cursor-pointer transition-all select-none ${
              favorited ? "bg-red-500 text-white scale-110" : "bg-white/80 hover:bg-white text-gray-400 hover:text-red-400"
            }`}
          >
            {favorited ? "❤️" : "🤍"}
          </span>
          {/* 정보 오류 신고 (Dislike) */}
          <span
            role="button"
            tabIndex={0}
            onClick={handleDislike}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleDislike(e as unknown as React.MouseEvent); }}
            aria-label={disliked ? "Already reported" : "Report inaccurate info"}
            title={disliked ? "신고됨 — 관리자가 검토합니다" : "정보 오류 신고"}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-sm shadow-md cursor-pointer transition-all select-none ${
              disliked
                ? "bg-gray-600 text-white scale-110 cursor-not-allowed"
                : "bg-white/80 hover:bg-white text-gray-400 hover:text-gray-700"
            }`}
          >
            👎
          </span>
        </div>

        {/* Stage 뱃지 (이미지 하단 왼쪽) */}
        <span
          className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold ${stage.bg} ${stage.text}`}
        >
          {stage.label}
        </span>

        {/* Transit 뱃지 (이미지 하단 오른쪽) */}
        {transit && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-black/50 text-white backdrop-blur-sm">
            📍 {transit}
          </span>
        )}
      </div>

      {/* ── 카드 본문 ── */}
      <div className="p-4 space-y-2">

        {/* 도시 + 지역 + 거리 뱃지 */}
        <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
          <span>{event.city}{event.district ? ` · ${event.district}` : ""}</span>
          {distanceBadge && (
            <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold normal-case text-[10px] shrink-0">
              📍 {distanceBadge}
            </span>
          )}
        </p>

        {/* 이벤트 이름 */}
        <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">
          {event.shortName}
        </h3>

        {/* 설명 한 줄 */}
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {event.description}
        </p>

        {/* 메타 정보 행 */}
        <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
          <span className="flex items-center gap-1">
            🕐 {event.recommendedDurationMinutes}min
          </span>
          <span className="flex items-center gap-1 capitalize">
            ☀️ {event.bestTimeSlot}
          </span>
          {event.cashOnly && (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              💵 Cash Only
            </span>
          )}
        </div>

        {/* 태그 (최대 3개) + Survival Score */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-wrap gap-1">
            {event.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <span
            className={`text-xs font-bold ${scoreColor(event.koreanSurvivalScore)} shrink-0 ml-2`}
            title="Korean Survival Score — foreigner-friendliness"
          >
            {event.koreanSurvivalScore}pts
          </span>
        </div>

        {/* 제휴 파트너 표시 */}
        {event.commerce.hasAffiliate && event.commerce.affiliatePartner && (
          <p className="text-[10px] text-gray-400 pt-0.5">
            🤝 via {event.commerce.affiliatePartner}
          </p>
        )}
      </div>

      {/* 하단 CTA 힌트 */}
      <div className="px-4 pb-4">
        <div
          className="w-full py-2 rounded-xl text-xs font-bold text-center text-white transition-opacity group-hover:opacity-100 opacity-80"
          style={{ backgroundColor: "#1a1f36" }}
        >
          View Details & Add to Itinerary →
        </div>
      </div>
    </button>
  );
}

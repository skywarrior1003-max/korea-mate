"use client";

import { useState, useEffect, useCallback } from "react";
import type { EventItem } from "@/lib/cart";
import {
  addToCart,
  removeFromCart,
  isInCart,
} from "@/lib/cart";

// ── Stage 색상 ─────────────────────────────────
const STAGE_STYLE: Record<string, { bg: string; text: string }> = {
  "Early-Bird": { bg: "bg-violet-100", text: "text-violet-700" },
  "Pre-Event":  { bg: "bg-blue-100",   text: "text-blue-700"   },
  "Event-Day":  { bg: "bg-red-100",    text: "text-red-700"    },
  "Post-Event": { bg: "bg-emerald-100",text: "text-emerald-700"},
  "Standalone": { bg: "bg-gray-100",   text: "text-gray-600"   },
};

// koreanSurvivalScore 색상 + 라벨
function scoreMeta(score: number) {
  if (score >= 85) return { color: "bg-emerald-500", label: "Very Foreigner-Friendly" };
  if (score >= 70) return { color: "bg-yellow-400",  label: "Manageable"              };
  return              { color: "bg-red-400",         label: "Prepare in Advance"      };
}

// 이동수단 아이콘
function transitIcon(type: "walk" | "subway" | "taxi") {
  return type === "walk" ? "🚶" : type === "subway" ? "🚇" : "🚕";
}

interface Props {
  event: EventItem;
  onClose: () => void;
}

export default function EventDetailModal({ event, onClose }: Props) {
  const [inCart, setInCart]   = useState(false);
  const [imgError, setImgError] = useState(false);
  const [added, setAdded]     = useState(false); // 방금 추가했을 때 잠깐 표시할 피드백

  // 마운트 시 장바구니 상태 확인
  useEffect(() => {
    setInCart(isInCart(event.id));
  }, [event.id]);

  // ESC 키로 닫기
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  // 모달 열리는 동안 배경 스크롤 잠금
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // [Add to My Itinerary] 버튼 핸들러
  function handleAddToCart() {
    addToCart(event);
    setInCart(true);
    setAdded(true);
    // 1.5초 후 피드백 메시지 제거
    setTimeout(() => setAdded(false), 1500);
  }

  // [Remove] 버튼 핸들러
  function handleRemoveFromCart() {
    removeFromCart(event.id);
    setInCart(false);
  }

  const stage    = STAGE_STYLE[event.stage] ?? STAGE_STYLE["Standalone"];
  const scoreInfo = scoreMeta(event.koreanSurvivalScore);
  const transit  = event.transitFromAnchor;

  return (
    // ── 반투명 오버레이 (클릭하면 닫힘) ──
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      {/* ── 모달 본체 (클릭 이벤트 전파 차단) ── */}
      <div
        className="relative w-full sm:max-w-2xl max-h-[95dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── 히어로 이미지 ── */}
        <div className="relative h-64 sm:h-80 w-full overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-gray-200">

          {/* Rule 9: onError → placeholder */}
          {event.image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.image}
              alt={event.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-sm text-lg font-bold"
            aria-label="Close"
          >
            ✕
          </button>

          {/* 이미지 위 뱃지들 */}
          <div className="absolute top-4 left-4 flex flex-wrap gap-2">
            {event.isTrending && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">
                🔥 Trending
              </span>
            )}
            {event.isAnchor && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900">
                ⭐ Anchor Event
              </span>
            )}
          </div>

          {/* 이미지 하단 제목 */}
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${stage.bg} ${stage.text}`}>
                {event.stage}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white capitalize backdrop-blur-sm">
                {event.type}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow">
              {event.name}
            </h2>
            <p className="text-sm text-white/80 mt-1">
              📍 {event.city}
              {event.district ? `, ${event.district}` : ""}
            </p>
          </div>
        </div>

        {/* ── 모달 콘텐츠 ── */}
        <div className="p-5 sm:p-6 space-y-5">

          {/* 지도 듀얼 버튼 — Google Maps + Naver Map */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={event.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-3 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <span className="text-xl shrink-0">🗺️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-blue-700 uppercase tracking-wide leading-tight">Google Maps</p>
                <p className="text-[10px] text-blue-400 mt-0.5">Directions</p>
              </div>
            </a>
            <a
              href={`https://map.naver.com/v5/search/${encodeURIComponent(event.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-3 rounded-2xl border-2 border-green-100 bg-green-50 hover:bg-green-100 transition-colors"
            >
              <span className="text-xl shrink-0">🟢</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-green-700 uppercase tracking-wide leading-tight">Naver Map</p>
                <p className="text-[10px] text-green-500 mt-0.5">Korean transit</p>
              </div>
            </a>
          </div>
          <p className="text-[10px] text-gray-400 -mt-3 pl-1 truncate">📍 {event.address}</p>

          {/* Why It Matters */}
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: "#1a1f36" }}
          >
            <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">
              Why It Matters
            </p>
            <p className="text-sm text-white/90 leading-relaxed">
              {event.whyItMatters}
            </p>
          </div>

          {/* 상세 설명 */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-1.5">About This Stop</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>
          </div>

          {/* 실용 정보 그리드 */}
          <div className="grid grid-cols-2 gap-3">

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Duration</p>
              <p className="text-sm font-semibold text-gray-800">
                🕐 {event.recommendedDurationMinutes} min
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Best Time</p>
              <p className="text-sm font-semibold text-gray-800 capitalize">
                ☀️ {event.bestTimeSlot}
              </p>
            </div>

            {event.openingHours && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hours</p>
                <p className="text-sm font-semibold text-gray-800">
                  🕑 {event.openingHours.open} – {event.openingHours.close}
                </p>
              </div>
            )}

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment</p>
              <p className="text-sm font-semibold text-gray-800">
                {event.cashOnly
                  ? "💵 Cash Only"
                  : event.foreignCardAccepted
                  ? "💳 Card OK"
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">English Menu</p>
              <p className="text-sm font-semibold text-gray-800">
                {event.englishMenu ? "✅ Available" : "❌ Korean only"}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Accessibility</p>
              <p className="text-sm font-semibold text-gray-800">
                {event.barrierFree ? "♿ Accessible" : "⚠️ Stairs / Uneven"}
              </p>
            </div>
          </div>

          {/* Korean Survival Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Korean Survival Score</h3>
              <span className="text-sm font-black text-gray-800">
                {event.koreanSurvivalScore}
                <span className="text-gray-400 font-normal">/100</span>
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${scoreInfo.color}`}
                style={{ width: `${event.koreanSurvivalScore}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{scoreInfo.label}</p>
          </div>

          {/* Transit from Anchor */}
          {transit && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">
                Getting There from Anchor
              </h3>
              <div className="flex flex-wrap gap-3">
                {transit.walkMinutes && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    {transitIcon("walk")} {transit.walkMinutes} min walk
                  </span>
                )}
                {transit.subwayMinutes && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    {transitIcon("subway")} {transit.subwayMinutes} min subway
                  </span>
                )}
                {transit.taxiMinutes && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    {transitIcon("taxi")} {transit.taxiMinutes} min taxi
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-2 leading-relaxed">{transit.description}</p>
            </div>
          )}

          {/* 태그 */}
          <div className="flex flex-wrap gap-1.5">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* 공지 / Notice */}
          {event.notice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-bold text-amber-700 mb-0.5">⚠️ Good to Know</p>
              <p className="text-xs text-amber-800 leading-relaxed">{event.notice}</p>
            </div>
          )}

          {/* 제휴 CTA (Affiliate Link) */}
          {event.commerce.hasAffiliate &&
            event.commerce.affiliateUrl &&
            event.commerce.affiliatePartner && (
              <a
                href={event.commerce.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-center justify-between w-full rounded-2xl px-5 py-4 border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors group"
              >
                <div>
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                    Book via {event.commerce.affiliatePartner}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">
                    {event.commerce.affiliateType === "booking"
                      ? "Reserve accommodation nearby →"
                      : event.commerce.affiliateType === "activity"
                      ? "Book this experience →"
                      : event.commerce.affiliateType === "transport"
                      ? "Get your transit card →"
                      : "Explore partner deals →"}
                  </p>
                </div>
                <span className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
              </a>
            )}

          {/* 티켓 구매 링크 */}
          {event.commerce.hasTicketing && event.commerce.bookingUrl && (
            <a
              href={event.commerce.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#1a1f36" }}
            >
              🎟️ Book Tickets
            </a>
          )}

          {/* ── 핵심 CTA: Add / Remove ── */}
          {inCart ? (
            <div className="space-y-2">
              {/* 방금 추가 피드백 */}
              {added && (
                <div className="text-center text-sm font-bold text-emerald-600 animate-pulse">
                  ✅ Added to your itinerary!
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm text-white bg-emerald-500">
                  ✓ In My Itinerary
                </div>
                <button
                  onClick={handleRemoveFromCart}
                  className="px-5 py-4 rounded-2xl font-bold text-sm text-red-500 border-2 border-red-200 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              className="w-full py-4 rounded-2xl font-black text-base text-white transition-opacity hover:opacity-90 shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#f97316" }}
            >
              + Add to My Itinerary
            </button>
          )}

          {/* 하단 여백 (모바일에서 홈 바 위) */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { VIATOR, BOOKING, KLOOK, isViatorEligible, isBookingEligible } from "@/config/affiliates";
import type { EventItem } from "@/lib/cart";
import { addToCart, removeFromCart, isInCart } from "@/lib/cart";
import { isFavorited, toggleFavorite, FAVORITES_EVENT, cacheSavedSpot, uncacheSavedSpot } from "@/lib/favorites";

// ── koreanSurvivalScore 색상 + 라벨 ──────────────
function scoreMeta(score: number) {
  if (score >= 85) return { color: "bg-emerald-500", label: "Very Foreigner-Friendly" };
  if (score >= 70) return { color: "bg-yellow-400",  label: "Manageable"              };
  return              { color: "bg-red-400",         label: "Prepare in Advance"      };
}

// ── 이동수단 아이콘 ────────────────────────────────
function transitIcon(type: "walk" | "subway" | "taxi") {
  return type === "walk" ? "🚶" : type === "subway" ? "🚇" : "🚕";
}

// ── Naver Maps URL 빌더 — 한국어 키워드 우선 ───────
function buildNaverMapUrl(event: EventItem): string {
  // 1순위: naverMapUrl 직접 설정 (local-info 한국어 URL)
  if (event.naverMapUrl) return event.naverMapUrl;

  // 2순위: naverSearchKeyword 한국어 검색어
  if (event.naverSearchKeyword) {
    return `https://map.naver.com/v5/search/${encodeURIComponent(event.naverSearchKeyword)}`;
  }

  // 3순위: shortName / name 에서 한국어 문자 추출
  const extractKorean = (s: string) =>
    (s.match(/[가-힯ᄀ-ᇿ㄰-㆏一-鿿]+/g) ?? []).join("").trim();

  const fromShort = extractKorean(event.shortName);
  if (fromShort.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(fromShort)}`;

  const fromName = extractKorean(event.name);
  if (fromName.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(fromName)}`;

  // 4순위: 영문 이름 + 도시 fallback
  return `https://map.naver.com/v5/search/${encodeURIComponent(`${event.name} ${event.city} Korea`)}`;
}

// ── address 에서 한국어 부분 추출 ─────────────────
function extractKoreanAddress(address: string): string | null {
  const paren = address.match(/[（(]([^\)）]*[가-힯][^\)）]*)[）)]/);
  if (paren) return paren[1].trim();
  if (/[가-힯]/.test(address)) return address.trim();
  return null;
}

// ── 한국어 검색어 표시용 ──────────────────────────
function getNaverDisplayKeyword(event: EventItem): string | null {
  if (event.naverSearchKeyword) return event.naverSearchKeyword;
  const extractKorean = (s: string) =>
    (s.match(/[가-힯ᄀ-ᇿ㄰-㆏一-鿿]+/g) ?? []).join("").trim();
  const fromShort = extractKorean(event.shortName);
  if (fromShort.length >= 2) return fromShort;
  const fromName = extractKorean(event.name);
  if (fromName.length >= 2) return fromName;
  return null;
}

// ── 리뷰 localStorage 관리 ────────────────────────
const REVIEW_KEY = "koreamate_reviews";
function loadReview(id: string): string {
  if (typeof window === "undefined") return "";
  try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || "{}")[id] ?? ""; }
  catch { return ""; }
}
function saveReview(id: string, text: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(REVIEW_KEY) || "{}");
    if (text.trim()) all[id] = text; else delete all[id];
    localStorage.setItem(REVIEW_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

interface Props {
  event: EventItem;
  onClose: () => void;
}

export default function EventDetailModal({ event, onClose }: Props) {
  const [inCart,    setInCart]    = useState(false);
  const [imgError,  setImgError]  = useState(false);
  const [added,     setAdded]     = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [review,    setReview]    = useState("");
  const [showReview, setShowReview] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ── 마운트: 상태 초기화 + 모바일 뒤로가기 방지 ──
  useEffect(() => {
    setInCart(isInCart(event.id));
    setFavorited(isFavorited(event.id));
    setReview(loadReview(event.id));

    // 모바일 뒤로가기 → 앱 이탈 방지: history 상태 주입
    window.history.pushState({ koreatmate_modal: true }, "");

    function handlePop() { onCloseRef.current(); }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [event.id]);

  // ── 찜 상태 동기화 ────────────────────────────────
  useEffect(() => {
    const handler = () => setFavorited(isFavorited(event.id));
    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, [event.id]);

  // ── ESC 닫기 + body 스크롤 잠금 ──────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  function handleAddToCart() {
    addToCart(event);
    setInCart(true);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }
  function handleRemoveFromCart() {
    removeFromCart(event.id);
    setInCart(false);
  }
  function handleToggleFavorite() {
    const next = toggleFavorite(event.id);
    setFavorited(next);
    if (next) cacheSavedSpot(event);
    else uncacheSavedSpot(event.id);
  }
  async function handleCopyAddress(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }
  function handleReviewChange(text: string) {
    setReview(text);
    saveReview(event.id, text);
  }

  const scoreInfo    = scoreMeta(event.koreanSurvivalScore);
  const transit      = event.transitFromAnchor;
  const naverUrl     = buildNaverMapUrl(event);
  const koreanAddr   = extractKoreanAddress(event.address);
  const naverKeyword = getNaverDisplayKeyword(event);
  const isCableCarRelated =
    event.name.toLowerCase().includes("cable") ||
    event.name.toLowerCase().includes("송도") ||
    event.tags.some((t) => t.toLowerCase().includes("cable"));

  const showViator  = isViatorEligible(event.type);
  const showBooking = isBookingEligible(event.type);
  const showKlook   = isCableCarRelated || event.type === "transport";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-2xl max-h-[95dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="flex-1 overflow-y-auto pb-2">
        {/* ── 히어로 이미지 ── */}
        <div className="relative h-64 sm:h-80 w-full overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-gray-200">
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
            <img src="/images/placeholder-spot.svg" alt="No image" className="w-full h-full object-cover" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-sm text-lg font-bold"
            aria-label="Close"
          >
            ✕
          </button>

          {/* 찜하기 하트 버튼 (이미지 위) */}
          <button
            onClick={handleToggleFavorite}
            className={`absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full text-xl shadow-md transition-all ${
              favorited ? "bg-red-500 text-white scale-110" : "bg-white/80 hover:bg-white text-gray-400 hover:text-red-400"
            }`}
            aria-label={favorited ? "Remove from liked" : "Like this spot"}
          >
            {favorited ? "❤️" : "🤍"}
          </button>

          {/* 뱃지들 */}
          <div className="absolute top-4 left-16 flex flex-wrap gap-2">
            {event.isTrending && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">🔥 Trending</span>
            )}
            {event.isAnchor && (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900">⭐ Anchor</span>
            )}
          </div>

          {/* 이미지 하단 제목 */}
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/15 text-white/80 capitalize backdrop-blur-sm cursor-default">
                {event.stage}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-white/70 capitalize backdrop-blur-sm cursor-default">
                {event.type}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow">{event.name}</h2>
            <p className="text-sm text-white/80 mt-1">
              📍 {event.city}{event.district ? `, ${event.district}` : ""}
            </p>
          </div>
        </div>

        {/* ── 모달 콘텐츠 ── */}
        <div className="p-5 sm:p-6 space-y-5">

          {/* 지도 듀얼 버튼 */}
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
              href={naverUrl}
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

          {/* 네이버 지도 한국어 안내 (외국인용) */}
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2">
            <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
              💡 If Naver Maps doesn&apos;t find the place, copy the Korean name or address below and paste it into Naver Maps directly.
            </p>
            {naverKeyword && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-800 flex-1">🔤 {naverKeyword}</span>
                <button
                  onClick={() => handleCopyAddress(naverKeyword)}
                  className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  {copied ? "✅ Copied!" : "Copy"}
                </button>
              </div>
            )}
            {koreanAddr && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 flex-1">📍 {koreanAddr}</span>
                <button
                  onClick={() => handleCopyAddress(koreanAddr)}
                  className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                >
                  {copied ? "✅" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <p className="text-[10px] text-gray-400 -mt-3 pl-1 truncate">📍 {event.address}</p>

          {/* Why It Matters */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: "#1a1f36" }}>
            <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-1">Why It Matters</p>
            <p className="text-sm text-white/90 leading-relaxed">{event.whyItMatters}</p>
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
              <p className="text-sm font-semibold text-gray-800">🕐 {event.recommendedDurationMinutes} min</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Best Time</p>
              <p className="text-sm font-semibold text-gray-800 capitalize">☀️ {event.bestTimeSlot}</p>
            </div>
            {event.openingHours && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hours</p>
                <p className="text-sm font-semibold text-gray-800">🕑 {event.openingHours.open} – {event.openingHours.close}</p>
              </div>
            )}
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payment</p>
              <p className="text-sm font-semibold text-gray-800">
                {event.cashOnly ? "💵 Cash Only" : event.foreignCardAccepted ? "💳 Card OK" : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">English Menu</p>
              <p className="text-sm font-semibold text-gray-800">{event.englishMenu ? "✅ Available" : "❌ Korean only"}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Accessibility</p>
              <p className="text-sm font-semibold text-gray-800">{event.barrierFree ? "♿ Accessible" : "⚠️ Stairs/Uneven"}</p>
            </div>
          </div>

          {/* Korean Survival Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900">Korean Survival Score</h3>
              <span className="text-sm font-black text-gray-800">
                {event.koreanSurvivalScore}<span className="text-gray-400 font-normal">/100</span>
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${scoreInfo.color}`} style={{ width: `${event.koreanSurvivalScore}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{scoreInfo.label}</p>
          </div>

          {/* Transit from Anchor */}
          {transit && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">Getting There from Anchor</h3>
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
              <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">{tag}</span>
            ))}
          </div>

          {/* 공지 */}
          {event.notice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs font-bold text-amber-700 mb-0.5">⚠️ Good to Know</p>
              <p className="text-xs text-amber-800 leading-relaxed">{event.notice}</p>
            </div>
          )}

          {/* ── Affiliate CTAs — smart routing by event type ── */}

          {/* Tier 1 — Viator (tours / activities / attractions) */}
          {showViator && (
            <a
              href={VIATOR.searchUrl(event.name)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-between w-full rounded-2xl overflow-hidden border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
            >
              <div className="px-5 py-4">
                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-0.5">🌿 Tours &amp; Experiences</p>
                <p className="text-sm font-bold text-gray-800">Book this experience on Viator →</p>
                <p className="text-xs text-gray-500 mt-0.5">English guides · Free cancellation · Best price guarantee</p>
              </div>
              <span className="text-2xl pr-5 group-hover:translate-x-1 transition-transform">→</span>
            </a>
          )}

          {/* Tier 2 — Booking.com (hotels near this spot) */}
          {showBooking && (
            <a
              href={BOOKING.nearUrl(event.name)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-between w-full rounded-2xl overflow-hidden border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors group"
            >
              <div className="px-5 py-4">
                <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-0.5">🏨 Stay Nearby</p>
                <p className="text-sm font-bold text-gray-800">Find hotels near this spot →</p>
                <p className="text-xs text-gray-500 mt-0.5">Booking.com · No booking fees · Instant confirmation</p>
              </div>
              <span className="text-2xl pr-5 group-hover:translate-x-1 transition-transform">→</span>
            </a>
          )}

          {/* Tier 3 — Klook (transport & cable car only) */}
          {showKlook && (
            isCableCarRelated ? (
              <a
                href={KLOOK.cableCarUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-center justify-between w-full rounded-2xl px-5 py-4 bg-sky-50 border-2 border-sky-200 hover:bg-sky-100 transition-colors group"
              >
                <div>
                  <p className="text-xs font-bold text-sky-600 uppercase tracking-wider">🚡 Songdo Sky Capsule</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">Book Cable Car Experience →</p>
                </div>
                <span className="text-2xl group-hover:translate-x-1 transition-transform">→</span>
              </a>
            ) : (
              <a
                href={KLOOK.transferUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-center justify-between w-full rounded-2xl overflow-hidden border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors group"
              >
                <div className="px-5 py-4">
                  <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-0.5">✈️ Airport Transfer</p>
                  <p className="text-sm font-bold text-gray-800">Book Chauffeur / Airport Transfer →</p>
                  <p className="text-xs text-gray-500 mt-0.5">Private car · English driver · Fixed price</p>
                </div>
                <span className="text-2xl pr-5 group-hover:translate-x-1 transition-transform">→</span>
              </a>
            )
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

          {/* ── 내 메모 / 리뷰 (간단 노트) ── */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowReview((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-bold text-gray-700">✏️ My Notes & Review</span>
              <span className="text-gray-400">{showReview ? "▲" : "▼"}</span>
            </button>
            {showReview && (
              <div className="p-4 space-y-3">
                <textarea
                  value={review}
                  onChange={(e) => handleReviewChange(e.target.value)}
                  placeholder="Write your notes, tips, or experience here... (saved locally)"
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none text-gray-700 placeholder:text-gray-400"
                />
                {review && (
                  <p className="text-xs text-emerald-600 font-medium">✅ Saved locally on this device</p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Sticky Bottom 액션 바 ── */}
      <div className="shrink-0 px-5 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.07)] rounded-b-3xl sm:rounded-b-3xl">
        {added && (
          <div className="text-center text-sm font-bold text-emerald-600 animate-pulse mb-2">✅ Added to your itinerary!</div>
        )}
        <div className="flex gap-3">
          {/* 하트 (찜하기) */}
          <button
            onClick={handleToggleFavorite}
            className={`shrink-0 flex items-center gap-2 px-5 py-3.5 rounded-2xl font-black text-sm border-2 transition-all ${
              favorited
                ? "bg-red-50 border-red-300 text-red-500"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-400"
            }`}
          >
            {favorited ? "❤️ Liked" : "🤍 Like"}
          </button>
          {/* 일정표 추가 / 제거 */}
          {inCart ? (
            <div className="flex-1 flex gap-2">
              <div className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white bg-emerald-500">
                ✓ In Itinerary
              </div>
              <button
                onClick={handleRemoveFromCart}
                className="px-4 py-3.5 rounded-2xl font-bold text-sm text-red-500 border-2 border-red-200 hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              className="flex-1 py-3.5 rounded-2xl font-black text-base text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#f97316" }}
            >
              + Add to Itinerary
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

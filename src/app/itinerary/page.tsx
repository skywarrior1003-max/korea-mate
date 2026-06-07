"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { generateItinerary } from "@/lib/scheduler";
import AdBanner from "@/components/AdBanner";
import { getCart } from "@/lib/cart";
import type { CartItem } from "@/lib/cart";

// ── 데이터 타입 ───────────────────────────────────────────────
interface Place {
  name: string;
  category: string;
  location: string;
  time: string;
  duration: string;
  tips: string;
  googleMapsUrl: string;
}

interface Day {
  date: string;
  dayNumber: number;
  places: Place[];
}

// ── localStorage 캐시 키 빌더 ────────────────────────────────
function cacheKey(city: string, sd: string, ed: string, t: string, s: string) {
  return `koreamate_itin_v2_${city}_${sd}_${ed}_${t}_${s}`;
}

// ── 카트 아이템 → Place 변환 ─────────────────────────────────
function cartItemToPlace(item: CartItem, dayNumber: number): Place {
  return {
    name: item.name,
    category: item.type,
    location: item.district || item.city,
    time: dayNumber === 1 ? "09:00" : "10:00",
    duration: `${item.recommendedDurationMinutes} min`,
    tips: item.whyItMatters || item.description.split(".")[0] + ".",
    googleMapsUrl: item.mapUrl,
  };
}

// ── Naver Maps URL ────────────────────────────────────────────
function buildNaverUrl(placeName: string, city: string): string {
  // Extract Korean characters from name first
  const korean = (placeName.match(/[가-힯ᄀ-ᇿ]+/g) ?? []).join("").trim();
  if (korean.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(korean)}`;
  return `https://map.naver.com/v5/search/${encodeURIComponent(`${placeName} ${city} Korea`)}`;
}

// ── 카테고리 이미지 ───────────────────────────────────────────
function getCategoryImage(category: string, name: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes("beach") || n.includes("haeundae") || n.includes("gwangalli") || n.includes("songdo"))
    return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800";
  if (n.includes("temple") || n.includes("shrine") || n.includes("haedong"))
    return "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800";
  if (n.includes("market") || c.includes("market"))
    return "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=800";
  if (n.includes("mountain") || n.includes("trail") || n.includes("jangsan") || n.includes("hwangnyeong"))
    return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800";
  if (n.includes("cable car") || n.includes("aerial"))
    return "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800";
  if (n.includes("gamcheon"))
    return "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800";
  if (c.includes("restaurant") || c.includes("food") || c.includes("dining"))
    return "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800";
  if (c.includes("cafe") || c.includes("coffee"))
    return "https://images.unsplash.com/photo-1447933601403-0c6688de566a?w=800";
  if (c.includes("museum"))
    return "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800";
  if (c.includes("park") || c.includes("nature") || c.includes("garden"))
    return "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800";
  if (c.includes("k-pop") || c.includes("concert"))
    return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800";
  return "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800";
}

function getCategoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("restaurant") || c.includes("food")) return "#f97316";
  if (c.includes("cafe") || c.includes("coffee")) return "#d97706";
  if (c.includes("market")) return "#dc2626";
  if (c.includes("museum")) return "#7c3aed";
  if (c.includes("park") || c.includes("nature")) return "#16a34a";
  if (c.includes("k-pop") || c.includes("concert")) return "#9333ea";
  if (c.includes("shopping")) return "#db2777";
  return "#1a1f36";
}

// ══════════════════════════════════════════════════════════════
//  PlaceModal — 뒤로가기 방지 포함
// ══════════════════════════════════════════════════════════════
interface ModalProps {
  place: Place;
  city: string;
  onClose: () => void;
}

function PlaceModal({ place, city, onClose }: ModalProps) {
  const naverUrl  = buildNaverUrl(place.name, city);
  const googleUrl = place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
  const imageUrl  = getCategoryImage(place.category, place.name);
  const badgeColor = getCategoryColor(place.category);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); },
    [onClose]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";

    // 모바일 뒤로가기 방지
    window.history.pushState({ koreamate_modal: true }, "");
    const handlePop = () => { onCloseRef.current(); };
    window.addEventListener("popstate", handlePop);

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("popstate", handlePop);
      document.body.style.overflow = "";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        style={{ animation: "modalSlideIn 0.22s ease-out" }}
      >
        <div className="relative h-52 sm:h-72 flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={place.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors backdrop-blur-sm font-bold text-base cursor-pointer z-10"
            aria-label="Close modal"
          >✕</button>
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wide text-white" style={{ backgroundColor: badgeColor }}>
              {place.category}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-black/50 text-white backdrop-blur-sm">
              🕒 {place.time} · {place.duration}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "#f97316" }}>📍 {place.location}</p>
            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] leading-tight">{place.name}</h2>
          </div>

          <div className="bg-[#FAF7F2] border border-[#E6DFD5] rounded-2xl p-5">
            <p className="text-xs font-black uppercase tracking-widest mb-2 text-[#8C6239]">💡 Tips for Foreigners</p>
            <p className="text-base text-[#61554D] leading-relaxed font-medium">{place.tips}</p>
          </div>

          {/* Naver Maps 한국어 안내 */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-bold text-green-700 mb-1">💡 If Naver Maps can&apos;t find it by English name, search in Korean directly.</p>
            <p className="text-xs text-green-600">
              Korean name search often works better than English for local spots.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
              🗺️ Google Maps
            </a>
            <a href={naverUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors">
              💚 Naver Maps
            </a>
          </div>

          <button onClick={onClose}
            className="w-full py-3.5 rounded-xl text-sm font-black text-[#2C2520] border-2 border-[#E6DFD5] hover:border-[#D4AF37] hover:bg-[#FAF7F2] transition-all cursor-pointer">
            Close
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: scale(0.93) translateY(12px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);     }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  일정 결과 컴포넌트
// ══════════════════════════════════════════════════════════════
function ItineraryResult() {
  const searchParams = useSearchParams();
  const city        = searchParams.get("city")        || "Seoul";
  const startDate   = searchParams.get("startDate")   || "";
  const endDate     = searchParams.get("endDate")     || "";
  const travelers   = searchParams.get("travelers")   || "1";
  const travelStyle = searchParams.get("travelStyle") || "Solo";

  const [days,         setDays]         = useState<Day[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [savedItems,   setSavedItems]   = useState<CartItem[]>([]);
  const [showSaved,    setShowSaved]    = useState(false);
  const [addToDay,     setAddToDay]     = useState<{ item: CartItem; dayNum: number } | null>(null);

  const key = cacheKey(city, startDate, endDate, travelers, travelStyle);

  // ── 저장된 일정 불러오기 / AI 생성 ──────────────────────────
  useEffect(() => {
    if (!startDate || !endDate) {
      setError("Please select travel dates.");
      setLoading(false);
      return;
    }

    // 1: localStorage 캐시 우선
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached) as Day[];
        if (parsed.length > 0) {
          setDays(parsed);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    // 2: AI 생성
    setLoading(true);
    setError(null);
    generateItinerary(city, startDate, endDate, travelers, travelStyle)
      .then((data) => {
        setDays(data.days);
        setLoading(false);
        try { localStorage.setItem(key, JSON.stringify(data.days)); } catch { /* ignore */ }
      })
      .catch((err) => {
        console.error("Itinerary generation error:", err);
        setError(`Failed to generate itinerary: ${err.message}`);
        setLoading(false);
      });
  }, [city, startDate, endDate, travelers, travelStyle, key]);

  // ── 일정 변경 시 자동 저장 ────────────────────────────────
  useEffect(() => {
    if (days.length === 0) return;
    try { localStorage.setItem(key, JSON.stringify(days)); } catch { /* ignore */ }
  }, [days, key]);

  // ── 찜한 장소 불러오기 ──────────────────────────────────
  useEffect(() => {
    setSavedItems(getCart());
  }, [showSaved]);

  // ── 장소 삭제 ───────────────────────────────────────────────
  function deletePlace(dayNumber: number, placeIndex: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayNumber === dayNumber
          ? { ...d, places: d.places.filter((_, i) => i !== placeIndex) }
          : d
      )
    );
  }

  // ── 찜한 장소 → 특정 Day에 추가 ─────────────────────────────
  function insertPlaceToDay(item: CartItem, dayNumber: number) {
    const newPlace = cartItemToPlace(item, dayNumber);
    setDays((prev) =>
      prev.map((d) =>
        d.dayNumber === dayNumber
          ? { ...d, places: [...d.places, newPlace] }
          : d
      )
    );
    setAddToDay(null);
  }

  // ── 일정 초기화 (재생성) ─────────────────────────────────────
  function resetItinerary() {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    setDays([]);
    setLoading(true);
    setError(null);
    generateItinerary(city, startDate, endDate, travelers, travelStyle)
      .then((data) => {
        setDays(data.days);
        setLoading(false);
        try { localStorage.setItem(key, JSON.stringify(data.days)); } catch { /* ignore */ }
      })
      .catch((err) => {
        setError(`Failed to generate itinerary: ${err.message}`);
        setLoading(false);
      });
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
        <h2 className="text-3xl font-black text-[#2C2520] mb-3 animate-pulse">AI is planning your Korea trip...</h2>
        <p className="text-lg text-[#61554D] max-w-md font-bold">
          Analyzing spots in {city} for a {travelStyle.toLowerCase()} traveler. About 10 seconds!
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-3xl font-black text-red-600 mb-4">Something went wrong</h2>
        <p className="text-lg text-[#61554D] max-w-md mb-8 font-bold">{error}</p>
        <Link href="/" className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors">
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">

      {/* 헤더 카드 */}
      <div className="bg-white rounded-3xl p-8 border border-[#E6DFD5] shadow-sm mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-black bg-[#EAE3D2] text-[#8C6239] px-3 py-1 rounded-md uppercase tracking-wider">
            {travelStyle} Trip
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520] mt-3">Your {city} Itinerary</h1>
          <p className="text-[#61554D] mt-2 text-base font-bold">
            📅 {startDate} to {endDate} ({travelers} {parseInt(travelers) > 1 ? "Travelers" : "Traveler"})
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm">
            ← Back to Home
          </Link>
          <button
            onClick={resetItinerary}
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-bold text-[#8C6239] border border-[#E6DFD5] rounded-xl hover:bg-[#FAF7F2] transition-all"
          >
            🔄 Regenerate
          </button>
        </div>
      </div>

      {/* 찜한 장소 추가 패널 토글 */}
      <div className="mb-8">
        <button
          onClick={() => { setShowSaved((v) => !v); setSavedItems(getCart()); }}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-[#D4AF37]/40 bg-[#FAF7F2] hover:bg-[#F3EEE3] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">❤️</span>
            <div className="text-left">
              <p className="text-sm font-black text-[#2C2520]">My Saved Places</p>
              <p className="text-xs text-[#8C6239] font-medium">
                {savedItems.length > 0 ? `${savedItems.length} place${savedItems.length > 1 ? "s" : ""} saved — tap to add to any day` : "No saved places yet — save spots from the main page"}
              </p>
            </div>
          </div>
          <span className="text-[#D4AF37] font-bold text-lg">{showSaved ? "▲" : "▼"}</span>
        </button>

        {showSaved && savedItems.length > 0 && (
          <div className="mt-3 bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden">
            {savedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E6DFD5] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2C2520] truncate">{item.name}</p>
                  <p className="text-xs text-[#8C6239]">{item.city} · {item.recommendedDurationMinutes}min</p>
                </div>
                {/* Day 선택 버튼들 */}
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {addToDay?.item.id === item.id ? (
                    // Day 선택 상태
                    <>
                      {days.map((d) => (
                        <button
                          key={d.dayNumber}
                          onClick={() => insertPlaceToDay(item, d.dayNumber)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-black text-white transition-colors"
                          style={{ backgroundColor: "#D4AF37" }}
                        >
                          Day {d.dayNumber}
                        </button>
                      ))}
                      <button
                        onClick={() => setAddToDay(null)}
                        className="px-2 py-1.5 rounded-lg text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-50"
                      >✕</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setAddToDay({ item, dayNum: 1 })}
                      className="px-3 py-1.5 rounded-lg text-xs font-black text-white transition-colors"
                      style={{ backgroundColor: "#2C2520" }}
                    >
                      + Add to Day
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 안내 텍스트 */}
      <p className="text-center text-sm text-[#8C6239] font-bold mb-8 bg-[#EAE3D2]/40 rounded-xl py-2.5">
        💡 Tap any card to see details &amp; maps · ✕ to remove a place · Changes auto-saved
      </p>

      {/* 날짜별 일정 */}
      <div className="space-y-12 mb-16">
        {days.map((day) => (
          <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-[#D4AF37]/30">
            <div className="absolute -left-[11px] top-1.5 bg-[#FAF7F2] border-4 border-[#D4AF37] w-5 h-5 rounded-full z-10" />

            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] mb-6 flex items-center gap-3">
              <span>Day {day.dayNumber}</span>
              <span className="text-lg font-bold text-[#8C6239] bg-[#EAE3D2]/40 px-3 py-0.5 rounded-full">{day.date}</span>
              <span className="text-sm font-semibold text-[#8C6239]">({day.places.length} places)</span>
            </h2>

            {day.places.length === 0 ? (
              <p className="text-sm text-[#8C6239] font-medium py-4 pl-2">No places yet — add from saved spots above.</p>
            ) : (
              <div className="grid grid-cols-1 gap-5">
                {day.places.map((place, idx) => {
                  const naverUrl = buildNaverUrl(place.name, city);
                  const googleUrl = place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;

                  return (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl border border-[#E6DFD5] p-6 sm:p-8 hover:shadow-lg hover:border-[#D4AF37]/40 transition-all group flex flex-col sm:flex-row justify-between gap-6 relative"
                    >
                      {/* 삭제 버튼 (우측 상단) */}
                      <button
                        onClick={() => deletePlace(day.dayNumber, idx)}
                        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 text-xs font-black transition-colors z-10"
                        aria-label="Remove place"
                        title="Remove this place"
                      >✕</button>

                      {/* 왼쪽: 정보 */}
                      <div
                        className="space-y-3 flex-1 cursor-pointer"
                        onClick={() => setSelectedPlace(place)}
                      >
                        <div className="flex flex-wrap items-center gap-2 pr-8">
                          <span
                            className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md text-white"
                            style={{ backgroundColor: getCategoryColor(place.category) }}
                          >{place.category}</span>
                          <span className="text-xs font-bold text-[#61554D]">🕒 {place.time} ({place.duration})</span>
                          <span className="text-xs font-bold text-[#61554D]">📍 {place.location}</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-[#2C2520] group-hover:text-[#8C6239] transition-colors">
                          {place.name}
                        </h3>
                        <div className="bg-[#FAF7F2]/60 border border-[#E6DFD5]/60 rounded-xl p-4">
                          <p className="text-xs font-extrabold text-[#8C6239] uppercase tracking-wider mb-1">💡 Tips for Foreigners</p>
                          <p className="text-sm text-[#61554D] leading-relaxed line-clamp-2">{place.tips}</p>
                        </div>
                        <p className="text-xs text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          Click for full details + maps →
                        </p>
                      </div>

                      {/* 오른쪽: 지도 버튼 */}
                      <div
                        className="flex sm:flex-col items-center gap-2 sm:justify-center shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a href={googleUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400 rounded-xl transition-all shadow-sm w-full sm:w-36">
                          🗺️ Google Maps
                        </a>
                        <a href={naverUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-white hover:bg-green-50 text-green-700 border border-green-200 hover:border-green-400 rounded-xl transition-all shadow-sm w-full sm:w-36">
                          💚 Naver Maps
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <AdBanner />

      {/* eSIM 배너 */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] rounded-3xl p-8 sm:p-10 shadow-xl border border-[#E6DFD5] text-[#2C2520] mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">📱 Don&apos;t forget your eSIM!</h3>
          <p className="text-base sm:text-lg font-bold text-[#4E3F35]">Stay connected throughout your Korea trip with 10% off.</p>
        </div>
        <a href="https://www.airalo.com/south-korea-esim" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-all shadow-md">
          Get eSIM Now
        </a>
      </div>

      {/* 상세 모달 */}
      {selectedPlace && (
        <PlaceModal place={selectedPlace} city={city} onClose={() => setSelectedPlace(null)} />
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════
//  페이지 레이아웃 (Suspense wrapper)
// ══════════════════════════════════════════════════════════════
export default function ItineraryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black tracking-tight text-[#2C2520] flex items-center gap-1.5">
            <span className="text-[#D4AF37] text-3xl">🇰🇷</span>
            Korea<span className="text-[#D4AF37]">Mate</span>
          </Link>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
            <h2 className="text-3xl font-black text-[#2C2520] mb-3">AI is planning your Korea trip...</h2>
          </div>
        }
      >
        <ItineraryResult />
      </Suspense>

      <footer className="mt-auto border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">Data provided by Korea Tourism Organization. AI-powered by Gemini.</p>
        </div>
      </footer>
    </div>
  );
}

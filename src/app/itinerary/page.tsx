"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { generateItinerary } from "@/lib/scheduler";
import AdBanner from "@/components/AdBanner";

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

interface Itinerary {
  days: Day[];
}

// ── 네이버 지도 영문 URL 생성 ─────────────────────────────────
function buildNaverUrl(placeName: string, city: string): string {
  const q = encodeURIComponent(`${placeName} ${city} Korea`);
  return `https://map.naver.com/v5/search/${q}?lang=en`;
}

// ── 카테고리/이름 → Unsplash 대표 이미지 ─────────────────────
function getCategoryImage(category: string, name: string): string {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (n.includes("beach") || n.includes("haeundae") || n.includes("gwangalli") || n.includes("songdo"))
    return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800";
  if (n.includes("temple") || n.includes("shrine") || n.includes("seokbul") || n.includes("haedong"))
    return "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800";
  if (n.includes("market") || c.includes("market"))
    return "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=800";
  if (n.includes("mountain") || n.includes("trail") || n.includes("jangsan") || n.includes("hwangnyeong"))
    return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800";
  if (n.includes("cable car") || n.includes("songdo aerial"))
    return "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800";
  if (n.includes("aquarium") || n.includes("sea life"))
    return "https://images.unsplash.com/photo-1484291470158-b8f8d608850d?w=800";
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
  if (c.includes("shopping") || c.includes("mall"))
    return "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800";
  if (c.includes("experience") || c.includes("activity") || c.includes("k-pop"))
    return "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800";
  return "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800";
}

// ── 카테고리 뱃지 스타일 ──────────────────────────────────────
function getCategoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("restaurant") || c.includes("food")) return "#f97316";
  if (c.includes("cafe") || c.includes("coffee")) return "#d97706";
  if (c.includes("market")) return "#dc2626";
  if (c.includes("museum")) return "#7c3aed";
  if (c.includes("park") || c.includes("nature")) return "#16a34a";
  if (c.includes("shopping")) return "#db2777";
  return "#1a1f36";
}

// ══════════════════════════════════════════════════════════════
//  상세 정보 모달
// ══════════════════════════════════════════════════════════════
interface ModalProps {
  place: Place;
  city: string;
  onClose: () => void;
}

function PlaceModal({ place, city, onClose }: ModalProps) {
  const naverUrl = buildNaverUrl(place.name, city);
  const googleUrl =
    place.googleMapsUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
  const imageUrl = getCategoryImage(place.category, place.name);
  const badgeColor = getCategoryColor(place.category);

  // 배경 클릭 시 닫기
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // ESC 키 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 모달 열릴 때 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        style={{ animation: "modalSlideIn 0.22s ease-out" }}
      >
        {/* 이미지 영역 */}
        <div className="relative h-52 sm:h-72 flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={place.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

          {/* 닫기 X 버튼 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition-colors backdrop-blur-sm font-bold text-base cursor-pointer z-10"
            aria-label="Close modal"
          >
            ✕
          </button>

          {/* 카테고리 + 시간 오버레이 (하단) */}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span
              className="px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wide text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {place.category}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-black/50 text-white backdrop-blur-sm">
              🕒 {place.time} · {place.duration}
            </span>
          </div>
        </div>

        {/* 콘텐츠 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">

          {/* 위치 + 타이틀 */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "#f97316" }}>
              📍 {place.location}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] leading-tight">
              {place.name}
            </h2>
          </div>

          {/* Tips for Foreigners */}
          <div className="bg-[#FAF7F2] border border-[#E6DFD5] rounded-2xl p-5">
            <p className="text-xs font-black uppercase tracking-widest mb-2 text-[#8C6239] flex items-center gap-1.5">
              💡 Tips for Foreigners
            </p>
            <p className="text-base text-[#61554D] leading-relaxed font-medium">
              {place.tips}
            </p>
          </div>

          {/* 지도 바로가기 버튼 (2열) */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              🗺️ Google Maps
            </a>
            <a
              href={naverUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
            >
              💚 Naver Maps
            </a>
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl text-sm font-black text-[#2C2520] border-2 border-[#E6DFD5] hover:border-[#D4AF37] hover:bg-[#FAF7F2] transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* 모달 슬라이드 인 키프레임 (글로벌 스타일 없이 inline) */}
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

  const [itinerary,    setItinerary]    = useState<Itinerary | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  useEffect(() => {
    if (!startDate || !endDate) {
      setError("Please select travel dates.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    generateItinerary(city, startDate, endDate, travelers, travelStyle)
      .then((data) => { setItinerary(data); setLoading(false); })
      .catch((err) => {
        console.error("Itinerary generation error:", err);
        setError(`Failed to generate itinerary: ${err.message}`);
        setLoading(false);
      });
  }, [city, startDate, endDate, travelers, travelStyle]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
        <h2 className="text-3xl font-black text-[#2C2520] mb-3 animate-pulse">
          AI is planning your Korea trip...
        </h2>
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
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors"
        >
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">

      {/* 헤더 카드 */}
      <div className="bg-white rounded-3xl p-8 border border-[#E6DFD5] shadow-sm mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-black bg-[#EAE3D2] text-[#8C6239] px-3 py-1 rounded-md uppercase tracking-wider">
            {travelStyle} Trip
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520] mt-3">
            Your {city} Itinerary
          </h1>
          <p className="text-[#61554D] mt-2 text-base font-bold">
            📅 {startDate} to {endDate} ({travelers} {parseInt(travelers) > 1 ? "Travelers" : "Traveler"})
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm"
        >
          ← Back to Home
        </Link>
      </div>

      {/* 안내 텍스트 */}
      <p className="text-center text-sm text-[#8C6239] font-bold mb-8 bg-[#EAE3D2]/40 rounded-xl py-2.5">
        💡 Tap any card to see full details, Google Maps &amp; Naver Maps directions
      </p>

      {/* 날짜별 일정 */}
      <div className="space-y-12 mb-16">
        {itinerary?.days.map((day) => (
          <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-[#D4AF37]/30">

            {/* 타임라인 점 */}
            <div className="absolute -left-[11px] top-1.5 bg-[#FAF7F2] border-4 border-[#D4AF37] w-5 h-5 rounded-full z-10" />

            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] mb-6 flex items-center gap-3">
              <span>Day {day.dayNumber}</span>
              <span className="text-lg font-bold text-[#8C6239] bg-[#EAE3D2]/40 px-3 py-0.5 rounded-full">
                {day.date}
              </span>
            </h2>

            {/* 장소 카드 */}
            <div className="grid grid-cols-1 gap-5">
              {day.places.map((place, idx) => {
                const naverUrl = buildNaverUrl(place.name, city);
                const googleUrl =
                  place.googleMapsUrl ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedPlace(place)}
                    className="bg-white rounded-2xl border border-[#E6DFD5] p-6 sm:p-8 hover:shadow-lg hover:border-[#D4AF37]/40 transition-all cursor-pointer group flex flex-col sm:flex-row justify-between gap-6"
                  >
                    {/* 왼쪽: 정보 */}
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md text-white"
                          style={{ backgroundColor: getCategoryColor(place.category) }}
                        >
                          {place.category}
                        </span>
                        <span className="text-xs font-bold text-[#61554D] flex items-center gap-1">
                          🕒 {place.time} ({place.duration})
                        </span>
                        <span className="text-xs font-bold text-[#61554D] flex items-center gap-1">
                          📍 {place.location}
                        </span>
                      </div>

                      <h3 className="text-xl sm:text-2xl font-black text-[#2C2520] group-hover:text-[#8C6239] transition-colors">
                        {place.name}
                      </h3>

                      <div className="bg-[#FAF7F2]/60 border border-[#E6DFD5]/60 rounded-xl p-4">
                        <p className="text-xs font-extrabold text-[#8C6239] uppercase tracking-wider mb-1">
                          💡 Tips for Foreigners
                        </p>
                        <p className="text-sm text-[#61554D] leading-relaxed line-clamp-2">
                          {place.tips}
                        </p>
                      </div>

                      {/* 클릭 힌트 */}
                      <p className="text-xs text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        Click for full details + maps →
                      </p>
                    </div>

                    {/* 오른쪽: 지도 버튼 */}
                    <div
                      className="flex sm:flex-col items-center gap-2 sm:justify-center shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400 rounded-xl transition-all shadow-sm w-full sm:w-36"
                      >
                        🗺️ Google Maps
                      </a>
                      <a
                        href={naverUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-white hover:bg-green-50 text-green-700 border border-green-200 hover:border-green-400 rounded-xl transition-all shadow-sm w-full sm:w-36"
                      >
                        💚 Naver Maps
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <AdBanner />

      {/* eSIM 배너 */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] rounded-3xl p-8 sm:p-10 shadow-xl border border-[#E6DFD5] text-[#2C2520] mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">📱 Don&apos;t forget your eSIM!</h3>
          <p className="text-base sm:text-lg font-bold text-[#4E3F35]">
            Stay connected throughout your Korea trip with 10% off.
          </p>
        </div>
        <a
          href="https://www.airalo.com/south-korea-esim"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-all shadow-md"
        >
          Get eSIM Now
        </a>
      </div>

      {/* 상세 모달 */}
      {selectedPlace && (
        <PlaceModal
          place={selectedPlace}
          city={city}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════
//  페이지 레이아웃 (Suspense wrapper 유지)
// ══════════════════════════════════════════════════════════════
export default function ItineraryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* 헤더 */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black tracking-tight text-[#2C2520] flex items-center gap-1.5">
            <span className="text-[#D4AF37] text-3xl">🇰🇷</span>
            Korea<span className="text-[#D4AF37]">Mate</span>
          </Link>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <Suspense
        fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
            <h2 className="text-3xl font-black text-[#2C2520] mb-3">
              AI is planning your Korea trip...
            </h2>
          </div>
        }
      >
        <ItineraryResult />
      </Suspense>

      {/* 푸터 */}
      <footer className="mt-auto border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}

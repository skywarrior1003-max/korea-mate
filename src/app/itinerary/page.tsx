"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { generateItinerary } from "@/lib/scheduler";
import AdBanner from "@/components/AdBanner";
import { PLANNER_EVENT } from "@/lib/plannerStore";
import { upsertItinerary, fetchItinerary } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

// ── 데이터 타입 ───────────────────────────────────────────────
interface Place {
  name: string;
  category: string;
  location: string;
  time: string;
  duration: string;
  tips: string;
  googleMapsUrl: string;
  slot?: string;
}

interface Day {
  date: string;
  dayNumber: number;
  places: Place[];
}

// ── 시간 슬롯 정의 ───────────────────────────────────────────
const TIME_SLOTS = [
  { key: "morning",   label: "Morning",   emoji: "☀️", range: "9AM–12PM" },
  { key: "lunch",     label: "Lunch",     emoji: "🍽️", range: "12–2PM"   },
  { key: "afternoon", label: "Afternoon", emoji: "⛅", range: "2–5PM"    },
  { key: "evening",   label: "Evening",   emoji: "🌙", range: "5–9PM"    },
] as const;

// ── 영문명 → 네이버 한국어 키워드 매핑 ──────────────────────
const NAVER_KEYWORD_MAP: Record<string, string> = {
  "haeundae beach":          "해운대해수욕장",
  "gamcheon culture village":"감천문화마을",
  "jagalchi fish market":    "자갈치시장",
  "jagalchi market":         "자갈치시장",
  "gwangalli beach":         "광안리해수욕장",
  "hwangnyeongsan":          "황령산전망대",
  "hwangnyeongsan night view trail": "황령산전망대",
  "jangsan mountain trail":  "장산등산로입구",
  "jangsan mountain":        "장산등산로입구",
  "igidae coastal walk":     "이기대해안산책로",
  "igidae":                  "이기대해안산책로",
  "haedong yonggungsa":      "해동용궁사",
  "oryukdo skywalk":         "오륙도스카이워크",
  "taejongdae":              "태종대",
  "busan tower":             "부산타워",
  "seomyeon":                "서면",
  "nampo-dong":              "남포동",
  "gyeongbokgung":           "경복궁",
  "namsan tower":            "남산타워",
  "n seoul tower":           "남산타워",
  "myeongdong":              "명동",
  "bukchon hanok village":   "북촌한옥마을",
  "dongdaemun":              "동대문",
  "hongdae":                 "홍대",
  "itaewon":                 "이태원",
  "insadong":                "인사동",
  "changdeokgung":           "창덕궁",
  "gwangjang market":        "광장시장",
  "noryangjin fish market":  "노량진수산시장",
};

// ── time 문자열 → 슬롯 자동 배정 ─────────────────────────────
function assignSlot(time: string): string {
  const h = parseInt(time?.split(":")?.[0] ?? "12", 10);
  if (isNaN(h) || h < 12) return "morning";
  if (h < 14) return "lunch";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Naver Maps URL ────────────────────────────────────────────
function buildNaverUrl(placeName: string, city: string): string {
  const norm = placeName.toLowerCase().trim();
  for (const [eng, kor] of Object.entries(NAVER_KEYWORD_MAP)) {
    if (norm.includes(eng) || eng.includes(norm)) {
      return `https://map.naver.com/v5/search/${encodeURIComponent(kor)}`;
    }
  }
  const korean = (placeName.match(/[가-힯ᄀ-ᇿ]+/g) ?? []).join("").trim();
  if (korean.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(korean)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${placeName} ${city} Korea`)}`;
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
//  PlaceModal
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
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-bold text-green-700 mb-1">💡 If Naver Maps can&apos;t find it by English name, search in Korean directly.</p>
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

  // ── URL 파라미터 (stable consts) ──────────────────────────
  const shareId        = searchParams.get("id");
  const paramCity        = searchParams.get("city")        || "Seoul";
  const paramStartDate   = searchParams.get("startDate")   || "";
  const paramEndDate     = searchParams.get("endDate")     || "";
  const paramTravelers   = searchParams.get("travelers")   || "1";
  const paramTravelStyle = searchParams.get("travelStyle") || "Solo";

  // ── 표시용 메타 (공유 링크 로드 시 Supabase 값으로 덮어씀) ─
  const [city,        setCity]        = useState(paramCity);
  const [startDate,   setStartDate]   = useState(paramStartDate);
  const [endDate,     setEndDate]     = useState(paramEndDate);
  const [travelers,   setTravelers]   = useState(paramTravelers);
  const [travelStyle, setTravelStyle] = useState(paramTravelStyle);

  // ── 핵심 상태 ─────────────────────────────────────────────
  const [days,          setDays]          = useState<Day[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [viewMode,      setViewMode]      = useState<"full" | "compact">("full");

  // ── Supabase 동기화 상태 ──────────────────────────────────
  const [itinId,      setItinId]      = useState<string | null>(null);
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncFading,  setSyncFading]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 플래너 뱃지 + 편집 진입용 플래너 세션 ID ─────────────────
  const [plannerMeta,  setPlannerMeta]  = useState<{ numDays: number; startDate: string } | null>(null);
  const [plannerSbId,  setPlannerSbId]  = useState<string | null>(null);

  // ══════════════════════════════════════════════════════════
  //  Effect 1: 공유 링크 모드 (?id=UUID) → Supabase에서 로드
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!shareId) return;
    setLoading(true);
    fetchItinerary(shareId).then(record => {
      if (!record) {
        setError("This shared itinerary could not be found. It may have been deleted.");
        setLoading(false);
        return;
      }
      setDays(record.days as Day[]);
      setItinId(shareId);
      setCity(record.city);
      setStartDate(record.start_date);
      setEndDate(record.end_date);
      setTravelers(record.travelers);
      setTravelStyle(record.travel_style);
      setSyncStatus("saved");
      setLoading(false);
    });
  }, [shareId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  //  Effect 2: 일반 모드 → Supabase 우선, 없으면 AI 생성
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (shareId) return; // Effect 1이 처리
    if (!paramStartDate || !paramEndDate) {
      setError("Please select travel dates.");
      setLoading(false);
      return;
    }

    // 낡은 v2 캐시 잔재 일회성 철거
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("koreamate_itin_v2_") || k === "koreamate_planner_v1")) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    // UUID 생성 또는 복원 (캐시 데이터 없이 ID만 보관)
    const idLocalKey = `koreamate_itin_id_${paramCity}_${paramStartDate}_${paramEndDate}_${paramTravelers}_${paramTravelStyle}`;
    let id: string | null = null;
    try { id = localStorage.getItem(idLocalKey); } catch {}
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(idLocalKey, id); } catch {}
    }
    setItinId(id);

    // Supabase 우선 로드
    fetchItinerary(id).then(record => {
      if (record && Array.isArray(record.days) && (record.days as Day[]).length > 0) {
        setDays(record.days as Day[]);
        setSyncStatus("saved");
        setLoading(false);
        return;
      }
      // Supabase에 없으면 AI 생성
      setLoading(true);
      setError(null);
      generateItinerary(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle)
        .then((data) => { setDays(data.days); setLoading(false); })
        .catch((err) => { setError(`Failed to generate itinerary: ${err.message}`); setLoading(false); });
    });
  }, [shareId, paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  //  Effect 3: days 변경 → Supabase 자동 동기화
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (days.length === 0 || !itinId) return;

    // Supabase 디바운스 동기화 (1.5s)
    setSyncStatus("saving");
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    const snapId          = itinId;
    const snapCity        = city;
    const snapStartDate   = startDate;
    const snapEndDate     = endDate;
    const snapTravelers   = travelers;
    const snapTravelStyle = travelStyle;
    const snapDays        = days;

    syncTimerRef.current = setTimeout(async () => {
      const ok = await upsertItinerary({
        id: snapId, city: snapCity,
        start_date: snapStartDate, end_date: snapEndDate,
        travelers: snapTravelers, travel_style: snapTravelStyle,
        days: snapDays,
        device_id: getDeviceId(),
      });
      setSyncStatus(ok ? "saved" : "error");
      if (ok) {
        setTimeout(() => setSyncFading(true), 2500);
        setTimeout(() => { setSyncStatus("idle"); setSyncFading(false); }, 3000);
      }
    }, 1500);

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [days, itinId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 플래너 메타 뱃지 + 편집용 세션 ID 읽기 (반응형) ──────
  useEffect(() => {
    // 편집 화면 진입 시 전달할 planner session ID
    try {
      const id = localStorage.getItem("koreamate_planner_sb_id");
      setPlannerSbId(id);
    } catch { /* ignore */ }

    const read = () => {
      try {
        const raw = localStorage.getItem("koreamate_planner_meta");
        setPlannerMeta(raw ? (JSON.parse(raw) as { numDays: number; startDate: string }) : null);
      } catch { setPlannerMeta(null); }
    };
    read();
    window.addEventListener(PLANNER_EVENT, read);
    return () => window.removeEventListener(PLANNER_EVENT, read);
  }, []);

  // ── 공유 링크 복사 ───────────────────────────────────────
  async function handleCopyShareLink() {
    if (!itinId) return;
    const url = `${window.location.origin}/itinerary?id=${itinId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API 미지원 브라우저: prompt로 수동 복사 유도
      window.prompt("Copy this link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── 일정 재생성 ──────────────────────────────────────────
  function resetItinerary() {
    // 새 UUID → 재생성된 일정은 별도 Supabase 레코드
    const newId = crypto.randomUUID();
    const idLocalKey = `koreamate_itin_id_${paramCity}_${paramStartDate}_${paramEndDate}_${paramTravelers}_${paramTravelStyle}`;
    try { localStorage.setItem(idLocalKey, newId); } catch { /* ignore */ }
    setItinId(newId);
    setSyncStatus("idle");
    setDays([]);
    setLoading(true);
    setError(null);
    generateItinerary(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle)
      .then((data) => { setDays(data.days); setLoading(false); })
      .catch((err) => { setError(`Failed to generate itinerary: ${err.message}`); setLoading(false); });
  }

  // ── 로딩 / 에러 화면 ────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8" />
        <h2 className="text-3xl font-black text-[#2C2520] mb-3 animate-pulse">
          {shareId ? "Loading shared itinerary..." : "AI is planning your Korea trip..."}
        </h2>
        {!shareId && (
          <p className="text-lg text-[#61554D] max-w-md font-bold">
            Analyzing spots in {paramCity} for a {paramTravelStyle.toLowerCase()} traveler. About 10 seconds!
          </p>
        )}
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

      {/* ── 공유 링크 뷰 배너 ── */}
      {shareId && (
        <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-blue-50 border border-blue-200">
          <span className="text-lg">🔗</span>
          <p className="text-sm font-bold text-blue-700 flex-1">
            You&apos;re viewing a shared itinerary. Changes you make will sync back to this link.
          </p>
        </div>
      )}

      {/* ── 헤더 카드 ── */}
      <div className="bg-white rounded-3xl p-8 border border-[#E6DFD5] shadow-sm mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black bg-[#EAE3D2] text-[#8C6239] px-3 py-1 rounded-md uppercase tracking-wider">
              {travelStyle} Trip
            </span>
            {plannerMeta && (
              <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-md flex items-center gap-1">
                🔗 Synced with My Planner · {plannerMeta.numDays}d
              </span>
            )}
            {/* 동기화 상태 표시기 */}
            {syncStatus === "saving" && (
              <span className="text-xs font-bold text-yellow-600 bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-full animate-pulse">
                ⟳ Syncing…
              </span>
            )}
            {syncStatus === "saved" && (
              <span className={`text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full transition-opacity duration-500 ${syncFading ? "opacity-0" : "opacity-100"}`}>
                ☁️ Saved to cloud
              </span>
            )}
            {syncStatus === "error" && (
              <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                ⚠️ Sync failed
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520] mt-3">My {city} Trip</h1>
          <p className="text-[#61554D] mt-2 text-base font-bold">
            📅 {startDate} to {endDate} ({travelers} {parseInt(travelers) > 1 ? "Travelers" : "Traveler"})
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full sm:w-auto">
          {/* 공유 링크 복사 버튼 */}
          <button
            onClick={handleCopyShareLink}
            disabled={!itinId}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all disabled:opacity-40 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            {copied ? "✅ Copied!" : "🔗 Copy Share Link"}
          </button>

          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm">
            ← Back to Home
          </Link>

          {!shareId && (
            <Link
              href={plannerSbId ? `/planner?id=${plannerSbId}` : "/planner"}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: "#f97316" }}
            >
              ✏️ Edit This Trip
            </Link>
          )}

          {!shareId && (
            <button
              onClick={resetItinerary}
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-bold text-[#8C6239] border border-[#E6DFD5] rounded-xl hover:bg-[#FAF7F2] transition-all"
            >
              🔄 Regenerate
            </button>
          )}

          {/* Compact / Full View 토글 */}
          <div className="flex gap-1.5 p-1 border border-[#E6DFD5] rounded-xl bg-[#FAF7F2]">
            {(["full", "compact"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                  viewMode === mode
                    ? "bg-[#2C2520] text-[#FAF7F2] shadow-sm"
                    : "text-[#8C6239] hover:text-[#2C2520]"
                }`}
              >
                {mode === "compact" ? "⊟ Compact" : "⊞ Full View"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-[#8C6239] font-bold mb-8 bg-[#EAE3D2]/40 rounded-xl py-2.5">
        💡 Tap any card for details, maps &amp; booking links · To edit your schedule, use ✏️ Edit This Trip above
      </p>

      {/* ── Compact 보기 ── */}
      {viewMode === "compact" ? (
        <div className="space-y-2 mb-16">
          {days.map((day) => (
            <div
              key={day.dayNumber}
              className="bg-white rounded-2xl border border-[#E6DFD5] px-5 py-4 flex flex-wrap items-center gap-3 hover:border-[#D4AF37]/50 transition-colors cursor-pointer"
              onClick={() => setViewMode("full")}
            >
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-sm font-black text-[#2C2520]">Day {day.dayNumber}</span>
                <span className="text-xs text-[#8C6239] font-medium bg-[#EAE3D2]/50 px-2 py-0.5 rounded-md">{day.date}</span>
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                {day.places.length === 0 ? (
                  <span className="text-xs text-[#8C6239]/40 italic">No places — click to add</span>
                ) : (
                  day.places.map((p, i) => (
                    <span key={i} className="inline-flex items-center px-2.5 py-0.5 bg-[#EAE3D2]/60 rounded-md text-xs font-semibold text-[#61554D]">
                      {p.name}
                    </span>
                  ))
                )}
              </div>
              <span className="shrink-0 text-xs font-bold text-[#8C6239]/60">
                {day.places.length} place{day.places.length !== 1 ? "s" : ""} →
              </span>
            </div>
          ))}
          <p className="text-center text-xs text-[#8C6239]/50 mt-3">Click any day card to switch to Full View</p>
        </div>
      ) : (
        /* ── Full View ── */
        <div className="space-y-12 mb-16">
          {days.map((day) => {
            const slotAssigned = day.places.map((p, i) => ({
              place: p,
              idx: i,
              slot: p.slot ?? assignSlot(p.time),
            }));

            return (
              <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-[#D4AF37]/30">
                <div className="absolute -left-[11px] top-1.5 bg-[#FAF7F2] border-4 border-[#D4AF37] w-5 h-5 rounded-full z-10" />
                <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] mb-5 flex items-center gap-3 flex-wrap">
                  <span>Day {day.dayNumber}</span>
                  <span className="text-lg font-bold text-[#8C6239] bg-[#EAE3D2]/40 px-3 py-0.5 rounded-full">{day.date}</span>
                  <span className="text-sm font-semibold text-[#8C6239]">({day.places.length} places)</span>
                </h2>

                <div className="space-y-4">
                  {TIME_SLOTS.map((ts) => {
                    const slotItems = slotAssigned.filter((x) => x.slot === ts.key);

                    return (
                      <div key={ts.key} className="rounded-2xl border border-[#E6DFD5] overflow-hidden bg-white">
                        <div className="px-5 py-3 bg-[#EAE3D2]/25 border-b border-[#E6DFD5] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{ts.emoji}</span>
                            <span className="text-sm font-black text-[#8C6239]">{ts.label}</span>
                            <span className="text-xs text-[#8C6239]/50 font-medium hidden sm:inline">{ts.range}</span>
                          </div>
                          {slotItems.length > 0 && (
                            <span className="text-xs text-[#8C6239]/60 font-semibold">
                              {slotItems.length} place{slotItems.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        {slotItems.length > 0 ? (
                          <div className="divide-y divide-[#E6DFD5]/50">
                            {slotItems.map(({ place, idx }) => {
                              const naverUrl = buildNaverUrl(place.name, city);
                              const googleUrl =
                                place.googleMapsUrl ||
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city} Korea`)}`;
                              const naverIsGoogle = naverUrl.includes("google.com");

                              return (
                                <div
                                  key={idx}
                                  className="flex flex-col sm:flex-row justify-between gap-4 p-5 hover:bg-[#FAF7F2]/40 transition-colors group relative"
                                >
                                  <div
                                    className="space-y-2 flex-1 cursor-pointer"
                                    onClick={() => setSelectedPlace(place)}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md text-white"
                                        style={{ backgroundColor: getCategoryColor(place.category) }}
                                      >{place.category}</span>
                                      <span className="text-xs font-bold text-[#61554D]">🕒 {place.time} ({place.duration})</span>
                                      <span className="text-xs font-bold text-[#61554D]">📍 {place.location}</span>
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-black text-[#2C2520] group-hover:text-[#8C6239] transition-colors">
                                      {place.name}
                                    </h3>
                                    <div className="bg-[#FAF7F2]/60 border border-[#E6DFD5]/60 rounded-xl p-3">
                                      <p className="text-xs text-[#61554D] leading-relaxed line-clamp-2">{place.tips}</p>
                                    </div>
                                    <p className="text-xs text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                      Click for full details + maps →
                                    </p>
                                  </div>
                                  <div className="flex sm:flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <a
                                      href={googleUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-extrabold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-400 rounded-xl transition-all shadow-sm sm:w-32"
                                    >🗺️ Google Maps</a>
                                    <a
                                      href={naverUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-extrabold rounded-xl transition-all shadow-sm sm:w-32 ${
                                        naverIsGoogle
                                          ? "bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 hover:border-blue-300"
                                          : "bg-white hover:bg-green-50 text-green-700 border border-green-200 hover:border-green-400"
                                      }`}
                                    >
                                      {naverIsGoogle ? "🗺️ More Search" : "💚 Naver Maps"}
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-xs text-[#8C6239]/40 italic py-3">
                            No places scheduled for {ts.label.toLowerCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AdBanner />

      {/* eSIM 배너 */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] rounded-3xl p-8 sm:p-10 shadow-xl border border-[#E6DFD5] text-[#2C2520] mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">📱 Don&apos;t forget your eSIM!</h3>
          <p className="text-base sm:text-lg font-bold text-[#4E3F35]">Stay connected throughout your Korea trip with 10% off.</p>
        </div>
        <a href="https://affiliate.klook.com/sl/KiT3U74" target="_blank" rel="noopener noreferrer sponsored"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-all shadow-md">
          Get eSIM Now
        </a>
      </div>

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
            <h2 className="text-3xl font-black text-[#2C2520] mb-3">Loading itinerary…</h2>
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

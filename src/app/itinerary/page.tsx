"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { generateItinerary } from "@/lib/scheduler";
import AdBanner from "@/components/AdBanner";
import { PLANNER_EVENT } from "@/lib/plannerStore";
import { upsertItinerary, fetchItinerary, updateItineraryTitle } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { getCart, removeFromCart, CART_EVENT, type CartItem } from "@/lib/cart";
import { isEmailSaved } from "@/lib/userEmail";
import EmailCaptureModal from "@/components/EmailCaptureModal";

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

// ── AI 빌드 단계 정의 (Task 1: 강제 드웰 타임 + 제휴 노출) ─────
const LOAD_PHASES = [
  {
    emoji: "🍽️",
    label: "[Step 1] Matching Michelin & top restaurants in Busan...",
    cards: [
      { emoji: "⭐", name: "Michelin Guide", desc: "Busan's best restaurants sorted by your route", color: "#d97706" },
      { emoji: "🏨", name: "Booking.com",    desc: "Top hotels auto-sorted near each day's spots",  color: "#003580" },
    ],
  },
  {
    emoji: "🏨",
    label: "[Step 2] Curating best hotels & nearby accommodations...",
    cards: [
      { emoji: "🏨", name: "Booking.com",    desc: "Free cancellation options — Haeundae & Centum", color: "#003580" },
      { emoji: "🎟️", name: "Viator Tours",   desc: "Day trips: Gamcheon, Taejongdae & more",        color: "#7c3aed" },
    ],
  },
  {
    emoji: "📱",
    label: "[Step 3] Optimizing eSIM coverage & transport routes...",
    cards: [
      { emoji: "📱", name: "Korea eSIM",     desc: "Unlimited 5G data — active before you land",    color: "#f97316" },
      { emoji: "✈️", name: "Airport Transfer",desc: "Fixed-price pickup from Gimhae Airport",        color: "#16a34a" },
    ],
  },
] as const;

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
  const router = useRouter();

  // ── URL 파라미터 (stable consts) ──────────────────────────
  const shareId          = searchParams.get("id");
  const paramCity        = searchParams.get("city")          || "Seoul";
  const paramStartDate   = searchParams.get("startDate")     || "";
  const paramEndDate     = searchParams.get("endDate")       || "";
  const paramTravelers   = searchParams.get("travelers")     || "1";
  const paramTravelStyle = searchParams.get("travelStyle")   || "Solo";
  const paramStartLoc      = searchParams.get("startLocation")  || "";
  const paramArrivalTime   = searchParams.get("arrivalTime")    || "";
  const paramDeparturePlace = searchParams.get("departurePlace") || "";
  const paramDepartureTime  = searchParams.get("departureTime")  || "";

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
  const [editDay,       setEditDay]       = useState(0);
  // ── 보관함 (cart 아이템 — Unscheduled 패널용) ─────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return getCart(); } catch { return []; }
  });
  // ── 로딩 페이즈 (Task 1: 강제 드웰 타임 + 제휴 노출) ─────────
  const [loadPhase, setLoadPhase] = useState(0);

  // ── Supabase 동기화 상태 ──────────────────────────────────
  const [itinId,      setItinId]      = useState<string | null>(null);
  const [syncStatus,  setSyncStatus]  = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [syncFading,  setSyncFading]  = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [emailModalOpen,  setEmailModalOpen]  = useState(false);
  const [emailSaved,      setEmailSaved]      = useState(() => isEmailSaved());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 플래너 뱃지 ────────────────────────────────────────────
  const [plannerMeta,  setPlannerMeta]  = useState<{ numDays: number; startDate: string } | null>(null);

  // ── 커스텀 제목 편집 (Bug ③) ──────────────────────────────
  const [tripTitle,    setTripTitle]    = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput,   setTitleInput]   = useState("");

  // ── 오너 판별 (shareId로 접근해도 본인 일정이면 편집 허용) ──
  const [isOwner, setIsOwner] = useState(!shareId);

  // ── 취향 태그 (cart 기반 — 세션 내 고정) ──────────────────
  const [prefTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cart = getCart();
      const tagSet = new Set<string>();
      cart.forEach(item => (item.tags ?? []).forEach((t: string) => tagSet.add(t)));
      const tags = Array.from(tagSet).slice(0, 6);
      return tags.length > 0 ? tags : ([paramTravelStyle].filter(Boolean) as string[]);
    } catch { return []; }
  });

  // ── 도착 시간 파싱 (컴포넌트 레벨 — 3중 방어의 공통 기준) ─
  const arrivalHour = parseInt(paramArrivalTime?.split(":")?.[0] ?? "14", 10);

  // 공항 저녁 도착 감지
  const isAirportEvening =
    (paramStartLoc.toLowerCase().includes("airport") ||
     paramStartLoc.toLowerCase().includes("gimhae") ||
     paramStartLoc.toLowerCase().includes("공항")) &&
    arrivalHour >= 17;

  // 저녁 도착 감지 (공항 포함 — 17:00 이후 모든 케이스)
  const isEveningOrNightArrival = arrivalHour >= 17;

  // Layer 2a: 공항 저녁 도착인데 금지 장소(해운대 등)가 Day 1에 있으면 true
  const PROHIBITED_DAY1 = ["haeundae", "gwangalli", "centum", "biff", "taejongdae", "haedong yonggungsa", "yonggungsa"];
  const day1HasProhibited = (dayList: Day[]): boolean => {
    const first = dayList[0];
    if (!first) return false;
    return first.places.some(p =>
      PROHIBITED_DAY1.some(kw =>
        p.name.toLowerCase().includes(kw) || p.location.toLowerCase().includes(kw)
      )
    );
  };

  // ── sanitizeDays: setDays 전 반드시 통과하는 유일한 정렬·세정 게이트 ──
  // 1) 모든 day.places를 HH:MM 시간 오름차순 정렬 (stable: origIdx 서브키)
  // 2) 공항 저녁 도착 Day 1: arrivalHour 이전 & 금지 장소 물리 제거
  // 3) 저녁/야간 도착 Day 1: arrivalHour 이전 슬롯 물리 제거 (Morning/Lunch 차단)

  // Edge Case 1/3: null·undefined·빈문자열 안전 처리 + 명시적 string | null | undefined 수용
  const timeToMins = (t: string | null | undefined): number => {
    const parts = (t ?? "12:00").split(":");
    const h = parseInt(parts[0] ?? "12", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    return (isNaN(h) ? 12 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const sanitizeDays = (rawDays: Day[]): Day[] =>
    rawDays.map((day, dayIdx) => {
      // ① 시간 오름차순 정렬 — origIdx를 서브 정렬 키로 사용하여 동일 시간대 순서 보장
      const sorted = day.places
        .map((p, origIdx) => ({ p, origIdx }))
        .sort((a, b) => {
          const diff = timeToMins(a.p.time) - timeToMins(b.p.time);
          return diff !== 0 ? diff : a.origIdx - b.origIdx; // 동일 시간 → 원래 입력 순서 유지
        })
        .map(({ p }) => p);

      // ② Day 1 필터링: 공항 저녁 = 금지 장소 + 이른 시간 제거
      //                 일반 저녁/야간 = 이른 시간(arrivalHour 이전) 만 제거
      let cleaned = sorted;
      if (dayIdx === 0 && isEveningOrNightArrival) {
        if (isAirportEvening) {
          // 공항 저녁: arrivalHour 이전 AND 금지 장소 모두 제거
          cleaned = sorted.filter(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
            const prohibited = PROHIBITED_DAY1.some(
              kw => p.name.toLowerCase().includes(kw) || p.location.toLowerCase().includes(kw)
            );
            return h >= arrivalHour && !prohibited;
          });
        } else {
          // 일반 저녁/야간: arrivalHour 이전 시간 슬롯만 제거 (Morning / Lunch 차단)
          cleaned = sorted.filter(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
            return h >= arrivalHour;
          });
        }
      }

      return { ...day, places: cleaned };
    });

  // ══════════════════════════════════════════════════════════
  //  Effect 1: 공유 링크 모드 (?id=UUID) → Supabase에서 로드
  //  2단계 폴백: ① ID만 쿼리 (공유 링크 / RLS 전체 허용)
  //              ② null이면 device_id 추가 재시도 (RLS가 device_id 일치 요구 시)
  // ══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!shareId) return;
    setLoading(true);

    const loadItinerary = async () => {
      // 시도 1: device_id 없이 ID만으로 조회 (공유 링크 / 익명 읽기 가능 RLS)
      let record = await fetchItinerary(shareId);

      // 시도 2: RLS가 device_id 일치를 요구할 경우 자신의 device_id로 재시도
      if (!record) {
        record = await fetchItinerary(shareId, getDeviceId());
      }

      if (!record) {
        // 두 시도 모두 실패 → My Trips로 복귀
        router.replace("/my-trips");
        return;
      }

      // days 필드 손상 방어
      if (!Array.isArray(record.days)) {
        setError("Itinerary data is corrupted. Please regenerate.");
        setLoading(false);
        return;
      }

      setDays(sanitizeDays(record.days as Day[]));
      setItinId(shareId);
      setCity(record.city);
      setStartDate(record.start_date);
      setEndDate(record.end_date);
      setTravelers(record.travelers);
      setTravelStyle(record.travel_style);
      if (record.trip_title) setTripTitle(record.trip_title);
      setIsOwner((record as { device_id?: string }).device_id === getDeviceId());
      setSyncStatus("saved");
      setLoading(false);
    };

    loadItinerary().catch(err => {
      setError(`Failed to load itinerary: ${(err as Error).message}`);
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

    // ── Layer 1: 구버전(v1/v2) 캐시 키 일회성 철거 → 잘못 생성된 구버전 UUID 완전 무효화
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith("koreamate_itin_v2_") ||
          k.startsWith("koreamate_itin_id_") ||   // ← v1 prefix (구버전) 전부 제거
          k === "koreamate_planner_v1"
        )) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    // ── 캐시 키 v3: startLocation + arrivalTime 해시 포함, 구버전과 완전 분리
    const locHash  = (paramStartLoc + paramArrivalTime).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    const deptHash = (paramDeparturePlace + paramDepartureTime).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
    const idLocalKey = `koreamate_itin3_id_${paramCity}_${paramStartDate}_${paramEndDate}_${paramTravelers}_${paramTravelStyle}_${locHash}${deptHash ? "_d" + deptHash : ""}`;
    let id: string | null = null;
    try { id = localStorage.getItem(idLocalKey); } catch {}
    if (!id) {
      id = crypto.randomUUID();
      try { localStorage.setItem(idLocalKey, id); } catch {}
    }
    setItinId(id);

    // ── Supabase 우선 로드 + Layer 2: 내용 검증
    fetchItinerary(id).then(record => {
      // v2 포맷 파싱 헬퍼 — { __v:2, scheduled, unscheduled } 또는 구버전 Day[]
      const raw = record?.days as Record<string, unknown> | Day[] | undefined;
      let loadedDays: Day[];
      let loadedUnscheduled: CartItem[] = [];
      if (raw && !Array.isArray(raw) && (raw as Record<string, unknown>).__v === 2) {
        const v2 = raw as { scheduled: Day[]; unscheduled: CartItem[] };
        loadedDays        = v2.scheduled    ?? [];
        loadedUnscheduled = v2.unscheduled  ?? [];
      } else {
        loadedDays = (raw as Day[]) ?? [];
      }

      if (record && Array.isArray(loadedDays) && loadedDays.length > 0) {
        // Day 1 이른 슬롯 감지 — 저녁 도착인데 arrivalHour 이전 슬롯이 있으면 오염된 캐시
        const day1HasEarlySlot = (dayList: Day[]): boolean => {
          const first = dayList[0];
          if (!first) return false;
          return first.places.some(p => {
            const h = parseInt(p.time?.split(":")?.[0] ?? "14", 10);
            return h < arrivalHour;
          });
        };
        // Layer 2: ① 공항 저녁 + 금지 장소 OR ② 일반 저녁 + Day 1 이른 슬롯
        const cacheIsStale =
          (isAirportEvening && day1HasProhibited(loadedDays)) ||
          (isEveningOrNightArrival && day1HasEarlySlot(loadedDays));
        if (cacheIsStale) {
          const freshId = crypto.randomUUID();
          try { localStorage.setItem(idLocalKey, freshId); } catch {}
          setItinId(freshId);
          setLoading(true);
          setError(null);
          generateWithDwell(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramStartLoc || undefined, paramArrivalTime || undefined, getPreferredSpotNames(), paramDeparturePlace || undefined, paramDepartureTime || undefined)
            .then((data) => { setDays(sanitizeDays(data.days)); setLoading(false); })
            .catch((err) => { setError(`Failed to generate itinerary: ${err.message}`); setLoading(false); });
          return;
        }
        // 정상 레코드 → sanitize 후 사용 + Supabase 보관함 복원
        setDays(sanitizeDays(loadedDays));
        if (record.trip_title) setTripTitle(record.trip_title);
        if (loadedUnscheduled.length > 0) {
          try {
            localStorage.setItem("koreamate_cart", JSON.stringify(
              loadedUnscheduled.map((item, i) => ({ ...item, addedAt: item.addedAt || Date.now(), sortOrder: i }))
            ));
            window.dispatchEvent(new CustomEvent(CART_EVENT));
          } catch { /* ignore */ }
        }
        setSyncStatus("saved");
        setLoading(false);
        return;
      }
      // Bug ②: Supabase에 없으면(삭제된 ID 포함) 새 UUID 발급 → 기존 UUID로 부활 방지
      const freshId = crypto.randomUUID();
      try { localStorage.setItem(idLocalKey, freshId); } catch {}
      setItinId(freshId);
      setLoading(true);
      setError(null);
      generateWithDwell(paramCity, paramStartDate, paramEndDate, paramTravelers, paramTravelStyle, paramStartLoc || undefined, paramArrivalTime || undefined, getPreferredSpotNames(), paramDeparturePlace || undefined, paramDepartureTime || undefined)
        .then((data) => { setDays(sanitizeDays(data.days)); setLoading(false); })
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
    // 보관함(Unscheduled)도 함께 Supabase에 영구 저장 — Single Source of Truth 구현
    const snapUnscheduled = getCart();

    syncTimerRef.current = setTimeout(async () => {
      const ok = await upsertItinerary({
        id: snapId, city: snapCity,
        start_date: snapStartDate, end_date: snapEndDate,
        travelers: snapTravelers, travel_style: snapTravelStyle,
        days: { __v: 2, scheduled: snapDays, unscheduled: snapUnscheduled },
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

  // ── 플래너 메타 뱃지 읽기 (반응형) ────────────────────────
  useEffect(() => {
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

  // ── 브라우저 탭 제목 동기화 ────────────────────────────────
  useEffect(() => {
    document.title = tripTitle
      ? `${tripTitle} — KoreaMate`
      : `My ${city} Trip — KoreaMate`;
  }, [tripTitle, city]);

  // ── 로딩 페이즈 사이클링 (2.5~3.5s 강제 드웰 타임) ─────────
  useEffect(() => {
    if (!loading || shareId) { setLoadPhase(0); return; }
    const t1 = setTimeout(() => setLoadPhase(1), 1200);
    const t2 = setTimeout(() => setLoadPhase(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading, shareId]);

  // ── AI 생성 + 최소 드웰 타임 보장 헬퍼 ──────────────────────
  async function generateWithDwell(
    city: string, sd: string, ed: string,
    trav: string, tstyle: string,
    startLoc?: string, arrTime?: string,
    preferredSpots?: string[],
    deptPlace?: string, deptTime?: string,
  ) {
    const MIN_MS = 2500 + Math.random() * 1000; // 2.5~3.5s
    const t0 = Date.now();
    const data = await generateItinerary(city, sd, ed, trav, tstyle, startLoc, arrTime, preferredSpots, deptPlace, deptTime);
    const elapsed = Date.now() - t0;
    const wait = Math.max(0, MIN_MS - elapsed);
    if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
    return data;
  }

  // ── 취향 스팟 이름 목록 (cart 기반) ────────────────────────
  function getPreferredSpotNames(): string[] {
    try {
      return getCart()
        .map((item) => item.shortName || item.name)
        .filter(Boolean)
        .slice(0, 8) as string[];
    } catch {
      return [];
    }
  }

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

  // ── Bug ③: 커스텀 제목 저장 ─────────────────────────────────
  async function handleTitleSave() {
    const trimmed = titleInput.trim();
    setEditingTitle(false);
    if (!trimmed || !itinId) return;
    setTripTitle(trimmed);
    await updateItineraryTitle(itinId, trimmed, getDeviceId());
  }

  // ── 인라인 편집: 장소 삭제 / 순서 변경 ─────────────────────
  function deletePlace(dayIdx: number, placeIdx: number) {
    setDays(prev => prev.map((day, di) =>
      di === dayIdx
        ? { ...day, places: day.places.filter((_, pi) => pi !== placeIdx) }
        : day
    ));
  }

  function movePlace(dayIdx: number, placeIdx: number, dir: "up" | "down") {
    const target = placeIdx + (dir === "up" ? -1 : 1);
    setDays(prev => prev.map((day, di) => {
      if (di !== dayIdx) return day;
      const places = [...day.places];
      if (target < 0 || target >= places.length) return day;
      [places[placeIdx], places[target]] = [places[target], places[placeIdx]];
      return { ...day, places };
    }));
  }

  // ── cart 변경 감지 → Unscheduled 갱신 ─────────────────
  useEffect(() => {
    const refreshCart = () => { try { setCartItems(getCart()); } catch { /* ignore */ } };
    window.addEventListener(CART_EVENT, refreshCart);
    return () => window.removeEventListener(CART_EVENT, refreshCart);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 보관함 아이템 → 현재 editDay에 추가 ─────────────────
  function addCartItemToDay(item: CartItem) {
    const defaultTime = "19:30";
    const newPlace: Place = {
      name:          item.shortName || item.name,
      category:      item.type || "attraction",
      location:      item.district || city,
      time:          defaultTime,
      duration:      item.recommendedDurationMinutes ? `${item.recommendedDurationMinutes}m` : "60m",
      tips:          item.description || item.whyItMatters || "",
      googleMapsUrl: item.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.shortName || item.name} ${city} Korea`)}`,
      slot:          assignSlot(defaultTime),
    };
    setDays(prev => prev.map((day, di) =>
      di === editDay ? { ...day, places: [...day.places, newPlace] } : day
    ));
    removeFromCart(item.id); // 배치 후 Unscheduled에서 즉시 제거
  }

  // ── 로딩 화면 — 페이즈별 스켈레톤 + 제휴 카드 노출 ──────────
  if (loading) {
    const phase = LOAD_PHASES[Math.min(loadPhase, LOAD_PHASES.length - 1)];
    return (
      <div className="flex-1 flex flex-col items-center py-12 px-4 max-w-4xl mx-auto w-full">

        {/* ── 페이즈 표시기 ── */}
        <div className="text-center mb-8 w-full max-w-lg">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#EAE3D2]/60 border border-[#E6DFD5] mb-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#D4AF37] shrink-0" />
            <span className="text-sm font-black text-[#2C2520]">
              {shareId ? "Loading shared itinerary…" : phase.label}
            </span>
          </div>
          {!shareId && (
            <div className="w-full bg-[#E6DFD5] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#D4AF37] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${((loadPhase + 1) / LOAD_PHASES.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* ── 제휴 파트너 카드 (드웰 타임 중 자연스럽게 노출) ── */}
        {!shareId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mb-10">
            {phase.cards.map((card) => (
              <div
                key={card.name}
                className="bg-white rounded-2xl border border-[#E6DFD5] p-5 flex items-start gap-4 shadow-sm"
                style={{ animation: "fadeInUp 0.4s ease-out" }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: card.color + "20" }}
                >
                  {card.emoji}
                </div>
                <div>
                  <p className="text-sm font-black text-[#2C2520]">{card.name}</p>
                  <p className="text-xs text-[#61554D] leading-relaxed mt-0.5">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 스켈레톤 일정 카드 ── */}
        <div className="w-full space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E6DFD5] p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-[#EAE3D2]" />
                <div className="h-5 bg-[#EAE3D2] rounded w-24" />
                <div className="h-4 bg-[#EAE3D2] rounded w-16 ml-2" />
              </div>
              <div className="space-y-2.5">
                <div className="h-3.5 bg-[#EAE3D2] rounded w-3/4" />
                <div className="h-3.5 bg-[#EAE3D2] rounded w-1/2" />
                <div className="h-3.5 bg-[#EAE3D2] rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
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
          {/* Bug ③: 커스텀 제목 편집 */}
          {prefTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
              {prefTags.map(tag => (
                <span
                  key={tag}
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#EAE3D2] text-[#8C6239] capitalize"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {editingTitle ? (
            <div className="flex items-center gap-2 mt-3">
              <input
                autoFocus
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                onBlur={handleTitleSave}
                className="text-2xl sm:text-3xl font-black text-[#2C2520] bg-[#FAF7F2] border-2 border-[#D4AF37] rounded-xl px-3 py-1 focus:outline-none w-full"
                placeholder={`My ${city} Trip`}
                maxLength={60}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3 group">
              <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520]">
                {tripTitle || `My ${city} Trip`}
              </h1>
              {(!shareId || isOwner) && itinId && (
                <button
                  onClick={() => { setTitleInput(tripTitle || `My ${city} Trip`); setEditingTitle(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#8C6239] hover:text-[#D4AF37] text-xl cursor-pointer shrink-0"
                  title="제목 편집"
                >✏️</button>
              )}
            </div>
          )}
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

          {/* 이메일 저장 버튼 */}
          {emailSaved ? (
            <button
              onClick={() => setEmailModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: "#22c55e" }}
            >
              ✅ Trip Saved to Email
            </button>
          ) : (
            <button
              onClick={() => setEmailModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: "#f97316" }}
            >
              📧 Save to Email
            </button>
          )}

          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm">
            ← Back to Home
          </Link>

          {/* Compact 편집 캔버스 진입 — 비공유 or 본인 일정 */}
          {(!shareId || isOwner) && (
            <button
              onClick={() => { setViewMode("compact"); setEditDay(0); }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-black text-white rounded-xl transition-all active:scale-95"
              style={{ backgroundColor: viewMode === "compact" ? "#16a34a" : "#f97316" }}
            >
              {viewMode === "compact" ? "✅ 편집 모드 중" : "✏️ Edit This Trip (여행 수정)"}
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

      <p className="text-center text-sm text-[#8C6239] font-bold mb-4 bg-[#EAE3D2]/40 rounded-xl py-2.5">
        💡 Tap any card for details, maps &amp; booking links · To edit your schedule, use ✏️ Edit This Trip above
      </p>

      {/* ── 공항 저녁 도착 전용 배관 배너 ── */}
      {!shareId && paramStartLoc.toLowerCase().includes("gimhae") && parseInt(paramArrivalTime || "0") >= 17 && (
        <div className="mb-6 rounded-2xl border border-[#D4AF37]/40 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
          <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-3">✈️ Gimhae Airport Evening Arrival — Essential Setup</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL || "https://affiliate.klook.com/redirect?aid=41763&aff_adid=944297&k_site=https%3A%2F%2Fwww.klook.com%2Factivity%2F21049-busan-gimhae-airport-private-transfer%2F"}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-amber-200 hover:border-amber-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">🚐</span>
              <div>
                <p className="text-xs font-black text-gray-900">Airport Limousine</p>
                <p className="text-[10px] text-gray-500">Gimhae → Nampo-dong · ₩8,000</p>
              </div>
            </a>
            <a
              href={process.env.NEXT_PUBLIC_KLOOK_ESIM_URL || "https://affiliate.klook.com/sl/KiT3U74"}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-orange-200 hover:border-orange-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">📱</span>
              <div>
                <p className="text-xs font-black text-gray-900">Korea eSIM</p>
                <p className="text-[10px] text-gray-500">Activate before landing · 5G</p>
              </div>
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Nampo-dong+Busan+Korea"}&checkin=${startDate}&checkout=${endDate}`}
              target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-blue-200 hover:border-blue-400 transition-colors shadow-sm"
            >
              <span className="text-2xl">🏨</span>
              <div>
                <p className="text-xs font-black text-gray-900">Hotel near Nampo-dong</p>
                <p className="text-[10px] text-gray-500">Best access from airport</p>
              </div>
            </a>
          </div>
        </div>
      )}


      {/* ── Compact / 인라인 편집 캔버스 ── */}
      {viewMode === "compact" ? (
        <div className="mb-16">
          {/* 안내 배너 */}
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#1a1f36] text-white">
            <span className="text-base shrink-0">✏️</span>
            <p className="text-xs font-bold flex-1">
              편집 캔버스 — 장소를 삭제하거나 순서를 바꿀 수 있습니다. 변경사항은 자동 저장됩니다.
            </p>
            <button
              onClick={() => setViewMode("full")}
              className="shrink-0 text-xs font-black text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              ⊞ Full View
            </button>
          </div>

          {/* 주황 Spot 탐색 버튼 — /all-spots 검색 페이지로 이동 */}
          {(!shareId || isOwner) && (
            <Link
              href="/all-spots"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-black text-white mb-4 transition-opacity hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#f97316" }}
            >
              🔍 Search Spots — 스폿 탐색하기
            </Link>
          )}

          {/* Day 탭 */}
          <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
            {days.map((day, i) => (
              <button
                key={i}
                onClick={() => setEditDay(i)}
                className={`shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  editDay === i
                    ? "bg-[#1a1f36] text-white shadow-md"
                    : "bg-white text-[#8C6239] border border-[#E6DFD5] hover:border-[#D4AF37]"
                }`}
              >
                <span>Day {day.dayNumber}</span>
                {day.date && (
                  <span className={`text-[10px] font-normal mt-0.5 ${editDay === i ? "text-white/60" : "text-gray-400"}`}>
                    {day.date}
                  </span>
                )}
                <span
                  className="mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                  style={editDay === i
                    ? { backgroundColor: "#f97316", color: "#fff" }
                    : { backgroundColor: "#f3f4f6", color: "#374151" }}
                >
                  {day.places.length}
                </span>
              </button>
            ))}
          </div>

          {/* 현재 Day 편집 리스트 — 시간순 플랫 리스트 (슬롯 그루핑 제거로 누락 방지) */}
          {days[editDay] && (
            <div className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm">
              <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "#1a1f36" }}>
                <span className="text-sm font-black text-white">
                  Day {days[editDay].dayNumber} — {days[editDay].date}
                </span>
                <span className="text-xs text-white/50">{days[editDay].places.length} places</span>
              </div>

              {/* 시간순 정렬 플랫 리스트 */}
              {days[editDay].places.map((p, pi) => (
                <div
                  key={pi}
                  className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5]/40 last:border-0 hover:bg-[#FAF7F2]/60 group transition-colors"
                >
                  <span className="text-xs font-bold text-[#8C6239] w-12 shrink-0 tabular-nums">{p.time}</span>
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                    style={{ backgroundColor: getCategoryColor(p.category) }}
                  >
                    {p.category.slice(0, 5)}
                  </span>
                  <span className="flex-1 text-sm font-bold text-[#2C2520] truncate">{p.name}</span>
                  {(!shareId || isOwner) && (
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                      <button
                        onClick={() => movePlace(editDay, pi, "up")}
                        disabled={pi === 0}
                        className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer"
                        title="위로"
                      >↑</button>
                      <button
                        onClick={() => movePlace(editDay, pi, "down")}
                        disabled={pi === days[editDay].places.length - 1}
                        className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-25 text-xs font-black flex items-center justify-center cursor-pointer"
                        title="아래로"
                      >↓</button>
                      <button
                        onClick={() => deletePlace(editDay, pi)}
                        className="w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-200 text-xs font-black flex items-center justify-center cursor-pointer"
                        title="삭제"
                      >×</button>
                    </div>
                  )}
                </div>
              ))}

              {days[editDay].places.length === 0 && (
                <div className="py-10 text-center text-sm text-[#8C6239]/40 italic">
                  이 날의 일정이 없습니다
                </div>
              )}
            </div>
          )}

          {/* 보관함 (Unscheduled) — 명시적으로 저장한 스폿 목록 */}
          {(() => {
            const unscheduled = cartItems;
            if (unscheduled.length === 0 || (shareId && !isOwner)) return null;
            return (
              <div className="mt-5">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-black text-[#8C6239]">❤️ 보관함 (Unscheduled)</span>
                  <span className="text-[10px] font-bold bg-[#EAE3D2]/60 text-[#8C6239] px-2 py-0.5 rounded-full">
                    {unscheduled.length}개
                  </span>
                  <span className="text-[10px] text-[#8C6239]/50 ml-auto">+ 버튼으로 현재 Day에 추가</span>
                </div>
                <div className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden shadow-sm">
                  {unscheduled.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5]/40 last:border-0 hover:bg-[#FAF7F2]/60 transition-colors"
                    >
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0 hidden sm:inline"
                        style={{ backgroundColor: getCategoryColor(item.type) }}
                      >
                        {item.type.slice(0, 5)}
                      </span>
                      <span className="flex-1 text-sm font-bold text-[#2C2520] truncate">
                        {item.shortName || item.name}
                      </span>
                      <span className="text-[10px] text-[#8C6239]/50 shrink-0 hidden sm:inline">
                        {item.recommendedDurationMinutes}m
                      </span>
                      <button
                        onClick={() => addCartItemToDay(item)}
                        className="shrink-0 w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center hover:opacity-80 cursor-pointer transition-opacity"
                        style={{ backgroundColor: "#f97316" }}
                        title={`Day ${editDay + 1}에 추가`}
                      >+</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <p className="text-center text-xs text-[#8C6239]/50 mt-4">
            ☁️ 변경사항 자동 저장 · 상단 ⊞ Full View 버튼으로 복귀
          </p>
        </div>
      ) : (
        /* ── Full View ── */
        <div className="space-y-12 mb-16">
          {days.map((day) => {
            // Layer 3: 공항 저녁 도착 + Day 1 → 도착 시간 이전 장소 렌더링 완전 제거
            const visiblePlaces =
              isAirportEvening && day.dayNumber === 1
                ? day.places.filter(p => {
                    const h = parseInt(p.time?.split(":")?.[0] ?? "20", 10);
                    return h >= arrivalHour;
                  })
                : day.places;

            const slotAssigned = visiblePlaces.map((p, i) => ({
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

                <div className="space-y-4" id={`day-${day.dayNumber}`}>
                  {TIME_SLOTS.map((ts) => {
                    const slotItems = slotAssigned.filter((x) => x.slot === ts.key);
                    if (slotItems.length === 0) return null;

                    return (
                      <div key={ts.key} className="rounded-2xl border border-[#E6DFD5] overflow-hidden bg-white">
                        <div className="px-5 py-3 bg-[#EAE3D2]/25 border-b border-[#E6DFD5] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{ts.emoji}</span>
                            <span className="text-sm font-black text-[#8C6239]">{ts.label}</span>
                            <span className="text-xs text-[#8C6239]/50 font-medium hidden sm:inline">{ts.range}</span>
                          </div>
                          <span className="text-xs text-[#8C6239]/60 font-semibold">
                            {slotItems.length} place{slotItems.length !== 1 ? "s" : ""}
                          </span>
                        </div>

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
                                  className="flex flex-col hover:bg-[#FAF7F2]/40 transition-colors group relative"
                                >
                                  {/* 장소 정보 + 지도 버튼 행 */}
                                  <div className="flex flex-col sm:flex-row justify-between gap-4 p-5">
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
                                  {/* ── 수익화 제휴 버튼 스트립 (환경변수 기반) ── */}
                                  <div
                                    className="flex gap-2 overflow-x-auto px-5 pb-4 pt-0 border-t border-[#E6DFD5]/40"
                                    style={{ scrollbarWidth: "none" }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <a
                                      href={process.env.NEXT_PUBLIC_KLOOK_ESIM_URL || "https://affiliate.klook.com/sl/KiT3U74"}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#f97316" }}
                                    >
                                      📱 Get Korea eSIM
                                    </a>
                                    <a
                                      href={`${process.env.NEXT_PUBLIC_BOOKING_BUSAN_URL || "https://www.booking.com/searchresults.html?ss=Busan+Korea"}&checkin=${startDate}&checkout=${endDate}`}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#003580" }}
                                    >
                                      🏨 Book Hotels
                                    </a>
                                    <a
                                      href={process.env.NEXT_PUBLIC_VIATOR_BUSAN_URL || "https://www.viator.com/en-KR/Korea/d4431-ttd/"}
                                      target="_blank"
                                      rel="noopener noreferrer sponsored"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white transition-opacity hover:opacity-90 mt-3"
                                      style={{ backgroundColor: "#7c3aed" }}
                                    >
                                      🎟️ Book Activities
                                    </a>
                                    <a
                                      href="/all-spots?filter=michelin"
                                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-opacity hover:opacity-90 border mt-3"
                                      style={{ backgroundColor: "#fef9c3", color: "#854d0e", borderColor: "#fde047" }}
                                    >
                                      ⭐ Michelin Spots
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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

      <EmailCaptureModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        context="save-trip"
        onSuccess={() => setEmailSaved(true)}
      />
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

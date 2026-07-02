"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AdBanner from "@/components/AdBanner";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import DatePicker from "@/components/DatePicker";
import NoticeModal from "@/components/NoticeModal";
import ContactModal from "@/components/ContactModal";
import { getCart, CART_EVENT, type EventItem } from "@/lib/cart";
import { getFavorites, FAVORITES_EVENT } from "@/lib/favorites";
import { trackEvent } from "@/lib/analytics";
import { haversineKm, fmtDist } from "@/lib/geo";
import CityQuickLinks from "@/components/CityQuickLinks";
import { CITY_ARRIVAL_DEFAULTS, CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

interface LocalInfo {
  id: number;
  name: string;
  category: "attraction" | "restaurant" | "event" | "accommodation" | "nature";
  city: string;
  district?: string;
  address: string;
  description: string;
  whyItMatters?: string;
  searchKeyword?: string;
  naverSearchKeyword?: string;
  mapUrl: string;
  naverMapUrl?: string;
  durationMinutes?: number;
  bestTimeSlot?: string;
  openingHours?: { open: string; close: string } | null;
  tags?: string[];
  relatedSurvivalGuides?: string[];
  soloFriendly: boolean;
  foreignCardAccepted: boolean;
  cashOnly?: boolean;
  image?: string;
}

// ═══════════════════════════════════════════════
//  HARDCODED BUSAN SPOTS
// ═══════════════════════════════════════════════

const BUSAN_SPOTS: LocalInfo[] = [
  {
    id: 6,
    name: "Haeundae Beach",
    category: "attraction",
    city: "Busan",
    district: "Haeundae-gu",
    address: "Haeundae-gu, Busan — Nearest subway: Haeundae Station (Line 2, Exit 3/5)",
    whyItMatters: "Korea's most iconic beach — the undisputed starting point of every Busan trip.",
    description:
      "A 1.8km white-sand stretch in Haeundae-gu, open year-round. Street food stalls line the beachfront (tteokbokki, sundae, fish cake). The stretch from Haeundae to Dalmaji Hill offers a quieter, scenic walk. Sunrise views from the east end are exceptional. Free entry. Foreign cards accepted at most cafés and restaurants nearby.",
    mapUrl: "https://maps.google.com/maps?q=35.15845,129.16027&z=17",
    naverMapUrl: "https://map.naver.com/v5/search/해운대해수욕장",
    durationMinutes: 120,
    bestTimeSlot: "afternoon",
    openingHours: null,
    tags: ["#Beach", "#Summer", "#Seafood", "#Sunrise", "#PhotoSpot"],
    relatedSurvivalGuides: ["getting-around", "solo-dining"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
  },
  {
    id: 7,
    name: "Gamcheon Culture Village",
    category: "attraction",
    city: "Busan",
    district: "Saha-gu",
    address: "Gamcheon 2-dong, Saha-gu, Busan — Bus 1-1 or 2 from Toseong-dong terminal",
    whyItMatters: "The most photogenic neighborhood in Busan — every painted staircase and alley is a photo opportunity.",
    description:
      "A hillside maze of pastel houses, murals, and art installations built on a steep slope in Saha-gu. Open 09:00–18:00 daily (closed some Mondays). Entry map available at the visitor center for ₩2,000 (redeemable as café stamp). Wear comfortable shoes — the alleys are steep and uneven. No large vehicles; arrive by bus or taxi. Foreign cards accepted at the souvenir shops.",
    mapUrl: "https://maps.google.com/maps?q=35.09771,129.01268&z=17",
    naverMapUrl: "https://map.naver.com/v5/search/감천문화마을",
    durationMinutes: 90,
    bestTimeSlot: "morning",
    openingHours: { open: "09:00", close: "18:00" },
    tags: ["#ColorfulVillage", "#Art", "#Mural", "#PhotoSpot", "#BTS"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600",
  },
  {
    id: 8,
    name: "Jagalchi Fish Market",
    category: "restaurant",
    city: "Busan",
    district: "Jung-gu",
    address: "52 Jagalchihaean-ro, Jung-gu, Busan — Jagalchi Station (Line 1, Exit 10)",
    whyItMatters: "The freshest seafood in Korea, cooked to order — this is the unmistakable taste of Busan.",
    description:
      "Korea's largest seafood market, open since 1971. Ground floor vendors sell live fish, abalone, crab, and shellfish. Take your pick upstairs to a cooking booth — they'll prepare it in minutes. Solo dining is completely normal; just point at what you want. Open 07:00–21:00 daily. Mostly cash only; bring ₩20,000–₩40,000 for a full solo meal. The market is a 2-min walk from Jagalchi subway station.",
    mapUrl: "https://maps.google.com/maps?q=35.09734,129.03011&z=17",
    naverMapUrl: "https://map.naver.com/v5/search/자갈치시장",
    durationMinutes: 60,
    bestTimeSlot: "morning",
    openingHours: { open: "07:00", close: "21:00" },
    tags: ["#Seafood", "#FishMarket", "#LocalFood", "#SoloFriendly", "#CashOnly"],
    relatedSurvivalGuides: ["payments", "solo-dining"],
    soloFriendly: true,
    foreignCardAccepted: false,
    cashOnly: true,
    image: "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600",
  },
  {
    id: 12,
    name: "Gwangalli Beach & Bridge",
    category: "attraction",
    city: "Busan",
    district: "Suyeong-gu",
    address: "Gwangalli 1-dong, Suyeong-gu, Busan — Gwangan Station (Line 2, Exit 3) or Geumnyeonsan Station (Exit 7)",
    whyItMatters: "Busan's trendiest beachfront — best at night when Gwangan Bridge illuminates the entire bay.",
    description:
      "A 1.4km sandy beach lined with independent cafés, bars, and seafood restaurants — hipper and less crowded than Haeundae. The landmark Gwangan Bridge (광안대교) stretches 7.4km across the bay and lights up nightly. Arrive at sunset and stay through the bridge lighting (around 20:00). Foreign cards accepted everywhere along the strip. The beach itself is free; parking is limited, so the subway is recommended.",
    mapUrl: "https://maps.google.com/maps?q=35.15328,129.11867&z=17",
    naverMapUrl: "https://map.naver.com/v5/search/광안리해수욕장",
    durationMinutes: 90,
    bestTimeSlot: "evening",
    openingHours: null,
    tags: ["#Beach", "#GwanganBridge", "#NightView", "#Seafood", "#PhotoSpot"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1583689397935-7de22f67e3c7?w=600",
  },
  {
    id: 13,
    name: "Hwangnyeongsan Night View Trail",
    category: "nature",
    city: "Busan",
    district: "Yeonje-gu",
    address: "Hwangnyeong-dong, Yeonje-gu, Busan — Bus 41 or 42 to Hwangnyeongsan trailhead",
    whyItMatters: "Busan's best free experience — a 40-min hike to a 360° city panorama consistently ranked #1 by foreign visitors.",
    description:
      "Hwangnyeongsan (황령산, 427m) sits at the geographic center of Busan, offering unobstructed 360° views of the city, Gwangalli Bridge, and the ocean. The summit is reached in about 40 minutes via the main trail. Go after 19:00 for the city-light panorama. Wear non-slip shoes; the trail is rocky after rain. Free entry, no facilities at the top — bring water. Bus 41 or 42 from Yeonsan-dong stops at the trailhead. No subway access; a taxi (₩5,000–₩8,000) is easiest.",
    mapUrl: "https://maps.google.com/maps?q=35.16867,129.08802&z=15",
    naverMapUrl: "https://map.naver.com/v5/search/황령산전망대",
    durationMinutes: 120,
    bestTimeSlot: "evening",
    openingHours: null,
    tags: ["#NightView", "#Hiking", "#PhotoSpot", "#Busan", "#Free"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: false,
    cashOnly: false,
    image: "https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=600",
  },
  {
    id: 14,
    name: "Jangsan Mountain Trail",
    category: "nature",
    city: "Busan",
    district: "Haeundae-gu",
    address: "Jangsan, Haeundae-gu, Busan — Jangsan Station (Line 2, Exit 7) → 15-min walk to trailhead",
    whyItMatters: "Haeundae's hidden green lung — forest trails and streams just 15 minutes from the beach.",
    description:
      "Jangsan (장산, 634m) is the highest peak in Haeundae-gu. Multiple trails range from easy valley walks (1hr round trip) to full summit routes (3hr). The valley path features small waterfalls and pine-scented air. The summit offers partial views of the East Sea on clear days. Free entry. Take Line 2 to Jangsan Station (Exit 7) and walk 15 minutes uphill to the main entrance. Bring water; no refreshment stands on the trail. Suitable for solo hikers — the trail is well-marked in Korean and partially in English.",
    mapUrl: "https://maps.google.com/maps?q=35.20543,129.17343&z=15",
    naverMapUrl: "https://map.naver.com/v5/search/장산등산로입구",
    durationMinutes: 180,
    bestTimeSlot: "morning",
    openingHours: null,
    tags: ["#Hiking", "#Forest", "#Stream", "#Haeundae", "#Free"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: false,
    cashOnly: false,
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600",
  },
  {
    id: 15,
    name: "Igidae Coastal Walk",
    category: "nature",
    city: "Busan",
    district: "Nam-gu",
    address: "Igidae Park entrance: 116 Igidae-ro, Nam-gu, Busan — Bus 27 or 131 to Igidae Park stop",
    whyItMatters: "The most dramatic free coastal trail in Korea — 5km of sea cliffs, caves, and crashing waves.",
    description:
      "Igidae (이기대) is a 4.7km coastal cliff trail in Nam-gu connecting Oryukdo Skywalk to Gwangalli Beach. The path runs along the edge of sheer sea cliffs with views across the bay toward Haeundae. Highlights include sea caves, tidal pools, and wildflowers (spring). Difficulty: easy-moderate. The trail is paved in sections and has wooden boardwalks along the cliff edges. Entrance near Oryukdo Skywalk: Bus 27 or 131 from Gwangalli or Namcheon Station. Free entry. Bring water — no vending facilities on the trail. Allow 2.5–3 hours for the full route.",
    mapUrl: "https://maps.google.com/maps?q=35.11040,129.11945&z=15",
    naverMapUrl: "https://map.naver.com/v5/search/이기대해안산책로",
    durationMinutes: 150,
    bestTimeSlot: "afternoon",
    openingHours: null,
    tags: ["#CoastalWalk", "#Cliffs", "#OceanView", "#Free", "#Oryukdo"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: false,
    cashOnly: false,
    image: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600",
  },
];

// ═══════════════════════════════════════════════
//  LocalInfo → EventItem 어댑터
// ═══════════════════════════════════════════════

function toEventItem(spot: LocalInfo): EventItem {
  // Extract lat/lng from Google Maps URL: "https://maps.google.com/maps?q=35.158,129.160&z=17"
  let parsedLat: number | undefined;
  let parsedLng: number | undefined;
  try {
    const qParam = spot.mapUrl ? new URL(spot.mapUrl).searchParams.get("q") : null;
    if (qParam) {
      const [latStr, lngStr] = qParam.split(",");
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) { parsedLat = lat; parsedLng = lng; }
    }
  } catch { /* mapUrl 파싱 실패 시 lat/lng 없이 진행 */ }
  return {
    id: `local-${spot.id}`,
    type: spot.category,
    isAnchor: false,
    journeyCluster: "busan-explore",
    stage: "Standalone",
    anchorEventId: null,
    relatedSpotIds: [],
    relatedSurvivalGuides: spot.relatedSurvivalGuides ?? [],
    transitFromAnchor: null,
    name: spot.name,
    shortName: spot.name,
    tags: spot.tags ?? [],
    city: spot.city,
    district: spot.district ?? "",
    address: spot.address,
    mapUrl: spot.mapUrl,
    naverMapUrl: spot.naverMapUrl,
    naverSearchKeyword: spot.naverSearchKeyword ?? spot.searchKeyword,
    description: spot.description,
    whyItMatters: spot.whyItMatters ?? spot.description.split(".")[0] + ".",
    recommendedDurationMinutes: spot.durationMinutes ?? 60,
    bestTimeSlot: spot.bestTimeSlot ?? "anytime",
    openingHours: spot.openingHours ?? null,
    image: spot.image ?? null,
    startDate: null,
    endDate: null,
    isTrending: false,
    soloFriendly: spot.soloFriendly,
    foreignCardAccepted: spot.foreignCardAccepted,
    cashOnly: spot.cashOnly ?? false,
    englishMenu: true,
    barrierFree: true,
    koreanSurvivalScore: 75,
    notice: null,
    lat: parsedLat,
    lng: parsedLng,
    commerce: {
      affiliateType: null,
      hasAffiliate: false,
      affiliatePartner: null,
      affiliateUrl: null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null,
    },
  };
}

// ═══════════════════════════════════════════════
//  레스토랑 타입 + 어댑터
// ═══════════════════════════════════════════════

interface RestaurantItem {
  id: string; source: string; award: string | null;
  name_ko: string; name_en: string;
  category_ko: string; category_en: string;
  district_ko: string; district_en: string;
  address_ko: string; address_en: string;
  description_ko: string; description_en: string;
  latitude: number; longitude: number;
  image: string | null; price_range: string | null;
  tags: string[]; phone: string | null; reservation_required: boolean;
  visible?: boolean;
}

function restaurantToEventItem(r: RestaurantItem): EventItem {
  const scoreMap: Record<string, number> = { "1star": 92, "bib-gourmand": 88, "selected": 83, "certified": 80, "recommended": 78 };
  return {
    id: r.id, type: "restaurant", isAnchor: false,
    journeyCluster: "busan-food-guide-2026", stage: "Standalone",
    anchorEventId: null, relatedSpotIds: [], relatedSurvivalGuides: ["payments", "solo-dining"],
    transitFromAnchor: null,
    name: `${r.name_en} (${r.name_ko})`, shortName: r.name_en,
    tags: r.tags ?? [], city: "Busan", district: r.district_en,
    address: r.address_ko,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name_ko)}`,
    naverMapUrl: `https://map.naver.com/v5/search/${encodeURIComponent(r.name_ko)}`,
    description: r.description_en, whyItMatters: r.description_en,
    recommendedDurationMinutes: 60, bestTimeSlot: "anytime",
    openingHours: null, image: r.image,
    startDate: null, endDate: null,
    isTrending: r.award === "1star" || r.award === "bib-gourmand",
    soloFriendly: true, foreignCardAccepted: r.price_range !== "$",
    cashOnly: false, englishMenu: true, barrierFree: true,
    koreanSurvivalScore: scoreMap[r.award ?? ""] ?? 78,
    notice: null,
    lat: r.latitude, lng: r.longitude,
    commerce: { affiliateType: null, hasAffiliate: false, affiliatePartner: null, affiliateUrl: null, hasMerchandise: false, hasTicketing: false, bookingUrl: null },
  };
}

// ── GPS 헬퍼 (홈 페이지) ──────────────────────────────────────────────────────

const HOME_DISTRICT_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Busanjin-gu":  { lat: 35.1587, lng: 129.0585 },
  "Haeundae-gu":  { lat: 35.1628, lng: 129.1635 },
  "Gijang-gun":   { lat: 35.2442, lng: 129.2204 },
  "Jung-gu":      { lat: 35.1008, lng: 129.0323 },
  "Yeongdo-gu":   { lat: 35.0847, lng: 129.0675 },
  "Seo-gu":       { lat: 35.0972, lng: 129.0221 },
  "Dong-gu":      { lat: 35.1396, lng: 129.0551 },
  "Suyeong-gu":   { lat: 35.1360, lng: 129.1131 },
  "Nam-gu":       { lat: 35.1340, lng: 129.0853 },
  "Yeonje-gu":    { lat: 35.1847, lng: 129.0778 },
  "Dongnae-gu":   { lat: 35.1949, lng: 129.0832 },
  "Geumjeong-gu": { lat: 35.2439, lng: 129.0929 },
  "Buk-gu":       { lat: 35.2073, lng: 128.9925 },
  "Saha-gu":      { lat: 35.1044, lng: 128.9753 },
  "Sasang-gu":    { lat: 35.1527, lng: 128.9705 },
  "Gangseo-gu":   { lat: 35.1063, lng: 128.8962 },
};

function getHomeEventCoords(event: EventItem): { lat: number; lng: number } {
  if (event.lat && event.lng) return { lat: event.lat, lng: event.lng };
  return HOME_DISTRICT_CENTERS[event.district] ?? { lat: 35.1796, lng: 129.0756 };
}


// ═══════════════════════════════════════════════
//  검색창 컴포넌트
// ═══════════════════════════════════════════════

function SpotSearchBar({
  value,
  onChange,
  placeholder = "Search spots, beaches, hiking, ARMY…",
  highlighted = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      id="search-section"
      className={`relative w-full max-w-2xl mx-auto transition-all duration-500 ${
        highlighted ? "ring-4 ring-orange-400 ring-offset-4 rounded-2xl shadow-lg shadow-orange-100" : ""
      }`}
    >
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-lg">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-11 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors text-xs font-bold"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const EVENT_FILTERS = [
  { key: "all",      label: "All"                    },
  { key: "kpop",     label: "🎤 K-POP / BTS"         },
  { key: "michelin", label: "🍽️ Food"                  },
  { key: "nature",   label: "🗺️ Attractions & Nature" },
  { key: "culture",  label: "🏛️ History & Culture"    },
  { key: "saved",    label: "❤️ Liked Spots"          },
];

// ═══════════════════════════════════════════════
//  섹션 헤더 컴포넌트
// ═══════════════════════════════════════════════

function SectionHeader({
  emoji,
  title,
  subtitle,
  count,
  onViewAll,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  count?: number;
  onViewAll?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
      <div>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-2">
          <span>{emoji}</span>
          <span>{title}</span>
          {count !== undefined && (
            <span className="text-base font-bold text-gray-400 ml-1">({count})</span>
          )}
        </h2>
        <p className="text-gray-500 mt-1 text-sm font-medium">{subtitle}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="h-px w-16 hidden sm:block" style={{ backgroundColor: "#f0f0f0" }} />
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-black border-2 transition-all cursor-pointer hover:shadow-md"
            style={{ borderColor: "#f97316", color: "#f97316" }}
          >
            View All →
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  PAGE COMPONENT
// ═══════════════════════════════════════════════

export default function Home() {

  // ── 로컬 스팟 상태 ────────────────────────────
  const [localInfoData, setLocalInfoData] = useState<LocalInfo[]>(BUSAN_SPOTS);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  // ── 통합 검색 + 필터 ──────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");
  const [eventFilter,  setEventFilter]  = useState("all");
  const [currentPage,  setCurrentPage]  = useState(1);

  // 필터/검색 변경 시 페이지 초기화
  useEffect(() => { setCurrentPage(1); }, [eventFilter, globalSearch]);

  // ── AI 플래너 폼 ──────────────────────────────
  const [city,          setCity]          = useState("Busan");
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [travelers,     setTravelers]     = useState("1");
  const [style,         setStyle]         = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return sessionStorage.getItem("km_travel_style") || ""; } catch { return ""; }
  });
  const [cartItemCount, setCartItemCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try { return getCart().length; } catch { return 0; }
  });
  const [showVibeModal,   setShowVibeModal]   = useState(false);
  const [showCloneBanner, setShowCloneBanner] = useState(false);
  const [startLocation, setStartLocation] = useState("KTX Busan Station (부산역)");
  const [arrivalTime,   setArrivalTime]   = useState("14:00");

  // ── events.json + restaurants.json 로드 ───────
  const [eventsData,    setEventsData]    = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // ── GPS Near Me ───────────────────────────────
  const [gpsActive,  setGpsActive]  = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError,   setGpsError]   = useState<string | null>(null);

  // ── Section 4 페이지네이션 ───────────────────
  const [section4Page, setSection4Page] = useState(1);
  const S4_PER_PAGE = 9;

  // ── 찜한 스팟 ─────────────────────────────────
  const [savedIds, setSavedIds] = useState<string[]>([]);

  // ── 모달 상태 ─────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  // ── BTS 아리랑 가이드 모달 (가상 라우팅 포함) ────
  const [contactOpen,     setContactOpen]     = useState(false);
  const [showBTSGuide,    setShowBTSGuide]    = useState(false);
  const [btsClosing,      setBtsClosing]      = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(false);

  useEffect(() => {
    if (!style) return;
    try { sessionStorage.setItem("km_travel_style", style); } catch { /* ignore */ }
  }, [style]);

  // ── 도시 변경 시 도착지 기본값 자동 전환 ─────────────────────────────────
  useEffect(() => {
    setStartLocation(CITY_ARRIVAL_DEFAULTS[city] ?? city);
  }, [city]);

  // ── 클론 파라미터 처리 (?city=&from=&to=&style=&ref=clone) ──────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("ref") !== "clone") return;
    const ct   = p.get("city");
    const from = p.get("from");
    const to   = p.get("to");
    const st   = p.get("style");
    if (ct && ["Busan", "Seoul", "Jeju", "Gyeongju"].includes(ct)) setCity(ct);
    if (from) setStartDate(from);
    if (to)   setEndDate(to);
    if (st && ["Solo", "Couple", "Family", "Group"].includes(st)) setStyle(st);
    setShowCloneBanner(true);
    setTimeout(() =>
      document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })
    , 300);
  }, []);

  useEffect(() => {
    if (!showBTSGuide) return;
    window.history.pushState({ btsModal: true }, "");
    function handlePop() { setShowBTSGuide(false); }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [showBTSGuide]);

  function openBTSGuide() { setShowBTSGuide(true); }
  function closeBTSGuide() {
    setBtsClosing(true);
    setTimeout(() => {
      setShowBTSGuide(false);
      setBtsClosing(false);
      setTimeout(() => {
        document.getElementById("search-filters-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
        setSearchHighlight(true);
        setTimeout(() => setSearchHighlight(false), 2200);
      }, 150);
    }, 500);
  }

  const router = useRouter();
  const [isNavigating,    setIsNavigating]    = useState(false);
  const [departurePlace,  setDeparturePlace]  = useState("");
  const [departureTime,   setDepartureTime]   = useState("");
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [showDeptWarning, setShowDeptWarning] = useState(false);
  const [deptDismissed,   setDeptDismissed]   = useState(false);
  const deptSectionRef = useRef<HTMLDivElement>(null);

  // ── AI 일정 생성 ──────────────────────────────
  function doNavigate(overrideStyle?: string) {
    setIsNavigating(true);
    const effectiveStyle = overrideStyle ?? style;
    const cityOptions = CITY_ARRIVAL_OPTIONS[city] ?? [];
    const params = new URLSearchParams({ city, startDate, endDate, travelers, travelStyle: effectiveStyle, startLocation, arrivalTime });
    if (departurePlace) params.set("departurePlace", departurePlace);
    if (departureTime)  params.set("departureTime",  departureTime);
    // Pass arrival/departure coordinates so the scheduler can use per-day base_coordinate
    const arrivalOpt   = cityOptions.find(o => o.value === startLocation);
    const departureOpt = cityOptions.find(o => o.value === departurePlace);
    if (arrivalOpt)   { params.set("arrivalLat",   String(arrivalOpt.lat));   params.set("arrivalLng",   String(arrivalOpt.lng));   params.set("arrivalType",   arrivalOpt.type);   }
    if (departureOpt) { params.set("departureLat",  String(departureOpt.lat)); params.set("departureLng",  String(departureOpt.lng)); params.set("departureType", departureOpt.type); }
    const days = startDate && endDate
      ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
      : 0;
    trackEvent("generate_itinerary", { city, travelers, travel_style: effectiveStyle, days });
    router.push(`/itinerary?${params.toString()}`);
  }

  function handleGenerate() {
    // 필수 조건 먼저 확인 — vibe 모달은 모든 조건 통과 후 마지막에만 표시
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    if (isNavigating) return;
    if (!departurePlace && !departureTime && !deptDismissed) {
      setShowDeptWarning(true);
      return;
    }
    // 스팟 미선택 시 유도 모달
    if (cartItemCount === 0) {
      setShowVibeModal(true);
      return;
    }
    doNavigate();
  }

  function handlePickVibeClick() {
    setShowVibeModal(false);
    setTimeout(() => {
      document.getElementById("search-filters-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleContinueWithoutPicks() {
    setShowVibeModal(false);
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    if (!departurePlace && !departureTime && !deptDismissed) {
      setShowDeptWarning(true);
      return;
    }
    const effectiveStyle = style || "Solo";
    if (!style) setStyle(effectiveStyle);
    doNavigate(effectiveStyle);
  }

  // ── JSON 로드 ─────────────────────────────────
  useEffect(() => {
    fetch("/data/local-info.json")
      .then((r) => r.json())
      .then((data: LocalInfo[]) => {
        const busanFromJson = data.filter((s) => s.city === "Busan");
        const hardcodedIds = new Set(BUSAN_SPOTS.map((s) => s.id));
        const newOnes = busanFromJson.filter((s) => !hardcodedIds.has(s.id));
        setLocalInfoData([...BUSAN_SPOTS, ...newOnes]);
      })
      .catch(() => { setLocalInfoData(BUSAN_SPOTS); });
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      fetch("/data/events.json").then(r => r.json()),
      fetch("/data/restaurants.json").then(r => r.json()).catch(() => [] as RestaurantItem[]),
    ]).then(([evts, rests]: [EventItem[], RestaurantItem[]]) => {
      const visible = (evts as EventItem[]).filter(
        e => !e.hidden && (!e.displayUntil || e.displayUntil >= today)
      );
      setEventsData([...visible, ...rests.filter(r => r.visible !== false).map(restaurantToEventItem)]);
      setEventsLoading(false);
    }).catch(() => setEventsLoading(false));
  }, []);

  const handleGpsToggle = useCallback(() => {
    if (gpsActive) {
      setGpsActive(false); setUserCoords(null); setGpsError(null); return;
    }
    if (!("geolocation" in navigator)) { setGpsError("Device does not support GPS."); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsActive(true); setGpsLoading(false); setGpsError(null);
        setEventFilter("all");
        setCurrentPage(1);
      },
      () => { setGpsLoading(false); setGpsError("Please allow location permission."); },
      { timeout: 8000 }
    );
  }, [gpsActive]);

  useEffect(() => {
    setSavedIds(getFavorites());
    const handler = () => setSavedIds(getFavorites());
    window.addEventListener(FAVORITES_EVENT, handler);
    return () => window.removeEventListener(FAVORITES_EVENT, handler);
  }, []);

  useEffect(() => {
    const refresh = () => { try { setCartItemCount(getCart().length); } catch { setCartItemCount(0); } };
    window.addEventListener(CART_EVENT, refresh);
    return () => window.removeEventListener(CART_EVENT, refresh);
  }, []);

  // ── K-POP 고정 정렬 우선순위 (BTS Concert → Drone → VisitBusan → 나머지) ──
  function kpopSortPriority(e: EventItem): number {
    if (e.id === "evt-anchor-001") return 0;
    if (e.id === "evt-drone-001")  return 1;
    if (e.id === "evt-pre-001")    return 2;   // ZM-ILLENNIAL 3위 고정
    if (e.id.startsWith("visit-busan-")) return 3;
    return e.isTrending ? 4 : 5;
  }

  // ── 섹션별 데이터 (4-Section 모드) ───────────────────
  const megaEvents = useMemo(() => {
    const filtered = eventsData.filter((e) =>
      ["event", "festival", "concert"].includes(e.type) ||
      (e.tags ?? []).some(t => ["bts", "k-pop", "kpop", "idol"].some(k => t.toLowerCase().includes(k)))
    );
    // Pin: BTS Concert → Drone Show → Visit Busan events → rest
    const anchor     = filtered.find(e => e.id === "evt-anchor-001");
    const drone      = filtered.find(e => e.id === "evt-drone-001");
    const visitBusan = filtered.filter(e => e.id.startsWith("visit-busan-"));
    const rest       = filtered.filter(e =>
      e.id !== "evt-anchor-001" && e.id !== "evt-drone-001" && !e.id.startsWith("visit-busan-")
    );
    return [...(anchor ? [anchor] : []), ...(drone ? [drone] : []), ...visitBusan, ...rest];
  }, [eventsData]);

  const michelinFood = useMemo(
    () => eventsData.filter((e) => e.type === "restaurant"),
    [eventsData]
  );

  const cultureEvents = useMemo(
    () => eventsData.filter((e) =>
      ["heritage", "museum", "cultural"].some(c => e.type.toLowerCase().includes(c)) ||
      (e.tags ?? []).some(t => ["history", "culture", "temple", "palace", "heritage", "tradition", "shrine"].some(k => t.toLowerCase().includes(k)))
    ),
    [eventsData]
  );

  const attractionSpots = useMemo(
    () => localInfoData.filter((s) => s.city === "Busan" && ["attraction", "nature"].includes(s.category)),
    [localInfoData]
  );

  // ── 통합 전체 아이템 (검색/필터 모드) ────────────────
  const allItems = useMemo(
    () => [
      ...eventsData,
      ...localInfoData.filter((s) => s.city === "Busan").map(toEventItem),
    ],
    [eventsData, localInfoData]
  );

  // ── 검색/필터 모드 판단 (GPS 활성 시도 필터 모드 진입) ─
  const isFilteringMode = useMemo(
    () => globalSearch.trim() !== "" || eventFilter !== "all" || gpsActive,
    [globalSearch, eventFilter, gpsActive]
  );

  // ── 통합 검색 결과 ────────────────────────────────────
  const filteredResults = useMemo(() => {
    let list = allItems;
    if (eventFilter === "kpop")
      list = list.filter((e) =>
        ["event", "festival", "concert"].includes(e.type) ||
        (e.tags ?? []).some(t => ["bts", "k-pop", "kpop", "idol", "concert"].some(k => t.toLowerCase().includes(k)))
      );
    else if (eventFilter === "nature")
      list = list.filter((e) => ["attraction", "nature", "pilgrimage", "permanent"].includes(e.type));
    else if (eventFilter === "culture")
      list = list.filter((e) =>
        ["heritage", "museum", "cultural"].some(c => e.type.toLowerCase().includes(c)) ||
        (e.tags ?? []).some(t => ["history", "culture", "temple", "palace", "heritage", "tradition", "shrine"].some(k => t.toLowerCase().includes(k)))
      );
    else if (eventFilter === "michelin")
      list = list.filter((e) => e.type === "restaurant");
    else if (eventFilter === "saved")
      list = list.filter((e) => savedIds.includes(e.id));

    const q = globalSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
        e.city.toLowerCase().includes(q) ||
        (e.district ?? "").toLowerCase().includes(q)
      );
    }

    // GPS 활성: 거리 오름차순 정렬
    if (gpsActive && userCoords) {
      return [...list].sort((a, b) => {
        const ac = getHomeEventCoords(a);
        const bc = getHomeEventCoords(b);
        return haversineKm(userCoords.lat, userCoords.lng, ac.lat, ac.lng)
             - haversineKm(userCoords.lat, userCoords.lng, bc.lat, bc.lng);
      });
    }

    // K-POP 필터: BTS Concert → Drone Show → Visit Busan → 나머지 (isTrending 순)
    if (eventFilter === "kpop") {
      return [...list].sort((a, b) => {
        const diff = kpopSortPriority(a) - kpopSortPriority(b);
        if (diff !== 0) return diff;
        return (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0);
      });
    }
    return [...list].sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
  }, [allItems, eventFilter, globalSearch, savedIds, gpsActive, userCoords]);

  // ── 검색/필터 모드 페이지네이션 ──────────────────────────────
  const ITEMS_PER_PAGE = 12;
  const totalPages  = Math.max(1, Math.ceil(filteredResults.length / ITEMS_PER_PAGE));
  const safePage    = Math.min(currentPage, totalPages);
  const pageItems   = filteredResults.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // ── Section 4 페이지네이션 계산 ───────────────────────────────
  const s4SafePage   = Math.min(section4Page, Math.max(1, Math.ceil(attractionSpots.length / S4_PER_PAGE)));
  const s4TotalPages = Math.max(1, Math.ceil(attractionSpots.length / S4_PER_PAGE));
  const s4Items      = attractionSpots.slice((s4SafePage - 1) * S4_PER_PAGE, s4SafePage * S4_PER_PAGE);

  // ════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      <NoticeModal />

      {/* ── 네비게이션 ──────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            go<span className="font-extrabold">korea</span>mate
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">🍽️ Food Guide</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Survival Guide</Link>
            <Link href="/about"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">About</Link>
            <Link href="/my-trips"       className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">🧳 My Trips</Link>
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan My Trip
            </button>
          </nav>
          <div className="sm:hidden flex items-center gap-2">
            <Link href="/my-trips" className="px-3 py-2 rounded-lg text-sm font-bold text-orange-600 border border-orange-200 bg-orange-50">
              🧳 My Trips
            </Link>
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-3 py-2 rounded-lg text-sm font-bold text-white cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan Trip
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          HERO — TASK-025: 바이럴 루프 전환 랜딩
      ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-16 sm:py-28" style={{ backgroundColor: "#1a1a2e" }}>
        {/* 배경 글로우 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 65%, rgba(212,175,55,0.13) 0%, transparent 50%), radial-gradient(circle at 82% 18%, rgba(59,130,246,0.11) 0%, transparent 45%)",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">

          {/* 배지 */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold text-white/55 border border-white/15 tracking-widest uppercase">
              🇰🇷 Plan · Capture · Share
            </span>
          </div>

          {/* 메인 헤드라인 */}
          <h1 className="text-center text-5xl sm:text-[5.5rem] font-black text-white tracking-tight leading-[1.05] mb-5">
            Your Korea Story,<br />
            <span style={{ color: "#D4AF37" }}>Captured &amp; Shared</span>
          </h1>

          {/* 서브헤드라인 */}
          <p className="text-center text-base sm:text-xl text-white/58 max-w-2xl mx-auto leading-relaxed mb-10">
            AI builds your perfect Korea itinerary in seconds. Capture GPS moments on the go, share to Instagram · TikTok · X in one tap.
          </p>

          {/* Primary CTA — 중앙 고정 */}
          <div className="flex justify-center mb-12">
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center px-10 py-4 rounded-2xl text-lg font-black shadow-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: "#D4AF37", color: "#1a1a2e" }}
            >
              ✨ Plan My Korea Trip
            </button>
          </div>

          {/* 3단계 플로우 시각화 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-2 mb-12">
            {[
              { num: "01", icon: "📅", label: "AI Plans",    sub: "City · dates · style" },
              { num: "02", icon: "📸", label: "Capture",    sub: "GPS + photo + memo" },
              { num: "03", icon: "🎴", label: "1-tap Share", sub: "Instagram · TikTok · X" },
            ].map((s, i) => (
              <div key={s.num} className="flex items-center gap-2 sm:gap-3">
                <div
                  className="flex flex-col items-center px-5 py-4 rounded-2xl w-44 sm:w-48 text-center"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.22)" }}
                >
                  <span className="text-2xl mb-1">{s.icon}</span>
                  <span className="text-[10px] font-black tracking-widest mb-0.5" style={{ color: "#D4AF37" }}>
                    STEP {s.num}
                  </span>
                  <span className="text-sm font-black text-white">{s.label}</span>
                  <span className="text-[11px] text-white/38 mt-0.5 leading-tight">{s.sub}</span>
                </div>
                {i < 2 && (
                  <span className="text-white/18 text-xl hidden sm:block">→</span>
                )}
              </div>
            ))}
          </div>

          {/* 스토리 카드 미리보기 (CSS 모크업) */}
          <div className="flex items-end justify-center gap-0 mb-10">
            {/* 카드 1 — 전면 */}
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl z-10"
              style={{
                width: "120px",
                aspectRatio: "9/16",
                background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
                border: "1px solid rgba(212,175,55,0.3)",
              }}
            >
              <div
                className="absolute inset-x-2 top-2 rounded-xl"
                style={{ height: "52%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
              />
              <span className="absolute top-[20%] left-0 right-0 text-center text-xs text-white/15">📸</span>
              <div className="absolute inset-x-0 bottom-0 px-2 pb-2 flex flex-col items-center gap-0.5">
                <div className="w-full h-[1px] mb-1" style={{ background: "#D4AF37", opacity: 0.45 }} />
                <span className="text-white/75 text-[7px] font-black">✨ My Busan Trip</span>
                <span className="text-[7px] font-bold" style={{ color: "#D4AF37" }}>3 Days · 12 Spots</span>
                <span className="text-white/25 text-[6px]">gokoreamate.com</span>
              </div>
            </div>
            {/* 카드 2 — 배경 */}
            <div
              className="relative rounded-2xl overflow-hidden shadow-xl -ml-8 mb-6 opacity-60"
              style={{
                width: "100px",
                aspectRatio: "9/16",
                background: "linear-gradient(180deg, #0f3460 0%, #16213e 60%, #1a1a2e 100%)",
                border: "1px solid rgba(212,175,55,0.15)",
              }}
            >
              <div
                className="absolute inset-x-2 top-2 rounded-xl"
                style={{ height: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}
              />
              <span className="absolute top-[18%] left-0 right-0 text-center text-xs text-white/10">🏖️</span>
              <div className="absolute inset-x-0 bottom-0 px-2 pb-2 flex flex-col items-center gap-0.5">
                <div className="w-full h-[1px] mb-1" style={{ background: "#D4AF37", opacity: 0.2 }} />
                <span className="text-white/40 text-[6px] font-black">🌿 Nature Wanderer</span>
                <span className="text-white/20 text-[5px]">gokoreamate.com</span>
              </div>
            </div>
          </div>

          {/* 소셜 프루프 + 서브 링크 */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-center">
            <p className="text-white/28 text-sm font-medium">
              Free · No sign-up · 30-sec itinerary
            </p>
            <span className="hidden sm:block text-white/15 text-lg">·</span>
            <Link
              href="/survival-guide"
              className="text-sm font-semibold text-white/38 hover:text-white/65 transition-colors"
            >
              Korea Survival Guide →
            </Link>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════════
          AI 일정 생성 폼
      ══════════════════════════════════════════════════════════ */}
      <section id="planner" className="py-20" style={{ backgroundColor: "#faf8f3" }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6">

          {/* 클론 배너 — ?ref=clone 진입 시 표시 */}
          {showCloneBanner && (
            <div
              className="mb-6 flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl text-sm font-bold"
              style={{
                background: "rgba(212,175,55,0.10)",
                border: "1px solid rgba(212,175,55,0.35)",
                color: "#8C6239",
              }}
            >
              <span>🗺️ Dates & travel style copied from a shared trip — adjust and make it yours!</span>
              <button
                onClick={() => setShowCloneBanner(false)}
                className="text-xs font-black opacity-50 hover:opacity-100 shrink-0 transition-opacity"
              >✕</button>
            </div>
          )}

          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              ✨ Plan Your Korea Trip with AI
            </h2>
            <p className="text-base font-medium text-gray-500">
              Free • No signup required • Ready in 30 seconds
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Where to? (City)</label>
                <div className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {/* Busan — 활성 */}
                  <button
                    type="button"
                    onClick={() => setCity("Busan")}
                    className={`w-full flex items-center justify-between px-4 py-3 text-base font-semibold transition-colors cursor-pointer ${
                      city === "Busan"
                        ? "bg-orange-50 text-orange-700 border-l-4 border-orange-500"
                        : "text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <span>🌊 Busan</span>
                    {city === "Busan" && <span className="text-xs font-black text-orange-500">✓ Selected</span>}
                  </button>
                  {[
                    { value: "Seoul",    label: "🏙️ Seoul"       },
                    { value: "Jeju",     label: "🏝️ Jeju Island"  },
                    { value: "Gyeongju", label: "🏯 Gyeongju"     },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCity(c.value)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-base font-semibold transition-colors cursor-pointer ${
                        city === c.value
                          ? "bg-orange-50 text-orange-700 border-l-4 border-orange-500"
                          : "text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <span>{c.label}</span>
                      {city === c.value && <span className="text-xs font-black text-orange-500">✓ Selected</span>}
                    </button>
                  ))}
                </div>
                <Link
                  href={`/explore/${city.toLowerCase()}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-black rounded-xl transition-all active:scale-95 hover:opacity-90 shadow-sm"
                  style={{ color: "#fff", background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                >
                  🗺️ Explore {city} Spots on Map →
                </Link>
              </div>
              <div id="travel-style-section" className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Travel Style
                </label>
                <button
                  type="button"
                  onClick={() => document.getElementById("search-filters-bar")?.scrollIntoView({ behavior: "smooth" })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: "#f97316" }}
                >
                  ✨ Pick Your Vibe
                </button>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors"
                >
                  <option value="" disabled>— Select your travel style —</option>
                  <option value="Solo">Solo FIT Traveler</option>
                  <option value="Couple">Couple / Partners</option>
                  <option value="Family">Family Trip</option>
                  <option value="Group">Friends / Group</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Start Date</label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Select start date"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">End Date</label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Select end date"
                  min={startDate || new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Number of Travelers</label>
                <input type="number" min="1" max="50" value={travelers} onChange={(e) => setTravelers(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              {/* ── 가변형 AI 스케줄러 — 시작 위치 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">📍 Where do you arrive? (Starting Point)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(CITY_ARRIVAL_OPTIONS[city] ?? CITY_ARRIVAL_OPTIONS["Busan"]!).map((loc) => (
                    <button
                      key={loc.value}
                      type="button"
                      onClick={() => setStartLocation(loc.value)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-all border ${
                        startLocation === loc.value
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-300"
                      }`}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 가변형 AI 스케줄러 — 도착 시간 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">🕐 Arrival Time on Day 1</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { value: "09:00", label: "☀️ Morning",   sub: "9 AM" },
                    { value: "12:00", label: "🍽️ Noon",      sub: "12 PM" },
                    { value: "14:00", label: "⛅ Afternoon", sub: "2 PM" },
                    { value: "17:00", label: "🌅 Evening",   sub: "5 PM" },
                    { value: "20:00", label: "🌙 Night",     sub: "8 PM" },
                  ].map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setArrivalTime(slot.value)}
                      className={`flex flex-col items-center px-2 py-3 rounded-xl text-center transition-all border ${
                        arrivalTime === slot.value
                          ? "border-orange-400 bg-orange-50 text-orange-700"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-orange-300"
                      }`}
                    >
                      <span className="text-sm font-black">{slot.label}</span>
                      <span className="text-[10px] font-semibold opacity-60">{slot.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Optional: Departure Info ── */}
            <div ref={deptSectionRef} className="mt-4">
              {!showDeptSection ? (
                <button
                  type="button"
                  onClick={() => setShowDeptSection(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-all bg-transparent"
                >
                  <span>✈️</span>
                  <span>Add Departure Info</span>
                  <span className="text-[10px] font-normal text-gray-400">(optional — for a safer last day)</span>
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      ✈️ Optional: Departure Info
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowDeptSection(false); setDeparturePlace(""); setDepartureTime(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ✕ Remove
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 -mt-1">
                    Add your train or flight time so we can avoid risky routes on your last day.
                  </p>

                  {/* Where do you leave from? */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">📍 Where do you leave from?</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(CITY_ARRIVAL_OPTIONS[city] ?? CITY_ARRIVAL_OPTIONS["Busan"]!).map((loc) => (
                        <button
                          key={loc.value}
                          type="button"
                          onClick={() => setDeparturePlace(loc.value)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-all border ${
                            departurePlace === loc.value
                              ? "border-orange-400 bg-orange-100 text-orange-700"
                              : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                          }`}
                        >
                          {loc.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Departure time */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">🕐 Departure time on last day</label>
                    <input
                      type="time"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isNavigating}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#f97316" }}
            >
              {isNavigating ? "⏳ Generating..." : "✨ Generate My Itinerary"}
            </button>
          </div>
        </div>
      </section>

      {/* ── Pick Your Vibe 유도 모달 ── */}
      {showVibeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowVibeModal(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7" style={{ animation: "vibeModalIn 0.22s ease-out" }}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="text-xl font-black text-[#2C2520] mb-2">Pick your spots first!</h3>
              <p className="text-sm text-[#61554D] leading-relaxed">
                Tap K-POP, Food, Attractions, or other cards below to tell us what you&apos;re into.
                We&apos;ll build your itinerary around your picks — or skip for a balanced mix.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePickVibeClick}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                🎯 Pick Spots →
              </button>
              <button
                onClick={handleContinueWithoutPicks}
                className="w-full py-3 rounded-xl font-bold text-sm text-[#61554D] border-2 border-[#E6DFD5] hover:border-[#D4AF37] hover:bg-[#FAF7F2] transition-all"
              >
                Continue Without Picks →
              </button>
            </div>
          </div>
          <style>{`
            @keyframes vibeModalIn {
              from { opacity: 0; transform: scale(0.93) translateY(12px); }
              to   { opacity: 1; transform: scale(1)   translateY(0); }
            }
          `}</style>
        </div>
      )}

      {/* ── Departure Info 안내 모달 ── */}
      {showDeptWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeptWarning(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-3xl mb-3 text-center">✈️</div>
            <h3 className="text-lg font-black text-gray-900 mb-2 text-center">
              Want a safer last-day plan?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
              Add your train or flight departure time so we can avoid risky routes on your final day.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowDeptWarning(false);
                  setShowDeptSection(true);
                  setTimeout(() => deptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
                }}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                Add Departure Info
              </button>
              <button
                onClick={() => { setShowDeptWarning(false); setDeptDismissed(true); if (cartItemCount === 0) { setShowVibeModal(true); } else { doNavigate(); } }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                Continue Without It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AdBanner */}
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <AdBanner />
      </div>

      {/* ── City Quick Links ─────────────────────────────────────── */}
      <CityQuickLinks />

      {/* ── Essential for Foreign Travelers ─────────────────────── */}
      <section id="essential" className="py-20" style={{ backgroundColor: "#f0f4ff" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              Essential for Foreign Travelers
            </h2>
            <p className="text-base font-medium text-gray-500">
              Things Korea doesn&apos;t explain to tourists
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: "✈️",
                title: "Airport Limousine",
                desc: "Private car from Incheon/Gimhae Airport straight to your hotel. No subway stress with luggage.",
                href: "https://affiliate.klook.com/sl/21FkAvj",
                cta: "Book Transfer →",
                external: true,
                highlight: true,
              },
              {
                icon: "📱",
                title: "Stay Connected",
                desc: "Get your Korea eSIM before landing. No registration hassle.",
                href: "https://affiliate.klook.com/sl/KiT3U74",
                cta: "Get 10% Off eSIM →",
                external: true,
                highlight: false,
              },
              {
                icon: "🚇",
                title: "Transport Card",
                desc: "How to get T-money card and load cash at convenience stores.",
                href: "/survival-guide",
                cta: "Read Guide →",
                external: false,
                highlight: false,
              },
              {
                icon: "💳",
                title: "Cash & Payments",
                desc: "Where foreign cards work. Which places are cash-only.",
                href: "/survival-guide",
                cta: "Read Guide →",
                external: false,
                highlight: false,
              },
            ].map((card) => (
              <div
                key={card.title}
                className={`rounded-2xl p-8 shadow-sm flex flex-col ${card.highlight ? "border-2 bg-white" : "bg-white border border-gray-100"}`}
                style={card.highlight ? { borderColor: "#f97316" } : {}}
              >
                {card.highlight && (
                  <span className="self-start mb-3 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white uppercase tracking-widest" style={{ backgroundColor: "#f97316" }}>
                    🔥 MUST BOOK
                  </span>
                )}
                <div className="text-4xl mb-4">{card.icon}</div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">{card.desc}</p>
                {card.external ? (
                  <a href={card.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#f97316" }}>
                    {card.cta}
                  </a>
                ) : (
                  <Link href={card.href}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-gray-900 border-2 border-gray-200 hover:border-gray-400 transition-colors">
                    {card.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          메인 스팟 콘텐츠 — 4섹션 구획 / 검색 통합 모드
      ══════════════════════════════════════════════════════════ */}
      <section id="spots-main" className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* ── 통합 검색창 + 필터 탭 (Sticky 슬림) ── */}
          <div
            id="search-filters-bar"
            className="sticky top-16 z-20 bg-white border-b border-gray-100 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-6 py-2"
          >
            <div className="max-w-7xl mx-auto space-y-1.5">
              {/* 검색창 */}
              <SpotSearchBar
                value={globalSearch}
                onChange={(v) => { setGlobalSearch(v); if (v) setEventFilter("all"); }}
                placeholder="Search spots, BTS, Michelin, beach, hiking…"
                highlighted={searchHighlight}
              />
              {/* ── 2분할 버튼: 미식 가이드 + Near Me ── */}
              <div className="flex gap-2">
                <Link
                  href="/restaurants"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm border-2 transition-all"
                  style={{ backgroundColor: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" }}
                >
                  <span className="text-xl">⭐</span>
                  <span className="whitespace-nowrap">Busan Food 100</span>
                </Link>
                <button
                  onClick={handleGpsToggle}
                  disabled={gpsLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm border-2 transition-all cursor-pointer"
                  style={
                    gpsActive
                      ? { backgroundColor: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" }
                      : { backgroundColor: "#eff6ff", color: "#1d4ed8", borderColor: "#93c5fd" }
                  }
                >
                  {gpsLoading ? (
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-base">📍</span>
                  )}
                  <span className="whitespace-nowrap">
                    {gpsActive ? "GPS Active" : "Near Me"}
                  </span>
                </button>
              </div>
              {gpsError && (
                <p className="text-xs text-red-500 font-medium -mt-0.5">{gpsError}</p>
              )}

              {/* 필터 칩 + 결과 카운트 */}
              <div className="flex items-center gap-2">
                <div
                  className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                >
                  {EVENT_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => { setEventFilter(f.key); setGlobalSearch(""); }}
                      className="shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer whitespace-nowrap"
                      style={
                        eventFilter === f.key
                          ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                          : { backgroundColor: "#f9fafb", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {isFilteringMode && (
                  <span className="text-[11px] text-gray-400 shrink-0 font-medium">
                    {filteredResults.length} results ·{" "}
                    <button
                      onClick={() => { setGlobalSearch(""); setEventFilter("all"); if (gpsActive) handleGpsToggle(); }}
                      className="text-orange-500 font-bold underline"
                    >
                      Clear
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── [Section 1] Airport Transfer Banner ── */}
          <div
            className="mt-6 mb-10 rounded-3xl overflow-hidden relative shadow-xl"
            style={{ background: "linear-gradient(135deg, #1a1f36 0%, #2d3a6b 60%, #1e3a5f 100%)" }}
          >
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 90% 50%, #22c55e 0%, transparent 50%), radial-gradient(circle at 10% 20%, #3b82f6 0%, transparent 40%)",
              }}
            />
            <div className="relative px-8 py-10 sm:px-12 sm:py-12 flex flex-col sm:flex-row items-center justify-between gap-8">
              <div className="text-center sm:text-left">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-green-400 border border-green-400/30 bg-green-400/10 mb-4 uppercase tracking-widest">
                  🔥 Must Book First
                </span>
                <h3 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
                  ✈️ Need an Airport Transfer?
                </h3>
                <p className="text-white/70 text-base sm:text-lg max-w-lg leading-relaxed font-medium">
                  Private limousine pickup from Gimhae/Incheon Airport, delivered straight to your hotel door.
                  No subway stress. No language barrier. Fixed price, no meter running.
                </p>
                <div className="flex flex-wrap gap-3 mt-5">
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold">✅ English driver</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold">✅ Fixed price</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-bold">✅ 24/7 available</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3 shrink-0">
                <a
                  href="https://affiliate.klook.com/sl/21FkAvj"
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-black transition-all shadow-lg cursor-pointer"
                  style={{ backgroundColor: "#22c55e", color: "#fff" }}
                >
                  Book Airport Transfer →
                </a>
                <p className="text-white/40 text-xs font-medium">via Klook · Instant confirmation</p>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════
              검색/필터 모드 — 통합 플랫 그리드
          ══════════════════════════════════════════ */}
          {isFilteringMode ? (
            eventsLoading && filteredResults.length === 0 ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: "#f97316" }} />
                <p className="text-gray-500 font-medium">Loading…</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3">{eventFilter === "saved" ? "🤍" : "🔍"}</p>
                <p className="text-gray-500 font-semibold text-lg">
                  {eventFilter === "saved"
                    ? "No liked spots yet — tap ❤️ on any card to like it."
                    : globalSearch
                    ? `No results for "${globalSearch}"`
                    : "No spots found for this filter."}
                </p>
                <button
                  onClick={() => { setGlobalSearch(""); setEventFilter("all"); }}
                  className="mt-4 text-sm text-orange-500 font-bold underline"
                >
                  Show all sections
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pageItems.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onClick={() => setSelectedEvent(event)}
                      distanceBadge={
                        gpsActive && userCoords
                          ? fmtDist(haversineKm(
                              userCoords.lat, userCoords.lng,
                              getHomeEventCoords(event).lat,
                              getHomeEventCoords(event).lng
                            ))
                          : undefined
                      }
                    />
                  ))}
                </div>
                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        onClick={() => setCurrentPage(pg)}
                        className="w-9 h-9 rounded-lg text-sm font-black transition-all"
                        style={
                          pg === safePage
                            ? { backgroundColor: "#f97316", color: "#fff" }
                            : { backgroundColor: "#fff", color: "#6b7280", border: "1px solid #e5e7eb" }
                        }
                      >{pg}</button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >Next →</button>
                  </div>
                )}
              </>
            )
          ) : (
            /* ══════════════════════════════════════════
                4섹션 구획 모드
            ══════════════════════════════════════════ */
            <div className="space-y-20">

              {/* ── [Section 2] K-POP / BTS ── */}
              <div>
                <SectionHeader
                  emoji="🎤"
                  title="K-POP / BTS Pilgrimage"
                  subtitle="BTS birthplaces, ARIRANG live concerts, and festival season highlights"
                  count={megaEvents.length}
                  onViewAll={() => router.push("/all-spots?filter=kpop")}
                />
                {eventsLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#f97316" }} />
                    <p className="text-gray-500 text-sm font-medium">Loading events…</p>
                  </div>
                ) : megaEvents.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">No K-POP events available.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {megaEvents.slice(0, 9).map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => setSelectedEvent(event)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── [Section 2-B] History & Culture ── */}
              {cultureEvents.length > 0 && (
                <div>
                  <SectionHeader
                    emoji="🏛️"
                    title="History & Culture"
                    subtitle="Temples, palaces, heritage villages, and Korea's living traditions"
                    count={cultureEvents.length}
                    onViewAll={() => router.push("/all-spots?filter=culture")}
                  />
                  {eventsLoading ? (
                    <div className="text-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#f97316" }} />
                      <p className="text-gray-500 text-sm font-medium">Loading…</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {cultureEvents.slice(0, 6).map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onClick={() => setSelectedEvent(event)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── [Section 3] Michelin Guide 맛집 ── */}
              <div>
                <SectionHeader
                  emoji="⭐🍽️"
                  title="Busan Food 100"
                  subtitle="Michelin, local favorites, and taxi-driver picks — curated for Busan travelers"
                  count={michelinFood.length}
                  onViewAll={() => router.push("/restaurants")}
                />
                {/* 2026 부산 미식 가이드 100선 프로모 카드 */}
                <Link
                  href="/restaurants"
                  className="group flex items-center gap-5 rounded-2xl p-5 mb-6 border-2 border-orange-100 hover:border-orange-300 transition-all hover:shadow-lg bg-gradient-to-r from-orange-50 to-amber-50"
                >
                  <span className="text-4xl shrink-0">🍽️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-0.5">NEW · 2026 Busan Food Guide</p>
                    <p className="text-base font-black text-gray-900">Michelin · Busan Taste · Taksulang picks <span className="text-orange-500">Top 100</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">16 districts · EN/KO · Sorted by GPS distance</p>
                  </div>
                  <span className="shrink-0 px-3 py-2 rounded-xl text-xs font-black text-white bg-orange-500 group-hover:bg-orange-600 transition-colors whitespace-nowrap">
                    View All →
                  </span>
                </Link>

                {eventsLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#f97316" }} />
                    <p className="text-gray-500 text-sm font-medium">Loading restaurants…</p>
                  </div>
                ) : michelinFood.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">No Michelin restaurants available.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {michelinFood.slice(0, 9).map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => setSelectedEvent(event)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── [Section 4] Attractions & Nature ── */}
              <div>
                <SectionHeader
                  emoji="🗺️"
                  title="Attractions & Nature"
                  subtitle="Beaches, coastal trails, and scenic viewpoints — all solo-traveler approved"
                  count={attractionSpots.length}
                  onViewAll={() => router.push("/all-spots?filter=nature")}
                />
                {attractionSpots.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">No attraction data available.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {s4Items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedEvent(toEventItem(item))}
                          className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-500 cursor-pointer group"
                        >
                          {/* 썸네일 */}
                          <div className="h-48 overflow-hidden relative bg-gray-200">
                            {item.image && !imgErrors[item.id] ? (
                              <Image
                                src={item.image}
                                alt={item.name}
                                fill
                                unoptimized
                                onError={() => setImgErrors((prev) => ({ ...prev, [item.id]: true }))}
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src="/images/placeholder-spot.svg"
                                alt="No image"
                                className="w-full h-full object-cover"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-500 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                                View Details →
                              </span>
                            </div>
                            <div className="absolute top-3 left-3">
                              <span
                                className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                                style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1f36" }}
                              >
                                {item.category === "nature" ? "🌿 Nature" : "🏯 Attraction"}
                              </span>
                            </div>
                          </div>

                          {/* 카드 본문 */}
                          <div className="p-5 flex flex-col flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-400">
                                📍 {item.district ?? item.city}
                              </span>
                              {item.durationMinutes && (
                                <span className="text-xs font-semibold text-gray-400">
                                  🕐 {item.durationMinutes}min
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-black text-gray-900 mb-2 leading-snug line-clamp-2">
                              {item.name}
                            </h3>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-3 leading-relaxed flex-1">
                              {item.description}
                            </p>

                            {/* 실용 뱃지 */}
                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {item.soloFriendly && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  👤 Solo OK
                                </span>
                              )}
                              {item.cashOnly && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                                  💵 Cash Only
                                </span>
                              )}
                              {item.foreignCardAccepted && !item.cashOnly && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                  💳 Card OK
                                </span>
                              )}
                              {item.category === "nature" && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                                  🆓 Free Entry
                                </span>
                              )}
                            </div>

                            {/* 듀얼 지도 버튼 */}
                            <div className="grid grid-cols-2 gap-2 mt-auto">
                              <a
                                href={item.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-colors"
                              >
                                🗺️ Google Maps
                              </a>
                              <a
                                href={
                                  item.naverMapUrl ??
                                  (item.naverSearchKeyword
                                    ? `https://map.naver.com/v5/search/${encodeURIComponent(item.naverSearchKeyword)}`
                                    : `https://map.naver.com/v5/search/${encodeURIComponent(item.name + " Busan Korea")}?lang=en`)
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-xl transition-colors"
                              >
                                💚 Naver Maps
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Section 4 페이지네이션 */}
                    {s4TotalPages > 1 && (
                      <div className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
                        <button
                          onClick={() => setSection4Page((p) => Math.max(1, p - 1))}
                          disabled={s4SafePage === 1}
                          className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >← Prev</button>
                        {Array.from({ length: s4TotalPages }, (_, i) => i + 1).map((pg) => (
                          <button
                            key={pg}
                            onClick={() => setSection4Page(pg)}
                            className="w-9 h-9 rounded-lg text-sm font-black transition-all"
                            style={
                              pg === s4SafePage
                                ? { backgroundColor: "#1a1f36", color: "#fff" }
                                : { backgroundColor: "#fff", color: "#6b7280", border: "1px solid #e5e7eb" }
                            }
                          >{pg}</button>
                        ))}
                        <button
                          onClick={() => setSection4Page((p) => Math.min(s4TotalPages, p + 1))}
                          disabled={s4SafePage === s4TotalPages}
                          className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                        >Next →</button>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div> // end 4-section space-y-20
          )}

        </div>
      </section>

      {/* ── Survival Guide Preview ──────────────────────────────── */}
      <section className="py-20" style={{ backgroundColor: "#1a1f36" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">Survival Guide for Korea</h2>
            <p className="text-base font-medium text-gray-400">Everything tourists struggle with — solved.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: "🚇", title: "Getting Around", desc: "Subway, bus & T-money explained" },
              { icon: "💳", title: "Payments",       desc: "Card vs. cash — know before you go" },
              { icon: "🍜", title: "Solo Dining",    desc: "Eat alone without awkwardness"       },
            ].map((card) => (
              <Link
                key={card.title}
                href="/survival-guide"
                className="group rounded-2xl p-8 flex flex-col gap-3 border border-white/10 transition-all hover:bg-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              >
                <div className="text-4xl">{card.icon}</div>
                <h3 className="text-xl font-black text-white">{card.title}</h3>
                <p className="text-sm font-medium text-gray-400">{card.desc}</p>
                <span className="text-sm font-bold mt-2 group-hover:underline" style={{ color: "#f97316" }}>
                  Read More →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 푸터 ────────────────────────────────────────────────── */}
      <footer className="py-12 px-4" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-xl font-normal text-white flex items-center gap-1.5">
              <span className="text-2xl">🇰🇷</span>
              go<span className="font-extrabold">korea</span>mate
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"           className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Blog</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Survival Guide</Link>
              <Link href="/about"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">About</Link>
              <button
                onClick={() => setContactOpen(true)}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Contact
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              Data by Korea Tourism Organization<br />AI by Gemini
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />

      {/* CartDrawer 가림 방지 */}
      <div className="h-20" />

      {/* ── EventDetailModal ─────────────────────────────────── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ── BTS 아리랑 교통 가이드 모달 ───────────────────────── */}
      {showBTSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.75)",
            animation: btsClosing
              ? "btsOverlayOut 0.5s ease-in-out forwards"
              : "btsOverlayIn 0.5s ease-out",
          }}
          onClick={() => closeBTSGuide()}
        >
          <div
            className="relative w-full sm:max-w-2xl max-h-[95dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
            style={{
              background: "linear-gradient(160deg, #0f0020 0%, #1e0040 40%, #0a0020 100%)",
              animation: btsClosing
                ? "btsModalOut 0.5s ease-in-out forwards"
                : "btsModalIn 0.5s cubic-bezier(0.22,1,0.36,1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="relative px-6 pt-8 pb-6">
              <button
                onClick={() => closeBTSGuide()}
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors text-lg font-bold"
              >✕</button>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">💜</span>
                <div>
                  <p className="text-xs font-black text-purple-400 uppercase tracking-widest">Special Transit Guide</p>
                  <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                    BTS ARIRANG IN BUSAN
                  </h2>
                </div>
              </div>
              <p className="text-purple-300 text-sm font-semibold">
                📅 June 12–13, 2026 · 부산아시아드주경기장 (Busan Asiad Main Stadium)
              </p>
            </div>

            {/* 콘텐츠 */}
            <div className="px-6 pb-8 space-y-5">

              {/* 교통 통제 경보 */}
              <div className="rounded-2xl bg-red-500/20 border border-red-400/40 p-5">
                <p className="text-xs font-black text-red-400 uppercase tracking-widest mb-2">⚠️ Road Closure Alert</p>
                <p className="text-white/90 text-sm leading-relaxed font-medium">
                  All vehicle traffic within 2km of Busan Asiad Main Stadium will be closed from <strong className="text-red-300">12:00 to 24:00</strong> on both concert days. Private vehicles must park at <strong className="text-red-300">satellite lots (P4–P7)</strong> and use shuttle buses. DO NOT attempt to drive to the stadium.
                </p>
              </div>

              {/* 도시철도 가이드 */}
              <div className="rounded-2xl bg-purple-500/20 border border-purple-400/40 p-5">
                <p className="text-xs font-black text-purple-400 uppercase tracking-widest mb-3">🚇 Subway — Fastest Option</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center">3</span>
                    <div>
                      <p className="text-white font-black text-sm">Line 3 — Special Concert Schedule</p>
                      <p className="text-purple-200 text-xs leading-relaxed">Headway reduced from 7 min → <strong className="text-yellow-300">4 min</strong> during concert hours. Last train extended to 01:30 AM after final encore.</p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs font-black text-purple-300 mb-2">🏟️ Recommended Station:</p>
                    <p className="text-white font-black text-base">종합운동장역 (Sports Complex Stn.)</p>
                    <p className="text-purple-200 text-sm mt-1">
                      <strong className="text-yellow-300">Exit 9</strong> → Footbridge (고가다리) → Stadium North Gate
                      <br /><span className="text-green-300">~8 min walk on elevated walkway. Covered, no hills.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 리무진 서비스 안내 — 교통 통제 고지 */}
              <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-5">
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3">🚗 Transfer Service Notice</p>
                <div className="space-y-3 mb-4">
                  <div className="rounded-xl bg-red-500/20 border border-red-400/30 p-3">
                    <p className="text-white/90 text-sm leading-relaxed">
                      <strong className="text-red-300">⚠️ IMPORTANT TRAFFIC NOTICE:</strong> Due to strict total road closures around the Busan Asiad Main Stadium on concert days, no private vehicles or pre-booked chauffeur cars can enter the stadium perimeter or drop off directly at the gates.
                    </p>
                  </div>
                  <div className="rounded-xl bg-green-500/10 border border-green-400/20 p-3">
                    <p className="text-white/90 text-sm leading-relaxed">
                      <strong className="text-green-300">💡 ALTERNATIVE ROUTE:</strong> You can use our Premium Limousine Service to comfortably travel from Airport/Station to your Hotel, or get dropped off at the nearest accessible transport hub outside the restriction zone. We highly recommend using the expanded Busan Metro (Line 3) which will operate 220 additional runs and extend service by 1 hour post-concert for your safe return.
                    </p>
                  </div>
                </div>
                <a
                  href={process.env.NEXT_PUBLIC_KLOOK_TRANSFER_URL || "https://affiliate.klook.com/sl/21FkAvj"}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-colors"
                  style={{ backgroundColor: "#f59e0b" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Book Hotel / Hub Transfer →
                </a>
              </div>

              {/* 콘서트 타임라인 */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <p className="text-xs font-black text-purple-300 uppercase tracking-widest mb-4">⏰ Day-of Timeline</p>
                <div className="space-y-3">
                  {[
                    { time: "14:00", label: "Roads close — private vehicles banned near stadium" },
                    { time: "16:00", label: "Merchandise booths open (arrive early for limited MD)" },
                    { time: "17:30", label: "Gates open — recommended arrival via Exit 9 footbridge" },
                    { time: "19:00", label: "Show starts" },
                    { time: "22:30", label: "Estimated end — Metro Line 3 runs until 01:30 AM" },
                  ].map((item) => (
                    <div key={item.time} className="flex items-start gap-3">
                      <span className="shrink-0 text-xs font-black text-yellow-300 w-12 pt-0.5">{item.time}</span>
                      <p className="text-white/80 text-sm">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ARMY 팁 */}
              <div className="rounded-2xl bg-purple-900/50 border border-purple-500/40 p-5">
                <p className="text-xs font-black text-purple-300 uppercase tracking-widest mb-3">💜 ARMY Tips</p>
                <ul className="space-y-2 text-sm text-white/80">
                  <li>• Bring your <strong className="text-purple-300">Weverse App</strong> — e-ticket only, no print</li>
                  <li>• <strong className="text-yellow-300">T-money card</strong> for subway. Cash for street vendors outside</li>
                  <li>• Hotel near <strong className="text-green-300">Yeonje-gu or Haeundae</strong> — easiest return route</li>
                  <li>• Post-concert: Gwangalli Beach (광안리) is ARMY gathering point</li>
                </ul>
              </div>

              {/* 구글 지도 내비게이션 버튼 */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">
                <p className="text-xs font-black text-purple-300 uppercase tracking-widest">🗺️ Open in Maps</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Busan+Asiad+Main+Stadium"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-black text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                  >
                    📍 Stadium Location
                  </a>
                  <a
                    href="https://www.google.com/maps/dir/?api=1&origin=종합운동장역+9번출구+부산&destination=Busan+Asiad+Main+Stadium&travelmode=walking"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                  >
                    🚶 Exit 9 → Stadium Walk
                  </a>
                </div>
                <p className="text-xs text-white/40 text-center">종합운동장역 9번 출구 → 고가다리 → 북문 (~8분)</p>
              </div>

              <button
                onClick={() => closeBTSGuide()}
                className="w-full py-4 rounded-2xl font-black text-base text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#7c3aed" }}
              >
                Close Guide 💜
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

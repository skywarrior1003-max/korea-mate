"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { resolveCityParam, stripCityParam } from "@/lib/home-city-param-core";
import { TRIP_FLOW_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import { resolveOffer } from "@/lib/affiliate-resolve";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import Image from "next/image";
import AdBanner from "@/components/AdBanner";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import DatePicker from "@/components/DatePicker";
import ContactModal from "@/components/ContactModal";
import PreOpenNotice from "@/components/PreOpenNotice";
import { getCart, CART_EVENT, type EventItem } from "@/lib/cart";
import { getFavorites, FAVORITES_EVENT } from "@/lib/favorites";
import { trackEvent } from "@/lib/analytics";
import { localInfoSourceKey } from "@/lib/place-identity";
import { haversineKm, fmtDist } from "@/lib/geo";
import CityQuickLinks from "@/components/CityQuickLinks";
import AdaptiveHomeCard from "@/components/AdaptiveHomeCard";
import HomeExperience from "@/components/home/HomeExperience";
import { useLocale, useTranslations } from "next-intl";
import { stayAreaOptions } from "@/lib/trip-stay/stay-core";
import StayFieldsSection from "@/components/StayFields";
import {
  EMPTY_STAY_FIELDS, stayFieldsFrom, stayModeFrom,
  type StayFields, type StayMode,
} from "@/lib/trip-stay/stay-input-core";
import { readTripDraft, writeTripDraft, clearTripDraft, type TripStayDetail }
  from "@/lib/trip-draft/trip-draft-core";
import { DEFAULT_TRIP_PACE, TRIP_PACE_CHOICES, normalizeTripPace, type TripPaceChoice }
  from "@/lib/trip-pace/pace-core";
import { buildItineraryGenerationUrl, itineraryDayCount } from "@/lib/trip-generation/itinerary-url";
import { CITY_ARRIVAL_DEFAULTS, CITY_ARRIVAL_OPTIONS } from "@/data/city-presets";
import { CITY_CONFIGS, CITY_SLUGS, cityLabelKey } from "@/data/cities";
import { citySwitchAction, savedToReleaseForCity, hasPlanningState } from "@/lib/city-switch/city-switch-core";
import { getSavedSpotsData, removeFavorite } from "@/lib/favorites";
import { getCityCart, clearCityCart } from "@/lib/cart";

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

// V1 정적 카드 목록. 2026-09-01 legacy retirement: 황령산 야경 트레일(13)·장산 트레일(14)·이기대(15)는
// Production city_spots 5/6/7/29 퇴역과 함께 제거 — 장산은 canonical id 30 이 Explore/DB 로 제공된다.
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
    // 이 숫자는 local-info.json 의 파일 ID 다. city_spots.id 가 아니다.
    //
    // 예전에는 여기서 citySpotSourceKey(spot.id) 를 불렀다. 그래서 Haeundae
    // Beach(파일 id 6)가 `city_spot:6` 이 됐고, canonical 6 번은 Jangsan
    // Mountain Trail 이라 상세로 들어가면 다른 산이 열렸다. 파일 ID 71 건 중
    // 65 건이 다른 장소를, 6 건이 존재하지 않는 행을 가리키고 있었다.
    //
    // 이 장소들의 canonical id 를 아직 모르므로 canonical 인 척하지 않는다.
    // local_info 네임스페이스로 두면 parseCitySpotId 가 null 을 돌려주고,
    // 틀린 Place Detail 링크와 틀린 AI 취향 신호가 둘 다 생기지 않는다.
    // 진짜 연결은 Home 을 city_spots 로 옮기는 다음 단계에서 붙인다.
    sourceKey: localInfoSourceKey(spot.city, spot.id),
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
  const tEx = useTranslations("explore");
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
          aria-label={tEx("search.clearSearch")}
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

// /all-spots 와 완전히 같은 카테고리다. 라벨을 여기 또 두면 한쪽만 고쳐진다 —
// 문구는 allSpots.cat_* 하나를 같이 쓰고, 여기엔 key 와 emoji 만 둔다.
const EVENT_FILTERS = [
  { key: "all",      emoji: ""   },
  { key: "kpop",     emoji: "🎤" },
  { key: "michelin", emoji: "🍽️" },
  { key: "nature",   emoji: "🗺️" },
  { key: "culture",  emoji: "🏛️" },
  { key: "saved",    emoji: "🔖" },
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
  const th = useTranslations("homeUi");
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
            style={{ borderColor: "#FF4A2D", color: "#FF4A2D" }}
          >
            {th("viewAll")}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  PAGE COMPONENT
// ═══════════════════════════════════════════════

// 정적 프리렌더 중에는 레이아웃 이펙트가 의미도 없고 경고만 낸다.
// 브라우저에서만 레이아웃 이펙트를 쓴다 — 페인트 전 판정이 필요한 쪽은 거기뿐이다.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function HomeClient() {
  // AI 여행계획 폼 전용 문구. 화면에 보이는 label 만 번역하고
  // city·style·시간 슬롯의 내부 value 는 손대지 않는다 — API payload 와
  // localStorage 가 그 값을 그대로 쓴다.
  // 제휴 링크는 화면이 소유하지 않는다 — 상품 키만 넘기고 resolver 가 정한다.
  const locale = useLocale();
  const tf = useTranslations("tripForm");
  // 도착/출발 지점 이름표는 locale 을 따른다(tripForm.arrival_*). value 는 그대로(URL·localStorage 계약).
  const arrivalLabel = (label: string): string => { const m = label.match(/^(\S+)\s+(.+)$/); const emoji = m ? m[1] : ""; const base = m ? m[2] : label; const key = `arrival_${base.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`; try { return tf.has(key) ? `${emoji} ${tf(key)}`.trim() : label; } catch { return label; } };
  const tPace = useTranslations("pace");
  const th = useTranslations("homeUi");
  const tn = useTranslations("nav");
  const tFooter = useTranslations("footer"); // 저작권 줄도 Explore 와 같은 footer.copyright 를 쓴다
  // 카테고리 문구는 /all-spots 와 공유한다
  const tCat = useTranslations("allSpots");

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
  // ?city= 가 플래너 미지원 도시를 가리킬 때. 그 프레임부터 Home 을 그리지 않는다.
  const [redirecting,   setRedirecting]   = useState(false);
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [travelers,     setTravelers]     = useState("1");
  // 어떤 속도로 다닐 것인가. 동행 선택에서 유추하지 않는다 — 다른 질문이다.
  const [tripPace,      setTripPace]      = useState<TripPaceChoice>(DEFAULT_TRIP_PACE);
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

  // ── 지역 변경 ────────────────────────────────────────────────────────────
  //
  // 한 번에 한 지역만 계획한다. 지역을 바꾸면 이전 지역에서 모아 둔 임시 상태
  // (Saved · This Trip)는 정리하고 새 지역에서 다시 시작한다. 돌아왔을 때
  // 되살려 주는 도시별 바구니는 만들지 않는다 — 있으면 사용자는 자기가 지금
  // 무엇을 보고 있는지 알 수 없다.
  //
  // 어느 도시가 열렸는지는 세지 않는다. `CityConfig.planningReady` 하나만 본다.
  const [pendingCity, setPendingCity] = useState<string | null>(null);

  /** 이름이든 slug 든 그 도시의 선언을 찾는다. 화면은 이름을, 설정은 slug 를 쓴다. */
  function cityConfigOf(v: string) {
    const k = v.trim().toLowerCase();
    return CITY_CONFIGS[k]
      ?? Object.values(CITY_CONFIGS).find(c => c.name.toLowerCase() === k)
      ?? null;
  }

  /** 이전 지역의 임시 상태를 정리하고 새 지역에서 다시 시작한다. */
  function applyCitySwitch(next: string) {
    try {
      // 이 도시 것이 확실한 Saved 만 내린다. 도시를 모르는 예전 항목은 남는다.
      for (const r of savedToReleaseForCity(getSavedSpotsData(), city)) {
        removeFavorite(r.id, r.sourceKey);
      }
      clearCityCart(city);
    } catch { /* ignore */ }

    // 저장된 draft 를 먼저 지운다.
    //
    // `writeTripDraft` 는 날짜가 유효할 때만 쓴다. 날짜를 비운 채로 두면 그
    // 저장은 조용히 실패하고 **이전 도시가 그대로 남는다** — 화면은 경주인데
    // 저장된 여행은 부산인 상태가 된다. 지우고 시작하면 새 지역에서 날짜를
    // 고르는 순간 그때의 인원·속도와 함께 새로 쓰인다.
    clearTripDraft();

    // 날짜·도착·출발·숙박은 그 지역에서만 뜻이 있는 값이라 비운다.
    // 인원과 여행 속도는 지역이 바뀌어도 그대로다 — 같은 사람이 같은 방식으로
    // 다닌다. 두 값은 React state 로 남아 다음 draft 에 그대로 실린다.
    setStartDate(""); setEndDate("");
    setArrivalTime("");
    setDeparturePlace(""); setDepartureTime("");
    setStayArea(""); setStayMode("none"); setStayDetail(null);

    setPendingCity(null);
    setCity(next);
  }

  /** 도시 버튼이 부른다. 바꿔도 되는지 먼저 보고, 지울 것이 있으면 묻는다. */
  function requestCitySwitch(next: string) {
    const action = citySwitchAction({
      from: city, to: next, toCity: cityConfigOf(next),
      hasPlanningState: hasPlanningState({
        savedForCity: savedToReleaseForCity(getSavedSpotsData(), city).length,
        cartForCity:  getCityCart(city).length,
      }),
    });
    if (action === "blocked" || action === "noop") return;
    if (action === "confirm") { setPendingCity(next); return; }
    applyCitySwitch(next);
  }

  // ── 도시 변경 시 도착지 기본값 자동 전환 ─────────────────────────────────
  useEffect(() => {
    setStartLocation(CITY_ARRIVAL_DEFAULTS[city] ?? city);
  }, [city]);


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

  // ── 클론 파라미터 처리 (?city=&from=&to=&style=&ref=clone) ──────────────
  //
  // ?city= 는 도시 진입 화면의 CTA 가 넘긴다. 판정은 resolveCityParam 한 곳에
  // 맡긴다 — 여기에 도시 목록을 적어두면 도시가 늘 때마다 빠뜨린다. 실제로
  // jeonju 가 빠져 있어서 /jeonju/ 에서 온 요청이 Busan 으로 흘렀다.
  //
  // 레이아웃 이펙트인 이유: redirect 로 판정된 경우 Busan 플래너가 한 프레임
  // 이라도 그려지면 안 된다. 레이아웃 이펙트의 상태 갱신은 페인트 전에
  // 반영되므로 화면에 Busan 이 스치지 않는다.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const isClone = p.get("ref") === "clone";

    const resolved = resolveCityParam(p.get("city"));
    if (resolved.kind === "redirect") {
      // 플래너가 없는 도시다. 그 도시의 진입 화면이 정답이므로 그리로 보낸다.
      // replace 라 뒤로가기가 이 URL 로 되돌아오지 않는다 = 루프가 없다.
      setRedirecting(true);
      router.replace(resolved.href);
      return;
    }
    if (resolved.kind === "planner") setCity(resolved.city);
    if (resolved.kind === "ignore") {
      // 모르는 도시다. Busan 으로 해석하지 않고 주소에서 지우기만 한다.
      // 도시 선택·일정은 건드리지 않으므로 평소 Home 그대로다.
      //
      // router.replace 가 아니라 history.replaceState 인 이유: 같은 route 로의
      // replace 는 주소를 그대로 두는 경우가 있어 실측에서 ?city= 가 남았다.
      // 여기서 필요한 건 라우팅이 아니라 주소 정리뿐이라 재렌더도 없는 쪽이 낫다.
      window.history.replaceState(
        null, "",
        stripCityParam(window.location.pathname, window.location.search) + window.location.hash,
      );
    }

    if (!isClone) return;
    const from = p.get("from");
    const to   = p.get("to");
    const st   = p.get("style");
    if (from) setStartDate(from);
    if (to)   setEndDate(to);
    if (st && ["Solo", "Couple", "Family", "Group"].includes(st)) setStyle(st);
    setShowCloneBanner(true);
    setTimeout(() =>
      document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })
    , 300);
  }, []);

  // ── /#planner 로 들어오면 플래너에 키보드 focus 를 준다 ──────────────────
  //
  // 브라우저 기본 앵커 이동은 스크롤만 하고 focus 는 직전에 누른 버튼에
  // 남겨 둔다(실측 당시: 전역 CartDrawer 의 Build 버튼). 키보드·스크린리더 사용자는
  // 화면은 플래너로 갔는데 Tab 은 헤더로 돌아가는 상태가 된다.
  //
  // preventScroll 로 브라우저 앵커 스크롤과 겹치는 두 번째 점프를 막는다.
  // 이미 플래너 안쪽에 focus 가 있으면 빼앗지 않는다 — 입력 중에 커서를
  // 옮기면 더 나쁘다.
  useEffect(() => {
    function focusPlanner() {
      if (window.location.hash !== "#planner") return;
      const section = document.getElementById("planner");
      if (!section) return;
      if (section.contains(document.activeElement)) return;
      section.focus({ preventScroll: true });
    }
    // 해시 진입 직후에는 아직 섹션이 그려지지 않았을 수 있다.
    const id = window.setTimeout(focusPlanner, 0);
    window.addEventListener("hashchange", focusPlanner);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("hashchange", focusPlanner);
    };
  }, []);

  const [isNavigating,    setIsNavigating]    = useState(false);
  const [departurePlace,  setDeparturePlace]  = useState("");
  const [departureTime,   setDepartureTime]   = useState("");
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [showDeptWarning, setShowDeptWarning] = useState(false);
  const [deptDismissed,   setDeptDismissed]   = useState(false);
  // 숙박 지역 — 선택 입력. 정확한 숙소가 아니라 공개 지역 프리셋 하나다.
  const [stayArea,        setStayArea]        = useState("");
  const [showStaySection, setShowStaySection] = useState(false);
  // 사용자가 고른 숙박 수준. 아직 안 정했거나 / 동네만 / 숙소를 정했거나.
  const [stayMode,        setStayMode]        = useState<StayMode>("none");
  // 정확한 숙소. 글자는 사용자의 메모고, 좌표는 지도에서 짚었을 때만 생긴다.
  const [stayFields,      setStayFields]      = useState<StayFields>(EMPTY_STAY_FIELDS);
  const [stayDetail,      setStayDetail]      = useState<TripStayDetail | null>(null);

  /**
   * 숙박 수준을 바꾼다.
   *
   * 적어 둔 글자를 지우지 않는다. `Not decided yet` 을 잘못 눌렀다가 되돌리는
   * 사람이 이름과 주소를 다시 타이핑하게 만들지 않는다 — 저장되는 내용은 아래
   * 저장 effect 가 고른 수준에 맞춰 정한다.
   */
  function changeStayMode(next: StayMode) { setStayMode(next); }
  const deptSectionRef = useRef<HTMLDivElement>(null);

  // ── 이번 여행의 조건을 This Trip 도 볼 수 있게 남긴다 ─────────────────────
  //
  // 지금까지 도시와 날짜만 남겼다. 동행·도착·출발·숙박은 이 컴포넌트 안에만
  // 있어서 화면을 떠나면 사라졌고, This Trip 은 그 값들을 볼 방법이 없었다.
  // 같은 여행인데 두 화면이 서로 다른 것을 알고 있는 상태였다.
  //
  // 읽기가 먼저고 쓰기가 나중이다. 순서가 뒤집히면 첫 렌더의 기본값("1",
  // "14:00", "")이 저장된 값을 덮어쓴다 — 돌아올 때마다 입력이 초기화되는 것과
  // 같다. `restored` 가 그 순서를 지킨다.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const d = readTripDraft();
    if (d) {
      // 날짜도 되돌린다.
      //
      // 처음에는 "도시·날짜는 다른 곳에서 정해진다" 고 두고 건드리지 않았다.
      // 그런데 되돌리는 곳이 아무 데도 없었다. 날짜를 고르고 장소를 담으러
      // Explore·Picks 로 갔다가 돌아오면 달력이 비어 있고, 일정 만들기를 눌러도
      // 아무 일이 일어나지 않는다 — 날짜가 없어 조용히 멈춘다. 장소를 담는 것
      // 자체가 Home 을 떠나야 하는 일이라 이 경로가 오히려 정상 경로였다.
      //
      // 두 가지를 지킨다. 이미 값이 있으면 덮지 않는다(복사 링크의 ?from=·?to=
      // 가 먼저 들어온다). 그리고 draft 의 도시가 지금 고른 도시와 같을 때만
      // 쓴다 — 서울 여행의 날짜를 부산 화면에 올려 두면 그다음 저장이 도시를
      // 조용히 바꿔 버린다.
      if (d.startDate && d.endDate && d.city.trim().toLowerCase() === city.trim().toLowerCase()) {
        setStartDate(prev => prev || d.startDate);
        setEndDate(prev   => prev || d.endDate);
      }
      if (d.travelers)      setTravelers(d.travelers);
      if (d.tripPace)       setTripPace(d.tripPace);
      if (d.startLocation)  setStartLocation(d.startLocation);
      if (d.arrivalTime)    setArrivalTime(d.arrivalTime);
      if (d.departurePlace) setDeparturePlace(d.departurePlace);
      if (d.departureTime)  setDepartureTime(d.departureTime);
      if (d.stayArea)       setStayArea(d.stayArea);
      if (d.stay) { setStayDetail(d.stay); setStayFields(stayFieldsFrom(d.stay)); }
      setStayMode(stayModeFrom(d.stayArea, d.stay));
      // 되살린 값이 접힌 칸 안에 숨어 있으면 사용자는 자기가 입력한 것을 보지
      // 못한 채 일정이 생성되는 것을 본다.
      if (d.departurePlace || d.departureTime) setShowDeptSection(true);
      if (d.stayArea || d.stay)                setShowStaySection(true);
    }
    setRestored(true);
  }, []);

  // ── 도시를 바꾸면 그 도시에 없는 지점은 버린다 ────────────────────────────
  //
  // 프리셋 value 는 도시별 목록에서 고른 것이다. 서울로 바꿔도 "해운대"가 남아
  // 있으면 builder 가 좌표를 찾지 못한 채 이름만 넘기고, 사용자는 자기가 고르지
  // 않은 지역이 선택돼 있는 것을 본다. 도착지는 이미 위에서 새 도시 기본값으로
  // 바뀐다 — 출발지와 숙박 지역만 남아 있었다.
  useEffect(() => {
    if (!restored) return;
    const options = CITY_ARRIVAL_OPTIONS[city] ?? [];
    setDeparturePlace(p => (p && !options.some(o => o.value === p) ? "" : p));
    setStayArea(s => (s && !stayAreaOptions(city).some(o => o.value === s) ? "" : s));
    // 적어 둔 숙소 이름·주소·링크는 그대로 둔다 — 사용자가 쓴 글을 우리가
    // 지우지 않는다. 다만 지도에서 확인한 좌표는 버린다. 부산에서 짚은 지점이
    // 서울 여행에 그대로 남으면 다음 작업에서 엉뚱한 곳을 기준으로 잡는다.
    setStayDetail(prev => {
      if (!prev?.coordinate) return prev;
      const { coordinate: _dropped, ...rest } = prev;
      return Object.keys(rest).length > 0 ? rest : null;
    });
  }, [city, restored]);

  // 값이 실제로 바뀔 때만 도는 effect 라 매 렌더마다 쓰지 않는다.
  // 도시·날짜가 모두 유효할 때만 저장된다 — 날짜를 하나만 고른 순간에 쓰면
  // This Trip 이 하루짜리 여행을 보게 된다.
  useEffect(() => {
    if (!restored) return;
    writeTripDraft({
      city, startDate, endDate,
      travelers, startLocation, arrivalTime, departurePlace, departureTime,
      // 고른 수준이 저장되는 내용을 정한다.
      //
      // 지역은 `Not decided yet` 일 때만 지운다. 숙소를 정한 사람의 지역 선택은
      // 남겨 둔다 — 지도 확인 전까지 그 사람에 대해 우리가 아는 유일한 위치이고,
      // 하루 시작점이 이미 그것을 쓰고 있다.
      stayArea: stayMode === "none"  ? "" : stayArea,
      stay:     stayMode === "exact" ? stayDetail : null,
      tripPace,
    });
  }, [restored, city, startDate, endDate,
      travelers, startLocation, arrivalTime, departurePlace, departureTime,
      stayArea, stayMode, stayDetail, tripPace]);

  // ── AI 일정 생성 ──────────────────────────────
  function doNavigate(overrideStyle?: string) {
    const effectiveStyle = overrideStyle ?? style;
    // 주소 조립은 공용 builder 한 곳에서 한다. This Trip 도 같은 것을 쓴다 —
    // 두 화면이 각자 조립하면 파라미터 하나가 어긋나도 한쪽에서만 티가 난다.
    const url = buildItineraryGenerationUrl({
      city, startDate, endDate, travelers,
      travelStyle:    effectiveStyle,
      tripPace,
      startLocation,  arrivalTime,
      departurePlace, departureTime, stayArea,
    });
    if (!url) return;                       // 도시·날짜가 없으면 이동하지 않는다
    setIsNavigating(true);
    trackEvent("generate_itinerary", {
      city, travelers, travel_style: effectiveStyle,
      days: itineraryDayCount(startDate, endDate),
    });
    router.push(url);
  }

  function handleGenerate() {
    // 필수 조건 먼저 확인 — vibe 모달은 모든 조건 통과 후 마지막에만 표시
    if (!startDate || !endDate) {
      alert(tf("errNoDates"));
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
    // 고르지 않았으면 비워 둔다. 예전에는 "Solo" 를 넣었는데, 그러면 넷이 가는
    // 여행에도 "Solo Trip" 이라고 적혔다. 없는 것은 없는 대로 넘긴다.
    doNavigate(style);
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

  // 도시 진입 화면으로 넘기는 중이다. 플래너를 그리면 Busan 도착지 목록이
  // 잠깐 보이고, 그건 그 도시를 고른 사용자에게 틀린 화면이다.
  if (redirecting) {
    return <div className="min-h-screen bg-white" aria-hidden />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased overflow-x-clip">

      {/* ── 네비게이션 ──────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/" className="text-lg sm:text-xl font-normal text-gray-900 flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("survivalGuide")}</Link>
            <Link href="/about"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("about")}</Link>
            <Link href="/my-trips"       className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("myTrips")}</Link>
            {/* 데스크톱 CTA 도 Home 시안 색을 따른다. 이모지 라벨과 주황 버튼은
                구버전 인상이 강해 Hero 보다 메뉴가 먼저 읽혔다 */}
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#0041c8" }}
            >
              {tn("planMyTrip")}
            </button>
          </nav>
          {/* 모바일 헤더 — 시안은 로고 + 아이콘 두 개로 아주 얇다.
              예전엔 여기에 큰 버튼 두 개(My Trips / Plan Trip)가 있어서 첫
              화면의 3분의 1을 먹고 Hero 위계를 눌렀다. 두 경로 모두 살아 있다:
              일정 만들기는 화면 안 CTA 와 하단 내비, My Trips 는 아래 아이콘. */}
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <button
              onClick={() => document.getElementById("spots-main")?.scrollIntoView({ behavior: "smooth" })}
              aria-label={th("searchPlaces")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700 cursor-pointer"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
            </button>
            <Link
              href="/my-trips"
              aria-label={tn("myTrips")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="7.5" width="17" height="12.5" rx="2.4" />
                <path d="M9 7.5V6a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 6v1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          HERO — TASK-025: 바이럴 루프 전환 랜딩
      ══════════════════════════════════════════════════════════ */}
      {/* ── Home Experience ─────────────────────────────────────────────
          상단 수동 가로 2페이지. Page 1 은 브랜드 에디토리얼(또는 사용자가
          마무리한 여행), Page 2 는 발견이다. 예전 Hero(베이지·골드 그라디언트)
          자리를 그대로 대체한다 — 페이저는 이 블록 안에서만 움직이고 아래
          Planner·섹션들은 평소처럼 세로로 이어진다. */}
      <HomeExperience />

      {/* Adaptive Home — 여행 상태(pre/in/post) 실데이터 기반 조건부 모듈 (S1) */}
      <AdaptiveHomeCard />

      {/* ══════════════════════════════════════════════════════════
          AI 일정 생성 폼
      ══════════════════════════════════════════════════════════ */}
      {/* tabIndex={-1} 은 프로그램적 focus 만 허용한다 — Tab 순서에는 들어가지
          않으므로 마우스 사용자의 흐름은 그대로다. aria-labelledby 로 아래
          h2 를 이름으로 재사용해 스크린리더가 이 영역의 목적을 읽는다. */}
      <section
        id="planner"
        tabIndex={-1}
        aria-labelledby="planner-heading"
        className="py-20 focus:outline-none"
        style={{ backgroundColor: "#faf8f3" }}
      >
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
              <span>{tf("sharedBanner")}</span>
              <button
                onClick={() => setShowCloneBanner(false)}
                className="text-xs font-black opacity-50 hover:opacity-100 shrink-0 transition-opacity"
              >✕</button>
            </div>
          )}

          <div className="text-center mb-8">
            <h2 id="planner-heading" className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              {tf("title")}
            </h2>
            <p className="text-base font-medium text-gray-500">
              {tf("subtitle")}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("cityLabel")}</label>
                <div className="w-full bg-gray-50 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {/* 어느 도시가 열렸는지는 `planningReady` 하나가 정한다.
                      예전에는 Busan 만 따로 떼어 "활성" 이라고 적어 두었는데, 그
                      구분이 이제 선언 값으로 옮겨졌으므로 한 목록으로 둔다 —
                      도시가 열리면 값만 바꾸면 되고 이 파일은 손대지 않는다. */}
                  {CITY_SLUGS.map((slug) => {
                    const conf  = CITY_CONFIGS[slug]!;
                    const c     = { value: conf.name, emoji: conf.emoji };
                    const ready = conf.planningReady;
                    return (
                    <button
                      key={c.value}
                      type="button"
                      aria-disabled={!ready}
                      onClick={() => { if (ready) requestCitySwitch(c.value); }}
                      className={`w-full flex items-center justify-between px-4 py-3 text-base font-semibold transition-colors ${
                        !ready
                          ? "text-gray-400 cursor-not-allowed"
                          : city === c.value
                            ? "bg-orange-50 text-orange-700 border-l-4 border-orange-500 cursor-pointer"
                            : "text-gray-900 hover:bg-gray-100 cursor-pointer"
                      }`}
                    >
                      <span>{c.emoji} {tf(cityLabelKey(conf))}</span>
                      {/* 눌러도 아무 일이 없으면 고장 난 버튼으로 읽힌다. 왜 안 되는지 말해 준다. */}
                      {!ready && <span className="text-[11px] font-bold text-gray-400">{tf("cityComingSoon")}</span>}
                      {ready && city === c.value && <span className="text-xs font-black text-orange-500">{tf("cityChosen")}</span>}
                    </button>
                    );
                  })}
                </div>
                <Link
                  href={`/explore/${city.toLowerCase()}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-black rounded-xl transition-all active:scale-95 hover:opacity-90 shadow-sm"
                  style={{ color: "#fff", background: "linear-gradient(135deg, #FF4A2D, #D93317)" }}
                >
                  {tf("exploreOnMap", { city: tf(`city_${city}`) })}
                </Link>
              </div>
              {/* 누구와 가는지(Solo·Couple·Family·Group)는 더 이상 묻지 않는다.
                  여행 계획에 필요한 것은 몇 명인가(Travelers)와 어떤 속도로
                  다니는가(Trip Pace) 두 가지이고, 그 둘은 각자 따로 있다.
                  예전 값은 저장된 여행을 다시 열기 위해 남겨 둔다. */}
              <div id="travel-style-section" className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById("search-filters-bar")?.scrollIntoView({ behavior: "smooth" })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: "#FF4A2D" }}
                >
                  {tf("pickVibe")}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("startDate")}</label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={tf("startDatePlaceholder")}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("endDate")}</label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={tf("endDatePlaceholder")}
                  min={startDate || new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("travelers")}</label>
                {/* 위 <label> 은 for/id 로 묶여 있지 않아 보조기술이 연결하지 못한다.
                    보이는 문구는 그대로 두고 접근 가능한 이름만 붙인다. */}
                <input type="number" min="1" max="50" value={travelers} onChange={(e) => setTravelers(e.target.value)}
                  aria-label={tf("travelersAria")}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>

              {/* ── 가변형 AI 스케줄러 — 시작 위치 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("arrivalLabel")}</label>
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
                      {arrivalLabel(loc.label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── 가변형 AI 스케줄러 — 도착 시간 ── */}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">{tf("arrivalTimeLabel")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { value: "09:00", k: "morning"   },
                    { value: "12:00", k: "noon"      },
                    { value: "14:00", k: "afternoon" },
                    { value: "17:00", k: "evening"   },
                    { value: "20:00", k: "night"     },
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
                      <span className="text-sm font-black">{tf(`slot_${slot.k}`)}</span>
                      <span className="text-[10px] font-semibold opacity-60">{tf(`sub_${slot.k}`)}</span>
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
                  <span>{tf("addDeparture")}</span>
                  <span className="text-[10px] font-normal text-gray-400">{tf("addDepartureNote")}</span>
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      {tf("departureTitle")}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowDeptSection(false); setDeparturePlace(""); setDepartureTime(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {tf("departureRemove")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 -mt-1">
                    {tf("departureHint")}
                  </p>

                  {/* Where do you leave from? */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">{tf("departureFrom")}</label>
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
                          {arrivalLabel(loc.label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Departure time */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-600">{tf("departureTime")}</label>
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

            {/* -- Trip Pace --
                누구와 가는지(위 여행 스타일)와 얼마나 느긋하게 다닐지는 다른
                질문이다. 예전에는 커플·가족을 고르면 체류가 조용히 1.3 배가
                됐다. 이제 직접 고른다. -- */}
            <div className="mt-3 flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600">{tPace("title")}</label>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={tPace("title")}>
                {TRIP_PACE_CHOICES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTripPace(p)}
                    aria-pressed={tripPace === p}
                    className={`px-2 py-2 rounded-lg text-[11px] font-bold leading-tight transition-all border ${
                      tripPace === p
                        ? "border-orange-400 bg-orange-100 text-orange-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-orange-300"
                    }`}
                  >
                    {tPace(p)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">{tPace(`${tripPace}Desc`)}</p>
            </div>

            {/* -- Optional: Stay Area -- */}
            <div className="mt-3">
              {!showStaySection ? (
                <button
                  type="button"
                  onClick={() => setShowStaySection(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-all bg-transparent"
                >
                  <span>🛏️</span>
                  <span>{tf("addStayArea")}</span>
                  <span className="text-[10px] font-normal text-gray-400">{tf("addStayAreaNote")}</span>
                </button>
              ) : (
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      {tf("stayAreaTitle")}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowStaySection(false); setStayArea(""); setStayMode("none"); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {tf("stayAreaRemove")}
                    </button>
                  </div>
                  {/* 이 안내는 지역을 고를 때의 말이다. 정확한 숙소를 적는
                      사람에게 "묵는 지역을 골라 주세요" 라고 하면 자기가 무엇을
                      하는 중인지 헷갈린다. */}
                  {stayMode === "area" && (
                    <p className="text-[11px] text-gray-500 -mt-1">
                      {tf("stayAreaHint")}
                    </p>
                  )}

                  {/* 입력 한 벌은 공용 컴포넌트다 — This Trip 도 같은 것을 건다. */}
                  <StayFieldsSection
                    city={city}
                    mode={stayMode}
                    stayArea={stayArea}
                    fields={stayFields}
                    stay={stayDetail}
                    onModeChange={changeStayMode}
                    onAreaChange={setStayArea}
                    onFieldChange={(f, next) => { setStayFields(f); setStayDetail(next); }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isNavigating}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              {isNavigating ? tf("generating") : tf("generate")}
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
              <h3 className="text-xl font-black text-[#2C2520] mb-2">{tf("vibeTitle")}</h3>
              <p className="text-sm text-[#61554D] leading-relaxed">
                Tap K-POP, Food, Attractions, or other cards below to tell us what you&apos;re into.
                We&apos;ll build your itinerary around your picks — or skip for a balanced mix.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePickVibeClick}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:opacity-90"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("vibePick")}
              </button>
              <button
                onClick={handleContinueWithoutPicks}
                className="w-full py-3 rounded-xl font-bold text-sm text-[#61554D] border-2 border-[#E6DFD5] hover:border-[#FF4A2D] hover:bg-[#FAF7F2] transition-all"
              >
                {tf("vibeSkip")}
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
      {/* 지역을 바꾸면 이 지역에서 모아 둔 것이 사라진다. 개수도, Saved 와
          This Trip 의 차이도 말하지 않는다 — 사용자가 알아야 할 것은 하나뿐이다. */}
      {pendingCity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label={tf("citySwitchTitle")}
          onClick={(e) => { if (e.target === e.currentTarget) setPendingCity(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-black text-gray-900 mb-2 text-center">
              {tf("citySwitchTitle")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
              {tf("citySwitchBody", { city: tf(`city_${pendingCity}`) })}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyCitySwitch(pendingCity)}
                className="gkm-focus w-full min-h-11 py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("citySwitchGo", { city: tf(`city_${pendingCity}`) })}
              </button>
              <button
                type="button"
                onClick={() => setPendingCity(null)}
                className="gkm-focus w-full min-h-11 py-3 rounded-xl text-sm font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {tf("citySwitchCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeptWarning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeptWarning(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-3xl mb-3 text-center">✈️</div>
            <h3 className="text-lg font-black text-gray-900 mb-2 text-center">
              {tf("deptWarnTitle")}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
              {tf("deptWarnBody")}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowDeptWarning(false);
                  setShowDeptSection(true);
                  setTimeout(() => deptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
                }}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {tf("addDeparture")}
              </button>
              <button
                onClick={() => {
                  setShowDeptWarning(false);
                  setDeptDismissed(true);
                  // 한 번의 Generate 클릭에서 모달은 하나까지다.
                  //
                  // 여기까지 왔다는 것은 사용자가 이미 "출발 정보 없이 계속"을
                  // 고른 것이다. 곧바로 Vibe 모달을 또 띄우면 아무것도 고르지
                  // 않은 첫 사용자가 모달 두 개를 연달아 통과해야 한다.
                  //
                  // handleContinueWithoutPicks 와 같은 fallback 을 쓴다 —
                  // 취향을 안 골랐으면 "Solo" 로 균형 잡힌 일정을 만든다.
                  // 출발 정보가 있거나 경고가 필요 없는 빈 Cart 사용자는
                  // handleGenerate 의 기존 Vibe 흐름을 그대로 탄다.
                  doNavigate(style);
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
              >
                {tf("deptWarnSkip")}
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
              {th("essentialTitle")}
            </h2>
            <p className="text-base font-medium text-gray-500">
              {th("essentialSub")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: "✈️",
                title: "Airport Limousine",
                desc: "Private car from Incheon/Gimhae Airport straight to your hotel. No subway stress with luggage.",
                href: resolveOffer("airport_transfer", locale, { variant: "literal" })?.url ?? "",
                cta: "Book Transfer →",
                external: true,
                highlight: true,
              },
              {
                icon: "📱",
                title: "Stay Connected",
                desc: "Get your Korea eSIM before landing. No registration hassle.",
                href: resolveOffer("esim", locale)?.url ?? "",
                cta: "Get 10% Off eSIM →",
                external: true,
                highlight: false,
              },
              {
                icon: "🚇",
                title: th("cardTransportTitle"),
                desc: th("cardTransportDesc"),
                href: "/survival-guide",
                cta: th("cardCtaGuide"),
                external: false,
                highlight: false,
              },
              {
                icon: "💳",
                title: th("cardCashTitle"),
                desc: th("cardCashDesc"),
                href: "/survival-guide",
                cta: th("cardCtaGuide"),
                external: false,
                highlight: false,
              },
            ]
              // Trip-Flow Commerce (§14-1-A) — 홈은 일정 생성 이전 단계다.
              // external 카드는 제휴 판매 CTA 이므로 게이트가 false 면 제외한다.
              // 내부 링크 카드(external: false)는 그대로 유지된다.
              .filter((card) => TRIP_FLOW_COMMERCE_ENABLED || !card.external)
              .map((card) => (
              <div
                key={card.title}
                className={`rounded-2xl p-8 shadow-sm flex flex-col ${card.highlight ? "border-2 bg-white" : "bg-white border border-gray-100"}`}
                style={card.highlight ? { borderColor: "#FF4A2D" } : {}}
              >
                {card.highlight && (
                  <span className="self-start mb-3 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white uppercase tracking-widest" style={{ backgroundColor: "#FF4A2D" }}>
                    🔥 MUST BOOK
                  </span>
                )}
                <div className="text-4xl mb-4">{card.icon}</div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">{card.desc}</p>
                {card.external ? (
                  <a href={card.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#FF4A2D" }}>
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
                placeholder={th("searchSpotsPlaceholder")}
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
                  <span className="whitespace-nowrap">{th("foodGuideTitle")}</span>
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
                    {gpsActive ? th("gpsActive") : th("nearMe")}
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
                          ? { backgroundColor: "#FF4A2D", color: "#fff", borderColor: "#FF4A2D" }
                          : { backgroundColor: "#f9fafb", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      {f.emoji && <span className="mr-1">{f.emoji}</span>}{tCat(`cat_${f.key}`)}
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

          {/* ── [Section 1] Airport Transfer Banner ──
                Trip-Flow Commerce (§14-1-A). 예전에는 CTA 만 flag 로 가려서,
                커머스가 꺼져 있으면 "예약하세요" 하는 홍보문과 혜택 목록,
                "via Klook" 까지 남고 정작 누를 버튼만 없었다. 블록 전체를 같은
                flag 로 묶는다 — 바깥 래퍼가 mt-6 mb-10 을 들고 있어서 통째로
                빠지면 빈 여백도 함께 사라진다. */}
          {TRIP_FLOW_COMMERCE_ENABLED && (
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
                {/* 일정 생성 전 판매 CTA — gate 는 이 블록 바깥에 하나만 둔다 */}
                <a
                  href={resolveOffer("airport_transfer", locale, { variant: "literal" })?.url ?? ""}
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
          )}

          {/* ══════════════════════════════════════════
              검색/필터 모드 — 통합 플랫 그리드
          ══════════════════════════════════════════ */}
          {isFilteringMode ? (
            eventsLoading && filteredResults.length === 0 ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: "#FF4A2D" }} />
                <p className="text-gray-500 font-medium">{th("loading")}</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-4xl mb-3">{eventFilter === "saved" ? "🔖" : "🔍"}</p>
                <p className="text-gray-500 font-semibold text-lg">
                  {eventFilter === "saved"
                    ? "No saved spots yet — tap the bookmark on any card to save it."
                    : globalSearch
                    ? `No results for "${globalSearch}"`
                    : "No spots found for this filter."}
                </p>
                <button
                  onClick={() => { setGlobalSearch(""); setEventFilter("all"); }}
                  className="mt-4 text-sm text-orange-500 font-bold underline"
                >
                  {th("showAllSections")}
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
                    >{th("prev")}</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                      <button
                        key={pg}
                        onClick={() => setCurrentPage(pg)}
                        className="w-9 h-9 rounded-lg text-sm font-black transition-all"
                        style={
                          pg === safePage
                            ? { backgroundColor: "#FF4A2D", color: "#fff" }
                            : { backgroundColor: "#fff", color: "#6b7280", border: "1px solid #e5e7eb" }
                        }
                      >{pg}</button>
                    ))}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="px-3 py-1.5 rounded-lg border text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
                    >{th("next")}</button>
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
                  title={th("kpopTitle")}
                  subtitle={th("kpopSub")}
                  count={megaEvents.length}
                  onViewAll={() => router.push("/all-spots?filter=kpop")}
                />
                {eventsLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#FF4A2D" }} />
                    <p className="text-gray-500 text-sm font-medium">{th("kpopLoading")}</p>
                  </div>
                ) : megaEvents.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">{th("kpopEmpty")}</p>
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
                    title={th("cultureTitle")}
                    subtitle={th("cultureSub")}
                    count={cultureEvents.length}
                    onViewAll={() => router.push("/all-spots?filter=culture")}
                  />
                  {eventsLoading ? (
                    <div className="text-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#FF4A2D" }} />
                      <p className="text-gray-500 text-sm font-medium">{th("loading")}</p>
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
                  title={th("foodGuideTitle")}
                  subtitle={th("foodSub")}
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
                    <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-0.5">{th("foodGuideNew")}</p>
                    <p className="text-base font-black text-gray-900">{th("foodGuidePicks")}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{th("foodGuideMeta")}</p>
                  </div>
                  <span className="shrink-0 px-3 py-2 rounded-xl text-xs font-black text-white bg-orange-500 group-hover:bg-orange-600 transition-colors whitespace-nowrap">
                    {th("viewAll")}
                  </span>
                </Link>

                {eventsLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: "#FF4A2D" }} />
                    <p className="text-gray-500 text-sm font-medium">{th("restLoading")}</p>
                  </div>
                ) : michelinFood.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">{th("restEmpty")}</p>
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
                  title={th("natureTitle")}
                  subtitle={th("natureSub")}
                  count={attractionSpots.length}
                  onViewAll={() => router.push("/all-spots?filter=nature")}
                />
                {attractionSpots.length === 0 ? (
                  <p className="text-gray-400 font-medium py-10 text-center">{th("natureEmpty")}</p>
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
                                alt={th("noImage")}
                                className="w-full h-full object-cover"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-500 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                                {th("viewDetails")} →
                              </span>
                            </div>
                            <div className="absolute top-3 left-3">
                              <span
                                className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                                style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1f36" }}
                              >
                                {item.category === "nature" ? `🌿 ${th("natureBadge")}` : `🏯 ${th("attractionBadge")}`}
                              </span>
                            </div>
                          </div>

                          {/* 카드 본문 */}
                          <div className="p-5 flex flex-col flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-400">
                                📍 {item.district ?? (() => { const c = (item.city || "").trim(); if (!c) return ""; const key = `city_${c.charAt(0).toUpperCase()}${c.slice(1).toLowerCase()}`; try { return tf.has(key) ? tf(key) : c.charAt(0).toUpperCase() + c.slice(1); } catch { return c; } })()}
                              </span>
                              {item.durationMinutes && (
                                <span className="text-xs font-semibold text-gray-400">
                                  🕐 {th("minutes", { n: item.durationMinutes })}
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
                                  👤 {th("soloOk")}
                                </span>
                              )}
                              {item.cashOnly && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                                  💵 {th("cashOnly")}
                                </span>
                              )}
                              {item.foreignCardAccepted && !item.cashOnly && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                  💳 {th("cardOk")}
                                </span>
                              )}
                              {item.category === "nature" && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                                  🆓 {th("freeEntry")}
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
                                🗺️ {th("googleMaps")}
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
                                💚 {th("naverMaps")}
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
                        >{th("prev")}</button>
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
                        >{th("next")}</button>
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
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">{th("survivalTitle")}</h2>
            <p className="text-base font-medium text-gray-400">{th("survivalSub")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: "🚇", title: th("svTransitTitle"), desc: th("svTransitDesc") },
              { icon: "💳", title: th("svPayTitle"),     desc: th("svPayDesc") },
              { icon: "🍜", title: th("svSoloTitle"),    desc: th("svSoloDesc") },
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
                <span className="text-sm font-bold mt-2 group-hover:underline" style={{ color: "#FF4A2D" }}>
                  {th("readMore")}
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
              <span className="font-black tracking-tight">gokoreamate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"           className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("blog")}</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("survivalGuide")}</Link>
              <Link href="/about"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("about")}</Link>
              <button
                onClick={() => setContactOpen(true)}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                {tn("contact")}
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              {th("footerData")}<br />{th("footerAi")}
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
      {/* 정식 오픈 전 안내 — session 당 한 번, Home 첫 진입 (Owner 결정 2026-09-01) */}
      <PreOpenNotice />


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
                {TRIP_FLOW_COMMERCE_ENABLED && (
                <a
                  href={resolveOffer("airport_transfer", locale)?.url ?? ""}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-black text-white transition-colors"
                  style={{ backgroundColor: "#f59e0b" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Book Hotel / Hub Transfer →
                </a>
                )}
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

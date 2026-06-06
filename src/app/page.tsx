"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AdBanner from "@/components/AdBanner";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import DatePicker from "@/components/DatePicker";
import type { EventItem } from "@/lib/cart";

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
//  HARDCODED BUSAN SPOTS — JSON 로딩 실패와 무관하게 항상 렌더링 보장
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
    mapUrl: "https://maps.google.com/?q=Haeundae+Beach+Busan",
    naverMapUrl:
      "https://map.naver.com/v5/search/%ED%95%B4%EC%9A%B4%EB%8C%80%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
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
    mapUrl: "https://maps.google.com/?q=Gamcheon+Culture+Village+Busan",
    naverMapUrl:
      "https://map.naver.com/v5/search/%EA%B0%90%EC%B2%9C%EB%AC%B8%ED%99%94%EB%A7%88%EC%9D%84",
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
    mapUrl: "https://maps.google.com/?q=Jagalchi+Fish+Market+Busan",
    naverMapUrl:
      "https://map.naver.com/v5/search/%EC%9E%90%EA%B0%88%EC%B9%98%EC%8B%9C%EC%9E%A5",
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
    mapUrl: "https://maps.google.com/?q=Gwangalli+Beach+Busan",
    naverMapUrl:
      "https://map.naver.com/v5/search/%EA%B4%91%EC%95%88%EB%A6%AC%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
    durationMinutes: 90,
    bestTimeSlot: "evening",
    openingHours: null,
    tags: ["#Beach", "#GwanganBridge", "#NightView", "#Seafood", "#PhotoSpot"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1583689397935-7de22f67e3c7?w=600",
  },
  // ── Nature & Trails (사장님 직접 선정 3곳) ────
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
    mapUrl: "https://maps.google.com/?q=%ED%99%A9%EB%A0%B9%EC%82%B0+%EB%B6%80%EC%82%B0",
    naverMapUrl: "https://map.naver.com/v5/search/%ED%99%A9%EB%A0%B9%EC%82%B0",
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
    mapUrl: "https://maps.google.com/?q=%EC%9E%A5%EC%82%B0+%ED%95%B4%EC%9A%B4%EB%8C%80%EA%B5%AC+%EB%B6%80%EC%82%B0",
    naverMapUrl: "https://map.naver.com/v5/search/%EC%9E%A5%EC%82%B0%EB%93%B1%EC%82%B0%EB%A1%9C",
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
    mapUrl: "https://maps.google.com/?q=%EC%9D%B4%EA%B8%B0%EB%8C%80%ED%95%B4%EC%95%88%EC%82%B0%EC%B1%85%EB%A1%9C+%EB%B6%80%EC%82%B0",
    naverMapUrl: "https://map.naver.com/v5/search/%EC%9D%B4%EA%B8%B0%EB%8C%80%ED%95%B4%EC%95%88%EC%82%B0%EC%B1%85%EB%A1%9C",
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
//  LocalInfo → EventItem 어댑터 (Explore 카드 → 동일 모달 재사용)
// ═══════════════════════════════════════════════

function toEventItem(spot: LocalInfo): EventItem {
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
//  검색창 컴포넌트
// ═══════════════════════════════════════════════

function SpotSearchBar({
  value,
  onChange,
  placeholder = "Search spots, beaches, hiking, ARMY…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-lg">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-11 py-4 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
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
  { key: "all",      label: "All"           },
  { key: "busan",    label: "🏙️ Busan"      },
  { key: "mega",     label: "🎤 Mega Event" },
  { key: "activity", label: "🗺️ Activity"   },
];

const SPOT_CATEGORIES = [
  { value: "all",        label: "All Spots"          },
  { value: "attraction", label: "🏯 Attractions"     },
  { value: "restaurant", label: "🍜 Food & Drink"    },
  { value: "nature",     label: "🌿 Nature & Trails" },
];

// ═══════════════════════════════════════════════
//  PAGE COMPONENT
// ═══════════════════════════════════════════════

export default function Home() {

  // ── 로컬 스팟 상태 ────────────────────────────
  const [localInfoData, setLocalInfoData] = useState<LocalInfo[]>(BUSAN_SPOTS);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  // ── 글로벌 통합 검색 (Trending + Explore 동시 필터링) ──
  const [globalSearch,     setGlobalSearch]     = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // ── AI 플래너 폼 ──────────────────────────────
  const [city,      setCity]      = useState("Busan");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [travelers, setTravelers] = useState("1");
  const [style,     setStyle]     = useState("Solo");

  // ── Trending Events ───────────────────────────
  const [eventsData,    setEventsData]    = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventFilter,   setEventFilter]   = useState("busan");

  // ── 공용 모달 상태 (Trending + Explore 공유) ──
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const router = useRouter();

  // ── AI 일정 생성 ──────────────────────────────
  function handleGenerate() {
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    const params = new URLSearchParams({ city, startDate, endDate, travelers, travelStyle: style });
    router.push(`/itinerary?${params.toString()}`);
  }

  // ── JSON에서 추가 스팟 로드 (하드코딩 위에 병합) ─
  useEffect(() => {
    fetch("/data/local-info.json")
      .then((r) => r.json())
      .then((data: LocalInfo[]) => {
        // JSON 로드 성공 시 부산 스팟만 추출, 중복 id는 JSON 우선
        const busanFromJson = data.filter((s) => s.city === "Busan");
        const hardcodedIds = new Set(BUSAN_SPOTS.map((s) => s.id));
        const newOnes = busanFromJson.filter((s) => !hardcodedIds.has(s.id));
        setLocalInfoData([...BUSAN_SPOTS, ...newOnes]);
      })
      .catch(() => {
        // 실패해도 하드코딩 유지
      });
  }, []);

  // ── Trending Events 로드 ──────────────────────
  useEffect(() => {
    fetch("/data/events.json")
      .then((r) => r.json())
      .then((data: EventItem[]) => { setEventsData(data); setEventsLoading(false); })
      .catch(() => setEventsLoading(false));
  }, []);

  // ── Trending 필터 — globalSearch 전용 (Explore와 완전 독립) ─
  const filteredEvents = useMemo(() => {
    let list = eventsData;
    if (eventFilter === "busan")
      list = list.filter((e) => e.city === "Busan");
    else if (eventFilter === "mega")
      list = list.filter((e) => ["concert", "festival", "event"].includes(e.type));
    else if (eventFilter === "activity")
      list = list.filter((e) => ["pilgrimage", "permanent", "logistics"].includes(e.type));
    const q = globalSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        e.district.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
  }, [eventsData, eventFilter, globalSearch]); // globalSearch 변경 시 Trending 재계산

  // ── Explore 필터 (부산 전용 + 카테고리 + 검색) ─
  const filteredSpots = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    return localInfoData
      .filter((s) => s.city === "Busan")
      .filter((s) => selectedCategory === "all" || s.category === selectedCategory)
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (s.district ?? "").toLowerCase().includes(q)
        );
      });
  }, [localInfoData, selectedCategory, globalSearch]); // globalSearch 변경 시 Explore 재계산

  // ════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      {/* ── 상단 배너 — eSIM + Airport Transfer ────────────────── */}
      <div
        className="py-2.5 px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-8 text-sm"
        style={{ backgroundColor: "#1a1f36" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-white/80 font-medium">📱 Stay connected — Korea eSIM</span>
          <a
            href="https://www.airalo.com/south-korea-esim"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#f97316" }}
          >
            Get eSIM →
          </a>
        </div>
        <div className="hidden sm:block w-px h-4 bg-white/20" />
        <div className="flex items-center gap-3">
          <span className="text-white/80 font-medium">✈️ Airport → Hotel transfer</span>
          <a
            href="https://www.klook.com/en-US/search-results/?query=korea+airport+private+transfer"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#22c55e", color: "#fff" }}
          >
            Book Transfer →
          </a>
        </div>
      </div>

      {/* ── 네비게이션 ──────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Survival Guide</Link>
            <Link href="/about"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">About</Link>
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan My Trip
            </button>
          </nav>
          <button
            onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
            className="sm:hidden px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer"
            style={{ backgroundColor: "#f97316" }}
          >
            Plan My Trip
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════
          HERO — "Don't Get Stuck in Korea" 주황 그래디언트 배너
      ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-24 sm:py-36" style={{ backgroundColor: "#1a1f36" }}>
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 60%, #f97316 0%, transparent 45%), radial-gradient(circle at 85% 15%, #3b82f6 0%, transparent 40%)",
          }}
        />
        <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white/70 border border-white/20 mb-6 tracking-widest uppercase">
            ✨ AI-Powered Travel Guide
          </span>
          <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-tight mb-6">
            Don&apos;t Get Stuck<br />
            in <span style={{ color: "#f97316" }}>Korea</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-10">
            AI builds your itinerary. We handle the confusing parts — payments, transport, solo dining.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => document.getElementById("trending-events")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-black text-white shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              🔥 See Trending Events →
            </button>
            <Link
              href="/survival-guide"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white border-2 border-white/30 hover:border-white/60 transition-colors"
            >
              See Survival Guide
            </Link>
          </div>
        </div>
      </section>

      {/* ── 신뢰 지표 3개 ────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100 py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 text-center gap-8 sm:gap-0">
            <div className="sm:px-8 pb-8 sm:pb-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">🌏 6.7M+</div>
              <div className="text-sm font-semibold text-gray-500">Foreign Visitors in 2026</div>
            </div>
            <div className="sm:px-8 py-8 sm:py-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">📍 200+</div>
              <div className="text-sm font-semibold text-gray-500">Verified Solo-friendly Spots</div>
            </div>
            <div className="sm:px-8 pt-8 sm:pt-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">⚡ 30 sec</div>
              <div className="text-sm font-semibold text-gray-500">To generate your itinerary</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          AI 일정 생성 폼 — 핵심 정체성, 절대 수정 금지
      ══════════════════════════════════════════════════════════ */}
      <section id="planner" className="py-20" style={{ backgroundColor: "#faf8f3" }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
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
                <select value={city} onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="Busan">Busan</option>
                  <option value="Seoul">Seoul</option>
                  <option value="Jeju">Jeju Island</option>
                  <option value="Gyeongju">Gyeongju</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Travel Style</label>
                <select value={style} onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400">
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
            </div>
            <button
              onClick={handleGenerate}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              ✨ Generate My Itinerary
            </button>
          </div>
        </div>
      </section>

      {/* AdBanner */}
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <AdBanner />
      </div>

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
                href: "https://www.klook.com/en-US/search-results/?query=korea+airport+private+transfer",
                cta: "Book Transfer →",
                external: true,
                highlight: true,
              },
              {
                icon: "📱",
                title: "Stay Connected",
                desc: "Get your Korea eSIM before landing. No registration hassle.",
                href: "https://www.airalo.com/south-korea-esim",
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
                    style={{ backgroundColor: card.highlight ? "#f97316" : "#f97316" }}>
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
          TRENDING EVENTS 섹션
      ══════════════════════════════════════════════════════════ */}
      <section id="trending-events" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* 헤더 카드 */}
          <div
            className="rounded-3xl px-8 py-10 mb-10 relative overflow-hidden"
            style={{ backgroundColor: "#1a1f36" }}
          >
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 90% 50%, #f97316 0%, transparent 50%), radial-gradient(circle at 10% 20%, #3b82f6 0%, transparent 40%)",
              }}
            />
            <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-orange-400 border border-orange-400/30 bg-orange-400/10 mb-4 uppercase tracking-widest">
                  🔥 Trending Now in Korea
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
                  Add to Your Itinerary
                </h2>
                <p className="text-white/60 text-base max-w-lg">
                  BTS concerts, Busan fireworks, K-pop pilgrimages — pick what excites you and
                  build your personalized trip in seconds.
                </p>
              </div>
              <Link
                href="/planner"
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                🗺️ Open My Planner →
              </Link>
            </div>
            {/* 필터 탭 */}
            <div className="relative flex flex-wrap gap-2 mt-8">
              {EVENT_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setEventFilter(f.key)}
                  className="px-4 py-1.5 rounded-full text-sm font-bold transition-all border cursor-pointer"
                  style={
                    eventFilter === f.key
                      ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                      : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }
                  }
                >
                  {f.label}
                  {eventFilter === f.key && (
                    <span className="ml-1.5 text-xs opacity-80">{filteredEvents.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── 검색창 1: Trending 전용 ── 다크 헤더 ~ EventCard 그리드 사이 */}
          <div className="py-6">
            <SpotSearchBar
              value={globalSearch}
              onChange={setGlobalSearch}
              placeholder="Search anything — BTS, fireworks, beach, hiking… (filters all sections)"
            />
            {globalSearch && (
              <p className="text-center text-xs text-orange-500 font-semibold mt-3">
                Filtering trending events for &ldquo;{globalSearch}&rdquo; ↓
              </p>
            )}
          </div>

          {/* EventCard 그리드 */}
          {eventsLoading ? (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: "#f97316" }} />
              <p className="text-gray-500 font-medium">Loading trending events…</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🎌</p>
              <p className="text-gray-500 font-semibold">No events in this category yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.slice(0, 9).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => setSelectedEvent(event)}
                  />
                ))}
              </div>
              {filteredEvents.length > 9 && (
                <div className="text-center mt-10">
                  <Link
                    href={`/trending?filter=${eventFilter}${globalSearch ? `&q=${encodeURIComponent(globalSearch)}` : ""}`}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-black text-white shadow-md transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#f97316" }}
                  >
                    View All {filteredEvents.length} Events →
                  </Link>
                </div>
              )}
            </>
          )}
          <p className="text-center text-xs text-gray-400 mt-8">
            Tap any card to see details and add it to your itinerary. Your picks appear in the bar below. ↓
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          검색창 2 — Explore Busan 전용 독립 엔진
          위치: Explore Busan 타이틀 & 카테고리 탭 바로 위
      ══════════════════════════════════════════════════════════ */}
      <div className="bg-gray-50 border-t border-gray-200 pt-10 pb-0 px-4">
        <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
          🔍 Search Busan Spots
        </p>
        <SpotSearchBar
          value={globalSearch}
          onChange={setGlobalSearch}
          placeholder="Search anything — BTS, beach, hiking, seafood… (filters all sections)"
        />
        {globalSearch && (
          <p className="text-center text-xs text-orange-500 font-semibold mt-3">
            Filtering Busan spots for &ldquo;{globalSearch}&rdquo; ↓
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          EXPLORE BUSAN 섹션
          - 부산 전용 (서울/제주/경주 완전 배제)
          - 카드 클릭 → EventDetailModal
          - Google Maps + Naver Map 듀얼 버튼
          - Nature & Trails 탭 포함
      ══════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 pt-8 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* 섹션 헤더 + 카테고리 탭 */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between pt-6 mb-8 gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Explore Busan</h2>
              <p className="text-gray-500 mt-2 text-base">
                Click any card for full details, Google Maps &amp; Naver Map directions
              </p>
            </div>
            {/* 카테고리 탭 — Nature & Trails 포함 */}
            <div className="flex flex-wrap gap-2">
              {SPOT_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className="px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer"
                  style={
                    selectedCategory === cat.value
                      ? { backgroundColor: "#1a1f36", color: "white", borderColor: "#1a1f36" }
                      : { backgroundColor: "white", color: "#6b7280", borderColor: "#e5e7eb" }
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 검색 결과 카운터 */}
          {globalSearch && (
            <p className="text-sm text-gray-500 mb-5 font-semibold">
              {filteredSpots.length} result{filteredSpots.length !== 1 ? "s" : ""} for &ldquo;{globalSearch}&rdquo;
            </p>
          )}

          {filteredSpots.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-600 font-semibold">No spots found for &ldquo;{globalSearch}&rdquo;</p>
              <button onClick={() => setGlobalSearch("")} className="mt-3 text-sm text-orange-500 font-bold underline">
                Clear search
              </button>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSpots.slice(0, 9).map((item) => (
                /*
                 * onClick → toEventItem 어댑터 → selectedEvent → EventDetailModal 오픈
                 * 하단 카드 클릭 시 상세 모달 팝업 연동 (누락 버그 수정)
                 */
                <div
                  key={item.id}
                  onClick={() => setSelectedEvent(toEventItem(item))}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 cursor-pointer group"
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
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src="/images/placeholder-spot.svg"
                        alt="No image"
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                        View Details →
                      </span>
                    </div>
                    {/* 카테고리 뱃지 */}
                    <div className="absolute top-3 left-3">
                      <span
                        className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1f36" }}
                      >
                        {item.category === "nature" ? "🌿 Nature" : item.category}
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

                    {/* 듀얼 지도 버튼 — stopPropagation으로 카드 클릭과 분리 */}
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
                          `https://map.naver.com/v5/search/${encodeURIComponent(item.name)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-xl transition-colors"
                      >
                        🟢 Naver Map
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredSpots.length > 9 && (
              <div className="text-center mt-10">
                <Link
                  href={`/explore-busan?category=${selectedCategory}${globalSearch ? `&q=${encodeURIComponent(globalSearch)}` : ""}`}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-black text-white shadow-md transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "#1a1f36" }}
                >
                  View All {filteredSpots.length} Spots →
                </Link>
              </div>
            )}
            </>
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
            <span className="text-xl font-black text-white flex items-center gap-1.5">
              <span className="text-2xl">🇰🇷</span>
              Korea<span style={{ color: "#f97316" }}>Mate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"           className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Blog</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Survival Guide</Link>
              <Link href="/about"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">About</Link>
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

      {/* CartDrawer 가림 방지 */}
      <div className="h-20" />

      {/* ══════════════════════════════════════════════════════════
          EventDetailModal — Trending + Explore Busan 공용 팝업
          selectedEvent !== null 일 때만 렌더링
      ══════════════════════════════════════════════════════════ */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

    </div>
  );
}

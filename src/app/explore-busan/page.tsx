"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import EventDetailModal from "@/components/EventDetailModal";
import type { EventItem } from "@/lib/cart";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { haversineKm } from "@/lib/geo";

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
  lat?: number;
  lng?: number;
}

// ═══════════════════════════════════════════════
//  BUSAN SPOTS (with lat/lng for GPS Near Me)
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
    naverMapUrl: "https://map.naver.com/v5/search/%ED%95%B4%EC%9A%B4%EB%8C%80%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
    durationMinutes: 120,
    bestTimeSlot: "afternoon",
    openingHours: null,
    tags: ["#Beach", "#Summer", "#Seafood", "#Sunrise", "#PhotoSpot"],
    relatedSurvivalGuides: ["getting-around", "solo-dining"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
    lat: 35.1587,
    lng: 129.1604,
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
    naverMapUrl: "https://map.naver.com/v5/search/%EA%B0%90%EC%B2%9C%EB%AC%B8%ED%99%94%EB%A7%88%EC%9D%84",
    durationMinutes: 90,
    bestTimeSlot: "morning",
    openingHours: { open: "09:00", close: "18:00" },
    tags: ["#ColorfulVillage", "#Art", "#Mural", "#PhotoSpot", "#BTS"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600",
    lat: 35.0975,
    lng: 129.0104,
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
    naverMapUrl: "https://map.naver.com/v5/search/%EC%9E%90%EA%B0%88%EC%B9%98%EC%8B%9C%EC%9E%A5",
    durationMinutes: 60,
    bestTimeSlot: "morning",
    openingHours: { open: "07:00", close: "21:00" },
    tags: ["#Seafood", "#FishMarket", "#LocalFood", "#SoloFriendly", "#CashOnly"],
    relatedSurvivalGuides: ["payments", "solo-dining"],
    soloFriendly: true,
    foreignCardAccepted: false,
    cashOnly: true,
    image: "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600",
    lat: 35.0971,
    lng: 129.0302,
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
    naverMapUrl: "https://map.naver.com/v5/search/%EA%B4%91%EC%95%88%EB%A6%AC%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5",
    durationMinutes: 90,
    bestTimeSlot: "evening",
    openingHours: null,
    tags: ["#Beach", "#GwanganBridge", "#NightView", "#Seafood", "#PhotoSpot"],
    relatedSurvivalGuides: ["getting-around"],
    soloFriendly: true,
    foreignCardAccepted: true,
    image: "https://images.unsplash.com/photo-1583689397935-7de22f67e3c7?w=600",
    lat: 35.1530,
    lng: 129.1185,
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
    lat: 35.1475,
    lng: 129.0715,
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
    lat: 35.1894,
    lng: 129.2017,
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
    lat: 35.1215,
    lng: 129.1287,
  },
];

// ═══════════════════════════════════════════════
//  LocalInfo → EventItem adapter
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
//  CONSTANTS
// ═══════════════════════════════════════════════

const SPOT_CATEGORIES = [
  { value: "all",        label: "All Spots"          },
  { value: "attraction", label: "🏯 Attractions"     },
  { value: "restaurant", label: "🍜 Food & Drink"    },
  { value: "nature",     label: "🌿 Nature & Trails" },
];

// ═══════════════════════════════════════════════
//  SEARCH BAR
// ═══════════════════════════════════════════════

function SearchBar({
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
//  PAGE CONTENT (uses useSearchParams → Suspense)
// ═══════════════════════════════════════════════

function ExploreBusanContent() {
  const searchParams     = useSearchParams();
  const initialCategory  = searchParams.get("category") ?? "all";
  const initialQuery     = searchParams.get("q")        ?? "";

  const [spots,           setSpots]          = useState<LocalInfo[]>(BUSAN_SPOTS);
  const [imgErrors,       setImgErrors]      = useState<Record<number, boolean>>({});
  const [search,          setSearch]         = useState(initialQuery);
  const [selectedCategory,setSelectedCategory] = useState(initialCategory);
  const [selectedEvent,   setSelectedEvent]  = useState<EventItem | null>(null);

  // GPS Near Me state
  const [nearMeActive,    setNearMeActive]   = useState(false);
  const [userLocation,    setUserLocation]   = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading]= useState(false);
  const [locationError,   setLocationError]  = useState<string | null>(null);

  // Load additional spots from local-info.json
  useEffect(() => {
    fetch("/data/local-info.json")
      .then((r) => r.json())
      .then((data: LocalInfo[]) => {
        const busanFromJson = data.filter((s) => s.city === "Busan");
        const hardcodedIds  = new Set(BUSAN_SPOTS.map((s) => s.id));
        const newOnes       = busanFromJson.filter((s) => !hardcodedIds.has(s.id));
        if (newOnes.length > 0) setSpots((prev) => [...prev, ...newOnes]);
      })
      .catch(() => {});
  }, []);

  // Also load Busan spots with GPS coordinates from events.json
  useEffect(() => {
    type EventSpot = {
      id: string;
      name: string;
      spotCategory?: string;
      type: string;
      city: string;
      district?: string;
      address: string;
      description: string;
      whyItMatters?: string;
      mapUrl: string;
      recommendedDurationMinutes?: number;
      bestTimeSlot?: string;
      openingHours?: { open: string; close: string } | null;
      tags?: string[];
      relatedSurvivalGuides?: string[];
      soloFriendly: boolean;
      foreignCardAccepted: boolean;
      cashOnly?: boolean;
      image?: string | null;
      lat?: number;
      lng?: number;
    };

    fetch("/data/events.json")
      .then((r) => r.json())
      .then((data: EventSpot[]) => {
        const geoSpots = data.filter(
          (e) => e.city === "Busan" && e.lat != null && e.lng != null && e.spotCategory != null
        );
        setSpots((prev) => {
          const existingNames = new Set(prev.map((s) => s.name.toLowerCase()));
          const newOnes: LocalInfo[] = geoSpots
            .filter((e) => !existingNames.has(e.name.toLowerCase()))
            .map((e, idx) => ({
              id: 3000 + idx,
              name: e.name,
              category: (e.spotCategory as LocalInfo["category"]) ?? "attraction",
              city: e.city,
              district: e.district,
              address: e.address,
              description: e.description,
              whyItMatters: e.whyItMatters,
              mapUrl: e.mapUrl,
              durationMinutes: e.recommendedDurationMinutes ?? 90,
              bestTimeSlot: e.bestTimeSlot ?? "anytime",
              openingHours: e.openingHours ?? null,
              tags: e.tags ?? [],
              relatedSurvivalGuides: e.relatedSurvivalGuides ?? [],
              soloFriendly: e.soloFriendly,
              foreignCardAccepted: e.foreignCardAccepted,
              cashOnly: e.cashOnly ?? false,
              image: e.image ?? undefined,
              lat: e.lat,
              lng: e.lng,
            }));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      })
      .catch(() => {});
  }, []);

  // GPS Near Me handler
  function handleNearMe() {
    if (nearMeActive) {
      setNearMeActive(false);
      setUserLocation(null);
      setLocationError(null);
      return;
    }
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setLocationLoading(false);
        setLocationError(null);
      },
      () => {
        setLocationError("Unable to get your location. Please enable location access and try again.");
        setLocationLoading(false);
      },
      { timeout: 10000 }
    );
  }

  // Pre-compute distances
  const distances = useMemo(() => {
    if (!nearMeActive || !userLocation) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const s of spots) {
      if (s.lat != null && s.lng != null) {
        m.set(s.id, haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng));
      }
    }
    return m;
  }, [spots, nearMeActive, userLocation]);

  // Filtered + conditionally sorted spots
  const filteredSpots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = spots
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

    if (nearMeActive && userLocation) {
      return [...list].sort((a, b) => {
        const da = distances.get(a.id) ?? Infinity;
        const db = distances.get(b.id) ?? Infinity;
        return da - db;
      });
    }
    return list;
  }, [spots, selectedCategory, search, nearMeActive, userLocation, distances]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* ── Page header ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900">Explore Busan</h1>
          <p className="text-gray-500 mt-1 text-base">
            {filteredSpots.length} spot{filteredSpots.length !== 1 ? "s" : ""}
            {nearMeActive ? " · sorted by distance" : " · click any card for details & maps"}
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 border border-gray-200 hover:border-gray-400 transition-colors"
        >
          ← Back to Home
        </Link>
      </div>

      {/* ── Search bar ──────────────────────────── */}
      <div className="mb-6">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search beaches, markets, trails, ARMY spots…"
        />
      </div>

      {/* ── Category tabs + Near Me button ──────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {SPOT_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer"
            style={
              selectedCategory === cat.value
                ? { backgroundColor: "#1a1f36", color: "white",   borderColor: "#1a1f36" }
                : { backgroundColor: "white",   color: "#6b7280", borderColor: "#e5e7eb" }
            }
          >
            {cat.label}
          </button>
        ))}

        {/* Near Me */}
        <button
          onClick={handleNearMe}
          disabled={locationLoading}
          className="ml-auto px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          style={
            nearMeActive
              ? { backgroundColor: "#f97316", color: "white",   borderColor: "#f97316" }
              : { backgroundColor: "white",   color: "#6b7280", borderColor: "#e5e7eb" }
          }
        >
          {locationLoading ? "⏳ Locating…" : nearMeActive ? "📍 Near Me ✓" : "📍 Near Me"}
        </button>
      </div>

      {/* ── Location error ──────────────────────── */}
      {locationError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold">
          ⚠️ {locationError}
        </div>
      )}

      {/* ── Naver Map ───────────────────────────── */}
      <NaverMap
        spots={filteredSpots.filter((s): s is LocalInfo & MapSpot => s.lat != null && s.lng != null) as MapSpot[]}
        userLocation={userLocation}
        nearMeActive={nearMeActive}
        defaultCenter={{ lat: 35.1587, lng: 129.1604 }}
        height={420}
      />

      {/* ── Near Me active banner ────────────────── */}
      {nearMeActive && userLocation && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-semibold flex items-center gap-2">
          <span>📍 Spots sorted by distance from your location.</span>
          <button
            onClick={handleNearMe}
            className="ml-auto text-xs underline opacity-70 hover:opacity-100"
          >
            Turn off
          </button>
        </div>
      )}

      {/* ── Search result count ──────────────────── */}
      {search && (
        <p className="text-sm text-gray-500 mb-5 font-semibold">
          {filteredSpots.length} result{filteredSpots.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* ── Spots grid ──────────────────────────── */}
      {filteredSpots.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 font-semibold">No spots found for &ldquo;{search}&rdquo;</p>
          <button
            onClick={() => setSearch("")}
            className="mt-3 text-sm text-orange-500 font-bold underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSpots.map((item) => {
            const distKm = distances.get(item.id);
            return (
              <div
                key={item.id}
                onClick={() => setSelectedEvent(toEventItem(item))}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 cursor-pointer group"
              >
                {/* Thumbnail */}
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
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                      View Details →
                    </span>
                  </div>
                  {/* Category badge */}
                  <div className="absolute top-3 left-3">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
                      style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1f36" }}
                    >
                      {item.category === "nature" ? "🌿 Nature" : item.category}
                    </span>
                  </div>
                  {/* Distance badge (Near Me active) */}
                  {distKm !== undefined && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: "#f97316" }}>
                        📍 {distKm.toFixed(1)} km
                      </span>
                    </div>
                  )}
                </div>

                {/* Card body */}
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

                  {/* Practical badges */}
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

                  {/* Dual map buttons */}
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
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  PAGE SHELL
// ═══════════════════════════════════════════════

export default function ExploreBusanPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-sans antialiased">

      {/* ── Header ─────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">🍽️ Food Guide</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Survival Guide</Link>
            <Link href="/my-trips"       className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">🧳 My Trips</Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan My Trip
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Content wrapped in Suspense for useSearchParams ── */}
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div
              className="animate-spin rounded-full h-10 w-10 border-b-2"
              style={{ borderColor: "#f97316" }}
            />
          </div>
        }
      >
        <ExploreBusanContent />
      </Suspense>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="mt-auto py-8 px-4 border-t border-gray-200 bg-white text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
      </footer>
    </div>
  );
}

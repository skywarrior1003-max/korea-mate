"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import EventDetailModal from "@/components/EventDetailModal";
import SpotCard from "@/components/SpotCard";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { haversineKm } from "@/lib/geo";
import { fetchCitySpots } from "@/lib/city-spots";
import type { EventItem } from "@/lib/cart";
import type { CityConfig, CitySpot } from "@/data/cities/types";

// ── Category tab values ──────────────────────────────────────────────────────

const SPOT_CATEGORY_VALUES = ["all", "attraction", "restaurant", "nature"] as const;

// ── CitySpot → EventItem adapter ────────────────────────────────────────────

function toEventItem(spot: CitySpot): EventItem {
  return {
    id: `local-${spot.id}`,
    type: spot.category,
    isAnchor: false,
    journeyCluster: `${spot.city.toLowerCase()}-explore`,
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
    description: spot.description,
    whyItMatters: spot.whyItMatters ?? (spot.description ? spot.description.split(".")[0] + "." : ""),
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
    lat: spot.lat,
    lng: spot.lng,
    commerce: {
      affiliateType: spot.affiliateUrl ? "booking" : null,
      hasAffiliate: !!spot.affiliateUrl,
      affiliatePartner: spot.affiliateProvider ?? null,
      affiliateUrl: spot.affiliateUrl ?? null,
      hasMerchandise: false,
      hasTicketing: false,
      bookingUrl: null,
    },
  };
}

// ── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-lg">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-11 py-3.5 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors text-xs font-bold"
        >✕</button>
      )}
    </div>
  );
}

// ── Inner content (useSearchParams needs Suspense) ───────────────────────────

function ExploreCityContent({ city }: { city: CityConfig }) {
  const tE = useTranslations("explore");
  const tN = useTranslations("nav");

  const spotCategories = SPOT_CATEGORY_VALUES.map(v => ({
    value: v,
    label: tE(`categories.${v}` as "categories.all" | "categories.attraction" | "categories.restaurant" | "categories.nature"),
  }));

  const searchParams = useSearchParams();

  // Supabase가 primary source, staticSpots는 fetch 전 fallback
  const [spots,            setSpots]           = useState<CitySpot[]>(city.staticSpots);
  const [spotsLoading,     setSpotsLoading]    = useState(true);
  const [search,           setSearch]          = useState(searchParams.get("q") ?? "");
  const [selectedCategory, setSelectedCategory]= useState(searchParams.get("category") ?? "all");
  const [selectedEvent,    setSelectedEvent]   = useState<EventItem | null>(null);

  const [nearMeActive,    setNearMeActive]    = useState(false);
  const [userLocation,    setUserLocation]    = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError,   setLocationError]   = useState<string | null>(null);
  const [mapExpanded,     setMapExpanded]     = useState(false);

  // ── 모든 소스를 Promise.all로 병렬 로드 (race condition 방지) ──────────────
  // 우선순위: Supabase city_spots (1위) > local-info.json (2위) > events.json (3위)
  useEffect(() => {
    type RawEventSpot = {
      name?: unknown; spotCategory?: unknown; city?: unknown;
      district?: unknown; address?: unknown; description?: unknown;
      whyItMatters?: unknown; mapUrl?: unknown;
      recommendedDurationMinutes?: unknown; bestTimeSlot?: unknown;
      openingHours?: unknown; tags?: unknown; relatedSurvivalGuides?: unknown;
      soloFriendly?: unknown; foreignCardAccepted?: unknown;
      cashOnly?: unknown; image?: unknown; lat?: unknown; lng?: unknown;
    };

    Promise.all([
      fetchCitySpots(city.name.toLowerCase()).catch((): CitySpot[] => []),
      fetch("/data/local-info.json").then(r => r.json()).catch(() => []),
      fetch("/data/events.json").then(r => r.json()).catch(() => []),
    ]).then(([supabaseSpots, localRaw, eventsRaw]: [CitySpot[], unknown, unknown]) => {
      const result: CitySpot[] = supabaseSpots.length > 0 ? [...supabaseSpots] : [...city.staticSpots];
      const seen = new Set(result.map(s => s.name.toLowerCase()));

      // local-info.json: 런타임 타입 가드로 필수 필드 검증
      const localItems: unknown[] = Array.isArray(localRaw) ? localRaw : [];
      for (const raw of localItems) {
        if (
          typeof raw !== "object" || raw === null ||
          typeof (raw as Record<string, unknown>).id !== "number" ||
          typeof (raw as Record<string, unknown>).name !== "string" ||
          typeof (raw as Record<string, unknown>).description !== "string" ||
          typeof (raw as Record<string, unknown>).address !== "string" ||
          (raw as Record<string, unknown>).city !== city.name
        ) continue;
        const s = raw as CitySpot;
        if (!seen.has(s.name.toLowerCase())) {
          result.push(s);
          seen.add(s.name.toLowerCase());
        }
      }

      // events.json: GPS+spotCategory가 있는 항목만 CitySpot으로 변환
      const eventItems: RawEventSpot[] = Array.isArray(eventsRaw) ? (eventsRaw as RawEventSpot[]) : [];
      let evtIdx = 0;
      for (const e of eventItems) {
        if (
          e.city !== city.name || e.lat == null || e.lng == null ||
          e.spotCategory == null || typeof e.name !== "string" ||
          typeof e.address !== "string" || typeof e.description !== "string" ||
          typeof e.mapUrl !== "string"
        ) continue;
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        result.push({
          id: 3000 + evtIdx++,
          name: e.name,
          category: (e.spotCategory as CitySpot["category"]) ?? "attraction",
          city: city.name,
          district:      typeof e.district      === "string" ? e.district      : undefined,
          address:       e.address,
          description:   e.description,
          whyItMatters:  typeof e.whyItMatters  === "string" ? e.whyItMatters  : undefined,
          mapUrl:        e.mapUrl,
          durationMinutes: typeof e.recommendedDurationMinutes === "number" ? e.recommendedDurationMinutes : 90,
          bestTimeSlot:  typeof e.bestTimeSlot  === "string" ? e.bestTimeSlot  : "anytime",
          openingHours:  (e.openingHours as CitySpot["openingHours"]) ?? null,
          tags:          Array.isArray(e.tags) ? (e.tags as string[]) : [],
          relatedSurvivalGuides: Array.isArray(e.relatedSurvivalGuides) ? (e.relatedSurvivalGuides as string[]) : [],
          soloFriendly:       e.soloFriendly === true,
          foreignCardAccepted: e.foreignCardAccepted === true,
          cashOnly:      e.cashOnly === true,
          image:         typeof e.image === "string" ? e.image : undefined,
          lat:           e.lat as number,
          lng:           e.lng as number,
        });
        seen.add(key);
      }

      setSpots(result);
    }).finally(() => setSpotsLoading(false));
  }, [city.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS Near Me
  function handleNearMe() {
    if (nearMeActive) {
      setNearMeActive(false);
      setUserLocation(null);
      setLocationError(null);
      return;
    }
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError(tE("locationUnsupported"));
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setLocationLoading(false);
        setLocationError(null);
      },
      () => {
        setLocationError(tE("locationError"));
        setLocationLoading(false);
      },
      { timeout: 10000 }
    );
  }

  const distances = useMemo(() => {
    if (!nearMeActive || !userLocation) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const s of spots) {
      if (s.lat != null && s.lng != null)
        m.set(s.id, haversineKm(userLocation.lat, userLocation.lng, s.lat, s.lng));
    }
    return m;
  }, [spots, nearMeActive, userLocation]);

  const filteredSpots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = spots
      .filter(s => s.city.toLowerCase() === city.name.toLowerCase())
      .filter(s => selectedCategory === "all" || s.category === selectedCategory)
      .filter(s => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
          (s.district ?? "").toLowerCase().includes(q)
        );
      });
    if (nearMeActive && userLocation) {
      return [...list].sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    }
    return list;
  }, [spots, selectedCategory, search, nearMeActive, userLocation, distances, city.name]);

  const mapSpots = useMemo(
    () => filteredSpots.filter((s): s is CitySpot & { lat: number; lng: number } =>
      s.lat != null && s.lng != null
    ) as unknown as MapSpot[],
    [filteredSpots]
  );

  // ── Shared controls (search + filter tabs) ──────────────────────────────────
  const controls = (
    <div className="mb-4">
      <SearchBar value={search} onChange={setSearch} placeholder={tE("search.placeholder")} />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {spotCategories.map(cat => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className="px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer"
            style={selectedCategory === cat.value
              ? { backgroundColor: "#1a1f36", color: "white", borderColor: "#1a1f36" }
              : { backgroundColor: "white",   color: "#6b7280", borderColor: "#e5e7eb" }
            }
          >{cat.label}</button>
        ))}
        <button
          onClick={handleNearMe}
          disabled={locationLoading}
          className="ml-auto px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          style={nearMeActive
            ? { backgroundColor: "#f97316", color: "white",   borderColor: "#f97316" }
            : { backgroundColor: "white",   color: "#6b7280", borderColor: "#e5e7eb" }
          }
        >
          {locationLoading ? tE("locating") : nearMeActive ? tE("nearMeActive") : tE("nearMe")}
        </button>
      </div>
      {locationError && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold">
          ⚠️ {locationError}
        </div>
      )}
      {nearMeActive && userLocation && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-semibold flex items-center gap-2">
          <span>{tE("sortedByDistanceBanner")}</span>
          <button onClick={handleNearMe} className="ml-auto text-xs underline opacity-70 hover:opacity-100">{tE("turnOff")}</button>
        </div>
      )}
      {search && (
        <p className="mt-2 text-sm text-gray-500 font-semibold">
          {filteredSpots.length === 1
            ? tE("search.results", { count: filteredSpots.length, query: search })
            : tE("search.resultsPlural", { count: filteredSpots.length, query: search })}
        </p>
      )}
    </div>
  );

  // ── Cards grid ──────────────────────────────────────────────────────────────
  const cardsGrid = spotsLoading ? (
    // 스켈레톤 로딩 UI
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
          <div className="h-44 bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  ) : filteredSpots.length === 0 ? (
    <div className="text-center py-16">
      {spots.length === 0 ? (
        <>
          <p className="text-4xl mb-3">🚧</p>
          <p className="text-gray-900 font-black text-lg mb-2">{tE("comingSoon.title")}</p>
          <p className="text-sm text-gray-400 mb-4">{tE("comingSoon.description", { city: city.name })}</p>
          <p className="text-sm text-gray-400">{tE("comingSoon.guide", { city: city.name })}</p>
        </>
      ) : (
        <>
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 font-semibold">{tE("search.noResults", { query: search })}</p>
          <button onClick={() => setSearch("")} className="mt-3 text-sm text-orange-500 font-bold underline">{tE("search.clearSearch")}</button>
        </>
      )}
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
      {filteredSpots.map(item => (
        <SpotCard
          key={item.id}
          spot={item}
          distKm={distances.get(item.id)}
          onClick={() => setSelectedEvent(toEventItem(item))}
        />
      ))}
    </div>
  );

  // ── Page header ─────────────────────────────────────────────────────────────
  const pageHeader = (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-gray-900">{tE("title", { city: city.name })}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {filteredSpots.length === 1
            ? tE("spotCount", { count: filteredSpots.length })
            : tE("spotCountPlural", { count: filteredSpots.length })}
          {nearMeActive ? ` ${tE("sortedByDistance")}` : ` ${tE("clickForDetails")}`}
        </p>
      </div>
      <Link href="/" className="shrink-0 text-sm font-bold text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:border-gray-400 transition-colors">
        {tN("home")}
      </Link>
    </div>
  );

  return (
    <>
      {/*
       * Single NaverMap + responsive layout:
       * Mobile  (< lg): flex-col — map top (h-72), cards below (scrolls naturally)
       * Desktop (≥ lg): flex-row — cards left (overflow-y-auto), map right (h-full sticky)
       */}
      <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden">

        {/* ── Map column: top on mobile, right sticky on desktop ── */}
        <div className={mapExpanded ? "flex-1 h-full lg:order-2" : "h-72 lg:h-full lg:w-[460px] shrink-0 lg:order-2 lg:border-l lg:border-gray-200"}>
          <div className="relative w-full h-full">
            <NaverMap
              spots={mapSpots}
              userLocation={userLocation}
              nearMeActive={nearMeActive}
              defaultCenter={city.defaultCenter}
              height="100%"
              className="relative w-full h-full overflow-hidden"
              relayoutKey={mapExpanded ? 1 : 0}
            />
            <button
              onClick={() => setMapExpanded(e => !e)}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-lg transition-all active:scale-95"
              style={{ backgroundColor: mapExpanded ? "#ef4444" : "#1a1f36", opacity: 0.9 }}
              title={mapExpanded ? "Exit full screen" : "Full screen map"}
            >
              {mapExpanded ? "✕ Exit" : "⛶ Full Screen"}
            </button>
          </div>
        </div>

        {/* ── Cards column: below on mobile, left scrollable on desktop ── */}
        {!mapExpanded && (
          <div className="flex-1 lg:overflow-y-auto lg:h-full lg:order-1 px-4 lg:px-6 py-5 lg:py-6">
            {pageHeader}
            {controls}
            {cardsGrid}
            <div className="h-8" /> {/* bottom spacing */}
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

export default function ExploreCity({ city }: { city: CityConfig }) {
  const tN = useTranslations("nav");
  const tF = useTranslations("footer");

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-gray-50 text-gray-900 font-sans antialiased">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30 shrink-0">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            go<span className="font-extrabold">korea</span>mate
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tN("survivalGuide")}</Link>
            <Link href="/my-trips"       className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">{tN("myTrips")}</Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "#f97316" }}>
              {tN("planMyTrip")}
            </Link>
          </nav>
          <div className="sm:hidden flex items-center gap-2">
            <Link href="/my-trips" className="px-3 py-2 rounded-lg text-sm font-bold text-orange-600 border border-orange-200 bg-orange-50">🧳</Link>
            <Link href="/" className="px-3 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#f97316" }}>{tN("plan")}</Link>
          </div>
        </div>
      </header>

      {/* Main content: flex-1 so map fills remaining viewport on desktop */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: "#f97316" }} />
          </div>
        }>
          <ExploreCityContent city={city} />
        </Suspense>
      </main>

      {/* Footer: mobile only (desktop right side is the full-height map) */}
      <footer className="lg:hidden py-6 px-4 border-t border-gray-200 bg-white text-center text-sm text-gray-500 shrink-0">
        <p>{tF("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}

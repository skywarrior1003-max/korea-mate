"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import EventDetailModal from "@/components/EventDetailModal";
import NaverMap, { type MapSpot } from "@/components/NaverMap";
import { haversineKm } from "@/lib/geo";
import type { EventItem } from "@/lib/cart";
import type { CityConfig, CitySpot } from "@/data/cities/types";

// ── Category tabs ────────────────────────────────────────────────────────────

const SPOT_CATEGORIES = [
  { value: "all",        label: "All Spots"          },
  { value: "attraction", label: "🏯 Attractions"     },
  { value: "restaurant", label: "🍜 Food & Drink"    },
  { value: "nature",     label: "🌿 Nature & Trails" },
];

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
    lat: spot.lat,
    lng: spot.lng,
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

// ── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-lg">🔍</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search spots, beaches, hiking…"
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
  const searchParams = useSearchParams();

  const [spots,           setSpots]           = useState<CitySpot[]>(city.staticSpots);
  const [imgErrors,       setImgErrors]       = useState<Record<number, boolean>>({});
  const [search,          setSearch]          = useState(searchParams.get("q") ?? "");
  const [selectedCategory,setSelectedCategory]= useState(searchParams.get("category") ?? "all");
  const [selectedEvent,   setSelectedEvent]   = useState<EventItem | null>(null);

  const [nearMeActive,    setNearMeActive]    = useState(false);
  const [userLocation,    setUserLocation]    = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError,   setLocationError]   = useState<string | null>(null);

  // Load extra spots from local-info.json
  useEffect(() => {
    fetch("/data/local-info.json")
      .then(r => r.json())
      .then((data: CitySpot[]) => {
        const citySpots = data.filter(s => s.city === city.name);
        setSpots(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newOnes = citySpots.filter(s => !existingIds.has(s.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      })
      .catch(() => {});
  }, [city.name]);

  // Load GPS-tagged spots from events.json
  useEffect(() => {
    type EventSpot = {
      id: string; name: string; spotCategory?: string; type: string;
      city: string; district?: string; address: string; description: string;
      whyItMatters?: string; mapUrl: string;
      recommendedDurationMinutes?: number; bestTimeSlot?: string;
      openingHours?: { open: string; close: string } | null;
      tags?: string[]; relatedSurvivalGuides?: string[];
      soloFriendly: boolean; foreignCardAccepted: boolean; cashOnly?: boolean;
      image?: string | null; lat?: number; lng?: number;
    };
    fetch("/data/events.json")
      .then(r => r.json())
      .then((data: EventSpot[]) => {
        const geoSpots = data.filter(e =>
          e.city === city.name && e.lat != null && e.lng != null && e.spotCategory != null
        );
        setSpots(prev => {
          const existingNames = new Set(prev.map(s => s.name.toLowerCase()));
          const newOnes: CitySpot[] = geoSpots
            .filter(e => !existingNames.has(e.name.toLowerCase()))
            .map((e, idx) => ({
              id: 3000 + idx,
              name: e.name,
              category: (e.spotCategory as CitySpot["category"]) ?? "attraction",
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
  }, [city.name]);

  // GPS Near Me
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
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMeActive(true);
        setLocationLoading(false);
        setLocationError(null);
      },
      () => {
        setLocationError("Unable to get your location. Please enable location access.");
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
      .filter(s => s.city === city.name)
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
      <SearchBar value={search} onChange={setSearch} />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {SPOT_CATEGORIES.map(cat => (
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
          {locationLoading ? "⏳ Locating…" : nearMeActive ? "📍 Near Me ✓" : "📍 Near Me"}
        </button>
      </div>
      {locationError && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-semibold">
          ⚠️ {locationError}
        </div>
      )}
      {nearMeActive && userLocation && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-semibold flex items-center gap-2">
          <span>📍 Sorted by distance from your location.</span>
          <button onClick={handleNearMe} className="ml-auto text-xs underline opacity-70 hover:opacity-100">Turn off</button>
        </div>
      )}
      {search && (
        <p className="mt-2 text-sm text-gray-500 font-semibold">
          {filteredSpots.length} result{filteredSpots.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  );

  // ── Cards grid ──────────────────────────────────────────────────────────────
  const cardsGrid = filteredSpots.length === 0 ? (
    <div className="text-center py-16">
      {spots.length === 0 ? (
        <>
          <p className="text-4xl mb-3">🚧</p>
          <p className="text-gray-900 font-black text-lg mb-2">Coming Soon</p>
          <p className="text-sm text-gray-400 mb-4">We&apos;re curating the best spots in {city.name}. Check back soon!</p>
          View our {city.name} travel guide coming soon.
        </>
      ) : (
        <>
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-gray-600 font-semibold">No spots found for &ldquo;{search}&rdquo;</p>
          <button onClick={() => setSearch("")} className="mt-3 text-sm text-orange-500 font-bold underline">Clear search</button>
        </>
      )}
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
      {filteredSpots.map(item => {
        const distKm = distances.get(item.id);
        return (
          <div
            key={item.id}
            onClick={() => setSelectedEvent(toEventItem(item))}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-xl transition-all duration-300 cursor-pointer group"
          >
            <div className="h-44 overflow-hidden relative bg-gray-200">
              {item.image && !imgErrors[item.id] ? (
                <Image
                  src={item.image} alt={item.name} fill unoptimized
                  onError={() => setImgErrors(prev => ({ ...prev, [item.id]: true }))}
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/images/placeholder-spot.svg" alt="No image" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-sm bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                  View Details →
                </span>
              </div>
              <div className="absolute top-3 left-3">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1f36" }}>
                  {item.category === "nature" ? "🌿 Nature" : item.category}
                </span>
              </div>
              {distKm !== undefined && (
                <div className="absolute top-3 right-3">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#f97316" }}>
                    📍 {distKm.toFixed(1)} km
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-400">📍 {item.district ?? item.city}</span>
                {item.durationMinutes && <span className="text-xs font-semibold text-gray-400">🕐 {item.durationMinutes}min</span>}
              </div>
              <h3 className="text-sm font-black text-gray-900 mb-1.5 leading-snug line-clamp-2">{item.name}</h3>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed flex-1">{item.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {item.soloFriendly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">👤 Solo OK</span>}
                {item.cashOnly    && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">💵 Cash Only</span>}
                {item.foreignCardAccepted && !item.cashOnly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">💳 Card OK</span>}
                {item.category === "nature" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">🆓 Free</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-auto">
                <a href={item.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                   className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-colors">
                  🗺️ Google
                </a>
                <a href={item.naverMapUrl ?? `https://map.naver.com/v5/search/${encodeURIComponent(item.name)}`}
                   target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                   className="flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-xl transition-colors">
                  🟢 Naver
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Page header ─────────────────────────────────────────────────────────────
  const pageHeader = (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-gray-900">Explore {city.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {filteredSpots.length} spot{filteredSpots.length !== 1 ? "s" : ""}
          {nearMeActive ? " · sorted by distance" : " · click any card for details"}
        </p>
      </div>
      <Link href="/" className="shrink-0 text-sm font-bold text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:border-gray-400 transition-colors">
        ← Home
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
        <div className="h-72 lg:h-full lg:w-[460px] shrink-0 lg:order-2 lg:border-l lg:border-gray-200">
          <NaverMap
            spots={mapSpots}
            userLocation={userLocation}
            nearMeActive={nearMeActive}
            defaultCenter={city.defaultCenter}
            height="100%"
            className="relative w-full h-full overflow-hidden"
          />
        </div>

        {/* ── Cards column: below on mobile, left scrollable on desktop ── */}
        <div className="flex-1 lg:overflow-y-auto lg:h-full lg:order-1 px-4 lg:px-6 py-5 lg:py-6">
          {pageHeader}
          {controls}
          {cardsGrid}
          <div className="h-8" /> {/* bottom spacing */}
        </div>
      </div>

      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

export default function ExploreCity({ city }: { city: CityConfig }) {
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
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">🍽️ Food Guide</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Survival Guide</Link>
            <Link href="/my-trips"       className="text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">🧳 My Trips</Link>
            <Link href="/" className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "#f97316" }}>
              Plan My Trip
            </Link>
          </nav>
          <div className="sm:hidden flex items-center gap-2">
            <Link href="/my-trips" className="px-3 py-2 rounded-lg text-sm font-bold text-orange-600 border border-orange-200 bg-orange-50">🧳</Link>
            <Link href="/" className="px-3 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#f97316" }}>Plan</Link>
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
        <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
      </footer>
    </div>
  );
}

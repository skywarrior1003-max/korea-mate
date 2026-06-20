"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import type { EventItem } from "@/lib/cart";
import { fetchPopularTrips } from "@/lib/supabase";
import type { PopularTrip } from "@/lib/supabase";

const EVENT_FILTERS = [
  { key: "all",      label: "All"           },
  { key: "busan",    label: "🏙️ Busan"      },
  { key: "mega",     label: "🎤 Mega Event" },
  { key: "activity", label: "🗺️ Activity"   },
];

function SearchBar({
  value,
  onChange,
  placeholder = "Search events, BTS, fireworks…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none text-lg">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-11 py-3.5 rounded-2xl border-2 border-white/20 bg-white/10 text-sm font-semibold text-white placeholder:text-white/40 focus:outline-none focus:border-orange-400 focus:bg-white/15 transition-all"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-white/70 hover:bg-white/30 transition-colors text-xs font-bold"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function TrendingContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") ?? "all";
  const initialQuery  = searchParams.get("q")      ?? "";

  const [eventsData,     setEventsData]     = useState<EventItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [eventFilter,    setEventFilter]    = useState(initialFilter);
  const [search,         setSearch]         = useState(initialQuery);
  const [selectedEvent,  setSelectedEvent]  = useState<EventItem | null>(null);
  const [popularTrips,   setPopularTrips]   = useState<PopularTrip[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);

  useEffect(() => {
    fetch("/data/events.json")
      .then((r) => r.json())
      .then((data: EventItem[]) => { setEventsData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPopularTrips(6)
      .then((trips) => { setPopularTrips(trips); setPopularLoading(false); })
      .catch(() => setPopularLoading(false));
  }, []);

  const filteredEvents = useMemo(() => {
    let list = eventsData;
    if (eventFilter === "busan")
      list = list.filter((e) => e.city === "Busan");
    else if (eventFilter === "mega")
      list = list.filter((e) => ["concert", "festival", "event"].includes(e.type));
    else if (eventFilter === "activity")
      list = list.filter((e) => ["pilgrimage", "permanent", "logistics"].includes(e.type));
    const q = search.trim().toLowerCase();
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
  }, [eventsData, eventFilter, search]);

  const CITY_EMOJI: Record<string, string> = { seoul: "🌆", busan: "🏙️", jeju: "🌿", gyeongju: "🏛️" };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* ── Popular Trips ────────────────────────── */}
      {!popularLoading && popularTrips.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-emerald-600 border border-emerald-400/40 bg-emerald-50 uppercase tracking-widest">
              ✨ Popular Trips
            </span>
            <p className="text-sm text-gray-500 font-medium">
              Real AI-planned itineraries — voted helpful by travelers
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {popularTrips.map((trip) => {
              const days = Math.round(
                (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              const cityLabel = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
              const emoji = CITY_EMOJI[trip.city.toLowerCase()] ?? "🇰🇷";
              return (
                <Link
                  key={trip.id}
                  href={`/shared/${trip.id}`}
                  className="flex flex-col gap-3 p-5 rounded-2xl border border-gray-200 bg-white hover:border-orange-300 hover:shadow-md transition-all group"
                >
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      {emoji} {cityLabel} · {days > 0 ? `${days} days` : "weekend"}
                    </p>
                    <p className="text-base font-black text-gray-900 leading-tight group-hover:text-orange-600 transition-colors line-clamp-2">
                      {trip.trip_title ?? `${days > 0 ? days + "-Day" : ""} ${cityLabel} Trip`}
                    </p>
                  </div>
                  <div className="mt-auto">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                      {trip.travel_style}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold text-gray-400 border-t border-gray-100 pt-3">
                    {trip.view_count >= 2 && (
                      <span className="text-amber-500">🔥 {trip.view_count} views</span>
                    )}
                    {(trip.helpful_count ?? 0) >= 1 && (
                      <span className="text-emerald-500">👍 {trip.helpful_count} helpful</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Dark header card ─────────────────────── */}
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
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-orange-400 border border-orange-400/30 bg-orange-400/10 mb-4 uppercase tracking-widest">
              🔥 All Trending Events in Korea
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
              Trending Now
            </h1>
            <p className="text-white/60 text-base max-w-lg">
              BTS concerts, Busan fireworks, K-pop pilgrimages — full list, no limits.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white/80 border border-white/20 hover:bg-white/10 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search: BTS, fireworks, pilgrimage, ARMY, Busan…"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
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

      {/* ── Search result count ───────────────────── */}
      {search && !loading && (
        <p className="text-sm text-gray-500 mb-5 font-semibold">
          {filteredEvents.length} result{filteredEvents.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      {/* ── Cards grid ───────────────────────────── */}
      {loading ? (
        <div className="text-center py-20">
          <div
            className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4"
            style={{ borderColor: "#f97316" }}
          />
          <p className="text-gray-500 font-medium">Loading events…</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🎌</p>
          <p className="text-gray-500 font-semibold">
            No events found{search ? ` for "${search}"` : ""}.
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-sm font-bold underline"
              style={{ color: "#f97316" }}
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => setSelectedEvent(event)}
            />
          ))}
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

export default function TrendingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      {/* ── Header ─────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="/explore-busan"
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              Explore Busan
            </Link>
            <Link
              href="/survival-guide"
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              Survival Guide
            </Link>
            <Link
              href="/planner"
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#f97316" }}
            >
              My Planner
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Page content wrapped in Suspense for useSearchParams ── */}
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
        <TrendingContent />
      </Suspense>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="mt-auto py-8 px-4 border-t border-gray-100 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
      </footer>
    </div>
  );
}

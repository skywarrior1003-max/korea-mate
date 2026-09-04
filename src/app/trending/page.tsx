"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import type { EventItem } from "@/lib/cart";
import { apiFetchPopularTrips } from "@/lib/itinerary-api";
import type { PopularTrip } from "@/lib/supabase";

// 필터 상수는 key 와 이모지만 갖는다. 문구는 messages 가 갖는다 —
// 예전엔 label 이 영어로 박혀 있어 네 언어 어디서도 번역되지 않았다.
// key 는 필터 로직과 DB travel_style 값에 그대로 쓰이므로 번역하지 않는다.
const EVENT_FILTERS = [
  { key: "all",      emoji: "",    labelKey: "filterAll"      },
  { key: "busan",    emoji: "🏙️", labelKey: "city:Busan"     },
  { key: "mega",     emoji: "🎤",  labelKey: "filterMega"     },
  { key: "activity", emoji: "🗺️", labelKey: "filterActivity" },
];

const TRIP_CITY_FILTERS = [
  { key: "",         emoji: "",    labelKey: "allCities"    },
  { key: "seoul",    emoji: "🌆",  labelKey: "city:Seoul"   },
  { key: "busan",    emoji: "🏙️", labelKey: "city:Busan"   },
  { key: "jeju",     emoji: "🌿",  labelKey: "city:Jeju"    },
  { key: "gyeongju", emoji: "🏛️", labelKey: "city:Gyeongju" },
];

const TRIP_STYLE_FILTERS = [
  { key: "",       labelKey: "allStyles"    },
  { key: "Solo",   labelKey: "style_Solo"   },
  { key: "Couple", labelKey: "style_Couple" },
  { key: "Family", labelKey: "style_Family" },
  { key: "Group",  labelKey: "style_Group"  },
];

// placeholder 에 기본값을 두지 않는다 — 기본값이 있으면 번역되지 않은 영어가
// 조용히 살아남는다. 호출부가 반드시 번역된 문구를 넘긴다.
function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations("trending");
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
          aria-label={t("clearSearch")}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function TrendingContent() {
  const t   = useTranslations("trending");
  const tH  = useTranslations("home");        // 같은 PopularTrip 을 Home 도 쓴다
  const tF  = useTranslations("tripForm");    // 도시 이름은 플래너와 같은 표기
  const tD  = useTranslations("discovery");   // Home 으로 돌아가기 문구 재사용
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
  const [tripCity,       setTripCity]       = useState("");
  const [tripStyle,      setTripStyle]      = useState("");

  useEffect(() => {
    fetch("/data/events.json")
      .then((r) => r.json())
      .then((data: EventItem[]) => { setEventsData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPopularLoading(true);
    apiFetchPopularTrips(9, tripCity || undefined, tripStyle || undefined)
      .then((trips) => { setPopularTrips(trips); setPopularLoading(false); })
      .catch(() => setPopularLoading(false));
  }, [tripCity, tripStyle]);

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

  // "city:Busan" 은 플래너가 쓰는 도시 표기를 그대로 빌린다. 도시 이름을
  // 이 화면에서 또 번역하면 같은 도시가 화면마다 다르게 불린다.
  const label = (labelKey: string) =>
    labelKey.startsWith("city:") ? tF(`city_${labelKey.slice(5)}`) : t(labelKey);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* ── Popular Trips ────────────────────────── */}
      <section className="mb-10">
        {/* 섹션 헤더 */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-emerald-600 border border-emerald-400/40 bg-emerald-50 uppercase tracking-widest">
            ✨ {tH("popularTrips")}
          </span>
          <p className="text-sm text-gray-500 font-medium">
            {t("popularSub")}
          </p>
        </div>

        {/* 도시·스타일 필터 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {TRIP_CITY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTripCity(f.key)}
              className="px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer"
              style={
                tripCity === f.key
                  ? { backgroundColor: "#059669", color: "#fff", borderColor: "#059669" }
                  : { backgroundColor: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }
              }
            >
              {f.emoji ? `${f.emoji} ` : ""}{label(f.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
          {TRIP_STYLE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTripStyle(f.key)}
              className="px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer"
              style={
                tripStyle === f.key
                  ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff", borderColor: "var(--gkm-action-primary)" }
                  : { backgroundColor: "#f9fafb", color: "#374151", borderColor: "#e5e7eb" }
              }
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {/* 로딩 */}
        {popularLoading ? (
          <div className="flex items-center gap-2 py-6 text-gray-400 text-sm font-medium">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500" />
            {t("loadingTrips")}
          </div>
        ) : popularTrips.length === 0 ? (
          /* 빈 상태 — 자동 폴백 없음 */
          <div className="py-10 text-center border border-dashed border-gray-200 rounded-2xl">
            <p className="text-3xl mb-2">🗺️</p>
            <p className="text-sm font-semibold text-gray-500 mb-3">
              {t("noTrips")}
            </p>
            {(tripCity || tripStyle) && (
              <button
                onClick={() => { setTripCity(""); setTripStyle(""); }}
                className="text-xs font-bold underline"
                style={{ color: "#FF4A2D" }}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
        ) : (
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
                      {emoji} {cityLabel} · {days > 0 ? tH("days", { n: days }) : t("weekend")}
                    </p>
                    <p className="text-base font-black text-gray-900 leading-tight group-hover:text-orange-600 transition-colors line-clamp-2">
                      {trip.trip_title
                        ?? (days > 0
                              ? t("tripTitleDays", { n: days, city: cityLabel })
                              : t("tripTitleCity", { city: cityLabel }))}
                    </p>
                  </div>
                  <div className="mt-auto">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                      {["Solo", "Couple", "Family", "Group"].includes(trip.travel_style)
                        ? t(`style_${trip.travel_style}`)
                        : trip.travel_style}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold text-gray-400 border-t border-gray-100 pt-3">
                    {/* RELEASE-CLEANUP-V1: 공개 helpful 배지·공개 copy count 는 제거.
                        정렬(legacy score)은 서버 그대로 — 카드에는 중립 메타(views)만 남긴다. */}
                    {trip.view_count >= 2 && (
                      <span>{tH("views", { n: trip.view_count })}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Dark header card ─────────────────────── */}
      <div
        className="rounded-3xl px-8 py-10 mb-10 relative overflow-hidden"
        style={{ backgroundColor: "#1a1f36" }}
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 90% 50%, #FF4A2D 0%, transparent 50%), radial-gradient(circle at 10% 20%, #3b82f6 0%, transparent 40%)",
          }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-orange-400 border border-orange-400/30 bg-orange-400/10 mb-4 uppercase tracking-widest">
              {t("eyebrowAll")}
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
              {t("title")}
            </h1>
            <p className="text-white/60 text-base max-w-lg">
              {t("subtitle")}
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white/80 border border-white/20 hover:bg-white/10 transition-colors"
          >
            ← {tD("backToHome")}
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
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
                  ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff", borderColor: "var(--gkm-action-primary)" }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }
              }
            >
              {f.emoji ? `${f.emoji} ` : ""}{label(f.labelKey)}
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
          {filteredEvents.length === 1
            ? t("resultsOne",    { n: filteredEvents.length, q: search })
            : t("resultsPlural", { n: filteredEvents.length, q: search })}
        </p>
      )}

      {/* ── Cards grid ───────────────────────────── */}
      {loading ? (
        <div className="text-center py-20">
          <div
            className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4"
            style={{ borderColor: "#FF4A2D" }}
          />
          <p className="text-gray-500 font-medium">{t("loadingEvents")}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🎌</p>
          <p className="text-gray-500 font-semibold">
            {search ? t("noEventsFor", { q: search }) : t("noEvents")}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-sm font-bold underline"
              style={{ color: "#FF4A2D" }}
            >
              {t("clearSearch")}
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
  const tNav = useTranslations("nav");
  const tE   = useTranslations("explore");
  const tF   = useTranslations("tripForm");
  const tFoot = useTranslations("footer");
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      {/* ── Header ─────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <LanguageSwitcher variant="icon" className="sm:hidden text-gray-700" />
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="/busan"
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              {tE("title", { city: tF("city_Busan") })}
            </Link>
            <Link
              href="/survival-guide"
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              {tNav("survivalGuide")}
            </Link>
            {/* /planner 라는 route 는 없다. 플래너는 Home 안의 섹션이고,
                Picks·Place Detail·도시 랜딩이 모두 /#planner 로 들어간다. */}
            <Link
              href="/#planner"
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--gkm-action-primary)" }}
            >
              {tNav("planMyTrip")}
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Page content wrapped in Suspense for useSearchParams ── */}
      {/* 이 화면만 main 랜드마크가 없어서 보조기술이 본문으로 건너뛸 수 없었다.
          다른 화면(all-spots·picks·my-trips·itinerary)과 같은 위치에 둔다. */}
      <main className="flex-1 flex flex-col">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center py-24">
            <div
              className="animate-spin rounded-full h-10 w-10 border-b-2"
              style={{ borderColor: "#FF4A2D" }}
            />
          </div>
        }
      >
        <TrendingContent />
      </Suspense>
      </main>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="mt-auto py-8 px-4 border-t border-gray-100 text-center text-sm text-gray-500">
        <p>{tFoot("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import type { EventItem } from "@/lib/cart";
import { getFavorites, FAVORITES_EVENT } from "@/lib/favorites";

// ── 레스토랑 타입 + 어댑터 ────────────────────────────────────────────────────

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
}

function restaurantToEventItem(r: RestaurantItem): EventItem {
  const awardScore: Record<string, number> = { "1star": 92, "bib-gourmand": 88, "selected": 83, "certified": 80, "recommended": 78 };
  return {
    id: r.id, type: "restaurant", isAnchor: false,
    journeyCluster: "busan-food-guide-2026", stage: "Standalone",
    anchorEventId: null, relatedSpotIds: [], relatedSurvivalGuides: ["payments", "solo-dining"],
    transitFromAnchor: null,
    name: `${r.name_ko} (${r.name_en})`, shortName: r.name_ko,
    tags: r.tags ?? [], city: "Busan", district: r.district_en,
    address: r.address_ko,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address_ko)}`,
    naverMapUrl: `https://map.naver.com/v5/search/${encodeURIComponent(r.name_ko)}`,
    description: r.description_ko, whyItMatters: r.description_en,
    recommendedDurationMinutes: 60, bestTimeSlot: "anytime",
    openingHours: null, image: r.image,
    startDate: null, endDate: null,
    isTrending: r.award === "1star" || r.award === "bib-gourmand",
    soloFriendly: true, foreignCardAccepted: r.price_range !== "$",
    cashOnly: false, englishMenu: true, barrierFree: true,
    koreanSurvivalScore: awardScore[r.award ?? ""] ?? 78,
    notice: null,
    lat: r.latitude, lng: r.longitude,
    commerce: { affiliateType: null, hasAffiliate: false, affiliatePartner: null, affiliateUrl: null, hasMerchandise: false, hasTicketing: false, bookingUrl: null },
  };
}

// ── 카테고리 필터 ─────────────────────────────────────────────────────────────
const CATEGORY_FILTERS = [
  { key: "all",      label: "All",                  emoji: ""   },
  { key: "kpop",     label: "K-POP / BTS",          emoji: "🎤" },
  { key: "michelin", label: "Michelin Guide",        emoji: "⭐" },
  { key: "nature",   label: "Attractions & Nature",  emoji: "🗺️" },
  { key: "culture",  label: "History & Culture",     emoji: "🏛️" },
  { key: "saved",    label: "My Saved Spots",        emoji: "❤️" },
];

// ── 지역 필터 ─────────────────────────────────────────────────────────────────
const DISTRICT_FILTERS = [
  { key: "all",       label: "전체",              districts: [] as string[] },
  { key: "haeundae",  label: "해운대·기장",        districts: ["Haeundae-gu", "Gijang-gun"] },
  { key: "gwangalli", label: "수영·광안리",         districts: ["Suyeong-gu", "Nam-gu"] },
  { key: "seomyeon",  label: "서면·부산진",         districts: ["Busanjin-gu"] },
  { key: "nampo",     label: "남포·중구·서구",      districts: ["Jung-gu", "Yeongdo-gu", "Seo-gu", "Dong-gu"] },
  { key: "dongnae",   label: "동래·금정·연제",      districts: ["Dongnae-gu", "Geumjeong-gu", "Yeonje-gu"] },
  { key: "bukgu",     label: "북구·사상·강서·사하", districts: ["Buk-gu", "Sasang-gu", "Gangseo-gu", "Saha-gu"] },
];

// ── 구별 중심 좌표 (GPS 폴백용) ───────────────────────────────────────────────
export const DISTRICT_CENTERS: Record<string, { lat: number; lng: number }> = {
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
  "Multiple":     { lat: 35.1800, lng: 129.0750 },
};

// Haversine 거리 계산 (km)
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m 앞`;
  return `${km.toFixed(1)}km`;
}

export function getEventCoords(event: EventItem): { lat: number; lng: number } {
  if (event.lat && event.lng) return { lat: event.lat, lng: event.lng };
  return DISTRICT_CENTERS[event.district] ?? { lat: 35.1796, lng: 129.0756 };
}

function matchCategoryFilter(e: EventItem, key: string, savedIds: string[]): boolean {
  if (key === "all")      return true;
  if (key === "kpop")     return ["event","festival","concert"].includes(e.type) || (e.tags ?? []).some(t => ["bts","k-pop","kpop","idol"].some(k => t.toLowerCase().includes(k)));
  if (key === "nature")   return ["attraction","nature","pilgrimage","permanent"].includes(e.type);
  if (key === "culture")  return ["heritage","museum","cultural"].some(c => e.type.toLowerCase().includes(c)) || (e.tags ?? []).some(t => ["history","culture","temple","palace","heritage","tradition","shrine"].some(k => t.toLowerCase().includes(k)));
  if (key === "michelin") return e.type === "restaurant";
  if (key === "saved")    return savedIds.includes(e.id);
  return true;
}

export default function AllSpotsPage() {
  const [events,         setEvents]         = useState<EventItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [search,         setSearch]         = useState("");
  const [selected,       setSelected]       = useState<EventItem | null>(null);
  const [savedIds,       setSavedIds]       = useState<string[]>([]);
  const [page,           setPage]           = useState(1);
  const [gpsActive,      setGpsActive]      = useState(false);
  const [userCoords,     setUserCoords]     = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading,     setGpsLoading]     = useState(false);
  const [gpsError,       setGpsError]       = useState<string | null>(null);
  const ITEMS_PER_PAGE = 24;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("filter");
    if (f && CATEGORY_FILTERS.some(fi => fi.key === f)) setCategoryFilter(f);
    setPage(1);
    Promise.all([
      fetch("/data/events.json").then(r => r.json()),
      fetch("/data/restaurants.json").then(r => r.json()).catch(() => [] as RestaurantItem[]),
    ]).then(([evtsData, restsData]: [EventItem[], RestaurantItem[]]) => {
      setEvents([...evtsData, ...restsData.map(restaurantToEventItem)]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSavedIds(getFavorites());
    const h = () => setSavedIds(getFavorites());
    window.addEventListener(FAVORITES_EVENT, h);
    return () => window.removeEventListener(FAVORITES_EVENT, h);
  }, []);

  const handleGpsToggle = useCallback(() => {
    if (gpsActive) {
      setGpsActive(false);
      setUserCoords(null);
      setGpsError(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsError("이 기기는 GPS를 지원하지 않습니다.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsActive(true);
        setGpsLoading(false);
        setGpsError(null);
      },
      () => {
        setGpsLoading(false);
        setGpsError("위치 권한을 허용해주세요.");
      },
      { timeout: 8000 }
    );
  }, [gpsActive]);

  const filtered = useMemo(() => {
    let list = events.filter(e => matchCategoryFilter(e, categoryFilter, savedIds));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.description ?? "").toLowerCase().includes(q) ||
      e.city.toLowerCase().includes(q) ||
      (e.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
    // 지역 필터 — district 필드 기준 즉시 필터링
    if (districtFilter !== "all") {
      const districts = DISTRICT_FILTERS.find(d => d.key === districtFilter)?.districts ?? [];
      list = list.filter(e => districts.includes(e.district));
    }
    // GPS: 3km 이내 필터 + 거리 오름차순 정렬
    if (gpsActive && userCoords) {
      list = list.filter(e => {
        const c = getEventCoords(e);
        return haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) <= 3;
      });
      list = [...list].sort((a, b) => {
        const ac = getEventCoords(a);
        const bc = getEventCoords(b);
        return (
          haversineKm(userCoords.lat, userCoords.lng, ac.lat, ac.lng) -
          haversineKm(userCoords.lat, userCoords.lng, bc.lat, bc.lng)
        );
      });
    }
    return list;
  }, [events, categoryFilter, savedIds, search, districtFilter, gpsActive, userCoords]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const resetPage  = useCallback(() => setPage(1), []);

  const activeFilterCount = (categoryFilter !== "all" ? 1 : 0) + (districtFilter !== "all" ? 1 : 0) + (gpsActive ? 1 : 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
              <span className="text-2xl">🇰🇷</span>
              Korea<span style={{ color: "#f97316" }}>Mate</span>
            </Link>
            <span className="text-gray-300 text-lg">/</span>
            <h1 className="text-base font-black text-gray-700">All Spots</h1>
          </div>
          <Link href="/my-trips" className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors">
            🧳 My Trips
          </Link>
        </div>
      </header>

      {/* Sticky 필터 패널 */}
      <div className="sticky top-16 z-20 bg-gray-50 border-b border-gray-100 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto space-y-2.5">

          {/* 검색창 */}
          <div className="relative max-w-2xl mx-auto">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search spots, BTS, beach, Michelin, hiking…"
              className="w-full pl-12 pr-10 py-3 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
            />
            {search && (
              <button onClick={() => { setSearch(""); resetPage(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-300">✕</button>
            )}
          </div>

          {/* 카테고리 필터 칩 */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {CATEGORY_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setCategoryFilter(f.key); resetPage(); }}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold transition-all border cursor-pointer whitespace-nowrap"
                  style={
                    categoryFilter === f.key
                      ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                      : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
                  }
                >
                  {f.emoji && <span className="mr-1">{f.emoji}</span>}{f.label}
                </button>
              ))}
            </div>
            <div className="absolute right-0 top-0 bottom-0.5 w-8 pointer-events-none" style={{ background: "linear-gradient(to left, #f9fafb, transparent)" }} />
          </div>

          {/* 지역 필터 버튼 */}
          <div className="relative">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <span className="shrink-0 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider pr-1">구역</span>
              {DISTRICT_FILTERS.map(d => (
                <button
                  key={d.key}
                  onClick={() => { setDistrictFilter(d.key); resetPage(); }}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer whitespace-nowrap"
                  style={
                    districtFilter === d.key
                      ? { backgroundColor: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" }
                      : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="absolute right-0 top-0 bottom-0.5 w-8 pointer-events-none" style={{ background: "linear-gradient(to left, #f9fafb, transparent)" }} />
          </div>

          {/* GPS 토글 + 상태 표시 */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGpsToggle}
              disabled={gpsLoading}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                gpsActive
                  ? "bg-blue-600 text-white border-blue-600 shadow-md"
                  : gpsLoading
                  ? "bg-blue-100 text-blue-400 border-blue-200 cursor-not-allowed"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              <span className="text-sm">{gpsLoading ? "⏳" : gpsActive ? "📍" : "📡"}</span>
              내 주변 3km 이내 보기
              {/* 토글 인디케이터 */}
              <span
                className={`inline-block w-8 h-4 rounded-full transition-colors relative ${gpsActive ? "bg-white/30" : "bg-gray-200"}`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform ${
                    gpsActive ? "bg-white translate-x-4" : "bg-gray-400 translate-x-0.5"
                  }`}
                />
              </span>
            </button>
            {gpsActive && userCoords && (
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                GPS 활성화 · 거리순 정렬 중
              </span>
            )}
            {gpsError && (
              <span className="text-xs text-red-500 font-semibold">{gpsError}</span>
            )}
          </div>

          {/* 결과 카운트 + 필터 초기화 */}
          <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
            <span>
              {loading ? "Loading…" : `${filtered.length} spot${filtered.length !== 1 ? "s" : ""}`}
            </span>
            {activeFilterCount > 0 && !loading && (
              <button
                onClick={() => { setCategoryFilter("all"); setDistrictFilter("all"); setSearch(""); setGpsActive(false); setUserCoords(null); setGpsError(null); resetPage(); }}
                className="text-orange-500 font-bold underline"
              >
                모두 해제
              </button>
            )}
          </p>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

        {/* 미식 가이드 배너 */}
        {!loading && categoryFilter === "all" && districtFilter === "all" && !search && (
          <Link
            href="/restaurants"
            className="group flex items-center gap-4 rounded-2xl p-4 mb-6 border border-orange-100 hover:border-orange-300 transition-all hover:shadow-md bg-gradient-to-r from-orange-50 to-amber-50"
          >
            <span className="text-3xl shrink-0">🍽️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">NEW</p>
              <p className="text-sm font-black text-gray-900 leading-snug">2026 부산 미식 가이드 100선 — 미쉐린·부산의맛·택슐랭</p>
            </div>
            <span className="shrink-0 text-xs font-black text-orange-500 group-hover:text-orange-700 transition-colors whitespace-nowrap">전체 보기 →</span>
          </Link>
        )}

        {loading ? (
          <div className="text-center py-24">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-500 mx-auto mb-6" />
            <p className="text-gray-500 font-semibold">Loading all spots…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-4">
              {categoryFilter === "saved" ? "🤍" : gpsActive ? "📍" : "🔍"}
            </p>
            <p className="text-xl font-black text-gray-700 mb-2">
              {categoryFilter === "saved"
                ? "No saved spots yet"
                : gpsActive
                ? "내 주변 3km 이내에 등록된 스팟이 없습니다"
                : "No results found"}
            </p>
            <p className="text-gray-500 mb-6 text-sm">
              {categoryFilter === "saved"
                ? "Tap ❤️ on any card to save spots here."
                : gpsActive
                ? "GPS 토글을 끄거나 지역 필터를 변경해보세요."
                : "Try a different search or filter."}
            </p>
            <button
              onClick={() => { setCategoryFilter("all"); setDistrictFilter("all"); setSearch(""); setGpsActive(false); setUserCoords(null); setGpsError(null); resetPage(); }}
              className="px-6 py-3 rounded-xl font-black text-white text-sm"
              style={{ backgroundColor: "#f97316" }}
            >
              모든 스팟 보기
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {pageItems.map(event => {
                const distKm =
                  gpsActive && userCoords
                    ? haversineKm(
                        userCoords.lat,
                        userCoords.lng,
                        getEventCoords(event).lat,
                        getEventCoords(event).lng
                      )
                    : null;
                return (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => setSelected(event)}
                    distanceBadge={distKm !== null ? formatDistance(distKm) : undefined}
                  />
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-10 flex-wrap">
                <button
                  onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === 1}
                  className="px-3 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-50"
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    n === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => { setPage(n as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        className="w-9 h-9 rounded-lg text-sm font-bold border transition-colors"
                        style={safePage === n
                          ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                          : { backgroundColor: "#fff", color: "#374151", borderColor: "#e5e7eb" }
                        }
                      >
                        {n}
                      </button>
                    )
                  )}
                <button
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === totalPages}
                  className="px-3 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-50"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        <Link href="/" className="text-orange-500 font-bold hover:underline">← Back to KoreaMate Home</Link>
      </footer>

      {/* 상세 모달 */}
      {selected && (
        <EventDetailModal event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

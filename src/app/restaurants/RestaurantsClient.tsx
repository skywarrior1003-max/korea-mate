"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { getRestaurantPlaces } from "@/lib/places";
import type { RestaurantItem } from "@/lib/places";

// ── 메타 상수 ─────────────────────────────────────────────────────────────────

const SOURCE_META = {
  "michelin-2026":   { label: "미쉐린 가이드 2026", labelEn: "Michelin Guide 2026", emoji: "⭐", color: "#e11d48",  bg: "#fff1f2"  },
  "busan-mat-2026":  { label: "부산의맛 2026",       labelEn: "Busan Mat 2026",       emoji: "🍽️", color: "#0369a1", bg: "#f0f9ff"  },
  "taegshlang-2025": { label: "택슐랭 2025",          labelEn: "Taegshlang 2025",      emoji: "🚖", color: "#047857", bg: "#f0fdf4"  },
} as const;

const SOURCE_CARD_GRADIENT: Record<string, string> = {
  "michelin-2026":   "linear-gradient(145deg, #4a0519 0%, #7c1533 100%)",
  "busan-mat-2026":  "linear-gradient(145deg, #0f2347 0%, #1a3a6e 100%)",
  "taegshlang-2025": "linear-gradient(145deg, #0f2d1e 0%, #1a4a33 100%)",
};

const AWARD_META: Record<string, { label: string; labelEn: string; color: string; bg: string }> = {
  "1star":        { label: "⭐ 1스타",    labelEn: "1 Star",       color: "#92400e", bg: "#fef3c7" },
  "bib-gourmand": { label: "🍽️ 빕구르망", labelEn: "Bib Gourmand", color: "#be185d", bg: "#fdf2f8" },
  "selected":     { label: "✦ 셀렉티드",  labelEn: "Selected",     color: "#5b21b6", bg: "#f5f3ff" },
  "certified":    { label: "🏅 인증",     labelEn: "Certified",    color: "#0369a1", bg: "#eff6ff" },
  "recommended":  { label: "👍 추천",     labelEn: "Recommended",  color: "#047857", bg: "#f0fdf4" },
};

const PRICE_LABEL: Record<string, string> = {
  "$":   "₩ Budget",
  "$$":  "₩₩ Mid-range",
  "$$$": "₩₩₩ Upscale",
};

// ── 지역 클러스터 ─────────────────────────────────────────────────────────────

const DISTRICT_CLUSTERS = [
  { key: "all",       label: "All",                    districts: [] as string[] },
  { key: "haeundae",  label: "Haeundae · Gijang",      districts: ["Haeundae-gu", "Gijang-gun"] },
  { key: "gwangalli", label: "Suyeong · Gwangalli",     districts: ["Suyeong-gu"] },
  { key: "seomyeon",  label: "Seomyeon · Busanjin",     districts: ["Busanjin-gu"] },
  { key: "dongnae",   label: "Dongnae · Geumjeong",     districts: ["Dongnae-gu", "Geumjeong-gu", "Yeonje-gu"] },
  { key: "namgu",     label: "Nam-gu · Suyeong",        districts: ["Nam-gu"] },
  { key: "nampo",     label: "Jung · Seo-gu · Nampo",   districts: ["Jung-gu", "Seo-gu", "Dong-gu"] },
  { key: "yeongdo",   label: "Yeongdo · Dong-gu",       districts: ["Yeongdo-gu", "Dong-gu"] },
  { key: "bukgu",     label: "Buk · Sasang · Gangseo",  districts: ["Buk-gu", "Sasang-gu", "Gangseo-gu", "Saha-gu"] },
];

// ── GPS 헬퍼 ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// ── 상세 모달 ─────────────────────────────────────────────────────────────────

function RestaurantModal({ r, onClose }: { r: RestaurantItem; onClose: () => void }) {
  const src  = SOURCE_META[r.source];
  const awd  = r.award ? AWARD_META[r.award] : null;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={{ animation: "modalIn 0.35s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 이미지 또는 placeholder */}
        {r.image ? (
          <div className="relative h-52 w-full overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image} alt={r.name_en} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        ) : (
          <div
            className="relative h-40 w-full overflow-hidden rounded-t-3xl sm:rounded-t-3xl flex flex-col justify-center px-8"
            style={{ background: SOURCE_CARD_GRADIENT[r.source] ?? "linear-gradient(145deg, #1c1c2e 0%, #2d2d44 100%)" }}
          >
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[100px] leading-none select-none pointer-events-none opacity-[0.08]">
              🍽️
            </span>
            <div className="relative z-10 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border border-white/20 text-white/70"
                >
                  {src.emoji} {src.labelEn}
                </span>
                {awd && (
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border border-white/20 text-white/70"
                  >
                    {awd.labelEn}
                  </span>
                )}
              </div>
              <p className="text-lg font-black text-white/90 leading-tight">
                {r.category_en || "Restaurant"}{r.district_en ? ` · ${r.district_en}` : ""}
              </p>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                Busan Food Guide 2026
              </p>
            </div>
          </div>
        )}

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-md transition-colors font-bold text-lg z-10"
        >✕</button>

        <div className="p-6 space-y-4">
          {/* 출처 + 등급 뱃지 */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black" style={{ color: src.color, backgroundColor: src.bg }}>
              {src.emoji} {src.labelEn}
            </span>
            {awd && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black" style={{ color: awd.color, backgroundColor: awd.bg }}>
                {awd.labelEn}
              </span>
            )}
            {r.price_range && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                {PRICE_LABEL[r.price_range] ?? r.price_range}
              </span>
            )}
          </div>

          {/* 이름 */}
          <div>
            <h2 className="text-2xl font-black text-gray-900 leading-tight">{r.name_en}</h2>
            <p className="text-base font-semibold text-gray-400 mt-0.5">{r.name_ko}</p>
          </div>

          {/* 카테고리 · 지역 */}
          <p className="text-sm font-semibold text-orange-500">
            {r.category_en} &nbsp;|&nbsp; 📍 {r.district_en}
          </p>

          {/* 설명 */}
          <div className="rounded-2xl bg-gray-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800 leading-relaxed">{r.description_en}</p>
            <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-200 pt-2">{r.description_ko}</p>
          </div>

          {/* 주소 */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Address</p>
            <p className="text-sm font-semibold text-gray-700">{r.address_ko}</p>
            <p className="text-xs text-gray-500">{r.address_en}</p>
          </div>

          {/* 전화·예약 */}
          <div className="flex flex-wrap gap-3 items-center">
            {r.phone && (
              <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                📞 {r.phone}
              </a>
            )}
            {r.reservation_required && (
              <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                🗓️ Reservation Required
              </span>
            )}
          </div>

          {/* 태그 */}
          {r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.tags.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium">{t}</span>
              ))}
            </div>
          )}

          {/* 지도 버튼 */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name_ko)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-black text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#4285f4" }}
            >
              🗺️ Google Maps
            </a>
            <a
              href={`https://map.naver.com/v5/search/${encodeURIComponent(r.name_ko)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-black text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#03c75a" }}
            >
              💚 Naver Maps
            </a>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── 레스토랑 카드 ─────────────────────────────────────────────────────────────

function RestaurantCard({
  r,
  onClick,
  distKm,
}: { r: RestaurantItem; onClick: () => void; distKm: number | null }) {
  const [imgErr, setImgErr] = useState(false);
  const src = SOURCE_META[r.source];
  const awd = r.award ? AWARD_META[r.award] : null;

  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
    >
      {/* 이미지 영역 */}
      <div className="relative h-44 w-full overflow-hidden bg-gray-100">
        {r.image && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.image}
            alt={r.name_en}
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-start justify-center pl-5 pr-14 relative overflow-hidden"
            style={{ background: SOURCE_CARD_GRADIENT[r.source] ?? "linear-gradient(145deg, #1c1c2e 0%, #2d2d44 100%)" }}
          >
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[88px] leading-none select-none pointer-events-none opacity-[0.09]">
              🍽️
            </span>
            <div className="relative z-10 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/40">
                {r.district_en ? `${r.district_en} · Busan` : "Busan"}
              </p>
              <p className="text-[13px] font-black text-white/90 leading-snug line-clamp-2">
                {r.category_en || "Restaurant"}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">
                Busan Food Guide 2026
              </p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

        {/* 출처 뱃지 (상단 왼쪽) */}
        <span
          className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black backdrop-blur-sm"
          style={{ color: src.color, backgroundColor: "rgba(255,255,255,0.92)" }}
        >
          {src.emoji} {src.labelEn}
        </span>

        {/* 등급 뱃지 (상단 오른쪽) */}
        {awd && (
          <span
            className="absolute top-3 right-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black backdrop-blur-sm"
            style={{ color: awd.color, backgroundColor: "rgba(255,255,255,0.92)" }}
          >
            {awd.labelEn}
          </span>
        )}

        {/* GPS 거리 뱃지 (하단 오른쪽) */}
        {distKm !== null && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600/90 text-white backdrop-blur-sm">
            📍 {fmtDist(distKm)}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 space-y-1.5">
        <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">{r.district_en} · {r.category_en}</p>
        <h3 className="text-sm font-black text-gray-900 leading-snug line-clamp-1">{r.name_en}</h3>
        <p className="text-[11px] font-semibold text-gray-400 line-clamp-1">{r.name_ko}</p>
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed pt-0.5">{r.description_en}</p>

        <div className="flex items-center justify-between pt-1.5">
          <div className="flex gap-1 flex-wrap">
            {r.tags.slice(0, 2).map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[9px] font-medium">{t}</span>
            ))}
          </div>
          {r.price_range && (
            <span className="text-[10px] font-bold text-gray-400 shrink-0">{r.price_range}</span>
          )}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="px-4 pb-4">
        <div
          className="w-full py-2 rounded-xl text-xs font-bold text-center text-white transition-opacity group-hover:opacity-100 opacity-75"
          style={{ backgroundColor: "#1a1f36" }}
        >
          Details →
        </div>
      </div>
    </button>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 24;

export default function RestaurantsClient() {
  const [restaurants, setRestaurants] = useState<RestaurantItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [source,      setSource]      = useState("all");
  const [district,    setDistrict]    = useState("all");
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<RestaurantItem | null>(null);
  const [gpsActive,   setGpsActive]   = useState(false);
  const [userCoords,  setUserCoords]  = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Supabase places 우선 조회 — 실패 또는 0건이면 JSON fallback
      const placesData = await getRestaurantPlaces();
      if (placesData.length > 0) {
        setRestaurants(placesData);
        setLoading(false);
        return;
      }
      // Fallback: restaurants.json (Supabase 장애 또는 0건)
      fetch("/data/restaurants.json")
        .then(r => r.json())
        .then((data: RestaurantItem[]) => { setRestaurants(data); setLoading(false); })
        .catch(() => setLoading(false));
    })();
  }, []);

  const resetPage = useCallback(() => setPage(1), []);

  const handleGps = useCallback(() => {
    if (gpsActive) { setGpsActive(false); setUserCoords(null); setGpsError(null); return; }
    if (!("geolocation" in navigator)) { setGpsError("Device does not support GPS."); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsActive(true); setGpsLoading(false); setGpsError(null); resetPage(); },
      ()  => { setGpsLoading(false); setGpsError("Please allow location permission."); },
      { timeout: 8000 }
    );
  }, [gpsActive, resetPage]);

  const filtered = useMemo(() => {
    let list = restaurants.filter(r => r.visible !== false);
    if (source !== "all") list = list.filter(r => r.source === source);
    if (district !== "all") {
      const ds = DISTRICT_CLUSTERS.find(d => d.key === district)?.districts ?? [];
      list = list.filter(r => ds.includes(r.district_en));
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r =>
      r.name_ko.toLowerCase().includes(q) ||
      r.name_en.toLowerCase().includes(q) ||
      r.description_ko.toLowerCase().includes(q) ||
      r.category_ko.toLowerCase().includes(q) ||
      r.district_ko.toLowerCase().includes(q) ||
      r.tags.some(t => t.toLowerCase().includes(q))
    );
    if (gpsActive && userCoords) {
      list = [...list].sort((a, b) =>
        haversineKm(userCoords.lat, userCoords.lng, a.latitude, a.longitude) -
        haversineKm(userCoords.lat, userCoords.lng, b.latitude, b.longitude)
      );
    }
    return list;
  }, [restaurants, source, district, search, gpsActive, userCoords]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const srcCounts = useMemo(() => {
    const c: Record<string, number> = { "michelin-2026": 0, "busan-mat-2026": 0, "taegshlang-2025": 0 };
    restaurants.forEach(r => { c[r.source] = (c[r.source] ?? 0) + 1; });
    return c;
  }, [restaurants]);

  const activeCount = (source !== "all" ? 1 : 0) + (district !== "all" ? 1 : 0) + (gpsActive ? 1 : 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* 헤더 */}
      <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="text-xl font-normal text-gray-900 flex items-center gap-1.5 shrink-0">
              <span className="text-2xl">🇰🇷</span>
              go<span className="font-extrabold">korea</span>mate
            </Link>
            <span className="text-gray-300 text-lg">/</span>
            <h1 className="text-sm font-black text-gray-700 truncate">2026 Busan Food Guide</h1>
          </div>
          <Link href="/all-spots" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
            All Spots
          </Link>
        </div>
      </header>

      {/* 히어로 배너 */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a0f00 0%, #7c2d12 50%, #1a0f00 100%)" }}
      >
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(ellipse at 20% 50%, #f97316 0%, transparent 55%), radial-gradient(ellipse at 80% 30%, #fbbf24 0%, transparent 50%)" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <p className="text-orange-300 text-xs font-black uppercase tracking-widest mb-2">Busan Food Guide 2026</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            2026 Busan Food Guide <span style={{ color: "#fb923c" }}>Top 100</span>
          </h2>
          <p className="text-white/70 text-sm sm:text-base font-medium mb-6 max-w-xl">
            Michelin Guide · Busan Mat · Taegshlang — selected from 3 major food guides across 16 districts
          </p>
          {/* 출처별 카운터 */}
          {!loading && (
            <div className="flex flex-wrap gap-3">
              {(Object.entries(SOURCE_META) as [keyof typeof SOURCE_META, typeof SOURCE_META[keyof typeof SOURCE_META]][]).map(([key, meta]) => (
                <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className="text-white font-black text-xs">{meta.labelEn}</span>
                  <span className="text-white/60 font-bold text-xs">{srcCounts[key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky 필터 바 */}
      <div className="sticky top-16 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">

          {/* 검색 */}
          <div className="relative max-w-2xl mx-auto">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search by name, area, category…"
              className="w-full pl-11 pr-10 py-2.5 rounded-2xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
            />
            {search && (
              <button onClick={() => { setSearch(""); resetPage(); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-gray-300">✕</button>
            )}
          </div>

          {/* 출처 필터 */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => { setSource("all"); resetPage(); }}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-black border transition-all cursor-pointer whitespace-nowrap"
                style={source === "all" ? { backgroundColor: "#1a1f36", color: "#fff", borderColor: "#1a1f36" } : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}
              >
                All {restaurants.length > 0 && `(${filtered.length})`}
              </button>
              {(Object.entries(SOURCE_META) as [keyof typeof SOURCE_META, typeof SOURCE_META[keyof typeof SOURCE_META]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => { setSource(key); resetPage(); }}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-black border transition-all cursor-pointer whitespace-nowrap"
                  style={source === key ? { backgroundColor: meta.color, color: "#fff", borderColor: meta.color } : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}
                >
                  {meta.emoji} {meta.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* 지역 필터 */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <span className="shrink-0 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider self-center pr-1">Area</span>
              {DISTRICT_CLUSTERS.map(d => (
                <button
                  key={d.key}
                  onClick={() => { setDistrict(d.key); resetPage(); }}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap"
                  style={district === d.key ? { backgroundColor: "#0369a1", color: "#fff", borderColor: "#0369a1" } : { backgroundColor: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {/* 오른쪽 페이드 힌트 */}
            <div className="absolute right-0 top-0 bottom-0.5 w-8 pointer-events-none" style={{ background: "linear-gradient(to left, white, transparent)" }} />
          </div>

          {/* GPS 토글 + 카운트 */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGps}
              disabled={gpsLoading}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                gpsActive ? "bg-blue-600 text-white border-blue-600 shadow-md"
                : gpsLoading ? "bg-blue-100 text-blue-400 border-blue-200 cursor-not-allowed"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              <span>{gpsLoading ? "⏳" : gpsActive ? "📍" : "📡"}</span>
              Sort by distance
              <span className={`inline-block w-8 h-4 rounded-full transition-colors relative ${gpsActive ? "bg-white/30" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform ${gpsActive ? "bg-white translate-x-4" : "bg-gray-400 translate-x-0.5"}`} />
              </span>
            </button>
            {gpsActive && <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">GPS active · by distance</span>}
            {gpsError && <span className="text-xs text-red-500 font-semibold">{gpsError}</span>}
            <span className="text-xs text-gray-400 font-medium ml-auto">
              {loading ? "Loading…" : `${filtered.length} restaurants`}
              {activeCount > 0 && (
                <button
                  onClick={() => { setSource("all"); setDistrict("all"); setSearch(""); setGpsActive(false); setUserCoords(null); setGpsError(null); resetPage(); }}
                  className="ml-2 text-orange-500 font-bold underline"
                >
                  Clear filters
                </button>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 메인 그리드 */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-24">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-500 mx-auto mb-6" />
            <p className="text-gray-500 font-semibold">Loading 2026 Busan Food Guide…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-xl font-black text-gray-700 mb-2">No results found</p>
            <p className="text-gray-500 text-sm mb-6">Try a different keyword or filter.</p>
            <button
              onClick={() => { setSource("all"); setDistrict("all"); setSearch(""); setGpsActive(false); setUserCoords(null); setGpsError(null); resetPage(); }}
              className="px-6 py-3 rounded-xl font-black text-white text-sm"
              style={{ backgroundColor: "#f97316" }}
            >
              View All
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
              {pageItems.map(r => (
                <RestaurantCard
                  key={r.id}
                  r={r}
                  onClick={() => setSelected(r)}
                  distKm={gpsActive && userCoords
                    ? haversineKm(userCoords.lat, userCoords.lng, r.latitude, r.longitude)
                    : null}
                />
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-10 flex-wrap">
                <button
                  onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === 1}
                  className="px-3 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-50"
                >← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(n); return acc;
                  }, [])
                  .map((n, i) =>
                    n === "…"
                      ? <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
                      : <button
                          key={n}
                          onClick={() => { setPage(n as number); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          className="w-9 h-9 rounded-lg text-sm font-bold border transition-colors"
                          style={safePage === n
                            ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                            : { backgroundColor: "#fff", color: "#374151", borderColor: "#e5e7eb" }}
                        >{n}</button>
                  )}
                <button
                  onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  disabled={safePage === totalPages}
                  className="px-3 py-2 rounded-lg text-sm font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange-50"
                >Next →</button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400 space-y-2">
        <p>
          <Link href="/" className="text-orange-500 font-bold hover:underline">← KoreaMate Home</Link>
          &nbsp;·&nbsp;
          <Link href="/all-spots" className="text-orange-500 font-bold hover:underline">View All Spots</Link>
        </p>
        <p className="text-xs text-gray-300">Source: Michelin Guide Busan 2026 · Busan Mat 2026 · Taegshlang 2025</p>
      </footer>

      {/* 상세 모달 */}
      {selected && <RestaurantModal r={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

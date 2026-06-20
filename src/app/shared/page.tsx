"use client";

// gokoreamate — 공유 일정 뷰어 페이지
// TASK-026: /shared/[id] 정적 쉘 + 클라이언트 사이드 Supabase 바인딩
// Cloudflare Pages _redirects: /shared/* → /shared/ 200 (정적 쉘 라우팅)

// output: "export" 정적 익스포트 선언 필수
export const dynamic = "force-static";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchItinerary, type ItineraryRow } from "@/lib/supabase";
import { queryAffiliateLinks, buildAffiliateMap } from "@/lib/affiliates/affiliate-loader";
import type { AffiliateDisplayMap } from "@/lib/affiliates/types";
import AffiliateInlineSection from "@/components/AffiliateInlineSection";
import KoreaReadySection from "@/components/KoreaReadySection";

// ── 로컬 타입 (itinerary/page.tsx 와 동일 구조) ──────────────────────────────
interface Place {
  name:         string;
  category:     string;
  location:     string;
  time:         string;
  duration:     string;
  tips:         string;
  googleMapsUrl:string;
  slot?:        string;
}

interface Day {
  date:      string;
  dayNumber: number;
  places:    Place[];
}

// ── 유틸: 클론 URL 빌더 ──────────────────────────────────────────────────────
// 공유된 일정의 날짜·스타일을 홈페이지 플래너에 pre-fill하는 URL 생성
const STYLE_MAP: Record<string, string> = {
  solo: "Solo", couple: "Couple", family: "Family", group: "Group",
};

function buildCloneUrl(trip: ItineraryRow): string {
  const cityFormatted = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
  const params = new URLSearchParams({
    city:  cityFormatted,
    from:  trip.start_date,
    to:    trip.end_date,
    style: STYLE_MAP[trip.travel_style?.toLowerCase()] ?? "Solo",
    ref:   "clone",
  });
  return `/?${params.toString()}`;
}

const KR_CITIES = ["seoul", "busan", "jeju", "gyeongju"] as const;
type KRCity = typeof KR_CITIES[number];
function toKRCity(c: string): KRCity | null {
  const lower = c.toLowerCase();
  return (KR_CITIES as readonly string[]).includes(lower) ? (lower as KRCity) : null;
}

// ── 유틸: share_id 추출 ───────────────────────────────────────────────────────
// 우선순위: pathname (/shared/UUID) → query string (?id=UUID)
function extractShareId(): string | null {
  if (typeof window === "undefined") return null;
  const pathParts = window.location.pathname.split("/shared/");
  const pathId    = pathParts.length > 1 ? (pathParts[1] ?? "").replace(/\/$/, "") : "";
  if (pathId) return pathId;
  return new URLSearchParams(window.location.search).get("id");
}

// ── 여행 스타일 한글 매핑 ─────────────────────────────────────────────────────
const STYLE_LABEL: Record<string, string> = {
  solo:   "솔로 FIT",
  couple: "커플 여행",
  family: "가족 여행",
  group:  "그룹 여행",
};

function styleLabel(raw: string): string {
  return STYLE_LABEL[raw.toLowerCase()] ?? raw;
}

// ── 카테고리 이모지 ───────────────────────────────────────────────────────────
const CATEGORY_EMOJI: Record<string, string> = {
  restaurant:  "🍽️",
  food:        "🍜",
  attraction:  "🗺️",
  nature:      "🌿",
  culture:     "🏛️",
  shopping:    "🛍️",
  hotel:       "🏨",
  transport:   "🚌",
  cafe:        "☕",
  nightlife:   "🌙",
  activity:    "🎯",
};

function placeEmoji(category: string): string {
  return CATEGORY_EMOJI[category?.toLowerCase()] ?? "📍";
}

// ══════════════════════════════════════════════════════════════════════════════

type Status = "loading" | "found" | "not_found" | "error";

export default function SharedTripPage() {
  const [status,        setStatus]        = useState<Status>("loading");
  const [trip,          setTrip]          = useState<ItineraryRow | null>(null);
  const [days,          setDays]          = useState<Day[]>([]);
  const [affiliateMap,  setAffiliateMap]  = useState<AffiliateDisplayMap>({});
  const [helpfulVoted,  setHelpfulVoted]  = useState(false);
  const [helpfulCount,  setHelpfulCount]  = useState(0);

  useEffect(() => {
    // ── window 가드 (SSR/빌드타임 안전) ──────────────────────────────────────
    if (typeof window === "undefined") return;

    const shareId = extractShareId();
    if (!shareId) { setStatus("not_found"); return; }

    // ── Supabase 조회 파이프라인 ───────────────────────────────────────────────
    // fetchItinerary without deviceId = public read (anon SELECT on itineraries)
    fetchItinerary(shareId).then(async (record) => {
      if (!record) { setStatus("not_found"); return; }

      setTrip(record);
      setHelpfulCount(record.helpful_count ?? 0);

      // days JSONB → Day[] 캐스팅
      const parsedDays = Array.isArray(record.days)
        ? (record.days as unknown as Day[])
        : [];
      setDays(parsedDays);

      // ── document.title 오버라이드 (Phase 1 OG 대응) ─────────────────────────
      const cityCap = record.city.charAt(0).toUpperCase() + record.city.slice(1);
      document.title = `${cityCap} ${parsedDays.length}일 여행 일정 — gokoreamate.com`;

      setStatus("found");

      // ── 제휴 링크 인젝션 파이프라인 ────────────────────────────────────────
      const locale = navigator.language.split("-")[0].toLowerCase();
      const rows   = await queryAffiliateLinks(record.city);
      setAffiliateMap(buildAffiliateMap(rows, locale));
    }).catch(() => setStatus("error"));
  }, []);

  // ── TASK-030: 뷰 카운터 RPC — 화면 렌더 후 백그라운드 비동기 호출 ──────────
  // Edge Function 병목 없음. sessionStorage로 동일 세션 중복 카운트 차단.
  useEffect(() => {
    if (!trip?.id) return;
    const key = `viewed_${trip.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const url  = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/increment_trip_view`;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:         anon,
        Authorization:  `Bearer ${anon}`,
      },
      body: JSON.stringify({ trip_id_param: trip.id }),
    }).catch(() => { /* silent — 카운터 실패가 UX에 영향 없음 */ });
  }, [trip?.id]);

  // ── TASK-034: sessionStorage dedup — 이미 투표한 경우 버튼 비활성화 ─────────
  useEffect(() => {
    if (!trip?.id) return;
    if (sessionStorage.getItem(`helped_${trip.id}`)) setHelpfulVoted(true);
  }, [trip?.id]);

  // ── TASK-034: Helpful Vote 핸들러 ────────────────────────────────────────
  function handleHelpfulVote() {
    if (!trip?.id || helpfulVoted) return;
    const key = `helped_${trip.id}`;
    sessionStorage.setItem(key, "1");
    setHelpfulVoted(true);
    setHelpfulCount((c) => c + 1);
    const url  = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/increment_trip_helpful`;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
      body:    JSON.stringify({ trip_id_param: trip.id }),
    }).catch(() => { /* silent */ });
  }

  // ── 로딩 상태 ─────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "#FAF7F2" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
          />
          <p className="text-sm font-bold text-[#8C6239]">여행 일정을 불러오는 중…</p>
          <Link href="/" className="text-xs text-[#B8A89A] hover:text-[#8C6239] transition-colors">
            gokoreamate.com
          </Link>
        </div>
      </div>
    );
  }

  // ── 404 / 에러 상태 ──────────────────────────────────────────────────────
  if (status === "not_found" || status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: "#FAF7F2" }}>
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🗺️</div>
          <h1 className="text-2xl font-black text-[#2C2520] mb-3">일정을 찾을 수 없어요</h1>
          <p className="text-sm text-[#61554D] leading-relaxed mb-6">
            링크가 만료되었거나 존재하지 않는 일정입니다.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all hover:opacity-90"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ 내 여행 계획하기
          </Link>
          <p className="text-xs text-[#B8A89A] mt-4">gokoreamate.com</p>
        </div>
      </div>
    );
  }

  // ── 정상 렌더 ─────────────────────────────────────────────────────────────
  if (!trip) return null;

  const cityCap    = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
  const totalSpots = days.reduce((sum, d) => sum + d.places.length, 0);
  const hasAffiliate = Object.keys(affiliateMap).length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF7F2" }}>

      {/* ── 히어로 헤더 ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden py-12 px-4"
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}
      >
        {/* 배경 글로우 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 70%, rgba(212,175,55,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.10) 0%, transparent 45%)",
          }}
        />

        <div className="relative max-w-2xl mx-auto text-center">
          {/* 공유 배지 */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/50 border border-white/15 mb-6 tracking-widest uppercase">
            🎴 공유된 여행 일정
          </span>

          {/* 도시명 */}
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-2">
            {cityCap} 여행
          </h1>

          {/* 날짜 */}
          <p className="text-base text-white/55 mb-6">
            {trip.start_date} ~ {trip.end_date}
          </p>

          {/* 스탯 칩 */}
          <div className="flex items-center justify-center gap-3 flex-wrap mb-8">
            {[
              { label: `${days.length} Days` },
              { label: `${totalSpots} Spots` },
              { label: styleLabel(trip.travel_style) },
            ].map((chip) => (
              <span
                key={chip.label}
                className="px-4 py-1.5 rounded-full text-xs font-black text-white/70"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(212,175,55,0.22)" }}
              >
                {chip.label}
              </span>
            ))}
          </div>

          {/* TASK-034: 이중 소셜 프루프 + Helpful Vote 버튼 */}
          <div className="mb-6 flex flex-col items-center gap-3">
            {/* 뷰 + 도움 카운터 */}
            {(trip.view_count ?? 0) >= 2 && (
              <div className="flex items-center gap-3 text-sm font-semibold flex-wrap justify-center">
                <span className="text-amber-400">🔥 {trip.view_count} views</span>
                {helpfulCount >= 1 && (
                  <span className="text-emerald-400">👍 {helpfulCount} found this helpful</span>
                )}
              </div>
            )}

            {/* Helpful Vote 버튼 */}
            <button
              onClick={handleHelpfulVote}
              disabled={helpfulVoted}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 ${
                helpfulVoted
                  ? "text-emerald-300 border border-emerald-400/40 cursor-default"
                  : "text-white/80 border border-white/25 hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"
              }`}
            >
              {helpfulVoted ? "✅ 도움됐다고 표시했어요!" : "👍 이 일정이 도움됐나요?"}
            </button>
          </div>

          {/* 골드 디바이더 */}
          <div className="w-24 h-[1.5px] mx-auto" style={{ background: "#D4AF37", opacity: 0.5 }} />
        </div>
      </div>

      {/* ── 메인 콘텐츠 ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* 상단 제휴 섹션 (데이터 로드 시) */}
        {hasAffiliate && (
          <div className="mb-8">
            <AffiliateInlineSection
              affiliateMap={affiliateMap}
              city={trip.city}
              placement="shared_trip_view"
            />
          </div>
        )}

        {/* Day별 일정 카드 */}
        {days.map((day, dayIdx) => (
          <div key={day.dayNumber ?? dayIdx}>
            {/* Day 헤더 */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                style={{ backgroundColor: "#1a1a2e" }}
              >
                {day.dayNumber ?? dayIdx + 1}
              </div>
              <div>
                <p className="text-base font-black text-[#2C2520]">
                  Day {day.dayNumber ?? dayIdx + 1}
                </p>
                <p className="text-xs text-[#8C6239]">{day.date}</p>
              </div>
            </div>

            {/* 장소 카드 목록 */}
            <div className="space-y-3 mb-6">
              {(day.places ?? []).map((place, placeIdx) => (
                <div
                  key={placeIdx}
                  className="bg-white rounded-2xl p-4 border border-[#E6DFD5] shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: "#F5EFE3" }}
                    >
                      {placeEmoji(place.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-[#2C2520] truncate">{place.name}</p>
                        <span className="text-xs font-bold text-[#8C6239] shrink-0">{place.time}</span>
                      </div>
                      <p className="text-xs text-[#9C8575] mt-0.5">{place.location}</p>
                      {place.tips && (
                        <p className="text-xs text-[#61554D] mt-1.5 leading-relaxed line-clamp-2">
                          {place.tips}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 지도 링크 */}
                  {place.googleMapsUrl && (
                    <a
                      href={place.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#8C6239] hover:text-[#D4AF37] transition-colors"
                    >
                      <span>📍</span>
                      <span>Google Maps</span>
                      <span className="text-[#D4AF37]">→</span>
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* 제휴 인젝터 — Day 2마다 삽입 */}
            {hasAffiliate && (dayIdx + 1) % 2 === 0 && dayIdx < days.length - 1 && (
              <div className="mb-8">
                <AffiliateInlineSection
                  affiliateMap={affiliateMap}
                  city={trip.city}
                  placement="shared_trip_view"
                  compact
                />
              </div>
            )}
          </div>
        ))}

        {/* ── 바이럴 CTA ────────────────────────────────────────────────────── */}
        <div
          className="rounded-3xl p-8 text-center mt-6 mb-8"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com
          </p>
          <h2 className="text-xl font-black text-white mb-2">
            나만의 {cityCap} 여행 계획하기
          </h2>
          <p className="text-sm text-white/55 leading-relaxed mb-6">
            AI가 30초 만에 이 스타일로 일정을 만들어 드립니다.<br />
            무료 · 회원가입 불필요 · 1탭 공유 가능
          </p>

          {/* Primary — contextual clone CTA (도시·날짜·스타일 pre-fill) */}
          <Link
            href={buildCloneUrl(trip)}
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            🗺️ 나만의 {cityCap} 여행 — 이 스타일로 계획하기 ⚡
          </Link>

          {/* Secondary — 처음부터 새 여행 */}
          <Link
            href="/"
            className="mt-3 inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-sm font-black border transition-all hover:bg-white/10 active:scale-95"
            style={{ color: "rgba(255,255,255,0.65)", borderColor: "rgba(212,175,55,0.35)" }}
          >
            ✨ 처음부터 계획하기 →
          </Link>
        </div>

        {/* ── 하단 제휴 섹션 ──────────────────────────────────────────────── */}
        {hasAffiliate && (
          <div className="mb-8">
            <AffiliateInlineSection
              affiliateMap={affiliateMap}
              city={trip.city}
              placement="shared_trip_view"
            />
          </div>
        )}

        {/* Korea Ready 정적 제휴 카드 — DB 시드 없이 항상 노출 */}
        {(() => { const krc = toKRCity(trip.city); return krc ? <KoreaReadySection city={krc} /> : null; })()}

        {/* 푸터 */}
        <p className="text-center text-xs text-[#B8A89A] pb-8 pt-6">
          이 일정은 gokoreamate.com의 AI 플래너로 생성되었습니다
        </p>
      </div>
    </div>
  );
}

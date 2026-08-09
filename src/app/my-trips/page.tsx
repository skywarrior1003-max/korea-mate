"use client";

// gokoreamate — My Trips Hub
// TASK-023: premium trip management hub with moments count + personality badge

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  apiFetchItinerariesByDevice,
  apiDeleteItinerary,
  apiSetPublic,
} from "@/lib/itinerary-api";
import type { ItineraryRow } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { getSavedEmail } from "@/lib/userEmail";
import { visitedStorageKey } from "@/lib/visited";
import EmailCaptureModal from "@/components/EmailCaptureModal";

// ── 도시 대표 이미지 ───────────────────────────────────────────────────────────
const CITY_IMAGES: Record<string, string> = {
  busan:    "https://images.unsplash.com/photo-1598965402089-897ce52e8355?w=800&q=70",
  seoul:    "https://images.unsplash.com/photo-1601042879364-f3947d3f9c16?w=800&q=70",
  gyeongju: "https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800&q=70",
  jeju:     "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800&q=70",
  incheon:  "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=70",
};
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=800&q=70";

function getCityImage(city: string): string {
  return CITY_IMAGES[city.toLowerCase()] ?? DEFAULT_IMAGE;
}

// ── 여행 퍼스낼리티 배지 ─────────────────────────────────────────────────────
function getPersonality(style: string): { emoji: string; label: string; color: string } {
  const s = style.toLowerCase();
  if (s.includes("food"))      return { emoji: "🍜", label: "Foodie",       color: "#FF4A2D" };
  if (s.includes("adventure")) return { emoji: "⚡", label: "Adventurer",   color: "#dc2626" };
  if (s.includes("couple"))    return { emoji: "💫", label: "Romantic",     color: "#db2777" };
  if (s.includes("family"))    return { emoji: "👨‍👩‍👧", label: "Family",       color: "#16a34a" };
  if (s.includes("culture"))   return { emoji: "🏛️", label: "Cultural",     color: "#7c3aed" };
  if (s.includes("solo"))      return { emoji: "🎒", label: "Solo",         color: "#0ea5e9" };
  return                              { emoji: "✨", label: "Explorer",     color: "#FF4A2D" };
}

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayCount(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

// ── 내부 Trip 모델 ────────────────────────────────────────────────────────────
interface Trip {
  id:          string;
  city:        string;
  startDate:   string;
  endDate:     string;
  travelers:   string;
  travelStyle: string;
  tripTitle:   string | null;
  updatedAt:   string;
  days:        number;
  isPublic:    boolean;
  copyCount:   number;   // 실측 누적값 — 낙관적 증가 없음
  helpfulCount:number;
}

function rowToTrip(r: ItineraryRow): Trip {
  const days = r.start_date && r.end_date ? dayCount(r.start_date, r.end_date) : 1;
  return {
    id:          r.id,
    city:        r.city || "Korea",
    startDate:   r.start_date ?? "",
    endDate:     r.end_date   ?? "",
    travelers:   r.travelers  ?? "1",
    travelStyle: r.travel_style ?? "Solo",
    tripTitle:   r.trip_title ?? null,
    updatedAt:   r.updated_at ?? "",
    days,
    isPublic:    r.is_public ?? false,
    copyCount:   r.copy_count ?? 0,
    helpfulCount:r.helpful_count ?? 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MyTripsPage() {
  const tStats = useTranslations("creatorStats");
  const [trips,          setTrips]          = useState<Trip[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [fetchError,     setFetchError]     = useState(false);
  const [deleting,       setDeleting]       = useState<string | null>(null);
  const [confirmDel,     setConfirmDel]     = useState<string | null>(null);
  const [copied,         setCopied]         = useState<string | null>(null);
  const [savedEmail,     setSavedEmail]     = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState<Set<string>>(new Set());

  useEffect(() => { setSavedEmail(getSavedEmail()); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiFetchItinerariesByDevice(getDeviceId()).then((itins) => {
      if (cancelled) return;
      const sorted = itins
        .map(rowToTrip)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setTrips(sorted);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLoading(false); setFetchError(true); } });

    return () => { cancelled = true; };
  }, []);

  const handleCopy = useCallback(async (trip: Trip) => {
    const url = `${window.location.origin}/itinerary?id=${trip.id}`;
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt("Copy this link:", url); }
    setCopied(trip.id);
    setTimeout(() => setCopied(null), 2500);
  }, []);

  const handleDelete = useCallback(async (trip: Trip) => {
    setDeleting(trip.id);
    setConfirmDel(null);
    setTrips(prev => prev.filter(t => t.id !== trip.id));
    const serverDeleted = await apiDeleteItinerary(trip.id, getDeviceId());
    // localStorage 캐시 키 일괄 제거
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("koreamate_itin") || k === `koreamate_moments_${trip.id}`)) {
          toRemove.push(k);
        }
      }
      // Visited 는 이 여행에서만 의미가 있는 기록이라 여행이 사라지면 같이 지운다.
      // 서버 삭제가 성공했을 때만 지운다 — 실패하면 여행이 그대로 남아 있고,
      // 그때 Visited 만 날리면 사용자가 직접 찍은 기록을 이유 없이 잃는다.
      if (serverDeleted) toRemove.push(visitedStorageKey(trip.id));
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setDeleting(null);
  }, []);

  const handleTogglePublic = useCallback(async (trip: Trip) => {
    if (togglingPublic.has(trip.id)) return;
    const next = !trip.isPublic;
    setTogglingPublic(prev => { const s = new Set(prev); s.add(trip.id); return s; });
    setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, isPublic: next } : t));
    const ok = await apiSetPublic(trip.id, next, getDeviceId());
    if (!ok) setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, isPublic: !next } : t));
    setTogglingPublic(prev => { const s = new Set(prev); s.delete(trip.id); return s; });
  }, [togglingPublic]);

  const cityCap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

  // 최종 디자인의 두 단(Current & Upcoming / Memory Archive) 구분.
  // 기준은 실제 종료일 하나뿐이다 — 진행률·완료 신호 같은 추정값을 쓰지 않는다.
  const today = new Date().toISOString().slice(0, 10);
  const SECTIONS = [
    {
      key: "upcoming",
      title: "Current & Upcoming",
      hint: "Trips you are on or about to take",
      trips: trips.filter(t => !t.endDate || t.endDate >= today),
    },
    {
      key: "archive",
      title: "Memory Archive",
      hint: "Finished trips — itinerary, visits and memories stay together",
      trips: trips.filter(t => t.endDate && t.endDate < today),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F6F7F8" }}>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-40 border-b border-[#E5E7EA] backdrop-blur-md" style={{ backgroundColor: "rgba(250,247,242,0.92)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-normal tracking-tight text-[#191C21] flex items-center gap-1.5">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-bold text-[#565D66] hover:text-[#191C21] transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">

        {/* ── 페이지 타이틀 ── */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-[#191C21] mb-2 tracking-tight">My Trips</h1>
          <p className="text-[#565D66] font-medium leading-relaxed max-w-md">
            Manage your journey and revisit the memories you&apos;ve made across Korea.
          </p>
        </div>

        {/* ── 통계 요약 칩 ── */}
        {!loading && trips.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-8">
            {[
              // Memory 개수는 여기에 두지 않는다. Memory SSOT 는 localStorage 1차 +
              // 서버 동기화라, 이 화면이 아는 값은 이 기기가 본 것뿐이다. 그 부분합을
              // 전체 개수처럼 적으면 다른 기기에서 남긴 기록이 없는 것처럼 읽힌다.
              { emoji: "✈️", label: `${trips.length} trips` },
              { emoji: "📍", label: `${trips.reduce((s, t) => s + t.days, 0)} days` },
            ].filter(Boolean).map((chip) => (
              <div
                key={chip!.label}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black border border-[#E5E7EA] bg-white"
                style={{ color: "#191C21" }}
              >
                <span>{chip!.emoji}</span>
                <span>{chip!.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── 이메일 연동 배너 ── */}
        {savedEmail ? (
          <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-emerald-200 bg-emerald-50">
            <span className="text-lg">☁️</span>
            <p className="text-sm font-bold text-emerald-800 flex-1">
              Saved to cloud as <strong>{savedEmail}</strong> — access from any device
            </p>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-[#E5E7EA] bg-white shadow-sm">
            <span className="text-lg">📧</span>
            <p className="text-sm font-bold text-[#565D66] flex-1">
              Connect your email to access trips on any device
            </p>
            <button
              onClick={() => setEmailModalOpen(true)}
              className="shrink-0 px-4 py-2 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              Connect
            </button>
          </div>
        )}

        {/* ── 로딩 ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FF4A2D]" />
            <p className="text-sm font-bold text-[#565D66]">Loading your trips…</p>
          </div>
        )}

        {/* ── 에러 상태 ── */}
        {!loading && fetchError && (
          <div className="flex flex-col items-center justify-center py-28 gap-6 text-center">
            <div className="w-24 h-24 rounded-3xl bg-red-50 flex items-center justify-center text-5xl">⚠️</div>
            <div>
              <p className="text-2xl font-black text-[#191C21] mb-2">Could not load trips</p>
              <p className="text-[#565D66] max-w-sm leading-relaxed">
                Check your connection and try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-4 rounded-2xl text-base font-black text-white transition-all active:scale-95 shadow-lg"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && !fetchError && trips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-6 text-center">
            <div className="w-24 h-24 rounded-3xl bg-[#F6F7F8] flex items-center justify-center text-5xl">✈️</div>
            <div>
              <p className="text-2xl font-black text-[#191C21] mb-2">No trips yet</p>
              <p className="text-[#565D66] max-w-sm leading-relaxed">
                Trips are saved here automatically after AI generation.<br/>Plan your first Korea adventure now!
              </p>
            </div>
            <Link
              href="/"
              className="px-8 py-4 rounded-2xl text-base font-black text-white transition-all active:scale-95 shadow-lg"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              🗺️ Start Planning
            </Link>
          </div>
        )}

        {/* ── 여행 카드 — 최종 디자인의 두 단 구성 ──
              빈 단은 제목째로 내리지 않는다. 첫 여행 하나를 만든 사람에게
              "Memory Archive: 비어 있음"을 보여줄 이유가 없다. */}
        {!loading && SECTIONS.map(section => section.trips.length === 0 ? null : (
          <section key={section.key} className="mb-10">
            <div className="mb-4">
              <h2 className="text-xl font-black text-[#191C21] tracking-tight">{section.title}</h2>
              <p className="text-xs text-[#565D66] font-medium mt-0.5">{section.hint}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {section.trips.map((trip, i) => {
              const personality = getPersonality(trip.travelStyle);
              const isDeleting  = deleting    === trip.id;
              const isConfirm   = confirmDel  === trip.id;
              const isCopied    = copied      === trip.id;
              const displayTitle = trip.tripTitle || `My ${cityCap(trip.city)} Trip`;
              const cityImg = getCityImage(trip.city);

              return (
                <div
                  key={trip.id}
                  className="bg-white rounded-3xl border border-[#E5E7EA] shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group"
                  style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.07}s both` }}
                >
                  {/* ── 도시 히어로 이미지 ── */}
                  {/* 최종 디자인은 사진이 카드의 주인공이다. 기존 h-44(약 2:1)는
                      도시 사진이 띠처럼 잘려 표지로 읽히지 않았다. */}
                  <Link href={`/itinerary?id=${trip.id}`} className="block relative aspect-[4/3] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cityImg}
                      alt={trip.city}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                    {/* 퍼스낼리티 배지 */}
                    <div className="absolute top-3 left-3">
                      <span
                        className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
                        style={{ backgroundColor: personality.color }}
                      >
                        {personality.emoji} {personality.label}
                      </span>
                    </div>

                    {/* 업데이트 시간 */}
                    <div className="absolute top-3 right-3">
                      <span className="text-[10px] font-bold bg-black/50 text-white px-2 py-1 rounded-lg backdrop-blur-sm">
                        {timeAgo(trip.updatedAt)}
                      </span>
                    </div>

                    {/* 도시명 + 날짜 */}
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="text-lg font-black text-white leading-tight">{displayTitle}</h3>
                      <p className="text-xs text-white/70 font-medium mt-0.5">
                        {trip.startDate} → {trip.endDate}
                      </p>
                    </div>
                  </Link>

                  {/* ── 메타 칩 ── */}
                  <div className="px-4 pt-3.5 pb-0 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-black bg-[#F6F7F8] text-[#565D66] px-2.5 py-1 rounded-md">
                      📅 {trip.days}d
                    </span>
                    <span className="text-[10px] font-black bg-[#F6F7F8] text-[#565D66] px-2.5 py-1 rounded-md">
                      👤 {trip.travelers} pax
                    </span>
                    {/* Memory 진입 — 개수는 적지 않는다. 이 기기가 본 로컬 캐시만
                        세는 값이라 "3 memories"라고 쓰면 다른 기기에서 남긴 기록이
                        없는 것처럼 읽힌다. Memory 는 같은 Trip 안에 있으므로 별도
                        화면이 아니라 그 Trip 의 Memory 영역으로 보낸다. */}
                    <Link
                      href={`/itinerary?id=${trip.id}#memories`}
                      className="text-[10px] font-black px-2.5 py-1 rounded-md text-white transition-opacity hover:opacity-85"
                      style={{ backgroundColor: "#1a1a2e" }}
                    >
                      📸 Memories
                    </Link>
                    {/* 원작자 성과 — 실측 누적값만. 둘 다 0이면 미노출 */}
                    {trip.copyCount > 0 && (
                      <span className="text-[10px] font-black bg-[#FFF0EC] text-[#FF4A2D] px-2.5 py-1 rounded-md">
                        📋 {tStats("copied", { n: trip.copyCount })}
                      </span>
                    )}
                    {trip.helpfulCount > 0 && (
                      <span className="text-[10px] font-black bg-[#E7F5EF] text-[#1D9A6C] px-2.5 py-1 rounded-md">
                        👍 {tStats("helpful", { n: trip.helpfulCount })}
                      </span>
                    )}
                    <button
                      onClick={() => handleTogglePublic(trip)}
                      disabled={togglingPublic.has(trip.id)}
                      className="text-[10px] font-black px-2.5 py-1 rounded-md border transition-all cursor-pointer disabled:opacity-50"
                      style={
                        trip.isPublic
                          ? { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }
                          : { backgroundColor: "#F6F7F8", borderColor: "#d1c4b0", color: "#565D66" }
                      }
                    >
                      {togglingPublic.has(trip.id) ? "…" : trip.isPublic ? "🌐 Public" : "🔒 Private"}
                    </button>
                  </div>

                  {/* ── 액션 버튼 ── */}
                  <div className="px-4 py-4 flex flex-col gap-2 mt-auto">
                    <Link
                      href={`/itinerary?id=${trip.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black text-white transition-all active:scale-95"
                      style={{ backgroundColor: "#191C21" }}
                    >
                      Open Itinerary →
                    </Link>

                    <div className="flex gap-2">
                      {/* 복사 */}
                      <button
                        onClick={() => handleCopy(trip)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer"
                        style={
                          isCopied
                            ? { backgroundColor: "#f0fdf4", borderColor: "#86efac", color: "#16a34a" }
                            : { backgroundColor: "#F6F7F8", borderColor: "#E5E7EA", color: "#565D66" }
                        }
                      >
                        {/* 이 버튼은 공유 링크를 클립보드에 담는다. 여행 자체를
                            복제하지 않는다 — "Copy Link"는 둘 다로 읽혔다. */}
                        {isCopied ? "✅ Link copied" : "🔗 Copy Share Link"}
                      </button>

                      {/* 삭제 */}
                      {isConfirm ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(trip)}
                            disabled={isDeleting}
                            className="px-3 py-2.5 rounded-xl text-xs font-black bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isDeleting ? "…" : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="px-3 py-2.5 rounded-xl text-xs font-bold bg-[#F6F7F8] text-[#565D66] hover:bg-[#E5E7EA] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(trip.id)}
                          className="px-3 py-2.5 rounded-xl text-xs font-bold border border-[#E5E7EA] text-[#565D66]/50 hover:border-red-200 hover:text-red-400 hover:bg-red-50 transition-all cursor-pointer"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </section>
        ))}

        {/* ── 새 여행 추가 카드 — 두 단 아래에 한 번만 둔다 ── */}
        {!loading && trips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Link
              href="/"
              className="rounded-3xl border-2 border-dashed border-[#E5E7EA] flex flex-col items-center justify-center gap-3 py-16 text-center hover:border-[#FF4A2D] transition-colors group"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#F6F7F8] flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                ＋
              </div>
              <div>
                <p className="text-sm font-black text-[#191C21]">New Trip Plan</p>
                <p className="text-xs text-[#565D66] mt-0.5">AI in 30 sec</p>
              </div>
            </Link>
          </div>
        )}

      </main>

      {/* ── 푸터 ── */}
      <footer className="mt-auto border-t border-[#E5E7EA] py-8 text-center text-sm text-[#565D66] px-4" style={{ backgroundColor: "#F6F7F8" }}>
        <p>© {new Date().getFullYear()} gokoreamate · Trip data stored on your device</p>
      </footer>

      <EmailCaptureModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        context="my-trips"
        onSuccess={(email) => { setSavedEmail(email); setEmailModalOpen(false); }}
      />

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

"use client";

// gokoreamate — My Trips Hub
// TASK-023: premium trip management hub with moments count + personality badge

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  apiFetchItinerariesByDevice,
  apiDeleteItinerary,
  apiSetPublic,
} from "@/lib/itinerary-api";
import type { ItineraryRow } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import { getSavedEmail } from "@/lib/userEmail";
import { loadMoments } from "@/lib/trip-moments";
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
  if (s.includes("food"))      return { emoji: "🍜", label: "Foodie",       color: "#f97316" };
  if (s.includes("adventure")) return { emoji: "⚡", label: "Adventurer",   color: "#dc2626" };
  if (s.includes("couple"))    return { emoji: "💫", label: "Romantic",     color: "#db2777" };
  if (s.includes("family"))    return { emoji: "👨‍👩‍👧", label: "Family",       color: "#16a34a" };
  if (s.includes("culture"))   return { emoji: "🏛️", label: "Cultural",     color: "#7c3aed" };
  if (s.includes("solo"))      return { emoji: "🎒", label: "Solo",         color: "#0ea5e9" };
  return                              { emoji: "✨", label: "Explorer",     color: "#D4AF37" };
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
  moments:     number;
  isPublic:    boolean;
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
    moments:     0,
    isPublic:    r.is_public ?? false,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MyTripsPage() {
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
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map(t => ({ ...t, moments: loadMoments(t.id).length }));
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
    await apiDeleteItinerary(trip.id, getDeviceId());
    // localStorage 캐시 키 일괄 제거
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("koreamate_itin") || k === `koreamate_moments_${trip.id}`)) {
          toRemove.push(k);
        }
      }
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

  const totalMoments = trips.reduce((s, t) => s + t.moments, 0);
  const cityCap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF7F2" }}>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-40 border-b border-[#E6DFD5] backdrop-blur-md" style={{ backgroundColor: "rgba(250,247,242,0.92)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
            <span className="text-[#D4AF37] text-3xl">🇰🇷</span>
            go<span className="font-extrabold">korea</span>mate
          </Link>
          <Link
            href="/"
            className="text-sm font-bold text-[#8C6239] hover:text-[#2C2520] transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">

        {/* ── 페이지 타이틀 ── */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-[#2C2520] mb-2">My Trips</h1>
          <p className="text-[#8C6239] font-medium">
            AI-generated Korea itineraries · memories · sharing
          </p>
        </div>

        {/* ── 통계 요약 칩 ── */}
        {!loading && trips.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-8">
            {[
              { emoji: "✈️", label: `${trips.length} trips` },
              { emoji: "📍", label: `${trips.reduce((s, t) => s + t.days, 0)} days` },
              totalMoments > 0 ? { emoji: "📸", label: `${totalMoments} moments` } : null,
            ].filter(Boolean).map((chip) => (
              <div
                key={chip!.label}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black border border-[#E6DFD5] bg-white"
                style={{ color: "#2C2520" }}
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
          <div className="mb-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-[#E6DFD5] bg-white shadow-sm">
            <span className="text-lg">📧</span>
            <p className="text-sm font-bold text-[#61554D] flex-1">
              Connect your email to access trips on any device
            </p>
            <button
              onClick={() => setEmailModalOpen(true)}
              className="shrink-0 px-4 py-2 rounded-xl text-xs font-black text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#D4AF37" }}
            >
              Connect
            </button>
          </div>
        )}

        {/* ── 로딩 ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#D4AF37]" />
            <p className="text-sm font-bold text-[#8C6239]">Loading your trips…</p>
          </div>
        )}

        {/* ── 에러 상태 ── */}
        {!loading && fetchError && (
          <div className="flex flex-col items-center justify-center py-28 gap-6 text-center">
            <div className="w-24 h-24 rounded-3xl bg-red-50 flex items-center justify-center text-5xl">⚠️</div>
            <div>
              <p className="text-2xl font-black text-[#2C2520] mb-2">Could not load trips</p>
              <p className="text-[#8C6239] max-w-sm leading-relaxed">
                Check your connection and try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-4 rounded-2xl text-base font-black text-white transition-all active:scale-95 shadow-lg"
              style={{ backgroundColor: "#D4AF37" }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && !fetchError && trips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-6 text-center">
            <div className="w-24 h-24 rounded-3xl bg-[#EAE3D2] flex items-center justify-center text-5xl">✈️</div>
            <div>
              <p className="text-2xl font-black text-[#2C2520] mb-2">No trips yet</p>
              <p className="text-[#8C6239] max-w-sm leading-relaxed">
                Trips are saved here automatically after AI generation.<br/>Plan your first Korea adventure now!
              </p>
            </div>
            <Link
              href="/"
              className="px-8 py-4 rounded-2xl text-base font-black text-white transition-all active:scale-95 shadow-lg"
              style={{ backgroundColor: "#D4AF37" }}
            >
              🗺️ Start Planning
            </Link>
          </div>
        )}

        {/* ── 여행 카드 그리드 ── */}
        {!loading && trips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip, i) => {
              const personality = getPersonality(trip.travelStyle);
              const isDeleting  = deleting    === trip.id;
              const isConfirm   = confirmDel  === trip.id;
              const isCopied    = copied      === trip.id;
              const displayTitle = trip.tripTitle || `My ${cityCap(trip.city)} Trip`;
              const cityImg = getCityImage(trip.city);

              return (
                <div
                  key={trip.id}
                  className="bg-white rounded-3xl border border-[#E6DFD5] shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group"
                  style={{ animation: `fadeInUp 0.3s ease-out ${i * 0.07}s both` }}
                >
                  {/* ── 도시 히어로 이미지 ── */}
                  <Link href={`/itinerary?id=${trip.id}`} className="block relative h-44 overflow-hidden">
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
                    <span className="text-[10px] font-black bg-[#EAE3D2] text-[#8C6239] px-2.5 py-1 rounded-md">
                      📅 {trip.days}d
                    </span>
                    <span className="text-[10px] font-black bg-[#EAE3D2] text-[#8C6239] px-2.5 py-1 rounded-md">
                      👤 {trip.travelers} pax
                    </span>
                    {trip.moments > 0 && (
                      <span
                        className="text-[10px] font-black px-2.5 py-1 rounded-md text-white"
                        style={{ backgroundColor: "#1a1a2e" }}
                      >
                        📸 {trip.moments} moments
                      </span>
                    )}
                    <button
                      onClick={() => handleTogglePublic(trip)}
                      disabled={togglingPublic.has(trip.id)}
                      className="text-[10px] font-black px-2.5 py-1 rounded-md border transition-all cursor-pointer disabled:opacity-50"
                      style={
                        trip.isPublic
                          ? { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }
                          : { backgroundColor: "#EAE3D2", borderColor: "#d1c4b0", color: "#8C6239" }
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
                      style={{ backgroundColor: "#2C2520" }}
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
                            : { backgroundColor: "#FAF7F2", borderColor: "#E6DFD5", color: "#8C6239" }
                        }
                      >
                        {isCopied ? "✅ Copied" : "🔗 Copy Link"}
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
                            className="px-3 py-2.5 rounded-xl text-xs font-bold bg-[#EAE3D2] text-[#8C6239] hover:bg-[#E6DFD5] transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(trip.id)}
                          className="px-3 py-2.5 rounded-xl text-xs font-bold border border-[#E6DFD5] text-[#8C6239]/50 hover:border-red-200 hover:text-red-400 hover:bg-red-50 transition-all cursor-pointer"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── 새 여행 추가 카드 ── */}
            <Link
              href="/"
              className="rounded-3xl border-2 border-dashed border-[#E6DFD5] flex flex-col items-center justify-center gap-3 py-16 text-center hover:border-[#D4AF37] transition-colors group"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#EAE3D2] flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                ＋
              </div>
              <div>
                <p className="text-sm font-black text-[#2C2520]">New Trip Plan</p>
                <p className="text-xs text-[#8C6239] mt-0.5">AI in 30 sec</p>
              </div>
            </Link>
          </div>
        )}

      </main>

      {/* ── 푸터 ── */}
      <footer className="mt-auto border-t border-[#E6DFD5] py-8 text-center text-sm text-[#8C6239] px-4" style={{ backgroundColor: "#FAF7F2" }}>
        <p>© {new Date().getFullYear()} KoreaMate · Trip data stored on your device</p>
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

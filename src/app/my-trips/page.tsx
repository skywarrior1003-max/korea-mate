"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  fetchItinerariesByDevice,
  deleteItinerary,
  type ItineraryRow,
} from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

// ── 날짜 상대 표시 ─────────────────────────────────────────────
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

interface TripCard {
  id:        string;
  title:     string;
  subtitle:  string;
  meta:      string;
  updatedAt: string;
}

function itineraryToCard(r: ItineraryRow): TripCard {
  const days = (r.start_date && r.end_date) ? dayCount(r.start_date, r.end_date) : 0;
  return {
    id:       r.id,
    title:    r.city || "Korea Trip",
    subtitle: r.start_date && r.end_date ? `${r.start_date} → ${r.end_date}` : "No dates",
    meta:     [
      days > 0 ? `${days} days` : null,
      r.travelers && r.travelers !== "1" ? `${r.travelers} travelers` : "Solo",
      r.travel_style,
    ].filter(Boolean).join(" · "),
    updatedAt: r.updated_at ?? "",
  };
}

// ══════════════════════════════════════════════════════════════
export default function MyTripsPage() {
  const [trips,      setTrips]      = useState<TripCard[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [copied,     setCopied]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrips([]);
    setLoading(true);

    const deviceId = getDeviceId();
    fetchItinerariesByDevice(deviceId).then((itins) => {
      if (cancelled) return;
      const cards = itins
        .map(itineraryToCard)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setTrips(cards);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  async function handleCopy(trip: TripCard) {
    const url = `${window.location.origin}/itinerary?id=${trip.id}`;
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt("Copy this link:", url); }
    setCopied(trip.id);
    setTimeout(() => setCopied(null), 2500);
  }

  async function handleDelete(trip: TripCard) {
    setDeleting(trip.id);
    setConfirmDel(null);
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));
    const deviceId = getDeviceId();
    await deleteItinerary(trip.id, deviceId);
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("koreamate_itin_id_") || k.startsWith("koreamate_itin3_id_"))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setDeleting(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5 shrink-0">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <h1 className="text-base font-black text-gray-800">My Trips</h1>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10">

        <div className="mb-8">
          <h2 className="text-3xl font-black text-gray-900 mb-1">✈️ My Trips</h2>
          <p className="text-sm text-gray-500 font-medium">Cloud-saved AI itineraries for this device.</p>
        </div>

        {/* ── 로딩 ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-orange-500" />
            <p className="text-sm font-semibold text-gray-500">Loading your trips from cloud…</p>
          </div>
        )}

        {/* ── 비어있음 ── */}
        {!loading && trips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <span className="text-6xl">✈️</span>
            <div>
              <p className="text-xl font-black text-gray-800 mb-2">No trips yet</p>
              <p className="text-sm text-gray-500 max-w-sm">
                Use the AI planner on the home page to generate your first itinerary.
              </p>
            </div>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan a Trip
            </Link>
          </div>
        )}

        {/* ── 카드 그리드 ── */}
        {!loading && trips.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trips.map((trip) => {
              const isDeleting = deleting === trip.id;
              const isConfirm  = confirmDel === trip.id;
              const isCopied   = copied === trip.id;

              return (
                <div
                  key={trip.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden"
                >
                  {/* 카드 헤더 */}
                  <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span
                        className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: "#FFF3E0", color: "#f97316" }}
                      >
                        🤖 AI Trip
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium shrink-0 mt-0.5">
                        {timeAgo(trip.updatedAt)}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight mb-1">🗺️ {trip.title}</h3>
                    <p className="text-sm font-semibold text-gray-500 mb-1">{trip.subtitle}</p>
                    <p className="text-xs text-gray-400">{trip.meta}</p>
                  </div>

                  {/* 카드 액션 */}
                  <div className="px-5 py-4 flex flex-col gap-2 mt-auto">
                    <Link
                      href={`/itinerary?id=${trip.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 active:scale-95"
                      style={{ backgroundColor: "#1a1f36" }}
                    >
                      Open Trip →
                    </Link>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(trip)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                        style={
                          isCopied
                            ? { backgroundColor: "#f0fdf4", borderColor: "#86efac", color: "#16a34a" }
                            : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#6b7280" }
                        }
                      >
                        {isCopied ? "✅ Copied!" : "🔗 Copy Link"}
                      </button>

                      {isConfirm ? (
                        <div className="flex gap-1 flex-1">
                          <button
                            onClick={() => handleDelete(trip)}
                            disabled={isDeleting}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-black bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {isDeleting ? "…" : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDel(trip.id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all"
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
        )}
      </main>

      {/* ── 푸터 ── */}
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        <Link href="/" className="text-orange-500 font-bold hover:underline">← Back to KoreaMate Home</Link>
        <span className="mx-3">·</span>
        <span>Trips are stored by device. Clearing browser data will remove local access.</span>
      </footer>
    </div>
  );
}

"use client";

// gokoreamate — Admin: User Spot Submissions
// 사용자 장소 공개 신청 검토 (pending → approved / rejected)
// Admin key: sessionStorage "km_admin_key" (tab-lifetime only)
// 승인 후 city_spots 자동 반영 없음 — 별도 작업으로 처리

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const SESSION_KEY = "km_admin_key";

interface PendingSpot {
  id:           string;
  name:         string;
  city?:        string;
  address?:     string;
  category?:    string;
  note?:        string;
  submitted_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminUserSpotsPage() {
  const [pw,       setPw]       = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null
  );
  const [pwError,  setPwError]  = useState("");
  const [checking, setChecking] = useState(false);

  const [spots,      setSpots]      = useState<PendingSpot[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reviewing,  setReviewing]  = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/user-spots", {
        headers: { "x-admin-key": key },
      });
      if (res.status === 503) {
        setFetchError("ADMIN_KEY not configured on server.");
        return;
      }
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpots(await res.json() as PendingSpot[]);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) { void load(adminKey); }
  }, [adminKey, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = pw.trim();
    if (!key || checking) return;
    setChecking(true);
    setPwError("");
    try {
      const res = await fetch("/api/admin/user-spots", {
        headers: { "x-admin-key": key },
      });
      if (res.status === 503) { setPwError("Admin key not configured on server."); return; }
      if (res.status === 401) { setPwError("Invalid admin key."); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sessionStorage.setItem(SESSION_KEY, key);
      setAdminKey(key);
      setSpots(await res.json() as PendingSpot[]);
    } catch {
      setPwError("Could not verify key.");
    } finally {
      setChecking(false);
    }
  }

  async function handleReview(spot: PendingSpot, status: "approved" | "rejected") {
    if (!adminKey || reviewing) return;
    setReviewing(spot.id);
    try {
      const res = await fetch("/api/admin/user-spots", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body:    JSON.stringify({ id: spot.id, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpots(prev => prev.filter(s => s.id !== spot.id));
    } catch {
      // silent — spot stays in list for retry
    } finally {
      setReviewing(null);
    }
  }

  // ── Login screen ─────────────────────────────────────────────────────────────
  if (!adminKey) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <form
          onSubmit={(e) => void handleLogin(e)}
          className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-8 w-full max-w-sm"
        >
          <h1 className="text-white font-black text-xl mb-2">User Spot Submissions</h1>
          <p className="text-gray-500 text-xs mb-6">Admin review queue</p>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Admin key"
            autoComplete="current-password"
            className="w-full bg-[#111] border border-gray-600 rounded-xl px-4 py-3 text-white text-sm mb-3 focus:outline-none focus:border-[#D4AF37]"
          />
          {pwError && <p className="text-red-400 text-xs mb-3">{pwError}</p>}
          <button
            type="submit"
            disabled={checking}
            className="w-full py-3 rounded-xl text-sm font-black text-[#1a1a1a] disabled:opacity-60 transition-opacity cursor-pointer"
            style={{ backgroundColor: "#D4AF37" }}
          >
            {checking ? "Verifying…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black">User Spot Submissions</h1>
            <p className="text-gray-400 text-sm mt-1">Pending public listing requests</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/korea-mate-admin" className="text-xs text-gray-400 hover:text-white transition-colors">
              ← Admin Home
            </Link>
            <button
              onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAdminKey(null); }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="animate-spin h-4 w-4 border-b-2 border-[#D4AF37] rounded-full" />
            Loading…
          </div>
        )}
        {fetchError && <p className="text-red-400 text-sm">{fetchError}</p>}

        {!loading && !fetchError && spots.length === 0 && (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">✅</p>
            <p className="text-gray-400 font-bold">No pending submissions</p>
          </div>
        )}

        {/* Spot list */}
        <div className="space-y-4">
          {spots.map(spot => {
            const isReviewing = reviewing === spot.id;
            return (
              <div
                key={spot.id}
                className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-5"
              >
                <div className="flex items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-lg leading-tight">{spot.name}</span>
                      {spot.category && (
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded capitalize">
                          {spot.category}
                        </span>
                      )}
                      {spot.city && (
                        <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded">
                          {spot.city}
                        </span>
                      )}
                    </div>
                    {spot.address && (
                      <p className="text-gray-400 text-sm">{spot.address}</p>
                    )}
                    {spot.note && (
                      <p className="text-gray-500 text-xs mt-1 italic line-clamp-2">{spot.note}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-2">
                      Submitted {formatDate(spot.submitted_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void handleReview(spot, "approved")}
                      disabled={isReviewing}
                      className="px-4 py-2 rounded-xl text-sm font-black bg-green-700 hover:bg-green-600 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isReviewing ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => void handleReview(spot, "rejected")}
                      disabled={isReviewing}
                      className="px-4 py-2 rounded-xl text-sm font-black bg-red-800 hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isReviewing ? "…" : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

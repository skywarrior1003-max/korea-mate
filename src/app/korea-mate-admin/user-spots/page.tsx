"use client";

// gokoreamate — Admin: User Spot Submissions
// pending → [승인/반려] / approved 미게시 → [게시 미리보기] / approved 게시 → Published 배지
// Admin key: sessionStorage "km_admin_key" (tab-lifetime only)

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

const SESSION_KEY = "km_admin_key";

const OVERRIDE_FIELDS = [
  "name", "city", "category", "subcategory",
  "address", "description", "image_url", "district", "lat", "lng",
] as const;
type OverrideField = typeof OVERRIDE_FIELDS[number];
type Overrides = Record<OverrideField, string>;

interface AdminSpot {
  id:                string;
  name:              string;
  city?:             string;
  address?:          string;
  category?:         string;
  note?:             string;
  submitted_at:      string;
  photo_url?:        string | null;
  lat?:              number | null;
  lng?:              number | null;
  city_spot_id?:     number | null;
  published_at?:     string | null;
  submission_status: "pending" | "approved";
}

interface DuplicateCandidate {
  id:          number;
  city:        string;
  name:        string;
  address?:    string | null;
  source_type: string;
}

interface PreviewData {
  spot: Record<string, unknown>;
  duplicateCandidates: {
    byName:     DuplicateCandidate[];
    byLocation: DuplicateCandidate[];
  };
}

function emptyOverrides(): Overrides {
  return Object.fromEntries(OVERRIDE_FIELDS.map(f => [f, ""])) as Overrides;
}

function buildOverridesPayload(ov: Overrides): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const field of OVERRIDE_FIELDS) {
    const v = ov[field].trim();
    if (!v) continue;
    if (field === "lat" || field === "lng") {
      const n = parseFloat(v);
      if (!isNaN(n)) out[field] = n;
    } else {
      out[field] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
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

  const [spots,      setSpots]      = useState<AdminSpot[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reviewing,  setReviewing]  = useState<string | null>(null);

  const [previewId,      setPreviewId]      = useState<string | null>(null);
  const [previewData,    setPreviewData]    = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState<string | null>(null);
  const [overrides,      setOverrides]      = useState<Overrides>(emptyOverrides());
  const [publishing,     setPublishing]     = useState(false);
  const [publishError,   setPublishError]   = useState<string | null>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/user-spots", { headers: { "x-admin-key": key } });
      if (res.status === 503) { setFetchError("ADMIN_KEY not configured on server."); return; }
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpots(await res.json() as AdminSpot[]);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (adminKey) { void load(adminKey); } }, [adminKey, load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = pw.trim();
    if (!key || checking) return;
    setChecking(true);
    setPwError("");
    try {
      const res = await fetch("/api/admin/user-spots", { headers: { "x-admin-key": key } });
      if (res.status === 503) { setPwError("Admin key not configured on server."); return; }
      if (res.status === 401) { setPwError("Invalid admin key."); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sessionStorage.setItem(SESSION_KEY, key);
      setAdminKey(key);
      setSpots(await res.json() as AdminSpot[]);
    } catch {
      setPwError("Could not verify key.");
    } finally {
      setChecking(false);
    }
  }

  async function handleReview(spot: AdminSpot, status: "approved" | "rejected") {
    if (!adminKey || reviewing) return;
    setReviewing(spot.id);
    try {
      const res = await fetch("/api/admin/user-spots", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body:    JSON.stringify({ id: spot.id, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (status === "approved") {
        // 목록 유지, 상태만 approved로 전환
        setSpots(prev => prev.map(s =>
          s.id === spot.id ? { ...s, submission_status: "approved" } : s
        ));
      } else {
        // 반려 → 목록에서 제거
        if (previewId === spot.id) { setPreviewId(null); setPreviewData(null); }
        setSpots(prev => prev.filter(s => s.id !== spot.id));
      }
    } catch { /* silent — spot stays for retry */ } finally {
      setReviewing(null);
    }
  }

  async function handlePreview(spot: AdminSpot) {
    if (!adminKey) return;
    if (previewId === spot.id) {
      setPreviewId(null); setPreviewData(null); setPublishError(null);
      return;
    }
    setPreviewId(spot.id);
    setPreviewData(null);
    setPreviewError(null);
    setPublishError(null);
    setOverrides(emptyOverrides());
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/user-spots?id=${encodeURIComponent(spot.id)}`, {
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreviewData(await res.json() as PreviewData);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handlePublish(spotId: string) {
    if (!adminKey || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const payload = buildOverridesPayload(overrides);
      const res = await fetch("/api/admin/user-spots", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body:    JSON.stringify({ id: spotId, overrides: payload }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setPublishError(String(data.error ?? "Failed to publish.")); return; }
      const newId = typeof data.city_spot_id === "number" ? data.city_spot_id : null;
      setSpots(prev => prev.map(s =>
        s.id === spotId ? { ...s, city_spot_id: newId, published_at: new Date().toISOString() } : s
      ));
      setPreviewId(null);
      setPreviewData(null);
    } catch {
      setPublishError("Network error. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────────
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
  const pendingCount   = spots.filter(s => s.submission_status === "pending").length;
  const approvedCount  = spots.filter(s => s.submission_status === "approved" && !s.city_spot_id).length;
  const publishedCount = spots.filter(s => s.submission_status === "approved" && !!s.city_spot_id).length;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black">User Spot Submissions</h1>
            <p className="text-gray-400 text-sm mt-1">
              {pendingCount} pending · {approvedCount} approved · {publishedCount} published
            </p>
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
            <p className="text-gray-400 font-bold">No pending or approved submissions</p>
          </div>
        )}

        {/* Spot list */}
        <div className="space-y-3">
          {spots.map(spot => {
            const isReviewing           = reviewing === spot.id;
            const isPending             = spot.submission_status === "pending";
            const isApprovedUnpublished = spot.submission_status === "approved" && !spot.city_spot_id;
            const isPublished           = spot.submission_status === "approved" && !!spot.city_spot_id;
            const isInPreview           = previewId === spot.id;

            return (
              <div key={spot.id}>
                {/* Spot card */}
                <div className="bg-[#1a1a1a] border border-gray-700 rounded-2xl p-5">
                  <div className="flex items-start gap-4">
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
                        {isApprovedUnpublished && (
                          <span className="text-xs bg-yellow-900/40 text-yellow-300 px-2 py-0.5 rounded font-bold">
                            Approved
                          </span>
                        )}
                        {isPublished && (
                          <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded font-bold">
                            ✓ Published
                          </span>
                        )}
                      </div>
                      {spot.address && <p className="text-gray-400 text-sm">{spot.address}</p>}
                      {spot.note && (
                        <p className="text-gray-500 text-xs mt-1 italic line-clamp-2">{spot.note}</p>
                      )}
                      <p className="text-gray-600 text-xs mt-2">
                        Submitted {formatDate(spot.submitted_at)}
                      </p>
                      {isPublished && spot.published_at && (
                        <p className="text-green-800 text-xs">
                          Published {formatDate(spot.published_at)} · city_spot #{spot.city_spot_id}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      {isPending && (
                        <>
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
                        </>
                      )}
                      {isApprovedUnpublished && (
                        <button
                          onClick={() => void handlePreview(spot)}
                          className="px-4 py-2 rounded-xl text-sm font-black text-[#D4AF37] bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 transition-colors cursor-pointer"
                        >
                          {isInPreview ? "닫기" : "게시 미리보기"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview panel */}
                {isInPreview && (
                  <div className="border border-[#D4AF37]/30 bg-[#111] rounded-2xl p-6 mt-1 space-y-5">
                    {previewLoading && (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <div className="animate-spin h-4 w-4 border-b-2 border-[#D4AF37] rounded-full" />
                        Loading…
                      </div>
                    )}
                    {previewError && (
                      <p className="text-red-400 text-sm">Preview error: {previewError}</p>
                    )}

                    {previewData && (
                      <>
                        {/* 원본 정보 */}
                        <div className="flex gap-4">
                          {spot.photo_url && (
                            <Image
                              src={spot.photo_url}
                              alt={spot.name}
                              width={112}
                              height={112}
                              className="w-28 h-28 object-cover rounded-xl shrink-0"
                            />
                          )}
                          <div className="text-sm space-y-1 text-gray-300">
                            <p><span className="text-gray-500">이름:</span> {spot.name}</p>
                            {spot.city    && <p><span className="text-gray-500">도시:</span> {spot.city}</p>}
                            {spot.address && <p><span className="text-gray-500">주소:</span> {spot.address}</p>}
                            {spot.lat != null && spot.lng != null && (
                              <p><span className="text-gray-500">좌표:</span> {spot.lat}, {spot.lng}</p>
                            )}
                          </div>
                        </div>

                        {/* 중복 경고 — byName */}
                        {previewData.duplicateCandidates.byName.length > 0 && (
                          <div className="bg-orange-950/50 border border-orange-700/40 rounded-xl p-4">
                            <p className="text-orange-400 text-xs font-bold mb-2">
                              ⚠ 이름 중복 후보 ({previewData.duplicateCandidates.byName.length})
                            </p>
                            {previewData.duplicateCandidates.byName.map(c => (
                              <p key={c.id} className="text-orange-300/80 text-xs">
                                #{c.id} {c.name} ({c.city}) — {c.source_type}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* 중복 경고 — byLocation */}
                        {previewData.duplicateCandidates.byLocation.length > 0 && (
                          <div className="bg-yellow-950/50 border border-yellow-700/40 rounded-xl p-4">
                            <p className="text-yellow-400 text-xs font-bold mb-2">
                              ⚠ 위치 중복 후보 ({previewData.duplicateCandidates.byLocation.length}건, ≤100m)
                            </p>
                            {previewData.duplicateCandidates.byLocation.map(c => (
                              <p key={c.id} className="text-yellow-300/80 text-xs">
                                #{c.id} {c.name} ({c.city}) — {c.source_type}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Overrides form */}
                        <div>
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-3">
                            Overrides — 빈칸은 원본 값 사용
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {OVERRIDE_FIELDS.map(field => (
                              <div key={field} className={field === "description" ? "col-span-2" : ""}>
                                <label className="text-gray-600 text-xs block mb-1">{field}</label>
                                <input
                                  type="text"
                                  value={overrides[field]}
                                  onChange={e =>
                                    setOverrides(prev => ({ ...prev, [field]: e.target.value } as Overrides))
                                  }
                                  placeholder={`override ${field}…`}
                                  className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {publishError && <p className="text-red-400 text-sm">{publishError}</p>}

                        <button
                          onClick={() => void handlePublish(spot.id)}
                          disabled={publishing}
                          className="w-full py-3 rounded-xl text-sm font-black text-[#1a1a1a] disabled:opacity-60 transition-opacity cursor-pointer"
                          style={{ backgroundColor: "#D4AF37" }}
                        >
                          {publishing ? "반영 중…" : "city_spots에 반영"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

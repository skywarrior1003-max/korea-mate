"use client";

// ── Security note ─────────────────────────────────────────────────────────
// The admin key is NEVER read from process.env here.
// It is read from sessionStorage (set at login time in the inquiries list page).
// If not in sessionStorage, the user must enter it again.
// All validation is done server-side against the ADMIN_KEY env var.
//
// Route: /korea-mate-admin/inquiries/detail?id=<inquiry-uuid>
// (Static route instead of [id] dynamic route — required for output: "export")

import { Suspense, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ContactInquiry, ContactStatus, ContactPriority } from "@/lib/contact";

const SESSION_KEY = "km_admin_key";

const ALL_STATUSES: ContactStatus[] = [
  "new", "reviewing", "waiting_user", "resolved", "archived", "spam",
];

const STATUS_LABELS: Record<ContactStatus, string> = {
  new:           "🔵 New",
  reviewing:     "🟡 Reviewing",
  waiting_user:  "🟠 Waiting user",
  resolved:      "🟢 Resolved",
  archived:      "⚫ Archived",
  spam:          "🔴 Spam",
};

// Inner component — uses useSearchParams(), must be wrapped in Suspense
function InquiryDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const [pw,       setPw]       = useState("");
  // Lazy-init from sessionStorage so no useEffect is needed for this one
  const [adminKey, setAdminKey] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null
  );
  const [pwError,  setPwError]  = useState("");
  const [checking, setChecking] = useState(false);

  const [inquiry,  setInquiry]  = useState<ContactInquiry | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [status,    setStatus]    = useState<ContactStatus>("new");
  const [priority,  setPriority]  = useState<ContactPriority>("normal");
  const [adminNote, setAdminNote] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState("");

  const load = useCallback(async (key: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/contact-inquiries?id=${encodeURIComponent(id)}`,
        { headers: { "x-admin-key": key } }
      );
      if (res.status === 503) {
        setError("ADMIN_KEY is not configured on the server.");
        return;
      }
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("Session expired. Please log in again.");
        return;
      }
      if (res.status === 404) {
        setError("Inquiry not found.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ContactInquiry;
      setInquiry(data);
      setStatus(data.status);
      setPriority(data.priority);
      setAdminNote(data.adminNote || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // load() calls setState asynchronously after await — lint false positive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (adminKey && id) load(adminKey);
  }, [adminKey, id, load]);

  async function handleLogin() {
    if (checking || !pw.trim()) return;
    setChecking(true);
    setPwError("");
    try {
      const res = await fetch("/api/admin/contact-inquiries", {
        headers: { "x-admin-key": pw },
      });
      if (res.status === 503) {
        setPwError("Admin key is not configured on the server.");
        return;
      }
      if (res.status === 401) {
        setPwError("Incorrect password.");
        return;
      }
      if (!res.ok) {
        setPwError(`Server error (HTTP ${res.status}).`);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, pw);
      setAdminKey(pw);
    } catch {
      setPwError("Network error. Please check your connection.");
    } finally {
      setChecking(false);
    }
  }

  async function handleSave() {
    if (saving || !inquiry || !adminKey) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/admin/contact-inquiries", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ id: inquiry.id, status, priority, adminNote }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) {
        setSaveMsg("✅ Saved successfully.");
        setInquiry((prev) => prev ? { ...prev, status, priority, adminNote } : prev);
      } else {
        setSaveMsg(`❌ Save failed: ${data.error || "unknown error"}`);
      }
    } catch (e) {
      setSaveMsg(`❌ Network error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  }

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm border border-gray-700 shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-4xl">📬</span>
            <h1 className="text-xl font-black text-white mt-3">GoKoreaMate Admin</h1>
            <p className="text-gray-400 text-sm mt-1">Inquiry Detail</p>
          </div>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Admin password"
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm font-semibold placeholder:text-gray-500 focus:outline-none focus:border-orange-500 mb-3"
          />
          {pwError && <p className="text-red-400 text-xs mb-3 font-bold">{pwError}</p>}
          <button
            onClick={handleLogin}
            disabled={checking}
            className="w-full py-3 rounded-xl font-black text-sm text-white disabled:opacity-60"
            style={{ backgroundColor: "#f97316" }}
          >
            {checking ? "Verifying…" : "Login"}
          </button>
          <div className="mt-4 text-center">
            <Link href="/korea-mate-admin/inquiries" className="text-xs text-gray-500 hover:text-gray-300">
              ← Back to Inquiries
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black">📬 Inquiry Detail</h1>
            <p className="text-gray-500 text-xs font-mono mt-1">{id}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/korea-mate-admin/inquiries"
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              ← All Inquiries
            </Link>
            <button
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY);
                setAdminKey(null);
              }}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>

        {loading && <div className="py-16 text-center text-gray-500">⏳ Loading…</div>}
        {error && (
          <div className="px-5 py-4 rounded-xl bg-red-900/30 border border-red-700 text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {inquiry && !loading && (
          <>
            {/* Inquiry info */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 space-y-5">
              <Row label="Date"          value={new Date(inquiry.createdAt).toLocaleString()} />
              <Row label="Type"          value={inquiry.type} />
              <Row label="Name"          value={inquiry.name  || "—"} />
              <Row label="Email"         value={inquiry.email} mono />
              <Row label="Related place" value={inquiry.relatedPlaceName || "—"} />
              {inquiry.relatedPlaceId && (
                <Row label="Place ID" value={inquiry.relatedPlaceId} mono />
              )}
              {inquiry.relatedPageUrl && (
                <div>
                  <p className="text-[11px] text-gray-500 font-bold uppercase mb-0.5">Related page</p>
                  <a
                    href={inquiry.relatedPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-400 hover:underline break-all"
                  >
                    {inquiry.relatedPageUrl}
                  </a>
                </div>
              )}
              <Row label="Language" value={inquiry.language || "—"} />

              {/* Message */}
              <div>
                <p className="text-[11px] text-gray-500 font-bold uppercase mb-2">Message</p>
                <div className="bg-gray-800 rounded-xl px-4 py-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {inquiry.message}
                </div>
              </div>

              {/* AI placeholder */}
              {(inquiry.aiCategory || inquiry.aiSummary) && (
                <div className="bg-blue-900/20 border border-blue-800 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-[11px] text-blue-400 font-bold uppercase">AI Analysis (future)</p>
                  {inquiry.aiCategory && <p className="text-xs text-gray-300">Category: {inquiry.aiCategory}</p>}
                  {inquiry.aiSummary  && <p className="text-xs text-gray-300">Summary: {inquiry.aiSummary}</p>}
                </div>
              )}
            </div>

            {/* Admin controls */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 space-y-5">
              <h2 className="text-sm font-black text-orange-400">Admin Controls</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-gray-400 font-bold uppercase mb-1.5">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ContactStatus)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-sm text-white focus:outline-none focus:border-orange-500"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 font-bold uppercase mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ContactPriority)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-sm text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-400 font-bold uppercase mb-1.5">Admin note</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Internal notes (not visible to users)…"
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#f97316" }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {saveMsg && (
                  <p className={`text-xs font-bold ${saveMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>
                    {saveMsg}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <p className="text-center text-xs text-gray-700 pb-6">
          GoKoreaMate Admin · Private · Do not share
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 font-bold uppercase mb-0.5">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// Suspense wrapper required for useSearchParams() with static export
export default function InquiryDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    }>
      <InquiryDetailContent />
    </Suspense>
  );
}

"use client";

// ── Security note ─────────────────────────────────────────────────────────
// The admin key is NEVER read from process.env here.
// The user types the key in the password field. It is sent to the server API
// as an x-admin-key header. The server validates it against the server-only
// ADMIN_KEY env var. The key is stored only in sessionStorage (cleared when
// the tab closes) — never in code or localStorage.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ContactInquiry, ContactStatus } from "@/lib/contact";

const SESSION_KEY = "km_admin_key"; // sessionStorage key — tab-lifetime only

const STATUS_LABELS: Record<ContactStatus, string> = {
  new:           "🔵 New",
  reviewing:     "🟡 Reviewing",
  waiting_user:  "🟠 Waiting user",
  resolved:      "🟢 Resolved",
  archived:      "⚫ Archived",
  spam:          "🔴 Spam",
};

const STATUS_COLORS: Record<ContactStatus, string> = {
  new:           "bg-blue-900/40 text-blue-300",
  reviewing:     "bg-yellow-900/40 text-yellow-300",
  waiting_user:  "bg-orange-900/40 text-orange-300",
  resolved:      "bg-green-900/40 text-green-300",
  archived:      "bg-gray-700/40 text-gray-400",
  spam:          "bg-red-900/40 text-red-400",
};

export default function AdminInquiriesPage() {
  const [pw,       setPw]       = useState("");
  // Lazy-init from sessionStorage so no useEffect is needed for this one
  const [adminKey, setAdminKey] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null
  );
  const [pwError,  setPwError]  = useState("");
  const [checking, setChecking] = useState(false);

  const [inquiries, setInquiries] = useState<ContactInquiry[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<ContactStatus | "all">("all");

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contact-inquiries", {
        headers: { "x-admin-key": key },
      });
      if (res.status === 503) {
        setError("Admin key is not configured on the server. Set ADMIN_KEY in .env.local.");
        return;
      }
      if (res.status === 401) {
        // Key in sessionStorage is stale
        sessionStorage.removeItem(SESSION_KEY);
        setAdminKey(null);
        setPwError("Session expired or key changed. Please log in again.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ContactInquiry[];
      setInquiries(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load() calls setState asynchronously after await — lint false positive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (adminKey) load(adminKey);
  }, [adminKey, load]);

  // Validate the entered password against the server
  async function handleLogin() {
    if (checking || !pw.trim()) return;
    setChecking(true);
    setPwError("");
    try {
      const res = await fetch("/api/admin/contact-inquiries", {
        headers: { "x-admin-key": pw },
      });
      if (res.status === 503) {
        setPwError("Admin key is not configured on the server. Set ADMIN_KEY in .env.local.");
        return;
      }
      if (res.status === 401) {
        setPwError("Incorrect password.");
        return;
      }
      if (!res.ok) {
        setPwError(`Server error (HTTP ${res.status}). Please try again.`);
        return;
      }
      // Success — store key in sessionStorage, load data from response
      sessionStorage.setItem(SESSION_KEY, pw);
      setAdminKey(pw);
      const data = await res.json() as ContactInquiry[];
      setInquiries(data);
    } catch {
      setPwError("Network error. Please check your connection.");
    } finally {
      setChecking(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAdminKey(null);
    setPw("");
    setInquiries([]);
    setError(null);
  }

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm border border-gray-700 shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-4xl">📬</span>
            <h1 className="text-xl font-black text-white mt-3">GoKoreaMate Admin</h1>
            <p className="text-gray-400 text-sm mt-1">Inquiry Management</p>
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
          {pwError && (
            <p className="text-red-400 text-xs mb-3 font-bold">{pwError}</p>
          )}
          <button
            onClick={handleLogin}
            disabled={checking}
            className="w-full py-3 rounded-xl font-black text-sm text-white disabled:opacity-60"
            style={{ backgroundColor: "#f97316" }}
          >
            {checking ? "Verifying…" : "Login"}
          </button>
          <div className="mt-4 text-center">
            <Link href="/korea-mate-admin" className="text-xs text-gray-500 hover:text-gray-300">
              ← Back to Admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayed = filter === "all"
    ? inquiries
    : inquiries.filter((i) => i.status === filter);

  const counts = inquiries.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black">📬 Inquiry Management</h1>
            <p className="text-gray-400 text-sm mt-1">
              {inquiries.length} total · {counts["new"] || 0} new
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <Link
              href="/korea-mate-admin"
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              ← Admin Home
            </Link>
            <button
              onClick={() => adminKey && load(adminKey)}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {loading ? "⏳" : "🔄"} Refresh
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === "all" ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            All ({inquiries.length})
          </button>
          {(Object.keys(STATUS_LABELS) as ContactStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === s ? "bg-orange-500 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
            >
              {STATUS_LABELS[s]} ({counts[s] || 0})
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-4 rounded-xl bg-red-900/30 border border-red-700 text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-16 text-center text-gray-500">⏳ Loading inquiries…</div>
        )}

        {/* Empty */}
        {!loading && !error && displayed.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-400 font-bold text-sm">No inquiries found.</p>
          </div>
        )}

        {/* Table */}
        {!loading && displayed.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-[11px] text-gray-400 font-bold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Related place</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Priority</th>
                    <th className="px-4 py-3 text-left">Message</th>
                    <th className="px-4 py-3 text-center">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((inq) => (
                    <tr key={inq.id} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                        {inq.createdAt.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-300 max-w-[140px] truncate">
                        {inq.type}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {inq.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[160px] truncate">
                        {inq.email}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px] truncate">
                        {inq.relatedPlaceName || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS_COLORS[inq.status]}`}>
                          {STATUS_LABELS[inq.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${inq.priority === "high" ? "bg-red-900/40 text-red-300" : "bg-gray-700 text-gray-400"}`}>
                          {inq.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                        {inq.message}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/korea-mate-admin/inquiries/detail?id=${inq.id}`}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Supabase setup note */}
        <div className="bg-gray-900/60 border border-gray-700/50 rounded-2xl p-5 text-xs text-gray-500 space-y-1">
          <p className="font-bold text-gray-400">⚙️ Setup required (first time)</p>
          <p>1. Run the SQL in <code className="text-orange-400">supabase/contact_inquiries.sql</code> in your Supabase SQL Editor.</p>
          <p>2. Add <code className="text-orange-400">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="text-orange-400">ADMIN_KEY</code> to <code>.env.local</code>.</p>
          <p>3. Add <code className="text-orange-400">RESEND_API_KEY</code>, <code className="text-orange-400">ADMIN_NOTIFICATION_EMAIL</code>, <code className="text-orange-400">CONTACT_FROM_EMAIL</code> for email notifications.</p>
        </div>

        <p className="text-center text-xs text-gray-700 pb-6">
          GoKoreaMate Admin · Private · Do not share
        </p>
      </div>
    </div>
  );
}

"use client";
// GoKoreaMate / gokoreamate.com — TASK-009 UI Draft Sandbox
// ⚠ DRAFT: Mock data only. DO NOT import into production pages without a Task approval.
// Mirrors TASK-005 trip_moments schema (privacy-first defaults, plain text, GPS policy).
// "use client" — required for include_in_share_card toggle (useState).

import { useState } from "react";

// ── Mock types (mirrors TASK-005 trip_moments schema) ────────────────────────
type Visibility         = "private" | "friends" | "public";
type ShareLocationLevel = "hidden" | "neighborhood" | "exact";
type GeoSource          = "gps" | "manual" | "place";

interface TripMomentMock {
  moment_id:             string;
  title:                 string;           // plain text — personal note (no multilingual, TASK-005)
  comment:               string;           // plain text
  photo_url:             string | null;    // null = show placeholder
  address_label:         string;           // human-readable location hint
  geo_source:            GeoSource;
  visibility:            Visibility;       // TASK-005 default: "private"
  share_location_level:  ShareLocationLevel; // TASK-005 default: "hidden"
  include_in_share_card: boolean;          // TASK-005 default: false
  visit_time:            string;           // ISO 8601
}

// ── Privacy badge config ──────────────────────────────────────────────────────
const VISIBILITY_BADGE: Record<Visibility, { icon: string; label: string; bg: string }> = {
  private: { icon: "🔒", label: "Private", bg: "bg-gray-700"  },
  friends: { icon: "👥", label: "Friends", bg: "bg-blue-500"  },
  public:  { icon: "🌍", label: "Public",  bg: "bg-green-500" },
};

// ── Mock data — TASK-005 privacy-first defaults applied ───────────────────────
const MOCK_MOMENT: TripMomentMock = {
  moment_id:             "mock-moment-001",
  title:                 "해동용궁사에서 본 일출",
  comment:               "새벽 5시에 일어난 보람이 있었다. 이 경치는 평생 잊지 못할 것 같다.",
  photo_url:             null,           // placeholder in draft
  address_label:         "해운대구 근처", // neighborhood-level hint (share_location_level: hidden)
  geo_source:            "place",
  visibility:            "private",      // TASK-005 default
  share_location_level:  "hidden",       // TASK-005 default
  include_in_share_card: false,          // TASK-005 default
  visit_time:            "2026-10-05T05:15:00+09:00",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatVisitTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_e) {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TripMomentCardDraft() {
  // include_in_share_card toggle — mirrors TASK-005 trip_moments field
  const [includeInCard, setIncludeInCard] = useState(MOCK_MOMENT.include_in_share_card);

  const badge = VISIBILITY_BADGE[MOCK_MOMENT.visibility];

  return (
    <article className="w-full rounded-2xl overflow-hidden shadow-md bg-white border border-gray-100">
      {/* ── Photo area ── */}
      <div className="relative h-64 w-full overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
        {MOCK_MOMENT.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={MOCK_MOMENT.photo_url}
            alt={MOCK_MOMENT.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <span className="text-7xl opacity-20" aria-hidden="true">📷</span>
            <p className="absolute text-xs text-white/30 select-none" style={{ bottom: "3rem" }}>
              [trip_moments.photo_url — EXIF stripped on upload]
            </p>
          </>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Privacy badge — top right (TASK-005 privacy-first) */}
        <span
          className={`absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white ${badge.bg}`}
        >
          {badge.icon} {badge.label}
        </span>

        {/* Visit time — bottom right */}
        <span className="absolute bottom-3 right-3 text-[10px] text-white/60 select-none">
          {formatVisitTime(MOCK_MOMENT.visit_time)}
        </span>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 space-y-2">
        {/* Title — plain text (no jsonb, personal note) */}
        <h3 className="text-sm font-bold text-gray-900 leading-snug">
          {MOCK_MOMENT.title}
        </h3>

        {/* Address label + geo source hint */}
        <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
          <span aria-hidden="true">📍</span>
          <span>{MOCK_MOMENT.address_label}</span>
          <span className="text-[10px] text-gray-300">
            · {MOCK_MOMENT.geo_source} · loc: {MOCK_MOMENT.share_location_level}
          </span>
        </p>

        {/* Comment */}
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
          {MOCK_MOMENT.comment}
        </p>

        {/* Include in Story Card toggle (TASK-010 connection point) */}
        <div className="border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setIncludeInCard((prev) => !prev)}
            className="flex items-center gap-3 w-full"
            aria-pressed={includeInCard}
            aria-label="Toggle include in Trip Story Card"
          >
            {/* Toggle track */}
            <div
              className={`relative w-10 h-5 rounded-full flex-shrink-0 transition-colors duration-200 ${
                includeInCard ? "bg-orange-500" : "bg-gray-200"
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  includeInCard ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>

            {/* Label */}
            <div className="text-left flex-1">
              <p
                className={`text-xs font-semibold transition-colors ${
                  includeInCard ? "text-orange-500" : "text-gray-500"
                }`}
              >
                Include in Trip Story Card
              </p>
              <p className="text-[10px] text-gray-400 leading-snug">
                {includeInCard
                  ? "Will appear in your 9:16 share card (TASK-010)"
                  : "Not included in share card"}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Draft watermark */}
      <p className="text-center text-[10px] text-gray-300 pb-3 select-none">
        [DRAFT] TripMomentCardDraft — mock data only — gokoreamate.com TASK-009
      </p>
    </article>
  );
}

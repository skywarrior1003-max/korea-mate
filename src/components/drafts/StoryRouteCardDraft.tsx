// GoKoreaMate / gokoreamate.com — TASK-009 UI Draft Sandbox
// ⚠ DRAFT: Mock data only. DO NOT import into production pages without a Task approval.
// Mirrors TASK-008 route_templates + route_template_items schema.
// NOTE: place_name in mock items is display-only — real impl uses places.id / events.id FK.

// ── Mock types (mirrors TASK-008 route_templates schema) ─────────────────────
type RouteType     = "curated" | "festival" | "seasonal" | "walking-trail" | "night";
type DurationType  = "half-day" | "full-day" | "multi-day";
type Difficulty    = "easy" | "moderate" | "challenging";

interface RouteItemMock {
  item_order:   number;
  place_name:   string;   // display-only — real impl: places.id / events.id FK
  stay_minutes: number;   // AI Scheduler input (TASK-013/014)
  is_required:  boolean;  // false = AI may skip if time is short
}

interface RouteTemplateMock {
  route_id:      string;
  title:         { en: string; ko: string };   // jsonb multilingual (TASK-008)
  highlight:     { en: string };               // one-line tagline for card display
  mood_tags:     string[];                     // jsonb array — Explore filter
  area_tags:     string[];                     // jsonb array — district coverage
  route_type:    RouteType;
  duration_type: DurationType;
  estimated_min: number;
  difficulty:    Difficulty;
}

// ── Display config ────────────────────────────────────────────────────────────
const ROUTE_TYPE_BADGE: Record<RouteType, { label: string; bg: string }> = {
  "curated":        { label: "✨ Curated",        bg: "bg-orange-500"  },
  "festival":       { label: "🎉 Festival",        bg: "bg-red-500"     },
  "seasonal":       { label: "🌸 Seasonal",        bg: "bg-pink-500"    },
  "walking-trail":  { label: "🥾 Walking Trail",   bg: "bg-emerald-600" },
  "night":          { label: "🌙 Night Route",     bg: "bg-indigo-600"  },
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy:        "Easy",
  moderate:    "Moderate",
  challenging: "Challenging",
};

const DURATION_LABEL: Record<DurationType, string> = {
  "half-day":  "Half Day",
  "full-day":  "Full Day",
  "multi-day": "Multi Day",
};

// ── Mock data (mirrors TASK-008 schema) ───────────────────────────────────────
const MOCK_ROUTE: RouteTemplateMock = {
  route_id:      "bts-day-busan",
  title:         { en: "BTS Day in Busan",           ko: "BTS 부산 성지순례"   },
  highlight:     { en: "Every BTS spot in one day"                              },
  mood_tags:     ["k-pop", "instagrammable", "fan-tour"],
  area_tags:     ["해운대", "광안리", "수영구"],
  route_type:    "curated",
  duration_type: "full-day",
  estimated_min: 480,
  difficulty:    "easy",
};

const MOCK_ITEMS: RouteItemMock[] = [
  { item_order: 1, place_name: "Haeundae Beach",   stay_minutes: 90, is_required: true  },
  { item_order: 2, place_name: "Gwangalli Bridge",  stay_minutes: 60, is_required: true  },
  { item_order: 3, place_name: "BTS Mural Wall",    stay_minutes: 30, is_required: false },
  { item_order: 4, place_name: "Centum City Mall",  stay_minutes: 60, is_required: false },
  { item_order: 5, place_name: "Haedong Gungsa",    stay_minutes: 60, is_required: true  },
  { item_order: 6, place_name: "Busan Tower",       stay_minutes: 45, is_required: false },
];

const VISIBLE_STOPS = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Component (Server Component — no client state needed) ─────────────────────
export default function StoryRouteCardDraft() {
  const typeMeta     = ROUTE_TYPE_BADGE[MOCK_ROUTE.route_type];
  const visibleItems = MOCK_ITEMS.slice(0, VISIBLE_STOPS);
  const hiddenCount  = MOCK_ITEMS.length - VISIBLE_STOPS;

  return (
    <article className="w-full rounded-2xl overflow-hidden shadow-md bg-white border border-gray-100">
      {/* ── Cover image placeholder ── */}
      <div className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
        <span className="text-6xl opacity-20" aria-hidden="true">🗺️</span>
        <p className="absolute text-xs text-gray-400 select-none" style={{ bottom: "3rem" }}>
          [cover_media_id → place_media → license gate]
        </p>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Route type badge */}
        <span
          className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold text-white ${typeMeta.bg}`}
        >
          {typeMeta.label}
        </span>

        {/* Duration + difficulty */}
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold bg-black/50 text-white backdrop-blur-sm">
          ⏱ {formatDuration(MOCK_ROUTE.estimated_min)} · {DIFFICULTY_LABEL[MOCK_ROUTE.difficulty]}
        </span>

        {/* Title on image bottom */}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-[10px] text-white/60 mb-0.5 uppercase tracking-wider">
            {DURATION_LABEL[MOCK_ROUTE.duration_type]}
          </p>
          <h3 className="text-base font-bold text-white leading-snug drop-shadow">
            {MOCK_ROUTE.title.en}
          </h3>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="p-4 space-y-3">
        {/* Highlight tagline */}
        <p className="text-sm text-gray-500 italic leading-snug">
          &ldquo;{MOCK_ROUTE.highlight.en}&rdquo;
        </p>

        {/* Area tags */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-400" aria-hidden="true">📍</span>
          {MOCK_ROUTE.area_tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-50 text-blue-700"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Mood tags */}
        <div className="flex gap-1 flex-wrap">
          {MOCK_ROUTE.mood_tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Stops preview */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Stops Preview
          </p>
          <div className="space-y-1.5">
            {visibleItems.map((item) => (
              <div key={item.item_order} className="flex items-center gap-2 text-xs text-gray-700">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-500 font-bold flex items-center justify-center flex-shrink-0 text-[10px]">
                  {item.item_order}
                </span>
                <span className="flex-1 font-medium leading-snug">
                  {item.place_name}
                  {!item.is_required && (
                    <span className="ml-1 text-[10px] text-gray-400">(optional)</span>
                  )}
                </span>
                <span className="text-gray-400 flex-shrink-0 tabular-nums">
                  {item.stay_minutes}min
                </span>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="text-xs text-orange-500 font-semibold pl-7 mt-1.5">
              + {hiddenCount} more stop{hiddenCount > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Mock CTA — no real navigation in draft */}
        <div
          role="button"
          aria-label="Add BTS Day in Busan to My Trip — mock action, not connected"
          className="w-full py-2.5 rounded-xl text-sm font-bold text-center text-white select-none"
          style={{ backgroundColor: "#1a1f36" }}
        >
          Add to My Trip →
        </div>
      </div>

      {/* Draft watermark */}
      <p className="text-center text-[10px] text-gray-300 pb-3 select-none">
        [DRAFT] StoryRouteCardDraft — mock data only — gokoreamate.com TASK-009
      </p>
    </article>
  );
}

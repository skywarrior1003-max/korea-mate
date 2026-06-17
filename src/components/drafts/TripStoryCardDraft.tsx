"use client";
// GoKoreaMate / gokoreamate.com — TASK-010 UI Draft Sandbox
// ⚠ DRAFT: Mock data only. Stage 1 of 5: Capture-friendly 9:16 UI.
// DO NOT import into production pages (src/app/**) without a Task approval.
// "use client" — Stage 2 Save as Image onClick readiness.

// ── Mock types (mirrors TASK-005 trip_sessions + trip_moments schema) ─────────
interface TripSessionMock {
  trip_id:    string;
  city:       string;
  start_date: string;  // "YYYY-MM-DD"
  end_date:   string;  // "YYYY-MM-DD"
  title:      string;  // user's custom trip name
}

interface TripPlaceMock {
  place_id:   string;  // placeholder — real impl: places.id FK (TASK-003)
  place_name: string;  // display-only string
  icon:       string;
  day:        number;
}

interface HighlightMomentMock {
  moment_id:             string;
  title:                 string;  // plain text — personal note (no jsonb, TASK-005)
  comment:               string;  // plain text
  photo_url:             null;    // always null in draft → shows placeholder
  visit_time:            string;  // ISO 8601
  include_in_share_card: true;    // only moments with this flag appear on card
}

interface TripStatsMock {
  total_places:  number;
  total_moments: number;
  total_days:    number;
}

interface TripStoryCardDataMock {
  session:   TripSessionMock;
  places:    TripPlaceMock[];      // from trip_items → places join
  highlight: HighlightMomentMock;  // first include_in_share_card=true moment
  stats:     TripStatsMock;
}

// ── Mock data (task-board.md TASK-010 required content) ───────────────────────
const MOCK_DATA: TripStoryCardDataMock = {
  session: {
    trip_id:    "busan-2026-oct-u7k2",
    city:       "busan",
    start_date: "2026-10-03",
    end_date:   "2026-10-07",
    title:      "My 2026 Busan Trip",
  },
  places: [
    { place_id: "mock-p1", place_name: "Haeundae Beach",  icon: "🏖️", day: 1 },
    { place_id: "mock-p2", place_name: "Gamcheon Village", icon: "🎨", day: 2 },
    { place_id: "mock-p3", place_name: "Jagalchi Market",  icon: "🐟", day: 3 },
    { place_id: "mock-p4", place_name: "Haedong Gungsa",   icon: "🏛️", day: 4 },
  ],
  highlight: {
    moment_id:             "mock-moment-001",
    title:                 "해동용궁사에서 본 일출",
    comment:               "새벽 5시에 일어난 보람이 있었다. 이 경치는 평생 잊지 못할 것 같다.",
    photo_url:             null,
    visit_time:            "2026-10-04T05:15:00+09:00",
    include_in_share_card: true,
  },
  stats: { total_places: 5, total_moments: 3, total_days: 5 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateRange(startISO: string, endISO: string): string {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${M[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
  }
  return `${M[s.getUTCMonth()]} ${s.getUTCDate()} – ${M[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TripStoryCardDraft() {
  const data      = MOCK_DATA;
  const dateRange = formatDateRange(data.session.start_date, data.session.end_date);

  // Split "My 2026 Busan Trip" → "MY 2026 BUSAN" (white) + "TRIP" (orange)
  const titleWords = data.session.title.toUpperCase().split(" ");
  const heroAccent = titleWords.pop() ?? "";
  const heroMain   = titleWords.join(" ");

  // Stage 2 placeholder — Satori/html2canvas pending separate Task approval
  function handleSaveAsImage(): void {
    // TODO Stage 2: implement PNG export (requires new Task)
  }

  return (
    <div className="w-full max-w-[360px] mx-auto">

      {/* ── 9:16 Card — overflow-hidden clips any content past 640px ── */}
      <div
        className="relative w-full aspect-[9/16] overflow-hidden rounded-3xl shadow-2xl"
        style={{
          background: "linear-gradient(to bottom, #0f172a 0%, #1a1f36 40%, #1a1f36 70%, #0f172a 100%)",
        }}
      >
        {/* Decorative radial orbs */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)" }}
        />

        {/* Content layer */}
        <div className="absolute inset-0 flex flex-col">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 flex-shrink-0">
            <span className="text-xs font-bold text-orange-400 tracking-wide">
              gokoreamate.com
            </span>
            <span className="text-[10px] text-white/40 uppercase tracking-widest">
              Trip Story
            </span>
          </div>

          {/* ── Hero ── */}
          <div className="px-5 pt-5 pb-4 flex-shrink-0">
            <div className="w-8 h-0.5 bg-orange-400 rounded-full mb-3" />
            <h1 className="text-3xl font-black leading-tight tracking-tight">
              <span className="text-white">{heroMain}</span>
              <br />
              <span className="text-orange-400">{heroAccent}</span>
            </h1>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-white/60 flex items-center gap-1.5">
                <span aria-hidden="true">📅</span>
                {dateRange} · {data.stats.total_days} days
              </p>
              <p className="text-xs text-white/60 flex items-center gap-1.5">
                <span aria-hidden="true">📍</span>
                Busan, South Korea 🇰🇷
              </p>
            </div>
          </div>

          {/* ── Featured Moment — flex-1 absorbs remaining vertical space ── */}
          <div className="px-5 flex-1 flex flex-col min-h-0">
            {/* Photo placeholder */}
            <div className="relative rounded-2xl overflow-hidden flex-shrink-0 h-32 bg-slate-800 flex items-center justify-center">
              <span className="text-5xl opacity-15 select-none" aria-hidden="true">📷</span>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <span className="absolute bottom-2 left-0 right-0 text-center text-[9px] text-white/25 select-none px-2">
                [trip_moments.photo_url · include_in_share_card: true]
              </span>
              <span className="absolute top-2 right-2 text-[9px] text-white/50 bg-black/40 px-1.5 py-0.5 rounded-full">
                Oct 4 · 05:15
              </span>
            </div>

            {/* Moment text */}
            <div className="mt-2.5">
              <p className="text-sm font-bold text-white leading-snug">
                {data.highlight.title}
              </p>
              <p className="text-xs text-white/55 mt-1 leading-relaxed line-clamp-2">
                {data.highlight.comment}
              </p>
            </div>
          </div>

          {/* ── Highlights ── */}
          <div className="px-5 pt-3 pb-2 flex-shrink-0">
            <p className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest mb-2">
              My Highlights
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {data.places.slice(0, 4).map((place) => (
                <div
                  key={place.place_id}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 bg-white/10"
                >
                  <span className="text-base leading-none flex-shrink-0" aria-hidden="true">
                    {place.icon}
                  </span>
                  <span className="text-[11px] text-white/80 font-medium leading-tight line-clamp-1">
                    {place.place_name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="px-5 py-2 border-t border-white/10 flex-shrink-0">
            <p className="text-[10px] text-white/35 flex items-center gap-3">
              <span>🗺️ {data.stats.total_places} places</span>
              <span>📸 {data.stats.total_moments} moments</span>
              <span>🌙 {data.stats.total_days} days</span>
            </p>
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-3 border-t border-white/10 flex-shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <p className="text-xs font-bold text-white tracking-wide">gokoreamate.com</p>
                <p className="text-[10px] text-white/35">Plan your Korea trip free →</p>
              </div>
              <div
                className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0"
                aria-hidden="true"
              >
                <span className="text-white text-sm font-black leading-none">G</span>
              </div>
            </div>

            {/* Stage 2 placeholder — no PNG export in Stage 1 */}
            <button
              type="button"
              onClick={handleSaveAsImage}
              title="Save as Image — Stage 2 pending separate Task approval"
              className="w-full py-2 rounded-xl text-[11px] font-semibold text-white/55 border border-white/15 hover:border-white/30 transition-colors"
            >
              📸 Save as Image — Coming in Stage 2
            </button>
          </div>

        </div>
      </div>

      {/* Draft watermark */}
      <p className="text-center text-[10px] text-gray-500 mt-3 select-none">
        [DRAFT] TripStoryCardDraft · Stage 1 of 5 · mock data only · gokoreamate.com TASK-010
      </p>
    </div>
  );
}

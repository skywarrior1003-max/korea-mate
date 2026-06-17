// GoKoreaMate / gokoreamate.com — TASK-009 UI Draft Sandbox
// ⚠ DRAFT: Mock data only. DO NOT import into production pages without a Task approval.
// Mirrors TASK-007 affiliate_links schema (jsonb multilingual, category, placement_context)

// ── Mock types (mirrors TASK-007 affiliate_links schema) ─────────────────────
type Category = "esim" | "transport" | "activity" | "stay" | "payment-tip" | "map-tip";

interface AffiliateLinkMock {
  affiliate_link_id: string;
  category: Category;
  provider: string;
  title: { en: string; ko: string };         // jsonb multilingual pocket (TASK-007)
  description: { en: string };
  priority: number;                           // lower = higher placement priority
}

// ── Category display config ───────────────────────────────────────────────────
const CATEGORY_META: Record<
  Category,
  { icon: string; from: string; to: string; badge: string }
> = {
  esim:          { icon: "📶", from: "from-violet-500", to: "to-purple-600",  badge: "#1 Pick"   },
  transport:     { icon: "🚅", from: "from-blue-500",   to: "to-blue-700",    badge: "Rail Pass" },
  activity:      { icon: "🎭", from: "from-emerald-500",to: "to-green-600",   badge: "Tours"     },
  stay:          { icon: "🏨", from: "from-amber-500",  to: "to-orange-600",  badge: "Hotels"    },
  "payment-tip": { icon: "💳", from: "from-gray-500",   to: "to-gray-600",    badge: "Tips"      },
  "map-tip":     { icon: "🗺️", from: "from-teal-500",   to: "to-cyan-600",    badge: "Maps"      },
};

// ── Mock data — sorted by priority asc (TASK-007 placement_context logic) ────
const MOCK_LINKS: AffiliateLinkMock[] = [
  {
    affiliate_link_id: "airalo-esim-korea",
    category:          "esim",
    provider:          "Airalo",
    title:             { en: "Korea eSIM",     ko: "한국 eSIM"      },
    description:       { en: "Ready on arrival. No SIM line at the airport." },
    priority: 1,
  },
  {
    affiliate_link_id: "klook-busan-tour",
    category:          "activity",
    provider:          "Klook",
    title:             { en: "Busan Day Tour",  ko: "부산 데이 투어" },
    description:       { en: "Top-rated Busan highlights — skip the planning." },
    priority: 15,
  },
  {
    affiliate_link_id: "korail-ktx-pass",
    category:          "transport",
    provider:          "Korail",
    title:             { en: "KTX Rail Pass",   ko: "KTX 레일패스"  },
    description:       { en: "Unlimited bullet-train rides for foreign visitors." },
    priority: 30,
  },
];

// ── Component (Server Component — no client state needed) ─────────────────────
export default function KoreaReadyDraft() {
  const sorted = [...MOCK_LINKS].sort((a, b) => a.priority - b.priority);

  return (
    <section className="py-6 bg-gray-50">
      {/* Section header */}
      <div className="px-4 mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-0.5">
            gokoreamate.com
          </p>
          <h2 className="text-xl font-bold text-gray-900">Korea Ready</h2>
          <p className="text-xs text-gray-500 mt-0.5">Get ready before you land</p>
        </div>
        <span className="text-xs text-orange-500 font-semibold select-none">
          See all →
        </span>
      </div>

      {/* Horizontal scroll card list */}
      <div className="flex gap-3 px-4 overflow-x-auto pb-2">
        {sorted.map((link) => {
          const meta = CATEGORY_META[link.category];
          return (
            <article
              key={link.affiliate_link_id}
              className="flex-shrink-0 w-52 rounded-2xl overflow-hidden shadow-md bg-white border border-gray-100"
            >
              {/* Gradient icon header */}
              <div
                className={`h-28 bg-gradient-to-br ${meta.from} ${meta.to} flex flex-col items-center justify-center gap-2`}
              >
                <span className="text-4xl" aria-hidden="true">{meta.icon}</span>
                <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">
                  {meta.badge}
                </span>
              </div>

              {/* Card body */}
              <div className="p-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider">
                  via {link.provider}
                </p>
                <h3 className="text-sm font-bold text-gray-900 leading-snug">
                  {link.title.en}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {link.description.en}
                </p>

                {/* Mock CTA — #mock-link (no real navigation in draft) */}
                <div
                  role="button"
                  aria-label={`${link.title.en} — mock link, not connected`}
                  className="mt-1 w-full py-2 rounded-xl text-xs font-bold text-center text-white select-none"
                  style={{ backgroundColor: "#1a1f36" }}
                >
                  Learn More →
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Draft watermark */}
      <p className="text-center text-[10px] text-gray-300 mt-3 select-none">
        [DRAFT] KoreaReadyDraft — mock data only — gokoreamate.com TASK-009
      </p>
    </section>
  );
}

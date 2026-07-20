// gokoreamate — Jeju city SEO landing page
// TASK-031: static, Server Component, targets "Jeju island travel guide" keywords

import type { Metadata } from "next";
import Link from "next/link";
import KoreaReadySection from "@/components/KoreaReadySection";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Jeju Island Travel Guide 2026 — AI Korea Itinerary Planner | gokoreamate.com",
  description:
    "Plan your perfect Jeju island trip with AI. Hallasan, Seongsan, beaches, lava caves & practical tips for foreign travelers. Free, no sign-up.",
  openGraph: {
    title: "Jeju Island Korea Travel Guide — gokoreamate.com",
    description:
      "AI-generated Jeju island itineraries for foreign travelers. Hallasan, Seongsan Ilchulbong, Manjanggul Cave & more. Plan free in 30 seconds.",
    images: [
      {
        url: "https://gokoreamate.com/og/jeju/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Jeju Korea Trip Itinerary — gokoreamate.com",
      },
    ],
    url: "https://gokoreamate.com/jeju/",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jeju Island Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Jeju island — volcanoes, beaches, lava caves & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/jeju/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/jeju/" },
};

const HIGHLIGHTS = [
  {
    emoji: "🌋",
    name: "Hallasan National Park",
    desc: "Korea's highest peak (1,950m) and a UNESCO World Heritage volcano. Eorimok trail (5.3km) rewards with stunning crater lake views on clear days.",
    tag: "UNESCO",
  },
  {
    emoji: "🌅",
    name: "Seongsan Ilchulbong",
    desc: "The 'Sunrise Peak' — a 182m volcanic crater rising from the sea. Climb 99 stone steps for a panoramic crater view. Best at dawn for the iconic sunrise.",
    tag: "UNESCO · Sunrise",
  },
  {
    emoji: "🕳️",
    name: "Manjanggul Lava Tube",
    desc: "One of the world's longest lava tubes (7.4km), formed 250,000 years ago. The accessible section (1km) maintains a cool 11°C year-round.",
    tag: "UNESCO",
  },
  {
    emoji: "🏖️",
    name: "Hamdeok & Hyeopjae Beach",
    desc: "Hamdeok's turquoise waters dazzle in summer. Hyeopjae faces west — perfect for sunset swims with volcanic rock formations in the background.",
    tag: "Beach",
  },
  {
    emoji: "🏘️",
    name: "Seopjikoji Coastal Trail",
    desc: "A 2km coastal walk past canola fields, stone walls, and volcanic rock cliffs. Made famous by the film 'Sopyonje'. Spectacular in spring (April canola).",
    tag: "Scenic Walk",
  },
  {
    emoji: "🍊",
    name: "Jeju Citrus Experience",
    desc: "Jeju is Korea's premier mandarin (hallabong) producer. Visit a tangerine farm for pick-your-own (Nov–Jan), or grab fresh hallabong juice at any market.",
    tag: "Local Food",
  },
];

const PRACTICAL = [
  { icon: "✈️", label: "Getting There", value: "Direct flights from Seoul (GMP→CJU): 55 min. From Busan (PUS→CJU): 50 min. Jeju has no ferries from Seoul." },
  { icon: "🚗", label: "Getting Around", value: "Rent a car — Jeju's best spots are spread island-wide. Budget: ₩40,000–₩80,000/day. International license accepted." },
  { icon: "🚌", label: "Without a Car", value: "Intercity buses connect major spots. Airport → Seongsan: ~1.5hr by bus 101. Slower but scenic." },
  { icon: "💳", label: "Payments", value: "Cards accepted widely. Carry some cash for smaller eateries and farm stalls." },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) canola & cherry blossoms · Autumn (Sep–Nov) foliage. Typhoon risk Jul–Sep." },
  { icon: "🌊", label: "Haenyeo Culture", value: "Watch Jeju's legendary female divers (해녀) work at Seongsan or Udo Island — a UNESCO Intangible Heritage." },
];

export default function JejuPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF7F2" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-[#2C2520]">
            🇰🇷 <span style={{ color: "#D4AF37" }}>gokoreamate</span>.com
          </Link>
          <nav className="flex items-center gap-4 text-sm font-bold">
            <Link href="/seoul" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Seoul</Link>
            <Link href="/gyeongju" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Gyeongju</Link>
            <Link href="/explore-busan" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Busan</Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-sm font-black text-[#1a1a2e] transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#D4AF37" }}
            >
              Plan My Trip →
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden py-20 px-4 text-center"
        style={{ background: "linear-gradient(160deg, #0a2a1a 0%, #1a3d2a 60%, #0d2418 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 65%, rgba(45,198,83,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 20%, rgba(212,175,55,0.10) 0%, transparent 45%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/50 border border-white/15 mb-6 tracking-widest uppercase">
            🇰🇷 Korea Travel Guide
          </span>
          <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Jeju Island
          </h1>
          <p className="text-xl text-white/60 mb-4 font-medium">
            Island Paradise · Volcanic Wonders · UNESCO Triple Crown
          </p>
          <p className="text-base text-white/45 max-w-xl mx-auto leading-relaxed mb-10">
            Jeju is Korea&apos;s volcanic island gem — a UNESCO triple heritage site where lava tubes,
            crater lakes, turquoise beaches, and tangerine orchards coexist. No visa required for most
            nationalities. Plan your Jeju itinerary in 30 seconds with AI.
          </p>
          <Link
            href="/?city=jeju"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Jeju Trip Free →
          </Link>
          <p className="mt-3 text-xs text-white/30">No sign-up required · AI generates your itinerary in 30 seconds</p>
        </div>
      </section>

      {/* ── Highlights ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-black text-[#2C2520] mb-2 text-center">
          Must-See in Jeju
        </h2>
        <p className="text-[#8C6239] text-center mb-10">
          The essential Jeju island itinerary stops — from volcanic peaks to hidden beaches
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.name}
              className="bg-white rounded-2xl p-5 border border-[#E6DFD5] hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{h.emoji}</span>
                <span className="text-[10px] font-black px-2 py-1 rounded-full text-[#8C6239] border border-[#D4AF37]/40 bg-[#FDF8EE]">
                  {h.tag}
                </span>
              </div>
              <h3 className="text-base font-black text-[#2C2520] mb-1.5">{h.name}</h3>
              <p className="text-sm text-[#61554D] leading-relaxed">{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Practical Info ──────────────────────────────────────────────── */}
      <section className="bg-white border-y border-[#E6DFD5] py-14 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-[#2C2520] mb-2 text-center">
            Practical Jeju Travel Info
          </h2>
          <p className="text-[#8C6239] text-center mb-10">Everything you need to know before visiting Jeju island</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRACTICAL.map((p) => (
              <div key={p.label} className="flex gap-3 p-4 rounded-xl border border-[#E6DFD5] bg-[#FAF7F2]">
                <span className="text-2xl shrink-0">{p.icon}</span>
                <div>
                  <p className="text-xs font-black text-[#8C6239] uppercase tracking-wide mb-0.5">{p.label}</p>
                  <p className="text-sm text-[#2C2520] font-medium leading-snug">{p.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Korea Ready (Surface D) ─────────────────────────────────────── */}
      <KoreaReadySection city="jeju" />

      {/* ── AI Planner CTA ──────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div
          className="rounded-3xl p-10"
          style={{
            background: "linear-gradient(135deg, #0a2a1a 0%, #1a3d2a 60%, #0d2418 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com · AI Trip Planner
          </p>
          <h2 className="text-2xl font-black text-white mb-3">
            Ready to Plan Your Jeju Itinerary?
          </h2>
          <p className="text-white/55 text-sm leading-relaxed mb-7 max-w-md mx-auto">
            Tell the AI your travel dates and style — solo, couple, family, or group.
            Get a full day-by-day Jeju island itinerary in 30 seconds. Free, no sign-up needed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Jeju Trip Free →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E6DFD5] py-8 text-center text-xs text-[#B8A89A]">
        <p>© {new Date().getFullYear()} gokoreamate.com · AI Korea Trip Planner</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/seoul" className="hover:text-[#8C6239] transition-colors">Seoul</Link>
          <Link href="/gyeongju" className="hover:text-[#8C6239] transition-colors">Gyeongju</Link>
          <Link href="/explore-busan" className="hover:text-[#8C6239] transition-colors">Busan</Link>
          <Link href="/blog" className="hover:text-[#8C6239] transition-colors">Blog</Link>
        </div>
      </footer>
    </div>
  );
}

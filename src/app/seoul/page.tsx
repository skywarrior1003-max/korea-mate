// gokoreamate — Seoul city SEO landing page
// TASK-031: static, Server Component, targets "Seoul Korea travel guide" keywords

import type { Metadata } from "next";
import Link from "next/link";
import KoreaReadySection from "@/components/KoreaReadySection";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Seoul Travel Guide 2026 — AI Korea Itinerary Planner | gokoreamate.com",
  description:
    "Plan your perfect Seoul trip with AI. 3-day & 5-day itineraries, best spots, food, K-culture & practical tips for foreign travelers. Free, no sign-up.",
  openGraph: {
    title: "Seoul Korea Travel Guide — gokoreamate.com",
    description:
      "AI-generated Seoul itineraries for foreign travelers. Palaces, Hongdae, Myeongdong, Han River & more. Plan free in 30 seconds.",
    images: [
      {
        url: "https://gokoreamate.com/og/seoul/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Seoul Korea Trip Itinerary — gokoreamate.com",
      },
    ],
    url: "https://gokoreamate.com/seoul/",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Seoul Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Seoul — palaces, street food, K-pop & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/seoul/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/seoul/" },
};

const HIGHLIGHTS = [
  {
    emoji: "🏯",
    name: "Gyeongbokgung Palace",
    desc: "Korea's grandest Joseon-era palace. Catch the 10:00 & 14:00 Royal Guard Changing Ceremony — free entry under 25 or in hanbok.",
    tag: "UNESCO Heritage",
  },
  {
    emoji: "🏘️",
    name: "Bukchon Hanok Village",
    desc: "700-year-old alleyways of traditional hanok homes between Gyeongbokgung and Changdeokgung palaces. Best before 09:00 to beat the crowds.",
    tag: "Photo Spot",
  },
  {
    emoji: "🎵",
    name: "Hongdae & Sinchon",
    desc: "Seoul's university arts district — busking performances, indie music, late-night street food, and Korea's most vibrant youth culture.",
    tag: "Nightlife",
  },
  {
    emoji: "🛍️",
    name: "Myeongdong",
    desc: "Korea's flagship shopping district. K-beauty flagship stores, street food stalls (egg bread, tteokbokki, tornado potato), and duty-free malls.",
    tag: "Shopping",
  },
  {
    emoji: "🌉",
    name: "Han River Parks",
    desc: "Rent a bike along the Han River, grab convenience store fried chicken, and watch the nightly Banpo Bridge Rainbow Fountain show (May–Oct).",
    tag: "Free",
  },
  {
    emoji: "🌃",
    name: "N Seoul Tower (Namsan)",
    desc: "360° panoramic view of Seoul from 479m elevation. Cable car or 20-min hike. The love-lock fence is a rite of passage for every Seoul visitor.",
    tag: "Night View",
  },
];

const PRACTICAL = [
  { icon: "✈️", label: "Getting There", value: "Incheon (ICN) — AREX Express Train to City Hall: 43 min, ₩9,500" },
  { icon: "🚇", label: "Getting Around", value: "Seoul Metro (9 lines). T-money card accepted. Single ride: ₩1,400–₩1,800" },
  { icon: "📱", label: "SIM / eSIM", value: "Buy at Incheon Airport arrival hall or pre-order eSIM online (activate on landing)" },
  { icon: "💳", label: "Payments", value: "Foreign Visa/Mastercard accepted almost everywhere. Carry ₩20,000 cash for street stalls" },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) cherry blossoms · Autumn (Sep–Nov) foliage. Summer is hot & humid." },
  { icon: "🗣️", label: "Language", value: "English signage on all subway lines. Google Translate camera mode handles menus." },
];

export default function SeoulPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF7F2" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-[#2C2520]">
            🇰🇷 <span style={{ color: "#D4AF37" }}>gokoreamate</span>.com
          </Link>
          <nav className="flex items-center gap-4 text-sm font-bold">
            <Link href="/busan" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Busan</Link>
            <Link href="/jeju" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Jeju</Link>
            <Link href="/gyeongju" className="text-[#8C6239] hover:text-[#2C2520] transition-colors hidden sm:block">Gyeongju</Link>
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
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 60%, rgba(74,144,217,0.18) 0%, transparent 50%), radial-gradient(circle at 75% 20%, rgba(212,175,55,0.12) 0%, transparent 45%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/50 border border-white/15 mb-6 tracking-widest uppercase">
            🇰🇷 Korea Travel Guide
          </span>
          <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Seoul
          </h1>
          <p className="text-xl text-white/60 mb-4 font-medium">
            Capital City · K-Culture · 10 Million Lights
          </p>
          <p className="text-base text-white/45 max-w-xl mx-auto leading-relaxed mb-10">
            Seoul is Korea&apos;s beating heart — ancient palaces stand beside futuristic skyscrapers,
            street food alleys lead to Michelin-starred restaurants, and K-pop culture is everywhere.
            Plan your Seoul itinerary in 30 seconds with AI.
          </p>
          <Link
            href="/?city=seoul"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Seoul Trip Free →
          </Link>
          <p className="mt-3 text-xs text-white/30">No sign-up required · AI generates your itinerary in 30 seconds</p>
        </div>
      </section>

      {/* ── Highlights ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-black text-[#2C2520] mb-2 text-center">
          Must-See in Seoul
        </h2>
        <p className="text-[#8C6239] text-center mb-10">
          The essential Seoul itinerary stops for first-time and repeat visitors
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
            Practical Seoul Travel Info
          </h2>
          <p className="text-[#8C6239] text-center mb-10">Everything you need before and during your Seoul trip</p>
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
      <KoreaReadySection city="seoul" />

      {/* ── AI Planner CTA ──────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div
          className="rounded-3xl p-10"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com · AI Trip Planner
          </p>
          <h2 className="text-2xl font-black text-white mb-3">
            Ready to Plan Your Seoul Itinerary?
          </h2>
          <p className="text-white/55 text-sm leading-relaxed mb-7 max-w-md mx-auto">
            Tell the AI your travel dates and style — solo, couple, family, or group.
            Get a full day-by-day Seoul itinerary in 30 seconds. Free, no sign-up needed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Seoul Trip Free →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E6DFD5] py-8 text-center text-xs text-[#B8A89A]">
        <p>© {new Date().getFullYear()} gokoreamate.com · AI Korea Trip Planner</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/busan" className="hover:text-[#8C6239] transition-colors">Busan</Link>
          <Link href="/jeju" className="hover:text-[#8C6239] transition-colors">Jeju</Link>
          <Link href="/gyeongju" className="hover:text-[#8C6239] transition-colors">Gyeongju</Link>
          <Link href="/blog" className="hover:text-[#8C6239] transition-colors">Blog</Link>
        </div>
      </footer>
    </div>
  );
}

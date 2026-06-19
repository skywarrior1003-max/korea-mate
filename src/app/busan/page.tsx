// gokoreamate — Busan city SEO landing page
// TASK-032: static, Server Component, targets "Busan Korea travel guide" keywords

import type { Metadata } from "next";
import Link from "next/link";
import KoreaReadySection from "@/components/KoreaReadySection";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Busan Travel Guide 2026 — AI Korea Itinerary Planner | gokoreamate.com",
  description:
    "Plan your perfect Busan trip with AI. Haeundae Beach, Gamcheon Village, seafood markets & practical tips for foreign travelers. Free, no sign-up.",
  openGraph: {
    title: "Busan Korea Travel Guide — gokoreamate.com",
    description:
      "AI-generated Busan itineraries for foreign travelers. Haeundae, Gwangalli, Jagalchi Market & more. Plan free in 30 seconds.",
    images: [
      {
        url: "https://gokoreamate.com/og/busan/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Busan Korea Trip Itinerary — gokoreamate.com",
      },
    ],
    url: "https://gokoreamate.com/busan",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Busan Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Busan — beaches, seafood, night views & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/busan/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/busan" },
};

const HIGHLIGHTS = [
  {
    emoji: "🏖️",
    name: "Haeundae Beach",
    desc: "Korea's most famous beach — 1.5km of white sand flanked by luxury hotels. Summer brings millions of visitors; spring and autumn are tranquil and perfect.",
    tag: "Icon",
  },
  {
    emoji: "🎨",
    name: "Gamcheon Culture Village",
    desc: "Busan's 'Santorini of Korea' — a hillside village of colorful houses turned into an open-air art gallery. Each alleyway hides murals, sculptures, and cafes.",
    tag: "Art · Photo",
  },
  {
    emoji: "🐟",
    name: "Jagalchi Fish Market",
    desc: "Korea's largest seafood market, open since 1945. Buy raw octopus, sea cucumber, and live fish at basement stalls, then have them cooked upstairs on the spot.",
    tag: "Food",
  },
  {
    emoji: "🌉",
    name: "Gwangalli Beach & Diamond Bridge",
    desc: "Gwangandaegyo (Diamond Bridge) illuminates the night skyline across a 7.4km span. Gwangalli beach below is lined with trendy restaurants and cocktail bars.",
    tag: "Night View",
  },
  {
    emoji: "⛩️",
    name: "Haedong Yonggungsa Temple",
    desc: "A rare coastal Buddhist temple built directly on oceanside cliffs. The dramatic setting — waves crashing below pagodas — is unlike any other temple in Korea.",
    tag: "Temple",
  },
  {
    emoji: "🚡",
    name: "Songdo Sky Walk & Cable Car",
    desc: "Korea's first public beach (1913) with a glass-bottom sky walk jutting over the sea. The cable car offers sweeping views of the Busan coastline.",
    tag: "Scenic",
  },
];

const PRACTICAL = [
  { icon: "🚄", label: "Getting There", value: "KTX from Seoul Station: 2hr 15min, from ₩59,800. Busan (PUS) airport for international flights." },
  { icon: "🚇", label: "Getting Around", value: "Busan Metro (4 lines + BRT). T-money card works. Haeundae–Nampo area taxi: ₩8,000–₩15,000." },
  { icon: "🚌", label: "Airport Bus", value: "Limousine Bus 7 links Gimhae Airport to Haeundae in ~55 min (₩8,000). Fastest option without luggage." },
  { icon: "💳", label: "Payments", value: "Cards accepted in tourist areas. Carry ₩30,000 cash for Jagalchi Market and street vendors." },
  { icon: "🌤️", label: "Best Season", value: "Autumn (Sep–Nov) for mild weather. Summer (Jul–Aug) for beach season but crowded. Avoid Chuseok week." },
  { icon: "🍜", label: "Must Eat", value: "Milmyeon (wheat noodles), Dwaeji gukbap (pork rice soup), Ssiat hotteok (seed-filled pancake) at Nampodong." },
];

export default function BusanPage() {
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
        style={{ background: "linear-gradient(160deg, #0d1f3c 0%, #1a3057 60%, #0a2545 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 60%, rgba(74,144,217,0.20) 0%, transparent 50%), radial-gradient(circle at 72% 25%, rgba(212,175,55,0.12) 0%, transparent 45%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/50 border border-white/15 mb-6 tracking-widest uppercase">
            🇰🇷 Korea Travel Guide
          </span>
          <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Busan
          </h1>
          <p className="text-xl text-white/60 mb-4 font-medium">
            Ocean City · Seafood Capital · Beach & Mountains
          </p>
          <p className="text-base text-white/45 max-w-xl mx-auto leading-relaxed mb-10">
            Busan is Korea&apos;s second city and its undisputed capital of seafood, beaches, and nightlife.
            Where mountains meet the sea, traditional fish markets coexist with rooftop bars,
            and colorful hillside villages overlook glittering bridges. Plan your Busan itinerary in 30 seconds with AI.
          </p>
          <Link
            href="/?city=busan"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Busan Trip Free →
          </Link>
          <p className="mt-3 text-xs text-white/30">No sign-up required · AI generates your itinerary in 30 seconds</p>
        </div>
      </section>

      {/* ── Highlights ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-black text-[#2C2520] mb-2 text-center">
          Must-See in Busan
        </h2>
        <p className="text-[#8C6239] text-center mb-10">
          The essential Busan itinerary stops — from world-class beaches to coastal temples
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
            Practical Busan Travel Info
          </h2>
          <p className="text-[#8C6239] text-center mb-10">Everything you need before and during your Busan trip</p>
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
      <KoreaReadySection city="busan" />

      {/* ── AI Planner CTA ──────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div
          className="rounded-3xl p-10"
          style={{
            background: "linear-gradient(135deg, #0d1f3c 0%, #1a3057 60%, #0a2545 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com · AI Trip Planner
          </p>
          <h2 className="text-2xl font-black text-white mb-3">
            Ready to Plan Your Busan Itinerary?
          </h2>
          <p className="text-white/55 text-sm leading-relaxed mb-7 max-w-md mx-auto">
            Tell the AI your travel dates and style — solo, couple, family, or group.
            Get a full day-by-day Busan itinerary in 30 seconds. Free, no sign-up needed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Busan Trip Free →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E6DFD5] py-8 text-center text-xs text-[#B8A89A]">
        <p>© {new Date().getFullYear()} gokoreamate.com · AI Korea Trip Planner</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/seoul" className="hover:text-[#8C6239] transition-colors">Seoul</Link>
          <Link href="/jeju" className="hover:text-[#8C6239] transition-colors">Jeju</Link>
          <Link href="/gyeongju" className="hover:text-[#8C6239] transition-colors">Gyeongju</Link>
          <Link href="/blog" className="hover:text-[#8C6239] transition-colors">Blog</Link>
        </div>
      </footer>
    </div>
  );
}

// gokoreamate — Gyeongju city SEO landing page
// TASK-031: static, Server Component, targets "Gyeongju Korea travel" keywords

import type { Metadata } from "next";
import Link from "next/link";
import KoreaReadySection from "@/components/KoreaReadySection";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Gyeongju Travel Guide 2026 — AI Korea Itinerary Planner | gokoreamate.com",
  description:
    "Plan your perfect Gyeongju trip with AI. Bulguksa Temple, royal tumuli, Cheomseongdae & practical tips for foreign travelers. Free, no sign-up.",
  openGraph: {
    title: "Gyeongju Korea Travel Guide — gokoreamate.com",
    description:
      "AI-generated Gyeongju itineraries for foreign travelers. Bulguksa, Seokguram, royal tombs & more. Plan free in 30 seconds.",
    images: [
      {
        url: "https://gokoreamate.com/og/gyeongju/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Gyeongju Korea Trip Itinerary — gokoreamate.com",
      },
    ],
    url: "https://gokoreamate.com/gyeongju",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gyeongju Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Gyeongju — ancient capital, temples, royal tombs & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/gyeongju/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/gyeongju" },
};

const HIGHLIGHTS = [
  {
    emoji: "🏛️",
    name: "Bulguksa Temple",
    desc: "Korea's most celebrated Buddhist temple, built in 751 CE. The two stone pagodas (Dabotap & Seokgatap) and Cheongungyo bridge are masterpieces of Silla architecture.",
    tag: "UNESCO",
  },
  {
    emoji: "🗿",
    name: "Seokguram Grotto",
    desc: "An 8th-century granite Buddha enshrined in a man-made cave overlooking the East Sea. Considered Korea's finest Buddhist artwork. 10-min bus from Bulguksa.",
    tag: "UNESCO",
  },
  {
    emoji: "🪦",
    name: "Tumuli Park (Royal Tombs)",
    desc: "23 massive grass-covered royal burial mounds of the Silla kingdom. Stroll freely around them at dusk when the park glows amber. Cheonmachong tomb is open inside.",
    tag: "Free",
  },
  {
    emoji: "🌸",
    name: "Anapji Pond (Donggung)",
    desc: "A Silla-era palace pond built in 674 CE — stunning at night when lanterns reflect across the water. One of Korea's most photographed night scenes.",
    tag: "Night View",
  },
  {
    emoji: "🔭",
    name: "Cheomseongdae Observatory",
    desc: "The oldest surviving astronomical observatory in Asia (634 CE). A 9.4m cylindrical stone tower in the middle of a field — simple, ancient, mesmerizing.",
    tag: "Historical",
  },
  {
    emoji: "🎋",
    name: "Gyeongju Yangdong Village",
    desc: "A 500-year-old Joseon aristocratic village with original tiled-roof mansions and thatched-roof homes. UNESCO-listed and far less crowded than Seoul's Bukchon.",
    tag: "UNESCO · Village",
  },
];

const PRACTICAL = [
  { icon: "🚄", label: "Getting There", value: "KTX from Seoul to Singyeongju: 2hr (₩42,800). From Busan: 23 min (₩9,800). Gyeongju sits between them." },
  { icon: "🚌", label: "Getting Around", value: "City bus #10 & #11 loop the main sites (Bulguksa, Tumuli, Cheomseongdae). All-day bus pass: ₩5,000" },
  { icon: "🚴", label: "Best Way", value: "Rent a bike near Gyeongju Station — the city is flat and the royal tombs area is perfect for cycling. ₩3,000–₩5,000/hr." },
  { icon: "💳", label: "Payments", value: "Cards accepted at major sites. Carry cash for street stalls near Bulguksa and the local market." },
  { icon: "🌤️", label: "Best Season", value: "Spring (Mar–May) cherry blossoms around the tombs · Autumn (Sep–Nov) for golden foliage + harvest moon festivals." },
  { icon: "🏨", label: "Base Camp", value: "Stay downtown for bike access to tombs. Or base in Busan (23 min by KTX) for a comfortable day trip." },
];

export default function GyeongjuPage() {
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
        style={{ background: "linear-gradient(160deg, #2a1a08 0%, #3d2810 60%, #1a0f05 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 65%, rgba(212,149,74,0.18) 0%, transparent 50%), radial-gradient(circle at 70% 20%, rgba(212,175,55,0.12) 0%, transparent 45%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/50 border border-white/15 mb-6 tracking-widest uppercase">
            🇰🇷 Korea Travel Guide
          </span>
          <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 leading-tight">
            Gyeongju
          </h1>
          <p className="text-xl text-white/60 mb-4 font-medium">
            Ancient Capital · 1,000 Years of Silla · Open-Air Museum City
          </p>
          <p className="text-base text-white/45 max-w-xl mx-auto leading-relaxed mb-10">
            Gyeongju was the capital of the Silla Kingdom for nearly 1,000 years. Today it&apos;s a
            UNESCO World Heritage city where grass-covered royal tombs, Buddhist temples, and
            ancient observatories stand peacefully among modern streets. Plan your trip with AI.
          </p>
          <Link
            href="/?city=gyeongju"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Gyeongju Trip Free →
          </Link>
          <p className="mt-3 text-xs text-white/30">No sign-up required · AI generates your itinerary in 30 seconds</p>
        </div>
      </section>

      {/* ── Highlights ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-black text-[#2C2520] mb-2 text-center">
          Must-See in Gyeongju
        </h2>
        <p className="text-[#8C6239] text-center mb-10">
          The essential Gyeongju itinerary stops — 5 UNESCO sites in one city
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
            Practical Gyeongju Travel Info
          </h2>
          <p className="text-[#8C6239] text-center mb-10">Everything you need to know before visiting Gyeongju</p>
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
      <KoreaReadySection city="gyeongju" />

      {/* ── AI Planner CTA ──────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div
          className="rounded-3xl p-10"
          style={{
            background: "linear-gradient(135deg, #2a1a08 0%, #3d2810 60%, #1a0f05 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com · AI Trip Planner
          </p>
          <h2 className="text-2xl font-black text-white mb-3">
            Ready to Plan Your Gyeongju Itinerary?
          </h2>
          <p className="text-white/55 text-sm leading-relaxed mb-7 max-w-md mx-auto">
            Tell the AI your travel dates and style — solo, couple, family, or group.
            Get a full day-by-day Gyeongju itinerary in 30 seconds. Free, no sign-up needed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-10 py-4 rounded-xl text-base font-black text-[#1a1a2e] transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: "#D4AF37" }}
          >
            ✨ Plan My Gyeongju Trip Free →
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E6DFD5] py-8 text-center text-xs text-[#B8A89A]">
        <p>© {new Date().getFullYear()} gokoreamate.com · AI Korea Trip Planner</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/seoul" className="hover:text-[#8C6239] transition-colors">Seoul</Link>
          <Link href="/jeju" className="hover:text-[#8C6239] transition-colors">Jeju</Link>
          <Link href="/busan" className="hover:text-[#8C6239] transition-colors">Busan</Link>
          <Link href="/blog" className="hover:text-[#8C6239] transition-colors">Blog</Link>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AdBanner from "@/components/AdBanner";
// ─ 단계 4 ~ 5 에서 만든 컴포넌트 통합 ─
import EventCard from "@/components/EventCard";
import EventDetailModal from "@/components/EventDetailModal";
import type { EventItem } from "@/lib/cart";

// ── 기존 로컬 스팟 타입 ─────────────────────────
interface LocalInfo {
  id: number;
  name: string;
  category: "attraction" | "restaurant" | "event" | "accommodation";
  city: string;
  address: string;
  description: string;
  searchKeyword?: string;
  mapUrl: string;
  soloFriendly: boolean;
  foreignCardAccepted: boolean;
  cashOnly?: boolean;
  image?: string;
}

// ── Trending Events 필터 정의 ──────────────────
// Mega Event: concert / festival / event  |  Activity: pilgrimage / permanent / logistics
const EVENT_FILTERS = [
  { key: "all",      label: "All"        },
  { key: "busan",    label: "🏙️ Busan"   },
  { key: "mega",     label: "🎤 Mega Event" },
  { key: "activity", label: "🗺️ Activity" },
];

export default function Home() {

  // ── 로컬 스팟 상태 ──────────────────────────
  const [localInfoData,    setLocalInfoData]    = useState<LocalInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading,          setLoading]          = useState<boolean>(true);
  const [spotImages,       setSpotImages]       = useState<Record<number, string | null>>({});
  const [imgErrors,        setImgErrors]        = useState<Record<number, boolean>>({});

  // ── AI 플래너 폼 상태 ───────────────────────
  const [city,      setCity]      = useState("Seoul");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [travelers, setTravelers] = useState("1");
  const [style,     setStyle]     = useState("Solo");

  // ── Trending Events 상태 ────────────────────
  const [eventsData,    setEventsData]    = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [eventFilter,   setEventFilter]   = useState<string>("busan");

  const router = useRouter();

  // ── AI 일정 생성 ─────────────────────────────
  const handleGenerate = () => {
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    const params = new URLSearchParams({ city, startDate, endDate, travelers, travelStyle: style });
    router.push(`/itinerary?${params.toString()}`);
  };

  // ── 로컬 스팟 데이터 로드 ──────────────────
  useEffect(() => {
    fetch("/data/local-info.json")
      .then((r) => r.json())
      .then((data) => { setLocalInfoData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── 로컬 스팟 이미지 패치 ──────────────────
  useEffect(() => {
    if (localInfoData.length === 0) return;
    const immediate: Record<number, string | null> = {};
    const needsApi: LocalInfo[] = [];
    localInfoData.forEach((item) => {
      if (item.image) { immediate[item.id] = item.image; }
      else            { needsApi.push(item); }
    });
    setSpotImages(immediate);
    if (needsApi.length === 0) return;
    Promise.all(
      needsApi.map((item) =>
        fetch(`/api/spot-images?spotName=${encodeURIComponent(item.name)}${item.searchKeyword ? `&searchKeyword=${encodeURIComponent(item.searchKeyword)}` : ""}`)
          .then((r) => r.json())
          .then(({ imageUrl }: { imageUrl: string | null }) => ({ id: item.id, imageUrl }))
          .catch(() => ({ id: item.id, imageUrl: null }))
      )
    ).then((results) => {
      setSpotImages((prev) => {
        const map = { ...prev };
        results.forEach(({ id, imageUrl }) => { map[id] = imageUrl; });
        return map;
      });
    });
  }, [localInfoData]);

  // ── Trending Events 데이터 로드 ────────────
  useEffect(() => {
    fetch("/data/events.json")
      .then((r) => r.json())
      .then((data: EventItem[]) => { setEventsData(data); setEventsLoading(false); })
      .catch(() => setEventsLoading(false));
  }, []);

  // ── 필터 적용 (isTrending 우선 정렬) ───────
  const filteredEvents = (() => {
    let list = eventsData;
    if (eventFilter === "busan")
      list = list.filter((e) => e.city === "Busan");
    else if (eventFilter === "mega")
      list = list.filter((e) => ["concert", "festival", "event"].includes(e.type));
    else if (eventFilter === "activity")
      list = list.filter((e) => ["pilgrimage", "permanent", "logistics"].includes(e.type));
    // Trending 항목 상단 정렬
    return [...list].sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
  })();

  // ── 로컬 스팟 카테고리 필터 ───────────────
  const categories = [
    { value: "all",        label: "All Spots"    },
    { value: "attraction", label: "Attractions"  },
    { value: "restaurant", label: "Restaurants"  },
    { value: "event",      label: "Events"       },
  ];
  const filteredData =
    selectedCategory === "all"
      ? localInfoData
      : localInfoData.filter((item) => item.category === selectedCategory);

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      {/* ══════════════════════════════════════════════════════════════
          Section 1 · eSIM 배너 (상단 고정 알림)
      ══════════════════════════════════════════════════════════════ */}
      <div
        className="py-3 px-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm"
        style={{ backgroundColor: "#1a1f36" }}
      >
        <span className="text-white font-medium">
          📱 Stay connected in Korea — Get eSIM before you land
        </span>
        <a
          href="https://www.airalo.com/south-korea-esim"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#f97316" }}
        >
          Get eSIM →
        </a>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Section 2 · 네비게이션
      ══════════════════════════════════════════════════════════════ */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Blog</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">Survival Guide</Link>
            <Link href="/about"         className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">About</Link>
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan My Trip
            </button>
          </nav>
          <button
            onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
            className="sm:hidden px-4 py-2 rounded-lg text-sm font-bold text-white cursor-pointer"
            style={{ backgroundColor: "#f97316" }}
          >
            Plan My Trip
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════
          Section 3 · 히어로 (메인 헤드카피)
      ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-24 sm:py-36" style={{ backgroundColor: "#1a1f36" }}>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 60%, #f97316 0%, transparent 45%), radial-gradient(circle at 85% 15%, #3b82f6 0%, transparent 40%)",
          }}
        />
        <div className="relative max-w-4xl mx-auto text-center px-4 sm:px-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white/70 border border-white/20 mb-6 tracking-widest uppercase">
            ✨ AI-Powered Travel Guide
          </span>
          <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-tight mb-6">
            Don&apos;t Get Stuck<br />
            in <span style={{ color: "#f97316" }}>Korea</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-10">
            AI builds your itinerary. We handle the confusing parts — payments, transport, solo dining.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => document.getElementById("trending-events")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-black text-white shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              🔥 See Trending Events →
            </button>
            <Link
              href="/survival-guide"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold text-white border-2 border-white/30 hover:border-white/60 transition-colors"
            >
              See Survival Guide
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 4 · 신뢰 지표 (숫자 3개)
      ══════════════════════════════════════════════════════════════ */}
      <section className="bg-white border-b border-gray-100 py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 text-center gap-8 sm:gap-0">
            <div className="sm:px-8 pb-8 sm:pb-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">🌏 6.7M+</div>
              <div className="text-sm font-semibold text-gray-500">Foreign Visitors in 2026</div>
            </div>
            <div className="sm:px-8 py-8 sm:py-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">📍 200+</div>
              <div className="text-sm font-semibold text-gray-500">Verified Solo-friendly Spots</div>
            </div>
            <div className="sm:px-8 pt-8 sm:pt-0">
              <div className="text-3xl sm:text-4xl font-black text-gray-900 mb-1">⚡ 30 sec</div>
              <div className="text-sm font-semibold text-gray-500">To generate your itinerary</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 5 · AI 일정 생성 폼
      ══════════════════════════════════════════════════════════════ */}
      <section id="planner" className="py-20" style={{ backgroundColor: "#faf8f3" }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">✨ Plan Your Korea Trip with AI</h2>
            <p className="text-base font-medium text-gray-500">Free • No signup required • Ready in 30 seconds</p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Where to? (City)</label>
                <select value={city} onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="Seoul">Seoul</option>
                  <option value="Busan">Busan</option>
                  <option value="Jeju">Jeju Island</option>
                  <option value="Gyeongju">Gyeongju</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Travel Style</label>
                <select value={style} onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="Solo">Solo FIT Traveler</option>
                  <option value="Couple">Couple / Partners</option>
                  <option value="Family">Family Trip</option>
                  <option value="Group">Friends / Group</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Number of Travelers</label>
                <input type="number" min="1" max="50" value={travelers} onChange={(e) => setTravelers(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <button onClick={handleGenerate}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}>
              ✨ Generate My Itinerary
            </button>
          </div>
        </div>
      </section>

      {/* AdBanner */}
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <AdBanner />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Section 6 · Essential Cards (여행 필수 정보 3가지)
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-20" style={{ backgroundColor: "#f0f4ff" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Essential for Foreign Travelers</h2>
            <p className="text-base font-medium text-gray-500">Things Korea doesn&apos;t explain to tourists</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: "📱", title: "Stay Connected",
                desc: "Get your Korea eSIM before landing. No registration hassle.",
                href: "https://www.airalo.com/south-korea-esim",
                cta: "Get 10% Off eSIM →",
                external: true,
              },
              {
                icon: "🚇", title: "Transport Card",
                desc: "How to get T-money card and load cash at convenience stores.",
                href: "/survival-guide",
                cta: "Read Guide →",
                external: false,
              },
              {
                icon: "💳", title: "Cash & Payments",
                desc: "Where foreign cards work. Which places are cash-only.",
                href: "/survival-guide",
                cta: "Read Guide →",
                external: false,
              },
            ].map((card) => (
              <div key={card.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col">
                <div className="text-4xl mb-4">{card.icon}</div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">{card.desc}</p>
                {card.external ? (
                  <a href={card.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#f97316" }}>
                    {card.cta}
                  </a>
                ) : (
                  <Link href={card.href}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-gray-900 border-2 border-gray-200 hover:border-gray-400 transition-colors">
                    {card.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 7 · TRENDING EVENTS (핵심 신규 섹션)
          - events.json 12개 로드
          - EventCard 그리드
          - EventDetailModal 연동
          - CartDrawer 배지 실시간 반영
      ══════════════════════════════════════════════════════════════ */}
      <section id="trending-events" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* 섹션 헤더 카드 (네이비 배경) */}
          <div
            className="rounded-3xl px-8 py-10 mb-10 relative overflow-hidden"
            style={{ backgroundColor: "#1a1f36" }}
          >
            {/* 배경 그라디언트 효과 */}
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 90% 50%, #f97316 0%, transparent 50%), radial-gradient(circle at 10% 20%, #3b82f6 0%, transparent 40%)",
              }}
            />
            <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

              {/* 타이틀 */}
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black text-orange-400 border border-orange-400/30 bg-orange-400/10 mb-4 uppercase tracking-widest">
                  🔥 Trending Now in Korea
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-2">
                  Add to Your Itinerary
                </h2>
                <p className="text-white/60 text-base max-w-lg">
                  BTS concerts, Busan fireworks, K-pop pilgrimages — pick what excites you and
                  build your personalized trip in seconds.
                </p>
              </div>

              {/* 플래너 이동 버튼 */}
              <Link
                href="/planner"
                className="shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                🗺️ Open My Planner →
              </Link>
            </div>

            {/* 필터 탭 */}
            <div className="relative flex flex-wrap gap-2 mt-8">
              {EVENT_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setEventFilter(f.key)}
                  className="px-4 py-1.5 rounded-full text-sm font-bold transition-all border cursor-pointer"
                  style={
                    eventFilter === f.key
                      ? { backgroundColor: "#f97316", color: "#fff", borderColor: "#f97316" }
                      : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.15)" }
                  }
                >
                  {f.label}
                  {eventFilter === f.key && (
                    <span className="ml-1.5 text-xs opacity-80">
                      {filteredEvents.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* EventCard 그리드 */}
          {eventsLoading ? (
            <div className="text-center py-20">
              <div
                className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4"
                style={{ borderColor: "#f97316" }}
              />
              <p className="text-gray-500 font-medium">Loading trending events…</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🎌</p>
              <p className="text-gray-500 font-semibold">No events in this category yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => (
                // EventCard 클릭 → selectedEvent 설정 → EventDetailModal 오픈
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>
          )}

          {/* 하단 안내 */}
          <p className="text-center text-xs text-gray-400 mt-8">
            Tap any card to see details and add it to your itinerary.
            Your picks will appear in the cart bar below. ↓
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 8 · Explore Korea (기존 로컬 스팟 카드)
      ══════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-black text-gray-900">Explore Korea</h2>
              <p className="text-gray-500 mt-2 text-base">Verified local spots to explore worry-free</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className="px-4 py-2 rounded-full text-sm font-bold transition-all border cursor-pointer"
                  style={
                    selectedCategory === cat.value
                      ? { backgroundColor: "#1a1f36", color: "white", borderColor: "#1a1f36" }
                      : { backgroundColor: "white", color: "#6b7280", borderColor: "#e5e7eb" }
                  }
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: "#f97316" }} />
              <p className="text-gray-500 font-medium">Loading awesome local spots…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-lg transition-all duration-300"
                >
                  <div className="h-44 overflow-hidden relative bg-gray-200">
                    {!(item.id in spotImages) ? (
                      <div className="w-full h-full bg-gray-200 animate-pulse" />
                    ) : spotImages[item.id] && !imgErrors[item.id] ? (
                      <Image
                        src={spotImages[item.id] as string}
                        alt={item.name}
                        fill
                        unoptimized
                        onError={() => setImgErrors((prev) => ({ ...prev, [item.id]: true }))}
                        className="object-cover transition-transform duration-300 hover:scale-105"
                      />
                    ) : (
                      // Rule 9: 이미지 로드 실패 시 SVG 플레이스홀더 표시
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/images/placeholder-spot.svg" alt="No image available" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md" style={{ backgroundColor: "#eff6ff", color: "#3b5bdb" }}>
                        {item.category}
                      </span>
                      <span className="text-xs font-medium text-gray-500">📍 {item.city}</span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 mb-2 leading-snug line-clamp-2">{item.name}</h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed flex-1">{item.description}</p>
                    <a
                      href={item.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold text-gray-900 border border-gray-200 hover:border-gray-400 rounded-xl transition-all"
                    >
                      🗺️ View on Map →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 9 · Survival Guide Preview
      ══════════════════════════════════════════════════════════════ */}
      <section className="py-20" style={{ backgroundColor: "#1a1f36" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">Survival Guide for Korea</h2>
            <p className="text-base font-medium text-gray-400">Everything tourists struggle with — solved.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: "🚇", title: "Getting Around", desc: "교통 완전 정복" },
              { icon: "💳", title: "Payments",       desc: "결제/현금 가이드" },
              { icon: "🍜", title: "Solo Dining",    desc: "1인 식당 찾기"  },
            ].map((card) => (
              <Link
                key={card.title}
                href="/survival-guide"
                className="group rounded-2xl p-8 flex flex-col gap-3 border border-white/10 transition-all hover:bg-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              >
                <div className="text-4xl">{card.icon}</div>
                <h3 className="text-xl font-black text-white">{card.title}</h3>
                <p className="text-sm font-medium text-gray-400">{card.desc}</p>
                <span className="text-sm font-bold mt-2 group-hover:underline" style={{ color: "#f97316" }}>
                  Read More →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          Section 10 · 푸터
      ══════════════════════════════════════════════════════════════ */}
      <footer className="py-12 px-4" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-xl font-black text-white flex items-center gap-1.5">
              <span className="text-2xl">🇰🇷</span>
              Korea<span style={{ color: "#f97316" }}>Mate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Blog</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">Survival Guide</Link>
              <Link href="/about"         className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">About</Link>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              Data by Korea Tourism Organization<br />AI by Gemini
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* CartDrawer 가림 방지 하단 여백 */}
      <div className="h-20" />

      {/* ══════════════════════════════════════════════════════════════
          EventDetailModal (z-50 오버레이)
          selectedEvent 가 설정되면 렌더링,
          onClose 호출 시 null 로 초기화 → 모달 사라짐
      ══════════════════════════════════════════════════════════════ */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

    </div>
  );
}

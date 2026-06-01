"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdBanner from "@/components/AdBanner";

interface LocalInfo {
  id: number;
  name: string;
  category: "attraction" | "restaurant" | "event" | "accommodation";
  city: string;
  address: string;
  description: string;
  mapUrl: string;
  soloFriendly: boolean;
  foreignCardAccepted: boolean;
  cashOnly?: boolean;
  image: string;
}

export default function Home() {
  const [localInfoData, setLocalInfoData] = useState<LocalInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);

  const [city, setCity] = useState("Seoul");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState("1");
  const [style, setStyle] = useState("Solo");

  const router = useRouter();

  const handleGenerate = () => {
    if (!startDate || !endDate) {
      alert("Please select both start and end travel dates.");
      return;
    }
    const params = new URLSearchParams({
      city,
      startDate,
      endDate,
      travelers,
      travelStyle: style,
    });
    router.push(`/itinerary?${params.toString()}`);
  };

  useEffect(() => {
    fetch("/data/local-info.json")
      .then((res) => res.json())
      .then((data) => {
        setLocalInfoData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading local info:", err);
        setLoading(false);
      });
  }, []);

  const categories = [
    { value: "all", label: "All Spots" },
    { value: "attraction", label: "Attractions" },
    { value: "restaurant", label: "Restaurants" },
    { value: "event", label: "Events" },
  ];

  const filteredData =
    selectedCategory === "all"
      ? localInfoData
      : localInfoData.filter((item) => item.category === selectedCategory);

  const spotIcon = (category: string) => {
    if (category === "restaurant") return "🍜";
    if (category === "event") return "🎉";
    if (category === "accommodation") return "🏨";
    return "🏰";
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased">

      {/* Section 1: eSIM Banner */}
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

      {/* Section 2: Navigation */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black text-gray-900 flex items-center gap-1.5">
            <span className="text-2xl">🇰🇷</span>
            Korea<span style={{ color: "#f97316" }}>Mate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              Blog
            </Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              Survival Guide
            </Link>
            <Link href="/about" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              About
            </Link>
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

      {/* Section 3: Hero */}
      <section
        className="relative overflow-hidden py-24 sm:py-36"
        style={{ backgroundColor: "#1a1f36" }}
      >
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
            Don&apos;t Get Stuck
            <br />
            in <span style={{ color: "#f97316" }}>Korea</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-10">
            AI builds your itinerary. We handle the confusing parts — payments, transport, solo dining.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-black text-white shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              Plan My Trip Free →
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

      {/* Section 4: Trust Metrics */}
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

      {/* Section 5: AI Planner Form */}
      <section id="planner" className="py-20" style={{ backgroundColor: "#faf8f3" }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              ✨ Plan Your Korea Trip with AI
            </h2>
            <p className="text-base font-medium text-gray-500">
              Free • No signup required • Ready in 30 seconds
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Where to? (City)
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="Seoul">Seoul</option>
                  <option value="Busan">Busan</option>
                  <option value="Jeju">Jeju Island</option>
                  <option value="Gyeongju">Gyeongju</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Travel Style
                </label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="Solo">Solo FIT Traveler</option>
                  <option value="Couple">Couple / Partners</option>
                  <option value="Family">Family Trip</option>
                  <option value="Group">Friends / Group</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Number of Travelers
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={travelers}
                  onChange={(e) => setTravelers(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full mt-6 py-4 rounded-xl text-base font-black text-white shadow-md transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: "#f97316" }}
            >
              ✨ Generate My Itinerary
            </button>
          </div>
        </div>
      </section>

      {/* AdBanner */}
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <AdBanner />
      </div>

      {/* Section 6: Essential Cards */}
      <section className="py-20" style={{ backgroundColor: "#f0f4ff" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">
              Essential for Foreign Travelers
            </h2>
            <p className="text-base font-medium text-gray-500">
              Things Korea doesn&apos;t explain to tourists
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col">
              <div className="text-4xl mb-4">📱</div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Stay Connected</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                Get your Korea eSIM before landing. No registration hassle.
              </p>
              <a
                href="https://www.airalo.com/south-korea-esim"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#f97316" }}
              >
                Get 10% Off eSIM →
              </a>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col">
              <div className="text-4xl mb-4">🚇</div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Transport Card</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                How to get T-money card and load cash at convenience stores.
              </p>
              <Link
                href="/survival-guide"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-gray-900 border-2 border-gray-200 hover:border-gray-400 transition-colors"
              >
                Read Guide →
              </Link>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 flex flex-col">
              <div className="text-4xl mb-4">💳</div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Cash & Payments</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6 flex-1">
                Where foreign cards work. Which places are cash-only.
              </p>
              <Link
                href="/survival-guide"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-bold text-gray-900 border-2 border-gray-200 hover:border-gray-400 transition-colors"
              >
                Read Guide →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Spot Cards */}
      <section className="bg-white py-20">
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
              <div
                className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4"
                style={{ borderColor: "#f97316" }}
              />
              <p className="text-gray-500 font-medium">Loading awesome local spots...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-lg transition-all duration-300"
                >
                  <div className="h-44 overflow-hidden relative bg-gray-100">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        const parent = el.parentElement;
                        if (parent) {
                          parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-5xl" style="background:#f0f4ff">${spotIcon(item.category)}</div>`;
                        }
                      }}
                    />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
                        style={{ backgroundColor: "#eff6ff", color: "#3b5bdb" }}
                      >
                        {item.category}
                      </span>
                      <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                        📍 {item.city}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 mb-2 leading-snug line-clamp-2">
                      {item.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed flex-1">
                      {item.description}
                    </p>
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

      {/* Section 8: Survival Guide Preview */}
      <section className="py-20" style={{ backgroundColor: "#1a1f36" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Survival Guide for Korea
            </h2>
            <p className="text-base font-medium text-gray-400">
              Everything tourists struggle with — solved.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: "🚇", title: "Getting Around", desc: "교통 완전 정복" },
              { icon: "💳", title: "Payments", desc: "결제/현금 가이드" },
              { icon: "🍜", title: "Solo Dining", desc: "1인 식당 찾기" },
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
                <span
                  className="text-sm font-bold mt-2 group-hover:underline"
                  style={{ color: "#f97316" }}
                >
                  Read More →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Section 9: Footer */}
      <footer className="py-12 px-4" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-xl font-black text-white flex items-center gap-1.5">
              <span className="text-2xl">🇰🇷</span>
              Korea<span style={{ color: "#f97316" }}>Mate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Blog
              </Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Survival Guide
              </Link>
              <Link href="/about" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                About
              </Link>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              Data by Korea Tourism Organization
              <br />
              AI by Gemini
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">
              © {new Date().getFullYear()} KoreaMate. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

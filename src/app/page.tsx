"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LocalInfo {
  id: string;
  name: string;
  category: "attraction" | "restaurant" | "event" | "accommodation";
  location: string;
  soloFriendly: boolean;
  cardAccepted: boolean;
  englishMenu: boolean;
  barrierFree: boolean;
  koreanSurvivalScore: number;
  googleMapsUrl: string;
  affiliateLink: string;
  startDate: string | null;
  endDate: string | null;
  target: string;
  summary: string;
}

export default function Home() {
  const [localInfoData, setLocalInfoData] = useState<LocalInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);

  // Form states
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
    { value: "attraction", label: "🏰 Attractions" },
    { value: "restaurant", label: "🥢 Restaurants" },
    { value: "event", label: "🎉 Events" },
  ];

  const filteredData =
    selectedCategory === "all"
      ? localInfoData
      : localInfoData.filter((item) => item.category === selectedCategory);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* 3. Sticky eSIM Banner - Enlarged Font */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] text-[#2C2520] py-3.5 px-4 text-center text-base sm:text-lg font-bold tracking-wide shadow-sm flex flex-col sm:flex-row items-center justify-center gap-3 transition-all">
        <span>📱 Stay connected in Korea — Get your eSIM before you land with 10% off</span>
        <a
          href="#"
          className="inline-flex items-center justify-center px-5 py-1.5 text-sm font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-full hover:bg-black transition-colors duration-200"
        >
          Get eSIM Now
        </a>
      </div>

      {/* 1. Header Navigation - Enlarged Logo and Links */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-24 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="text-[#D4AF37] text-4xl">🇰🇷</span> Korea<span className="text-[#D4AF37]">Mate</span>
            </span>
          </div>
          <nav className="flex items-center gap-8 sm:gap-10">
            <Link
              href="/blog"
              className="text-base sm:text-lg font-bold hover:text-[#D4AF37] transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/survival-guide"
              className="text-base sm:text-lg font-bold hover:text-[#D4AF37] transition-colors"
            >
              Survival Guide
            </Link>
            <Link
              href="/about"
              className="text-base sm:text-lg font-bold hover:text-[#D4AF37] transition-colors"
            >
              About
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. Hero Section - Enlarged Title and Subtitle */}
      <section className="relative overflow-hidden py-20 sm:py-28 bg-gradient-to-b from-[#F3EEE3] to-[#FAF7F2] border-b border-[#E6DFD5]">
        <div className="absolute inset-0 opacity-5 mix-blend-overlay bg-[radial-gradient(#D4AF37_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 relative z-10">
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold bg-[#EAE3D2] text-[#8C6239] mb-6 tracking-wider uppercase">
            ✨ AI-Powered Travel Assistant
          </span>
          <h1 className="text-5xl sm:text-7xl font-black text-[#2C2520] tracking-tight leading-tight">
            Your AI Travel Guide for <span className="text-[#D4AF37]">Korea</span>
          </h1>
          <p className="mt-8 text-xl sm:text-2xl text-[#61554D] max-w-3xl mx-auto leading-relaxed">
            Plan your trip, find solo-friendly spots, and navigate local payment systems without getting stuck in Korea.
          </p>
        </div>
      </section>

      {/* 4. AI Scheduler Input Form Section - Enlarged Text Inputs & Titles */}
      <section className="max-w-4xl mx-auto w-full px-4 -mt-10 sm:-mt-14 relative z-20">
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-[#E6DFD5]">
          <h2 className="text-3xl font-black mb-8 text-center sm:text-left text-[#2C2520] flex items-center gap-3 justify-center sm:justify-start">
            <span className="text-[#D4AF37] text-4xl">🗺️</span> Plan Your Korea Trip with AI
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-extrabold uppercase tracking-wider text-[#8C6239]">
                Where to? (City)
              </label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E6DFD5] rounded-xl px-4 py-3.5 text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-[#2C2520]"
              >
                <option value="Seoul">Seoul</option>
                <option value="Busan">Busan</option>
                <option value="Jeju">Jeju Island</option>
                <option value="Gyeongju">Gyeongju</option>
              </select>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-extrabold uppercase tracking-wider text-[#8C6239]">
                Travel Style
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E6DFD5] rounded-xl px-4 py-3.5 text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-[#2C2520]"
              >
                <option value="Solo">Solo FIT Traveler</option>
                <option value="Couple">Couple / Partners</option>
                <option value="Family">Family Trip</option>
                <option value="Group">Friends / Group</option>
              </select>
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-extrabold uppercase tracking-wider text-[#8C6239]">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E6DFD5] rounded-xl px-4 py-3.5 text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-[#2C2520]"
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <label className="text-sm font-extrabold uppercase tracking-wider text-[#8C6239]">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E6DFD5] rounded-xl px-4 py-3.5 text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-[#2C2520]"
              />
            </div>

            <div className="flex flex-col gap-2.5 sm:col-span-2">
              <label className="text-sm font-extrabold uppercase tracking-wider text-[#8C6239]">
                Number of Travelers
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={travelers}
                onChange={(e) => setTravelers(e.target.value)}
                className="w-full bg-[#FAF7F2] border border-[#E6DFD5] rounded-xl px-4 py-3.5 text-base sm:text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-[#2C2520]"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="w-full mt-10 bg-[#D4AF37] hover:bg-[#C29D26] text-[#2C2520] font-black text-lg sm:text-xl py-4.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            ✨ Generate My Itinerary
          </button>
        </div>
      </section>

      {/* 5. Local Info Card Section - Enlarged Title and Cards text */}
      <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-6">
          <div>
            <h2 className="text-4xl sm:text-5xl font-black text-[#2C2520]">Explore Korea</h2>
            <p className="text-[#61554D] mt-3 text-lg sm:text-xl">Verified local spots to explore worry-free</p>
          </div>

          {/* Interactive Category Tabs - Enlarged */}
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-5 py-2.5 rounded-full text-sm sm:text-base font-black tracking-wide transition-all border cursor-pointer ${
                  selectedCategory === cat.value
                    ? "bg-[#2C2520] text-[#FAF7F2] border-[#2C2520] shadow-sm"
                    : "bg-white text-[#61554D] border-[#E6DFD5] hover:bg-[#F3EEE3]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37] mx-auto"></div>
            <p className="text-[#61554D] mt-6 text-lg font-bold">Loading awesome local spots...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filteredData.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-[#E6DFD5] overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300 group"
              >
                <div className="p-8">
                  {/* Category & Location - Enlarged */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-xs font-black uppercase tracking-wider text-[#8C6239] bg-[#EAE3D2] px-3 py-1 rounded-md">
                      {item.category}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-[#61554D] flex items-center gap-1.5">
                      📍 {item.location}
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-[#2C2520] mb-3 group-hover:text-[#D4AF37] transition-colors leading-tight">
                    {item.name}
                  </h3>

                  <p className="text-base sm:text-lg text-[#61554D] mb-6 line-clamp-3 leading-relaxed">
                    {item.summary}
                  </p>

                  {/* Badges Info - Enlarged */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {item.soloFriendly && (
                      <span className="text-xs font-black bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full">
                        🙋‍♂️ Solo Friendly
                      </span>
                    )}
                    {item.cardAccepted ? (
                      <span className="text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full">
                        💳 Card OK
                      </span>
                    ) : (
                      <span className="text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
                        💵 Cash Helpful
                      </span>
                    )}
                    {item.englishMenu && (
                      <span className="text-xs font-black bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full">
                        🇺🇸 English Menu
                      </span>
                    )}
                    {item.barrierFree && (
                      <span className="text-xs font-black bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 rounded-full">
                        ♿ Barrier Free
                      </span>
                    )}
                  </div>
                </div>

                {/* Score & Button Area - Enlarged */}
                <div className="px-8 pb-8 pt-5 border-t border-[#F3EEE3] bg-[#FAF7F2]/50 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#8C6239]">
                      Survival Score
                    </span>
                    <span className="text-2xl font-black text-[#2C2520]">
                      {item.koreanSurvivalScore} <span className="text-sm font-bold text-[#61554D]">/ 100</span>
                    </span>
                  </div>

                  <a
                    href={item.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-extrabold bg-white hover:bg-[#FAF7F2] text-[#2C2520] border border-[#E6DFD5] hover:border-[#D4AF37] rounded-xl transition-all cursor-pointer shadow-sm"
                  >
                    🗺️ Google Maps
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Footer - Enlarged Font */}
      <footer className="mt-auto border-t border-[#E6DFD5] bg-[#FAF7F2] py-10 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}

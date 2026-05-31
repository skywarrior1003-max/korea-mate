"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { generateItinerary } from "@/lib/scheduler";

interface Place {
  name: string;
  category: string;
  location: string;
  time: string;
  duration: string;
  tips: string;
  googleMapsUrl: string;
}

interface Day {
  date: string;
  dayNumber: number;
  places: Place[];
}

interface Itinerary {
  days: Day[];
}

function ItineraryResult() {
  const searchParams = useSearchParams();
  const city = searchParams.get("city") || "Seoul";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";
  const travelers = searchParams.get("travelers") || "1";
  const travelStyle = searchParams.get("travelStyle") || "Solo";

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!startDate || !endDate) {
      setError("Please select travel dates.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    generateItinerary(city, startDate, endDate, travelers, travelStyle)
      .then((data) => {
        setItinerary(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Itinerary generation error:", err);
        setError("Failed to generate itinerary. Please check if your GEMINI_API_KEY is configured correctly.");
        setLoading(false);
      });
  }, [city, startDate, endDate, travelers, travelStyle]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8"></div>
        <h2 className="text-3xl font-black text-[#2C2520] mb-3 animate-pulse">
          AI is planning your Korea trip...
        </h2>
        <p className="text-lg text-[#61554D] max-w-md font-bold">
          Analyzing spots in {city} for a {travelStyle.toLowerCase()} traveler. This takes about 10 seconds!
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-3xl font-black text-red-600 mb-4">Something went wrong</h2>
        <p className="text-lg text-[#61554D] max-w-md mb-8 font-bold">{error}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors"
        >
          ← Back to Home
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">
      {/* Header Info */}
      <div className="bg-white rounded-3xl p-8 border border-[#E6DFD5] shadow-sm mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-xs font-black bg-[#EAE3D2] text-[#8C6239] px-3 py-1 rounded-md uppercase tracking-wider">
            {travelStyle} Trip
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#2C2520] mt-3">
            Your {city} Itinerary
          </h1>
          <p className="text-[#61554D] mt-2 text-base font-bold">
            📅 {startDate} to {endDate} ({travelers} {parseInt(travelers) > 1 ? "Travelers" : "Traveler"})
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3.5 text-base font-extrabold bg-[#FAF7F2] hover:bg-[#F3EEE3] text-[#2C2520] border border-[#E6DFD5] rounded-xl transition-all shadow-sm"
        >
          ← Back to Home
        </Link>
      </div>

      {/* Days List */}
      <div className="space-y-12 mb-16">
        {itinerary?.days.map((day) => (
          <div key={day.dayNumber} className="relative pl-6 sm:pl-8 border-l-2 border-[#D4AF37]/30">
            {/* Timeline Circle */}
            <div className="absolute -left-[11px] top-1.5 bg-[#FAF7F2] border-4 border-[#D4AF37] w-5 h-5 rounded-full z-10"></div>

            <h2 className="text-2xl sm:text-3xl font-black text-[#2C2520] mb-6 flex items-center gap-3">
              <span>Day {day.dayNumber}</span>
              <span className="text-lg font-bold text-[#8C6239] bg-[#EAE3D2]/40 px-3 py-0.5 rounded-full">
                {day.date}
              </span>
            </h2>

            {/* Places cards inside the day */}
            <div className="grid grid-cols-1 gap-6">
              {day.places.map((place, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl border border-[#E6DFD5] p-6 sm:p-8 hover:shadow-md transition-shadow flex flex-col sm:flex-row justify-between gap-6"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black uppercase bg-[#EAE3D2] text-[#8C6239] px-2.5 py-0.5 rounded-md">
                        {place.category}
                      </span>
                      <span className="text-xs font-bold text-[#61554D] flex items-center gap-1">
                        🕒 {place.time} ({place.duration})
                      </span>
                      <span className="text-xs font-bold text-[#61554D] flex items-center gap-1">
                        📍 {place.location}
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-black text-[#2C2520]">
                      {place.name}
                    </h3>

                    <div className="bg-[#FAF7F2]/50 border border-[#E6DFD5]/50 rounded-xl p-4 mt-2">
                      <p className="text-sm font-extrabold text-[#8C6239] uppercase tracking-wider mb-1">
                        💡 Tips for Foreigners
                      </p>
                      <p className="text-base text-[#61554D] leading-relaxed">
                        {place.tips}
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end justify-center">
                    <a
                      href={place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}+${city}+Korea`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4.5 py-3 text-sm font-extrabold bg-white hover:bg-[#FAF7F2] text-[#2C2520] border border-[#E6DFD5] hover:border-[#D4AF37] rounded-xl transition-all cursor-pointer shadow-sm w-full sm:w-auto"
                    >
                      🗺️ Google Maps
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* eSIM Banner at the bottom of the page */}
      <div className="bg-gradient-to-r from-[#D4AF37] via-[#E5C158] to-[#C29D26] rounded-3xl p-8 sm:p-10 shadow-xl border border-[#E6DFD5] text-[#2C2520] mb-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <h3 className="text-2xl sm:text-3xl font-black">
            📱 Don't forget your eSIM!
          </h3>
          <p className="text-base sm:text-lg font-bold text-[#4E3F35]">
            Stay connected throughout your trip across Korea with 10% off.
          </p>
        </div>
        <a
          href="#"
          className="inline-flex items-center justify-center px-6 py-4 text-base font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-all duration-200 shadow-md"
        >
          Get eSIM Now
        </a>
      </div>
    </main>
  );
}

export default function ItineraryPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Header Navigation */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-black tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="text-[#D4AF37] text-3xl">🇰🇷</span> Korea<span className="text-[#D4AF37]">Mate</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Dynamic Content loaded in Suspense */}
      <Suspense fallback={
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#D4AF37] mb-8"></div>
          <h2 className="text-3xl font-black text-[#2C2520] mb-3">AI is planning your Korea trip...</h2>
        </div>
      }>
        <ItineraryResult />
      </Suspense>

      {/* Footer */}
      <footer className="mt-auto border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}

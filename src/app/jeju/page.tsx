// gokoreamate — Jeju city SEO landing page
// TASK-031: static, Server Component, targets "Jeju island travel guide" keywords

import type { Metadata } from "next";
import CityEntry from "@/components/CityEntry";
import { CITY_CONFIGS } from "@/data/cities";
import { JEJU_ENTRY } from "@/data/cities/entry-content";

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


export default function JejuPage() {
  return <CityEntry city={CITY_CONFIGS.jeju} content={JEJU_ENTRY} />;
}

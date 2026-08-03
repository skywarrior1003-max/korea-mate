// gokoreamate — Busan city SEO landing page
// TASK-032: static, Server Component, targets "Busan Korea travel guide" keywords

import type { Metadata } from "next";
import CityEntry from "@/components/CityEntry";
import { CITY_CONFIGS } from "@/data/cities";
import { BUSAN_ENTRY } from "@/data/cities/entry-content";

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
    url: "https://gokoreamate.com/busan/",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Busan Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Busan — beaches, seafood, night views & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/busan/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/busan/" },
};


export default function BusanPage() {
  return <CityEntry city={CITY_CONFIGS.busan} content={BUSAN_ENTRY} />;
}

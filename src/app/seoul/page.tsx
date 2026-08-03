// gokoreamate — Seoul city SEO landing page
// TASK-031: static, Server Component, targets "Seoul Korea travel guide" keywords

import type { Metadata } from "next";
import CityEntry from "@/components/CityEntry";
import { CITY_CONFIGS } from "@/data/cities";
import { SEOUL_ENTRY } from "@/data/cities/entry-content";

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


export default function SeoulPage() {
  return <CityEntry city={CITY_CONFIGS.seoul} content={SEOUL_ENTRY} />;
}

// gokoreamate — Gyeongju city SEO landing page
// TASK-031: static, Server Component, targets "Gyeongju Korea travel" keywords

import type { Metadata } from "next";
import CityEntry from "@/components/CityEntry";
import { CITY_CONFIGS } from "@/data/cities";
import { GYEONGJU_ENTRY } from "@/data/cities/entry-content";

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
    url: "https://gokoreamate.com/gyeongju/",
    siteName: "gokoreamate.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gyeongju Korea Travel Guide 2026 — gokoreamate.com",
    description: "AI itineraries for Gyeongju — ancient capital, temples, royal tombs & more. Free trip planner.",
    images: ["https://gokoreamate.com/og/gyeongju/opengraph-image.png"],
  },
  alternates: { canonical: "https://gokoreamate.com/gyeongju/" },
};


export default function GyeongjuPage() {
  return <CityEntry city={CITY_CONFIGS.gyeongju} content={GYEONGJU_ENTRY} />;
}

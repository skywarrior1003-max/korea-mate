// gokoreamate — Jeonju city SEO landing page
// 검증된 장소·실용 정보가 아직 없다. 없는 것을 지어내지 않고, 같은 CityEntry
// 구조로 Coming Soon 상태만 보여준다. metadata 는 기존 cityConfig 의
// seoDescription 을 쓰고 새 통계·장소 수를 만들지 않는다.

import type { Metadata } from "next";
import CityEntry from "@/components/CityEntry";
import { CITY_CONFIGS } from "@/data/cities";
import { JEONJU_ENTRY } from "@/data/cities/entry-content";

const city = CITY_CONFIGS.jeonju;

export const metadata: Metadata = {
  title: "Jeonju Travel Guide 2026 — AI Korea Itinerary Planner | gokoreamate.com",
  description: city.seoDescription,
  openGraph: {
    title: "Jeonju Korea Travel Guide — gokoreamate.com",
    description: city.seoDescription,
    url: "https://gokoreamate.com/jeonju/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jeonju Korea Travel Guide 2026 — gokoreamate.com",
    description: city.seoDescription,
  },
  alternates: { canonical: "https://gokoreamate.com/jeonju/" },
};

export default function JeonjuPage() {
  return <CityEntry city={city} content={JEONJU_ENTRY} />;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

// 화면은 "use client" 인 page.tsx 가 그린다 — client component 는 metadata 를
// 내보낼 수 없어 여기에 둔다. (/my-trips · /itinerary 와 같은 구조다.)
//
// 이 경로는 sitemap 에 들어 있는데 title·description·canonical 이 없어서
// 검색엔진이 폴백 제목으로 색인하고 있었다. 언어별 metadata 는 별도 과제라
// 여기서는 누락만 채운다.
export const metadata: Metadata = {
  title: "All Busan Spots — gokoreamate",
  description: "Browse every Busan spot in one list: attractions, food, and neighbourhoods, filterable by category.",
  alternates: { canonical: "https://gokoreamate.com/all-spots/" },
};

export default function AllSpotsLayout({ children }: { children: ReactNode }) {
  return children;
}

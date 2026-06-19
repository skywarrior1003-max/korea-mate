// gokoreamate — itinerary route layout (server component)
// TASK-025: /itinerary 전용 OG meta 오버라이드
// 정적 익스포트 환경에서는 query params를 서버측 바인딩 불가 →
// 페이지별 고품질 정적 OG 제공 (진정한 동적 per-trip OG는 TASK-026 Supabase 공유 URL에서 처리)

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "나의 한국 여행 일정 — gokoreamate",
  description:
    "AI로 생성한 나만의 한국 여행 일정. 장소별 GPS 순간을 기록하고 1탭으로 Instagram · TikTok · X에 공유하세요.",
  openGraph: {
    title: "나의 한국 여행 일정 — gokoreamate",
    description:
      "AI로 만든 나만의 Korea 여행 플랜. 순간을 기록하고 스토리 카드로 공유하세요 — gokoreamate.com",
    type: "website",
    url: "https://gokoreamate.com/itinerary",
    siteName: "gokoreamate.com",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "gokoreamate — AI Korea Trip Itinerary",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "나의 한국 여행 일정 — gokoreamate",
    description:
      "AI 일정 생성 · GPS 순간 기록 · 1탭 SNS 공유 — gokoreamate.com",
    images: ["/opengraph-image.png"],
  },
};

export default function ItineraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

// gokoreamate — itinerary route layout (server component)
// TASK-025: /itinerary 전용 OG meta 오버라이드
// 정적 익스포트 환경에서는 query params를 서버측 바인딩 불가 →
// 페이지별 고품질 정적 OG 제공 (진정한 동적 per-trip OG는 TASK-026 Supabase 공유 URL에서 처리)

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
  title: "My Korea Travel Itinerary — gokoreamate",
  description:
    "Your AI-generated Korea itinerary. Record GPS moments at each place and share to Instagram · TikTok · X in one tap.",
  openGraph: {
    title: "My Korea Travel Itinerary — gokoreamate",
    description:
      "Your AI-built Korea trip plan. Capture moments and share as a story card — gokoreamate.com",
    type: "website",
    url: "https://gokoreamate.com/itinerary/",
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
    title: "My Korea Travel Itinerary — gokoreamate",
    description:
      "AI itinerary · GPS moment capture · 1-tap social share — gokoreamate.com",
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

import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import SavedSpotsPanel from "@/components/SavedSpotsPanel";
import I18nProvider from "@/components/I18nProvider";
import NavShell from "@/components/ui/NavShell";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Home 시안이 지정한 두 서체.
//
// next/font/google 은 빌드 때 폰트를 받아 우리 도메인에서 서빙한다 — 런타임에
// Google 을 부르지 않고 외부 CDN 에도 의존하지 않는다. 둘 다 OFL 이라 라이선스도
// 걸림돌이 없다. Geist 를 이미 같은 방식으로 쓰고 있어 빌드 경로도 검증돼 있다.
//
// 전역 body 서체는 건드리지 않는다. 이 변수는 Home Experience 안에서만 쓴다 —
// 앱 전체 서체를 바꾸는 건 별개 작업이다.
const playfair = Playfair_Display({
  variable: "--font-display-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "gokoreamate — AI Korea Trip Planner · Capture & Share Your Story",
  description:
    "Plan your perfect Korea itinerary with AI, capture GPS moments during your trip, and share your story in 1 tap to Instagram, TikTok & X. Free · No signup · Busan ready.",
  keywords: [
    "Korea travel guide",
    "Busan tour guide",
    "Seoul itinerary planner",
    "free travel itinerary planner",
    "Korea trip scheduler",
    "AI trip planner Korea",
    "Korea travel story share",
    "Korea GPS travel journal",
    "trip moments Korea",
    "Korea vacation planning",
    "gokoreamate",
    "travel planner for foreigners",
  ],
  openGraph: {
    title: "gokoreamate — Plan, Capture & Share Your Korea Story",
    description:
      "AI builds your Korea itinerary. You capture the moments. One tap shares your story to Instagram, TikTok & X.",
    type: "website",
    url: "https://gokoreamate.com/",
    siteName: "gokoreamate.com",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "gokoreamate — Plan · Capture · Share Your Korea Story" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "gokoreamate — Plan, Capture & Share Your Korea Story",
    description: "AI builds your itinerary · Capture GPS moments · Share your story in 1 tap",
    images: ["/opengraph-image.png"],
  },
  metadataBase: new URL("https://gokoreamate.com"),
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || "sGBjjMTMMM8LKvzHnDCQ0AQpHdQKBOSEQUizwVBTpxo",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${jakarta.variable} h-full antialiased`}
    >
      {(() => {
        const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "um01w41srz";
        return (
          // geocoder 는 주소를 지도 중심으로 바꾸는 데만 쓴다 — My Place 위치 확인
          // 화면이 사용자가 적은 주소 근처에서 열리게 하는 용도다. submodule 을
          // 빼면 `naver.maps.Service` 자체가 없어서 조용히 도시 중심으로 떨어진다.
          <Script
            src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverClientId}&submodules=geocoder`}
            strategy="afterInteractive"
          />
        );
      })()}
      {(() => {
        const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
        const ga4Valid = ga4Id && ga4Id !== "나중에_입력";
        return ga4Valid ? (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">{`
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${ga4Id}');
`}</Script>
          </>
        ) : null;
      })()}
      {(() => {
        const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;
        const isValid = adsenseId && adsenseId !== "나중에_입력";
        return isValid ? (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null;
      })()}
      {/*
        Impact 파트너 사이트 소유권 확인 태그.

        왜 metadata.other 를 쓰지 않는가
          Next Metadata API 는 name/content 로만 직렬화한다. 그런데 Impact 가
          제시한 스니펫은 value 속성이다. 두 형식이 같다고 볼 근거가 없고
          (공식 문서에도 형식 설명이 없다) 검증기가 무엇을 읽는지 모르는 채로
          content 만 내보내면 실패해도 원인을 알 수 없다. 그래서 받은 그대로
          value 를 내보낸다.

        content 를 함께 두지 않는 이유
          처음에는 표준 HTML 을 읽는 도구를 위해 content 도 같이 달았다. 그
          상태로 Impact 검증이 실패했다. 검증기가 자기 스니펫과 문자열로
          맞춰 본다면 여분의 속성이 어긋나는 원인이 된다. 그래서 받은 스니펫
          과 같은 모양만 남긴다 — 이 name 을 읽는 다른 도구는 없다.

        value 를 spread 로 넣는 이유
          value 는 <meta> 의 표준 속성이 아니라 React 타입이 거부한다. 속성을
          빼는 대신 타입만 우회한다 — 우리가 형식을 고를 수 있는 자리가 아니다.

        이 토큰은 소유권 확인용 public 값이다. secret 이 아니지만 env·별도
        파일로 복제하지 않는다. 복제하면 어느 쪽이 진짜인지 흐려진다.
      */}
      <meta
        name="impact-site-verification"
        {...{ value: "0ece1873-d6ea-4c1c-994c-641d4d140c8b" }}
      />
      <body className="min-h-full flex flex-col">
        <I18nProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["TravelAgency", "TouristInformationCenter"],
              name: "gokoreamate",
              description:
                "Free AI-powered Korea tour guide and itinerary planner for foreign tourists. Build day-by-day trip schedules for Busan, Seoul, and beyond.",
              url: "https://gokoreamate.com",
              sameAs: ["https://korea-mate.pages.dev"],
              areaServed: {
                "@type": "Country",
                name: "South Korea",
              },
              serviceType: [
                "Travel Itinerary Planning",
                "Tourist Information",
                "Korea Tour Guide",
              ],
            }),
          }}
        />
        {children}
        <Suspense fallback={null}>
          <SavedSpotsPanel />
        </Suspense>
        <Suspense fallback={null}>
          <NavShell />
        </Suspense>
        </I18nProvider>
      </body>
    </html>
  );
}

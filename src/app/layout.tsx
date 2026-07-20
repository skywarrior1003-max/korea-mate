import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import SavedSpotsPanel from "@/components/SavedSpotsPanel";
import CartDrawer from "@/components/CartDrawer";
import I18nProvider from "@/components/I18nProvider";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {(() => {
        const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID || "um01w41srz";
        return (
          <Script
            src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverClientId}`}
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
      <body className="min-h-full flex flex-col">
        <I18nProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["TravelAgency", "TouristInformationCenter"],
              name: "KoreaMate",
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
          <CartDrawer />
        </Suspense>
        </I18nProvider>
      </body>
    </html>
  );
}

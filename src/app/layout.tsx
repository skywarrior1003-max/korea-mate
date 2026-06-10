import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KoreaMate — Free Korea Travel Itinerary Planner for Tourists",
  description:
    "Free AI-powered Korea tour guide and itinerary planner for foreign tourists. Discover Busan and Seoul attractions, build day-by-day trip schedules, and explore local hidden gems.",
  keywords: [
    "Korea travel guide",
    "Busan tour guide",
    "Seoul itinerary planner",
    "free travel itinerary planner",
    "Korea trip scheduler",
    "tourist attractions Korea",
    "Korea sightseeing spots",
    "travel planner for foreigners",
    "Korea vacation planning",
    "Busan sightseeing",
    "Korea travel tips",
    "AI trip planner Korea",
  ],
  openGraph: {
    title: "KoreaMate — Free Korea Travel Itinerary Planner",
    description:
      "AI-powered Korea tour guide and itinerary planner for foreign tourists. Build day-by-day schedules for Busan, Seoul, and beyond.",
    type: "website",
    url: "https://gokoreamate.com",
    siteName: "KoreaMate",
  },
  metadataBase: new URL("https://gokoreamate.com"),
  alternates: {
    canonical: "https://gokoreamate.com",
  },
  verification: {
    google: "sGBjjMTMMM8LKvzHnDCQ0AQpHdQKBOSEQUizwVBTpxo",
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
      </body>
    </html>
  );
}

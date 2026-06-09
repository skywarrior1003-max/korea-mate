import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import CartDrawer from "@/components/CartDrawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KoreaMate — AI Travel Guide for Foreign Visitors to Korea",
  description:
    "Plan your Korea trip with AI. Find solo-friendly spots, get itineraries, and navigate Korea without getting stuck.",
  openGraph: {
    title: "KoreaMate — AI Travel Guide for Korea",
    description:
      "AI-powered travel scheduler for foreign travelers visiting Korea.",
    type: "website",
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
              "@type": "WebSite",
              name: "KoreaMate",
              description: "AI-powered travel guide for foreign visitors to Korea",
              url: "https://korea-mate.pages.dev",
            }),
          }}
        />
        {children}
        <Suspense fallback={null}>
          <CartDrawer />
        </Suspense>
      </body>
    </html>
  );
}

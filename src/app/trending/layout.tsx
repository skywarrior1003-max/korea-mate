import type { Metadata } from "next";
import type { ReactNode } from "react";

// all-spots 와 같은 이유로 layout 에 둔다 — page.tsx 가 "use client" 다.
export const metadata: Metadata = {
  title: "Trending Korea Trips — gokoreamate",
  description: "Real AI-built itineraries other travelers made public and marked helpful. Filter by city and travel style.",
  alternates: { canonical: "https://gokoreamate.com/trending/" },
};

export default function TrendingLayout({ children }: { children: ReactNode }) {
  return children;
}

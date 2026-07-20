import type { Metadata } from "next";
import RestaurantsClient from "./RestaurantsClient";

const title = "Busan Restaurant Guide 2026 | GoKoreaMate";
const description =
  "Discover top Busan restaurants from Michelin 2026, Busan Mat 2026, and Taegshlang 2025. Filter by district, price, and award.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "https://gokoreamate.com/restaurants/",
  },
  openGraph: {
    title,
    description,
    url: "https://gokoreamate.com/restaurants/",
    type: "website",
  },
};

export default function RestaurantsPage() {
  return <RestaurantsClient />;
}
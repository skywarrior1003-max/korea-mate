// gokoreamate — Jeju OG image (1200×630 PNG, build-time static)
// TASK-029: 제주 전용 SNS 링크 프리뷰 카드

import { ImageResponse } from "next/og";
import { CITY_OG_CONFIGS } from "@/lib/og/city-og-config";
import { buildCityOGJSX } from "@/lib/og/city-og-template";

export const dynamic     = "force-static";
export const alt         = "Jeju Korea Trip Itinerary — gokoreamate.com";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function JejuOGImage() {
  return new ImageResponse(
    buildCityOGJSX(CITY_OG_CONFIGS["jeju"]!),
    { width: 1200, height: 630 },
  );
}

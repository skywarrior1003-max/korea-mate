"use client";

// Trips View All — Structured Editorial Feed.
// 데이터 = repo 의 curated 공식 코스(제목·분류·테마·실측 일수)만. 가짜 순위·별점·
// 가격·traveled 날짜 없음. RECOMMENDED-TRIP-STORY-EXPRESSION-NORMALIZATION-V1:
// 카드가 Story 와 같은 여행 표현 DNA(대표 사진 = 코스가 실제 연결하는 첫 장소의
// 카탈로그 사진, stop preview, 코스 상세 진입)를 쓴다. 사진이 없는 코스는 지금처럼
// 편집형으로 성립한다 — 이미지를 지어내지 않는다.
// masonry 금지: 모바일 1열 · 데스크톱 2열 동일 지오메트리.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { getRecommendedTrips, tripDisplayTitle } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";
import { tripCoverSpot } from "./TripCourseClient";

export default function TripsAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const trips = getRecommendedTrips(slug);
  const byId = new Map((spots ?? []).map(s => [Number(s.id), s]));

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        {/* RT-02: back 링크는 제목과 다른 줄 — 데스크톱에서도 충돌하지 않는다 */}
        <Link href={`/city/${slug}`} className="inline-flex items-center whitespace-nowrap text-[13px] text-[var(--qh-faint)] hover:text-[var(--qh-ink)] py-2 min-h-11 gkm-focus">
          ← {cityLabel}
        </Link>
        <h1 className="mt-1 text-[22px] md:text-[26px] font-semibold text-[var(--qh-ink)]">{t("tripsIn", { city: cityLabel })}</h1>

        {trips.length === 0 ? (
          <p className="mt-5 text-[13px] text-[var(--qh-faint2)]">{t("tripsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {trips.map(trip => {
              const cover = tripCoverSpot(trip, byId);
              const preview = trip.stops.slice(0, 3)
                .map(s => (locale !== "ko" && s.nameEn ? s.nameEn : s.name))
                .filter((n): n is string => Boolean(n));
              return (
                <li key={trip.id} className="py-4 border-b border-[var(--qh-line)]">
                  <Link href={`/city/${slug}/trips/${trip.id}`} className="block gkm-focus rounded-[4px] min-h-11">
                    {cover?.image && (
                      <span className="relative block aspect-[16/9] rounded-[4px] overflow-hidden bg-[var(--qh-line)] mb-2.5">
                        <img src={cover.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      </span>
                    )}
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[16px] font-semibold text-[var(--qh-ink)] leading-snug">{tripDisplayTitle(trip, locale)}</span>
                      {trip.days && Number.isInteger(trip.days) && trip.days >= 1 && (
                        <span className="flex-none whitespace-nowrap text-[12px] text-[var(--qh-faint)]">
                          {trip.days}d{trip.stops.length > 0 ? ` · ${trip.stops.length} stops` : ""}
                        </span>
                      )}
                    </span>
                    <span className="block mt-0.5 text-[12px] text-[var(--qh-faint)]">
                      {t("officialCourse")}
                      {!Number.isInteger(trip.days) && trip.durationLabel && locale === "ko" ? ` · ${trip.durationLabel}` : ""}
                    </span>
                    {trip.theme && (
                      <span className="block mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(33,29,23,.6)" }}>{trip.theme}</span>
                    )}
                    {preview.length > 0 && (
                      <span className="block mt-1 text-[12px] text-[var(--qh-faint2)] truncate">
                        {preview.join(" → ")}{trip.stops.length > preview.length ? " …" : ""}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

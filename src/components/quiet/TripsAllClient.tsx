"use client";

// Trips View All — Structured Editorial Feed.
// 데이터 = repo 의 curated 공식 코스(제목·분류·테마·실측 일수)만. 가짜 순위·별점·
// 가격·traveled 날짜 없음. 코스별 권리 안전 사진이 아직 저장소에 없어 카드가
// 사진 없이도 성립하는 편집형으로 구성한다 — 사진 자산이 들어오면 상단에 얹는다.
// masonry 금지: 모바일 1열 · 데스크톱 2열 동일 지오메트리.

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { getRecommendedTrips, tripDisplayTitle } from "@/data/regional/regional-recommendations";
import { quietCity } from "./quiet-data";

export default function TripsAllClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const trips = getRecommendedTrips(slug);

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
            {trips.map(trip => (
              <li key={trip.id} className="py-4 border-b border-[var(--qh-line)]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[16px] font-semibold text-[var(--qh-ink)] leading-snug">{tripDisplayTitle(trip, locale)}</h2>
                  {trip.days && Number.isInteger(trip.days) && trip.days >= 1 && (
                    <span className="flex-none whitespace-nowrap text-[12px] text-[var(--qh-faint)]">
                      {trip.days}d{trip.stops.length > 0 ? ` · ${trip.stops.length} stops` : ""}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--qh-faint)]">
                  {t("officialCourse")}
                  {!Number.isInteger(trip.days) && trip.durationLabel && locale === "ko" ? ` · ${trip.durationLabel}` : ""}
                </p>
                {trip.theme && (
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(33,29,23,.6)" }}>{trip.theme}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

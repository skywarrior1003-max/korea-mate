"use client";

// Official Recommended Trip 상세 — Story 와 같은 "여행 표현 DNA" 를 쓰는 코스 화면.
// (RECOMMENDED-TRIP-STORY-EXPRESSION-NORMALIZATION-V1)
//
// 같은 언어: 사진이 주인공(대표 이미지 = 코스가 실제로 연결하는 첫 장소의 카탈로그
// 대표 사진), stop 흐름은 세로 타임라인(이동감), 각 stop 은 장소 이미지·이름으로
// Place Detail 로 이어진다. 다른 점은 출처뿐 — Official course 표기(provenance)만
// 조용히 구분하고 Traveler Story 를 흉내내는 배지·꾸밈은 만들지 않는다.
//
// 데이터 안전: 기존 normalized 코스 그대로 — stop 순서·구성 무변경, 재수집 0.
// spotId 가 없는 stop 은 이름만 보여 준다(임의 매칭·가짜 링크 금지).

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { cityVisual } from "@/lib/city-visual";
import { getRecommendedTrips, tripDisplayTitle, type RecommendedTrip } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";

/** 코스 대표 이미지 — 연결된 stop 중 카탈로그 사진이 있는 첫 장소. 지어내지 않는다. */
export function tripCoverSpot(trip: RecommendedTrip, byId: Map<number, CitySpot>): CitySpot | null {
  for (const s of trip.stops) {
    if (s.spotId === null) continue;
    const spot = byId.get(s.spotId);
    if (spot?.image) return spot;
  }
  return null;
}

export default function TripCourseClient({ slug, tripId }: { slug: string; tripId: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);
  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const trip = getRecommendedTrips(slug).find(tr => tr.id === tripId);
  if (!trip) {
    return (
      <div className="qh min-h-screen" style={{ backgroundColor: "var(--qh-paper)" }}>
        <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
          <Link href={`/city/${slug}/trips`} className="inline-flex items-center text-[13px] text-[var(--qh-faint)] py-2 min-h-11 gkm-focus">← {t("tripsIn", { city: cityLabel })}</Link>
          <p className="mt-4 text-[13px] text-[var(--qh-faint2)]">{t("tripsSoon", { city: cityLabel })}</p>
        </div>
      </div>
    );
  }

  const byId = new Map((spots ?? []).map(s => [Number(s.id), s]));
  const cover = tripCoverSpot(trip, byId);
  const v = cityVisual(slug);
  const coverSrc = cover?.image ?? v?.src ?? null;
  const metaLine = [
    trip.days && Number.isInteger(trip.days) && trip.days >= 1 ? `${trip.days}d` : (locale === "ko" ? trip.durationLabel : null),
    trip.stops.length > 0 ? `${trip.stops.length} stops` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      {/* ── Cover — 사진이 주인공, hub 와 같은 scrim 문법 ── */}
      <div className="relative h-[230px] md:h-[320px] overflow-hidden" style={{ backgroundColor: "#33566b" }}>
        {coverSrc && (
          coverSrc.startsWith("http")
            ? <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
            : <Image src={coverSrc} alt="" fill priority sizes="100vw" className="object-cover" style={v && !cover ? { objectPosition: v.objectPosition } : undefined} />
        )}
        <div className="absolute inset-x-0 top-0 h-[64px]" style={{ background: "linear-gradient(180deg,rgba(8,10,12,.5),transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 h-[130px]" style={{ background: "linear-gradient(180deg,transparent,rgba(8,10,12,.74))" }} />
        <Link
          href={`/city/${slug}/trips`}
          className="absolute top-4 left-4 inline-flex items-center whitespace-nowrap text-white text-[14px] rounded-[4px] px-3.5 py-2.5 min-h-11 gkm-focus"
          style={{ background: "rgba(10,10,8,.38)", backdropFilter: "blur(4px)" }}
        >
          ← {cityLabel}
        </Link>
        <div className="absolute left-0 right-0 bottom-0 max-w-3xl mx-auto px-5 md:px-6 pb-4">
          <p className="text-[11px] font-medium tracking-[.14em] text-white/75 uppercase">{t("officialCourse")} · {cityLabel}</p>
          <h1 className="mt-0.5 text-white text-[22px] md:text-[30px] font-semibold leading-tight">{tripDisplayTitle(trip, locale)}</h1>
          {metaLine && <p className="mt-0.5 text-[12.5px] text-white/80">{metaLine}</p>}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        {/* 짧은 여행 설명 — 원문 theme 그대로(창작 없음) */}
        {trip.theme && (
          <p className="text-[14px] leading-relaxed" style={{ color: "rgba(33,29,23,.72)" }}>{trip.theme}</p>
        )}

        {/* ── 코스 흐름 — 세로 타임라인, Story 의 이동감 문법 ── */}
        {trip.stops.length > 0 ? (
          <ol className="mt-5">
            {trip.stops.map((stop, i) => {
              const spot = stop.spotId !== null ? byId.get(stop.spotId) : undefined;
              const name = spot
                ? displayPlaceName(spot.name, spot.nameL10n, locale)
                : (locale !== "ko" && stop.nameEn ? stop.nameEn : (stop.name ?? ""));
              const body = (
                <span className="flex items-center gap-3.5 min-w-0 flex-1">
                  <span className="relative flex-none w-[64px] h-[64px] rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
                    {spot?.image ? (
                      <img src={spot.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] leading-snug">{name}</span>
                    {spot?.district && <span className="block mt-0.5 text-[11.5px] text-[var(--qh-faint2)] truncate">{spot.district}</span>}
                  </span>
                  {spot && <span className="flex-none text-[13px] text-[var(--qh-faint)]" aria-hidden>→</span>}
                </span>
              );
              return (
                <li key={`${trip.id}-${i}`} className="relative pl-8">
                  {/* 흐름 선과 순서 점 — 지도 없이도 코스의 이어짐이 읽히게 */}
                  {i < trip.stops.length - 1 && (
                    <span aria-hidden className="absolute left-[9px] top-[34px] bottom-[-10px] w-px" style={{ backgroundColor: "var(--qh-line)" }} />
                  )}
                  <span aria-hidden className="absolute left-0 top-[24px] w-[19px] h-[19px] rounded-full text-[10px] font-semibold flex items-center justify-center"
                    style={{ backgroundColor: "var(--qh-ink)", color: "var(--qh-paper)" }}>{i + 1}</span>
                  {spot ? (
                    <Link href={`/place/${spot.id}/`} className="flex py-2.5 gkm-focus rounded-[4px] min-h-11">{body}</Link>
                  ) : (
                    <div className="flex py-2.5 min-h-11">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-5 text-[13px] leading-relaxed text-[var(--qh-faint2)]">{t("courseNoStops")}</p>
        )}

        {/* ── CTA — 이 도시로 내 일정 시작(기존 /planner 경로 그대로) ── */}
        <Link
          href={`/planner?city=${slug}`}
          className="mt-7 flex items-center justify-between rounded-[4px] px-4 py-3.5 gkm-focus"
          style={{ backgroundColor: "var(--qh-navy)" }}
        >
          <span>
            <span className="block text-[15px] font-semibold" style={{ color: "var(--qh-paper)" }}>{t("planCity", { city: cityLabel })}</span>
            <span className="block text-[12px]" style={{ color: "rgba(247,243,236,.6)" }}>{t("planCitySub")}</span>
          </span>
          <span className="text-[17px]" style={{ color: "var(--qh-paper)" }}>→</span>
        </Link>
      </div>
    </div>
  );
}

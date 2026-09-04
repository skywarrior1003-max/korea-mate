"use client";

// City Hub — Home 과 Explore 사이의 curated 계층 (Quiet Travel Editorial).
// 계층 고정: Hero → Recommended Trips(3 · View all) → Recommended Places(3 · View all)
//            → Explore {city} (콘텐츠 흐름의 끝 — sticky/floating CTA 아님).
// Hub 와 View All 은 Home 컨텍스트다(BottomNav Home 활성, RT-01) — Explore 로
// handoff 된 뒤에만 Explore 탭이 켜진다. 지도·필터·랭킹·날씨는 넣지 않는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { cityVisual } from "@/lib/city-visual";
import { getRecommendedTrips, recommendedSpotIds, tripDisplayTitle } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";

/** 추천 3: 카탈로그 순서(기존 fetch 의 id asc)에서 이미지 있는 행 우선 — 인기 주장 없음 */
export function pickRecommended(spots: CitySpot[], n: number): CitySpot[] {
  const withImg = spots.filter(s => s.image);
  return (withImg.length >= n ? withImg : [...withImg, ...spots.filter(s => !s.image)]).slice(0, n);
}

export default function CityHubClient({ slug }: { slug: string }) {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const tLinks = useTranslations("cityLinks");
  const locale = useLocale();
  const city = quietCity(slug);
  const [spots, setSpots] = useState<CitySpot[] | null>(null);

  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const desc = tLinks(`desc${slug.charAt(0).toUpperCase()}${slug.slice(1)}`);
  const v = cityVisual(slug);
  const trips = getRecommendedTrips(slug).slice(0, 3);
  // 추천 장소: 공식 recommended_now 의 canonical 연결(순서 보존)을 먼저,
  // 부족분만 카탈로그에서 보충 — 임의 매칭·가짜 인기 없음.
  const officialIds = recommendedSpotIds(slug);
  const places = (() => {
    if (!spots) return [];
    const byId = new Map(spots.map(s => [Number(s.id), s]));
    const official = officialIds.map(id => byId.get(id)).filter((s): s is CitySpot => Boolean(s));
    const fill = pickRecommended(spots.filter(s => !official.includes(s)), 3);
    return [...official, ...fill].slice(0, 3);
  })();

  return (
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: "var(--qh-paper)" }}>
      {/* ── Hero — 절제된 1/4 화면, 관광 slogan 없음 ── */}
      <div className="relative h-[230px] md:h-[300px] overflow-hidden" style={{ backgroundColor: "#33566b" }}>
        {v && (
          <Image src={v.src} alt="" fill priority sizes="100vw" className="object-cover"
            style={{ objectPosition: v.objectPosition }} />
        )}
        {/* RT-04: 상·하단 scrim */}
        <div className="absolute inset-x-0 top-0 h-[64px]" style={{ background: "linear-gradient(180deg,rgba(8,10,12,.5),transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 h-[110px]" style={{ background: "linear-gradient(180deg,transparent,rgba(8,10,12,.72))" }} />
        <Link
          href="/"
          className="absolute top-4 left-4 inline-flex items-center whitespace-nowrap text-white text-[14px] rounded-[4px] px-3.5 py-2.5 min-h-11 gkm-focus"
          style={{ background: "rgba(10,10,8,.38)", backdropFilter: "blur(4px)" }}
        >
          ← {t("backHome")}
        </Link>
        <div className="absolute left-0 right-0 bottom-0 max-w-3xl mx-auto px-5 md:px-6 pb-4">
          <h1 className="text-white text-[27px] md:text-[36px] font-semibold leading-tight">{cityLabel}</h1>
          <p className="mt-0.5 text-[12.5px] md:text-[13.5px] text-white/80">{desc}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        {/* ── Recommended Trips ── */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)]">{t("recommendedTrips")}</h2>
          {trips.length > 0 && (
            <Link href={`/city/${slug}/trips`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-clay)" }}>
              {t("viewAll")}
            </Link>
          )}
        </div>
        {trips.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--qh-faint2)]">{t("tripsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-1">
            {trips.map(trip => (
              <li key={trip.id}>
                <Link href={`/city/${slug}/trips`} className="flex items-start gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] truncate">{tripDisplayTitle(trip, locale)}</span>
                    <span className="block mt-0.5 text-[12px] text-[var(--qh-faint)] truncate">
                      {trip.days && Number.isInteger(trip.days) && trip.days >= 1
                        ? `${trip.days}d${trip.stops.length > 0 ? ` · ${trip.stops.length} stops` : ""}`
                        : trip.stops.length > 0 ? `${t("officialCourse")} · ${trip.stops.length} stops` : t("officialCourse")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* ── Recommended Places ── */}
        <div className="mt-7 flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)]">{t("recommendedPlaces")}</h2>
          <Link href={`/city/${slug}/places`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-clay)" }}>
            {t("viewAll")}
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {places.map(s => (
            <Link key={s.id} href={`/place/${s.id}/`} className="min-w-0 gkm-focus rounded-[4px]">
              <span className="relative block aspect-square rounded-[4px] overflow-hidden bg-[var(--qh-line)]">
                {s.image ? (
                  <Image src={s.image} alt="" fill sizes="33vw" className="object-cover" unoptimized={s.image.startsWith("http")} />
                ) : (
                  <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                )}
              </span>
              <span className="block mt-1.5 text-[13px] font-medium text-[var(--qh-ink)] truncate">
                {displayPlaceName(s.name, s.nameL10n, locale)}
              </span>
              <span className="block text-[11.5px] text-[var(--qh-faint2)] truncate">{s.district ?? ""}</span>
            </Link>
          ))}
          {spots === null && [0, 1, 2].map(i => (
            <div key={i} className="aspect-square rounded-[4px] bg-[var(--qh-line)] animate-pulse" />
          ))}
        </div>

        {/* ── Explore — 흐름의 끝, 스코프 유지 handoff ── */}
        <Link
          href={`/explore/${slug}`}
          className="mt-6 flex items-center justify-between rounded-[4px] px-4 py-3.5 gkm-focus"
          style={{ backgroundColor: "var(--qh-ink)" }}
        >
          <span>
            <span className="block text-[15px] font-semibold" style={{ color: "var(--qh-paper)" }}>{t("exploreCity", { city: cityLabel })}</span>
            <span className="block text-[12px]" style={{ color: "rgba(247,243,236,.6)" }}>{t("exploreSub")}</span>
          </span>
          <span className="text-[17px]" style={{ color: "var(--qh-paper)" }}>→</span>
        </Link>
      </div>
    </div>
  );
}

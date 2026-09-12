"use client";

// City Hub — Home 과 Explore 사이의 curated 계층 (Quiet Travel Editorial).
// 계층 고정: Hero → Recommended Trips(3 · View all) → Recommended Places(3 · View all)
//            → What's happening(공식 한시 콘텐츠, 종료분 제외)
//            → Travel Essentials(공식 여행 편의정보)
//            → Explore {city} (콘텐츠 흐름의 끝 — sticky/floating CTA 아님).
// Hub 와 View All 은 Home 컨텍스트다(BottomNav Home 활성, RT-01) — Explore 로
// handoff 된 뒤에만 Explore 탭이 켜진다. 지도·필터·랭킹은 넣지 않는다.
// 날씨는 2026-09-11 Owner 결정으로 정확히 한 줄만 있다: 현재 아이콘+기온
// (`☀️ 26°C`) utility — 예보 카드/패널/자체 날씨 페이지는 여전히 금지.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import type { CitySpot } from "@/data/cities/types";
import { displayPlaceName } from "@/lib/place-display-name";
import { cityHubHeroVisual } from "@/lib/city-visual";
import { KMA_SHORT_FORECAST_URL, formatNowTemp } from "@/lib/weather/city-now-core";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { getRecommendedTrips, recommendedSpotIds, tripDisplayTitle, getCityEvents, getTravelEssentials, essentialSummary } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";
import { pickEssentialsPreview } from "@/lib/quiet/essentials-preview-core";

// City Hub Fresh 토큰(디자인 SSOT discovery-explore-final-v1 §1) — Home 의 warm
// --qh-* 를 바꾸지 않고 Hub 화면에만 cool 값을 입힌다.
const HUB = {
  paper: "#F5F8FC", ink: "#16233B", sub: "#4C5E7E",
  faint: "#8DA0BF", line: "#DFE7F2", eyebrow: "#3D63C9",
} as const;

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
  // 현재날씨 `☀️ 26°C` — 보고 있는 도시 기준(GPS 아님). 실패는 조용히 숨긴다
  // (가짜 온도 금지 — POST-ACCEPTANCE-CITY-HUB-WEATHER-V1).
  const [nowWx, setNowWx] = useState<{ temp: number; icon: string | null } | null>(null);

  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);
  useEffect(() => {
    let alive = true;
    setNowWx(null);
    fetch(`/api/weather/now?city=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then((j: { available?: boolean; temp?: number; icon?: string | null }) => {
        if (alive && j?.available === true && typeof j.temp === "number") {
          setNowWx({ temp: j.temp, icon: typeof j.icon === "string" ? j.icon : null });
        }
      })
      .catch(() => { /* 조용한 fallback — 표시 없음 */ });
    return () => { alive = false; };
  }, [slug]);

  if (!city) return null;
  const cityLabel = tForm(city.labelKey);
  const desc = tLinks(`desc${slug.charAt(0).toUpperCase()}${slug.slice(1)}`);
  const v = cityHubHeroVisual(slug);
  const trips = getRecommendedTrips(slug).slice(0, 3);
  const events = getCityEvents(slug);
  const essentials = getTravelEssentials(slug);
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
    <div className="qh min-h-screen pb-20" style={{ backgroundColor: HUB.paper, color: HUB.ink }}>
      {/* ── Hero — 절제된 1/4 화면, 관광 slogan 없음 ── */}
      <div className="relative h-[230px] md:h-[300px] overflow-hidden" style={{ backgroundColor: "#33566b" }}>
        {v && (
          <Image src={v.src} alt="" fill priority sizes="100vw" className="object-cover"
            style={{ objectPosition: v.objectPosition }} />
        )}
        {/* Fresh treatment(디자인 SSOT §2 Hero): 다크 스크림 대신 white-up —
            사진은 밝게 남고 하단이 paper 로 녹아 "여행 시작" 공기를 만든다. */}
        <div className="absolute inset-x-0 top-0 h-[64px]" style={{ background: "linear-gradient(180deg,rgba(8,10,12,.28),transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 h-[130px]" style={{ background: `linear-gradient(180deg, transparent, ${HUB.paper}E6 78%, ${HUB.paper} 100%)` }} />
        <Link
          href="/"
          className="absolute top-4 left-4 inline-flex items-center whitespace-nowrap text-[14px] rounded-full px-3.5 py-2.5 min-h-11 gkm-focus"
          style={{ background: "rgba(255,255,255,.88)", color: HUB.ink, backdropFilter: "blur(6px)", boxShadow: "0 2px 8px rgba(10,30,80,.12)" }}
        >
          ← {t("backHome")}
        </Link>
        {/* 우상단 = 언어(사이트 전역 관례 복원, Owner 2026-09-12) — 다른 화면
            헤더의 글로브와 같은 자리·같은 의미. 유리 pill 은 ← Home 과 동일 언어. */}
        <span
          className="absolute top-4 right-4 inline-flex rounded-full gkm-focus"
          style={{ background: "rgba(255,255,255,.88)", color: HUB.ink, backdropFilter: "blur(6px)", boxShadow: "0 2px 8px rgba(10,30,80,.12)" }}
        >
          <LanguageSwitcher variant="icon" />
        </span>
        <div className="absolute left-0 right-0 bottom-0 max-w-3xl mx-auto px-5 md:px-6 pb-4">
          {/* 현재날씨 utility — 아이콘 1 + 기온 1 뿐(Owner 계약). 도시명과 같은
              라인(도시의 현재 상태 = 도시 identity 정보 블록, Google Maps 문법).
              누르면 기상청 공식 단기예보 새 탭. 값을 못 얻으면 렌더 자체가 없다. */}
          <div className="flex items-end justify-between gap-3">
            <h1 className="min-w-0 truncate text-[28px] md:text-[36px] font-black leading-tight tracking-[-0.02em]" style={{ color: HUB.ink }}>{cityLabel}</h1>
            {nowWx && (
              <a
                href={KMA_SHORT_FORECAST_URL}
                target="_blank" rel="noopener noreferrer"
                aria-label={t("cityWeatherNow", { city: cityLabel })}
                className="mb-1 flex-none inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-bold rounded-full px-3.5 py-2 min-h-11 gkm-focus"
                style={{ background: "rgba(255,255,255,.88)", color: HUB.ink, backdropFilter: "blur(6px)", boxShadow: "0 2px 8px rgba(10,30,80,.12)" }}
              >
                {nowWx.icon && <span aria-hidden>{nowWx.icon}</span>}
                <span>{formatNowTemp(nowWx.temp)}</span>
              </a>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] md:text-[13.5px] font-medium" style={{ color: HUB.sub }}>{desc}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 md:px-6 pt-5">
        {/* ── Recommended Trips ── */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("recommendedTrips")}</h2>
          {trips.length > 0 && (
            <Link href={`/city/${slug}/trips`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
              {t("viewAll")}
            </Link>
          )}
        </div>
        {trips.length === 0 ? (
          <p className="mt-3 text-[13px] text-[#7C8FB0]">{t("tripsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-1">
            {trips.map(trip => (
              <li key={trip.id}>
                {/* 각 행은 해당 코스의 상세(코스 흐름·stop·장소 진입)로 간다 */}
                <Link href={`/city/${slug}/trips/${trip.id}`} className="flex items-start gap-3.5 py-3 border-b border-[#DFE7F2] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[#16233B] truncate">{tripDisplayTitle(trip, locale)}</span>
                    <span className="block mt-0.5 text-[12px] text-[#8DA0BF] truncate">
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
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("recommendedPlaces")}</h2>
          <Link href={`/city/${slug}/places`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
            {t("viewAll")}
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {places.map(s => (
            <Link key={s.id} href={`/place/${s.id}/`} className="min-w-0 gkm-focus rounded-[4px]">
              <span className="relative block aspect-square rounded-[4px] overflow-hidden bg-[#E5EDF7]">
                {s.image ? (
                  <Image src={s.image} alt="" fill sizes="33vw" className="object-cover" unoptimized={s.image.startsWith("http")} />
                ) : (
                  <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                )}
              </span>
              <span className="block mt-1.5 text-[13px] font-medium text-[#16233B] truncate">
                {displayPlaceName(s.name, s.nameL10n, locale)}
              </span>
              <span className="block text-[11.5px] text-[#7C8FB0] truncate">{s.district ?? ""}</span>
            </Link>
          ))}
          {spots === null && [0, 1, 2].map(i => (
            <div key={i} className="aspect-square rounded-[4px] bg-[#E5EDF7] animate-pulse" />
          ))}
        </div>

        {/* ── What's happening — 대표 2~3개 · 카드 → 내부 상세(외부 직행 없음) ── */}
        <div className="mt-7 flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("whatsHappening")}</h2>
          {events.length > 0 && (
            <Link href={`/city/${slug}/events`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
              {t("viewAll")}
            </Link>
          )}
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-[13px] text-[#7C8FB0]">{t("eventsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-1">
            {events.slice(0, 3).map(ev => {
              const name = locale !== "ko" && ev.nameEn ? ev.nameEn : (ev.name ?? "");
              const period = [ev.validFrom, ev.validTo].filter(Boolean).join(" – ");
              return (
                <li key={ev.id}>
                  <Link href={`/city/${slug}/events/${ev.id}`} className="flex items-start gap-3.5 py-3 border-b border-[#DFE7F2] gkm-focus min-h-11">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-[#16233B] truncate">{name}</span>
                      <span className="block mt-0.5 text-[12px] text-[#8DA0BF] truncate">
                        {ev.status && (
                          <span className="font-medium" style={{ color: ev.status === "ongoing" ? "var(--qh-blue)" : "#8DA0BF" }}>
                            {t(ev.status)}{" · "}
                          </span>
                        )}
                        {period}{ev.category ? ` · ${ev.category}` : ""}
                      </span>
                      {ev.whyNow && (
                        <span className="block mt-0.5 text-[12.5px] leading-snug text-[#7C8FB0]"
                          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {ev.whyNow}
                        </span>
                      )}
                    </span>
                    <span className="flex-none text-[13px]" style={{ color: "var(--qh-blue)" }} aria-hidden>→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Travel Essentials — 대표 1~2개 · 카드 → 내부 상세 · 공식 링크는 상세 안 ── */}
        <div className="mt-7 flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("travelEssentials")}</h2>
          {essentials.length > 0 && (
            <Link href={`/city/${slug}/essentials`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
              {t("viewAll")}
            </Link>
          )}
        </div>
        <ul className="mt-1">
          {pickEssentialsPreview(essentials).map(es => {
            const summary = essentialSummary(es, locale);
            return (
              <li key={es.id}>
                <Link href={`/city/${slug}/essentials/${es.id}`} className="flex items-start gap-3.5 py-2.5 border-b border-[#DFE7F2] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-[#16233B] leading-snug">{es.title}</span>
                    <span className="block mt-0.5 text-[11.5px] text-[#7C8FB0] truncate">
                      {es.category ?? ""}{es.provider ? ` · ${es.provider}` : ""}
                    </span>
                    {summary && (
                      <span className="block mt-0.5 text-[12.5px] leading-snug text-[#7C8FB0]"
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {summary}
                      </span>
                    )}
                  </span>
                  <span className="flex-none text-[13px]" style={{ color: "var(--qh-blue)" }} aria-hidden>→</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* ── Explore — 흐름의 끝, 스코프 유지 handoff (확정 Blue: navy CTA) ── */}
        <Link
          href={`/explore/${slug}`}
          className="mt-6 flex items-center justify-between rounded-[4px] px-4 py-3.5 gkm-focus"
          style={{ backgroundColor: "var(--qh-navy)" }}
        >
          <span>
            <span className="block text-[15px] font-semibold" style={{ color: "#FFFFFF" }}>{t("exploreCity", { city: cityLabel })}</span>
            <span className="block text-[12px]" style={{ color: "rgba(255,255,255,.65)" }}>{t("exploreSub")}</span>
          </span>
          <span className="text-[17px]" style={{ color: "#FFFFFF" }}>→</span>
        </Link>
      </div>
    </div>
  );
}

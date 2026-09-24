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
import PartnerOfferRow from "@/components/PartnerOfferRow";
import { getRecommendedTrips, recommendedSpotIds, hubEditorialSpotOrder, tripDisplayTitle, getCityEvents, getTravelEssentials, essentialSummary } from "@/data/regional/regional-recommendations";
import { loadCitySpots, quietCity } from "./quiet-data";
import { pickEssentialsPreview } from "@/lib/quiet/essentials-preview-core";
// RANKING-UX-HOTFIX §4 — 장소 제안 진입점은 Hub 에서 제거됐다(소비 화면 유지).
// 제안은 Picks > My Places 와 본인 Story 의 user_spot 문맥에서만 연다(§5·§10-2).

/** 승인된 여행자 Story 코스 카드(서버 순위 그대로 — 클라이언트 재정렬 없음) */
interface CommunityTripCard {
  id: string; title: string | null; days: number; stops: number;
  likeCount: number; copyCount: number;
  /** 대표 이미지 — 공개 moment 프록시 경로. 없으면 이미지 없이 성립 */
  cover?: string | null;
}

/** 서버 확정 도시 전체 순위 행(COLD-START §2) — rank 는 서버 값, 재정렬 금지 */
interface CommunityPlaceRank { id: number; likeCount: number; usageCount: number; rank: number }

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
  // COMMUNITY-V1 §6 — 승인된 공개 Story 코스. 실패는 조용히 seed 만 남는다.
  const [commTrips, setCommTrips] = useState<CommunityTripCard[]>([]);
  // RANKING-UX-HOTFIX §6-1 — 서버 순위의 추천 장소(반응이 실제 있는 장소만 온다).
  const [commPlaces, setCommPlaces] = useState<CommunityPlaceRank[]>([]);
  // 응답을 받은 도시를 기억한다 — "준비 중" 안내는 그 도시의 응답 후에만(§8).
  // 효과 안 동기 setState 금지 규칙에 맞춰 리셋 대신 slug 대조로 판정한다.
  const [commLoadedSlug, setCommLoadedSlug] = useState<string | null>(null);

  useEffect(() => { loadCitySpots(slug).then(setSpots); }, [slug]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/recommendations/${slug}?limit=3`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { stories?: CommunityTripCard[]; places?: CommunityPlaceRank[] } | null) => {
        if (!alive) return;
        if (j && Array.isArray(j.stories)) setCommTrips(j.stories.slice(0, 3));
        if (j && Array.isArray(j.places)) setCommPlaces(j.places.slice(0, 3));
        if (j) setCommLoadedSlug(slug);
      })
      .catch(() => { /* seed 유지 */ });
    return () => { alive = false; };
  }, [slug]);
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
  const seedTrips = getRecommendedTrips(slug);
  // 승인 Story 가 먼저, 빈 슬롯은 기존 seed 로 — 총 카드 수는 그대로 3(§6).
  const trips = seedTrips.slice(0, Math.max(0, 3 - commTrips.length));
  const events = getCityEvents(slug);
  const essentials = getTravelEssentials(slug);
  // 추천 장소: 공식 recommended_now 의 canonical 연결(순서 보존)을 먼저,
  // 부족분만 카탈로그에서 보충 — 임의 매칭·가짜 인기 없음.
  // editorial order(Owner 지정 도시)가 있으면 그 순서를 그대로 쓴다 — 자동 순서가 덮지 않는다.
  const officialIds = hubEditorialSpotOrder(slug) ?? recommendedSpotIds(slug);
  // COLD-START-RANKING-POLICY-V1 §2·§3 — 서버가 도시 전체 후보의 연속 순위를
  // 확정한다(반응 0 포함·editorial 순서가 cold-start 기준). Hub 는 그 1~3위를
  // 그대로 그린다 — 클라이언트 재정렬 없음. API 를 못 받은 동안·실패 시에만
  // 기존 정적 추천을 순위 badge 없이 보여 화면을 비우지 않는다(과도기 폴백).
  const places = (() => {
    if (!spots) return [];
    const byId = new Map(spots.map(s => [Number(s.id), s]));
    const ranked = commPlaces
      .map(r => ({ spot: byId.get(r.id), rank: r.rank as number | null, likeCount: r.likeCount, usageCount: r.usageCount }))
      .filter((x): x is { spot: CitySpot; rank: number; likeCount: number; usageCount: number } => Boolean(x.spot))
      .slice(0, 3);
    if (ranked.length > 0) return ranked;
    const official = officialIds.map(id => byId.get(id)).filter((s): s is CitySpot => Boolean(s));
    const fill = pickRecommended(spots.filter(s => !official.includes(s)), 3);
    return [...official, ...fill].slice(0, 3)
      .map(s => ({ spot: s, rank: null as number | null, likeCount: 0, usageCount: 0 }));
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
        {/* ── 검색 진입 (Owner 2026-09-17 — discovery-explore-final-v1 §3 의 "Hub 검색
             input 미신설" 결정을 진입점 1개 허용으로 변경). 입력은 여기서 받지 않고
             Explore 의 기존 검색으로 도시 스코프 그대로 넘긴다 — 새 검색 체계 0. ── */}
        <Link
          href={`/explore/${slug}?focus=search`}
          className="flex items-center gap-3 rounded-full border px-4 py-3 min-h-11 gkm-focus"
          style={{ borderColor: HUB.line, backgroundColor: "#fff" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden stroke={HUB.sub} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium" style={{ color: HUB.sub }}>{t("hubSearchCta", { city: cityLabel })}</span>
          <span className="flex-none text-[13px]" style={{ color: HUB.faint }} aria-hidden>→</span>
        </Link>

        {/* ── Recommended Trips ── */}
        <div className="mt-6 flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("recommendedTrips")}</h2>
          {(trips.length > 0 || commTrips.length > 0) && (
            <Link href={`/city/${slug}/trips`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
              {t("viewAll")}
            </Link>
          )}
        </div>
        {trips.length === 0 && commTrips.length === 0 ? (
          <p className="mt-3 text-[13px] text-[#7C8FB0]">{t("tripsSoon", { city: cityLabel })}</p>
        ) : (
          <ul className="mt-1">
            {/* 승인된 여행자 Story 코스 — 공개 Story 그 자체가 콘텐츠다(복제 없음).
                작은 출처 라벨로 editorial seed 와 오인되지 않게 한다(§6). */}
            {commTrips.map((ct, i) => (
              <li key={`comm-${ct.id}`}>
                <Link href={`/shared/?id=${ct.id}`} className="flex items-center gap-3.5 py-3 border-b border-[#DFE7F2] gkm-focus min-h-11">
                  {/* §7-2 대표 이미지 — 공개 moment 프록시. 없으면 이미지 없이 성립 */}
                  {ct.cover && (
                    <span className="relative flex-none w-[56px] h-[56px] rounded-[4px] overflow-hidden bg-[#E5EDF7]">
                      <Image src={ct.cover} alt="" fill sizes="56px" className="object-cover" unoptimized />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[#16233B] truncate">
                      {ct.title ?? t("communityTravelerCourse")}
                    </span>
                    <span className="block mt-0.5 text-[12px] text-[#8DA0BF] truncate">
                      {/* COLD-START §4-1 — 여행자 순위(점수 기반)는 `여행자 추천 · N위` */}
                      <span className="font-bold" style={{ color: HUB.eyebrow }}>{t("communityTravelerRank", { n: i + 1 })}</span>
                      {ct.days >= 1 ? ` · ${ct.days}d` : ""}{ct.stops > 0 ? ` · ${ct.stops} stops` : ""}
                      {` · ${t("communityLiked", { count: ct.likeCount })} · ${t("communityCopied", { count: ct.copyCount })}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {trips.map((trip, i) => (
              <li key={trip.id}>
                {/* 각 행은 해당 코스의 상세(코스 흐름·stop·장소 진입)로 간다 */}
                <Link href={`/city/${slug}/trips/${trip.id}`} className="flex items-start gap-3.5 py-3 border-b border-[#DFE7F2] gkm-focus min-h-11">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[#16233B] truncate">{tripDisplayTitle(trip, locale)}</span>
                    <span className="block mt-0.5 text-[12px] text-[#8DA0BF] truncate">
                      {/* COLD-START §4-2·§4-3 — 공식 코스는 `공식 추천 · N`
                          (editorial 순서 번호). 여행자 `N위`와 다른 체계라
                          "위"를 붙이지 않고, 인기·여행자 표기를 쓰지 않는다. */}
                      {t("communityOfficialRank", { n: i + 1 })}
                      {trip.days && Number.isInteger(trip.days) && trip.days >= 1 ? ` · ${trip.days}d` : ""}
                      {trip.stops.length > 0 ? ` · ${trip.stops.length} stops` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* §8 — 여행자 Story 0개일 때만의 조용한 안내(공식 3개는 그대로 유지) */}
        {commLoadedSlug === slug && commTrips.length === 0 && trips.length > 0 && (
          <p className="mt-2 text-[12px]" style={{ color: HUB.faint }}>{t("communityStoriesSoon")}</p>
        )}

        {/* ── Recommended Places ── */}
        <div className="mt-7 flex items-baseline justify-between gap-3">
          <h2 className="flex-none whitespace-nowrap text-[11px] font-black tracking-[.14em] uppercase" style={{ color: HUB.eyebrow }}>{t("recommendedPlaces")}</h2>
          <Link href={`/city/${slug}/places`} className="flex-none whitespace-nowrap text-[13px] font-medium gkm-focus" style={{ color: "var(--qh-blue)" }}>
            {t("viewAll")}
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {places.map(p => (
            <Link key={p.spot.id} href={`/place/${p.spot.id}/`} className="min-w-0 gkm-focus rounded-[4px]">
              <span className="relative block aspect-square rounded-[4px] overflow-hidden bg-[#E5EDF7]">
                {p.spot.image ? (
                  <Image src={p.spot.image} alt="" fill sizes="33vw" className="object-cover" unoptimized={p.spot.image.startsWith("http")} />
                ) : (
                  <img src="/images/placeholder-spot.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                )}
                {/* §6-1 조용한 순위 badge — 서버 순위가 실재하는 카드에만 */}
                {p.rank !== null && (
                  <span className="absolute top-1 left-1 rounded-[3px] px-1.5 py-0.5 text-[10.5px] font-bold"
                    style={{ background: "rgba(255,255,255,.92)", color: HUB.eyebrow }}>
                    {t("communityRank", { n: p.rank })}
                  </span>
                )}
              </span>
              <span className="block mt-1.5 text-[13px] font-medium text-[#16233B] truncate">
                {displayPlaceName(p.spot.name, p.spot.nameL10n, locale)}
              </span>
              {/* 순위 카드 = 좋아요·활용 수(내부 score·싫어요 없음) / seed 카드 = 기존 메타 */}
              {p.rank !== null ? (
                <span className="block text-[11.5px] text-[#7C8FB0] truncate">
                  {t("communityLiked", { count: p.likeCount })} · {t("communityUsage", { count: p.usageCount })}
                </span>
              ) : (
                <span className="block text-[11.5px] text-[#7C8FB0] truncate">{p.spot.district ?? ""}</span>
              )}
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

        {/* ── PHASE 10: 조용한 예약 보조 1줄 (Essentials 끝) — 검증된 도시만
            렌더되고, 없으면 이 줄 자체가 없다. Hero/콘텐츠 위계 무접촉. ── */}
        <PartnerOfferRow surface="city-hub-essentials" citySlug={slug} cityLabel={cityLabel} className="mt-6" />

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

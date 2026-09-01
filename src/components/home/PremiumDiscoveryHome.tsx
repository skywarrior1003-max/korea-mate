// Page 2 — 발견.
//
// 시안(home_screen_premium_discovery)의 구성·색·모양을 그대로 따른다:
// 큰 인사 → 검색 진입 → 도시 카드 가로 스크롤 → 파랑/민트 타일 두 장 →
// 인기 공개 여행.
//
// 시안에서 빼는 것과 이유:
//   @사용자명·하트 수치 — itineraries 에 작성자 필드가 없고 좋아요 기능도 없다
//   FAB(+)            — 전역 FAB 추가 금지
//   목업 하단탭       — 기존 BottomNav 정보구조를 유지한다
// 지표는 실제 컬럼 이름 그대로 Views / Helpful / Copies 로 쓴다.
//
// 도시 카드는 시안 그대로 세로 3:4 사진 카드다(시안: min-w-280 h-380 rounded-3xl,
// bg-cover). 사진은 승인된 Stitch 원본을 로컬 편입해서 쓴다 — 서울·부산·제주 3장.
// 원본이 없는 경주·전주만 토큰 아트로 둔다.
//
// 1408x768 가로 원본을 3:4 로 crop 해도 280px 카드에서는 확대가 없다
// (필요 760px, 원본 768px). 시안도 같은 방식으로 crop 한다.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CITY_ENTRY_CONTENT } from "@/data/cities/entry-content";
import { CITY_CONFIGS, CITY_SLUGS } from "@/data/cities";
import { apiFetchPopularTrips } from "@/lib/itinerary-api";
import { cityVisual } from "@/lib/city-visual";
import type { PopularTrip } from "@/lib/supabase";
import CityCardArt from "./CityCardArt";
import {
  DESIGN_PRIMARY, DESIGN_INK, DESIGN_SURFACE, DESIGN_SURFACE_LOW,
  DESIGN_OUTLINE, DESIGN_LINE, DESIGN_MINT, DESIGN_MINT_INK, HERO_MAX_WIDTH,
  FONT_SANS,
} from "./home-visual";

const CITY_LABEL: Record<string, string> = {
  busan: "Busan", seoul: "Seoul", jeju: "Jeju", gyeongju: "Gyeongju", jeonju: "Jeonju",
};

// 도시 사진은 서비스 공용 resolver 를 쓴다(src/lib/city-visual.ts).
// 대표 비주얼이 없는 도시는 null 로 떨어져 CityCardArt 로 그린다 —
// 다른 도시 사진을 돌려쓰지 않는다.

function dayCount(t: PopularTrip): number | null {
  if (!t.start_date || !t.end_date) return null;
  const d = (new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.round(d) + 1 : null;
}

export default function PremiumDiscoveryHome({ active }: { active: boolean }) {
  const t = useTranslations("home");
  const tCityLinks = useTranslations("cityLinks");
  const tCityName = useTranslations("tripForm");
  const [trips, setTrips] = useState<PopularTrip[] | null>(null);
  const [asked, setAsked] = useState(false);

  // 화면 밖 페이지가 네트워크를 먼저 쓰지 않게 한다. 한 번 부르면 다시 부르지 않는다.
  useEffect(() => {
    if (!active || asked) return;
    setAsked(true);
    apiFetchPopularTrips(6).then(setTrips).catch(() => setTrips([]));
  }, [active, asked]);

  const cities = CITY_SLUGS.map(slug => ({
    slug,
    // 도시 이름표도 locale 을 따른다(tripForm.city_*). 표에 없는 도시만 영어 원문.
    label: (() => { const key = `city_${slug.charAt(0).toUpperCase()}${slug.slice(1)}`; try { return tCityName.has(key) ? tCityName(key) : (CITY_LABEL[slug] ?? slug); } catch { return CITY_LABEL[slug] ?? slug; } })(),
    plannerReady: CITY_CONFIGS[slug]?.planningReady ?? false,
    // 한 줄 소개는 일반 UI 문구라 번역한다(cityLinks.desc*). 표에 없는 도시만 영어 원문.
    tagline: (() => { const key = `desc${slug.charAt(0).toUpperCase()}${slug.slice(1)}`; try { return tCityLinks.has(key) ? tCityLinks(key) : (CITY_ENTRY_CONTENT[slug]?.tagline || CITY_CONFIGS[slug]?.seoDescription || ""); } catch { return CITY_ENTRY_CONTENT[slug]?.tagline || ""; } })(),
    image: cityVisual(slug),
  }));

  // 모든 지표가 0인 목록은 인기라고 부를 근거가 없다. 그러면 섹션을 숨긴다.
  const shown = (trips ?? []).filter(
    x => (x.view_count ?? 0) > 0 || (x.helpful_count ?? 0) > 0 || (x.copy_count ?? 0) > 0,
  );

  return (
    <div style={{ backgroundColor: DESIGN_SURFACE, fontFamily: FONT_SANS }}>
      <div className="mx-auto" style={{ maxWidth: HERO_MAX_WIDTH }}>

        {/* ── 인사 ─────────────────────────────────────────────────────── */}
        <section className="px-6 pt-10 pb-6">
          <h1 className="font-black mb-2" style={{ color: DESIGN_INK, fontSize: "clamp(2.1rem,10vw,2.9rem)", lineHeight: 1.06 }}>
            {t("greeting")}
          </h1>
          <p className="text-[15px]" style={{ color: DESIGN_OUTLINE }}>{t("greetingSub")}</p>
        </section>

        {/* ── 검색 진입 — 새 검색 로직을 만들지 않고 기존 섹션으로 보낸다 ── */}
        <section className="px-6 pb-8">
          <a
            href="#spots-main"
            className="gkm-focus flex items-center gap-3 w-full h-14 px-5"
            style={{ backgroundColor: DESIGN_SURFACE_LOW, borderRadius: 16 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke={DESIGN_OUTLINE} strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
            </svg>
            <span className="flex-1 text-[14.5px]" style={{ color: DESIGN_OUTLINE }}>{t("searchHint")}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke={DESIGN_PRIMARY} strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
            </svg>
          </a>
        </section>

        {/* ── 도시 탐색 ────────────────────────────────────────────────── */}
        <section className="pb-9" aria-label={t("exploreCities")}>
          <div className="px-6 flex items-baseline justify-between mb-4">
            <h2 className="text-[22px] font-black" style={{ color: DESIGN_INK }}>{t("exploreCities")}</h2>
            <Link href="/explore/busan/" className="gkm-focus text-[13.5px] font-bold" style={{ color: DESIGN_PRIMARY }}>
              {t("viewAll")}
            </Link>
          </div>

          {/* overscroll-x: contain — 안쪽 스크롤이 끝나도 바깥 페이저로 넘어가지
              않게 잡는다. 안 그러면 도시 카드를 넘기다가 Page 1 로 튕긴다 */}
          <ul
            className="flex gap-4 overflow-x-auto px-6 pb-1 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", overscrollBehaviorX: "contain" }}
          >
            {cities.map(c => (
              <li key={c.slug} className="snap-start shrink-0 w-[74vw] max-w-[280px]">
                <Link
                  href={`/${c.slug}/`}
                  className="gkm-focus relative block overflow-hidden"
                  style={{ height: 380, borderRadius: 24, boxShadow: "0 14px 32px rgba(19,27,46,0.18)" }}
                  aria-label={t("cityCardAria", { city: c.label })}
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image.src}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ objectPosition: c.image.objectPosition }}
                      loading="lazy"
                      decoding="async"
                      width={c.image.w}
                      height={c.image.h}
                    />
                  ) : (
                    <CityCardArt slug={c.slug} label={c.label} />
                  )}

                  <span
                    className="absolute left-3.5 top-3.5 inline-flex items-center px-3 py-1.5 rounded-full text-[11.5px] font-black"
                    style={{ backgroundColor: "rgba(250,248,255,0.92)", color: DESIGN_PRIMARY }}
                  >
                    {c.label}
                  </span>
                  {!c.plannerReady && (
                    <span
                      className="absolute right-3.5 top-3.5 px-2.5 py-1.5 rounded-full text-[10px] font-black text-white"
                      style={{ backgroundColor: "rgba(19,27,46,0.72)" }}
                    >
                      {t("comingSoon")}
                    </span>
                  )}

                  {/* 시안의 하단 다크 패널 — 카드 안쪽에 떠 있는 둥근 판 */}
                  <div
                    className="absolute inset-x-3 bottom-3 px-4 py-3.5"
                    style={{ backgroundColor: "rgba(11,14,24,0.62)", backdropFilter: "blur(6px)", borderRadius: 16 }}
                  >
                    {c.tagline && (
                      <p className="text-[11px] mb-1 line-clamp-1" style={{ color: "rgba(250,248,255,0.68)" }}>
                        {c.tagline}
                      </p>
                    )}
                    <p className="text-[19px] font-black text-white leading-tight">{c.label}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 타일 두 장 ───────────────────────────────────────────────── */}
        <section className="px-6 pb-9">
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/picks"
              className="gkm-focus relative overflow-hidden p-5 min-h-[148px] flex flex-col justify-between"
              style={{ backgroundColor: DESIGN_PRIMARY, borderRadius: 24 }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
              </svg>
              <span>
                <span className="block text-[19px] font-black text-white leading-[1.2]">{t("myPicks")}</span>
                <span className="block text-[12px] mt-1.5" style={{ color: "rgba(255,255,255,0.72)" }}>{t("myPicksSub")}</span>
              </span>
            </Link>
            <Link
              href="/my-trips"
              className="gkm-focus relative overflow-hidden p-5 min-h-[148px] flex flex-col justify-between"
              style={{ backgroundColor: DESIGN_MINT, borderRadius: 24 }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke={DESIGN_MINT_INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
                <path d="M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5" />
              </svg>
              <span>
                <span className="block text-[19px] font-black leading-[1.2]" style={{ color: DESIGN_MINT_INK }}>{t("myTrips")}</span>
                <span className="block text-[12px] mt-1.5" style={{ color: "rgba(0,32,26,0.62)" }}>{t("myTripsSub")}</span>
              </span>
            </Link>
          </div>
        </section>

        {/* ── 인기 공개 여행 ───────────────────────────────────────────── */}
        {shown.length > 0 && (
          <section className="px-6 pb-12" aria-label={t("popularTrips")}>
            <h2 className="text-[22px] font-black mb-4" style={{ color: DESIGN_INK }}>{t("popularTrips")}</h2>
            <ul className="flex flex-col gap-3">
              {shown.map(x => {
                const days = dayCount(x);
                return (
                  <li key={x.id}>
                    <Link
                      href={`/itinerary?id=${encodeURIComponent(x.id)}`}
                      className="gkm-focus flex gap-4 p-3"
                      style={{ backgroundColor: DESIGN_SURFACE_LOW, borderRadius: 20 }}
                    >
                      <div className="relative shrink-0 w-[92px] overflow-hidden" style={{ aspectRatio: "1 / 1", borderRadius: 14 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/img/trip-cover/${encodeURIComponent(x.id)}`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="min-w-0 flex-1 py-1">
                        <p className="text-[15px] font-black leading-snug line-clamp-2" style={{ color: DESIGN_INK }}>
                          {x.trip_title || x.city}
                        </p>
                        <p className="text-[12.5px] mt-1" style={{ color: DESIGN_OUTLINE }}>
                          {x.city}{days ? ` · ${t("days", { n: days })}` : ""}
                        </p>
                        {/* 실제 컬럼 이름 그대로. helpful 을 Like 로 바꾸지 않는다 */}
                        <p className="text-[11.5px] mt-2 flex flex-wrap gap-x-3" style={{ color: DESIGN_OUTLINE }}>
                          {(x.view_count ?? 0) > 0    && <span>{t("views",   { n: x.view_count })}</span>}
                          {(x.helpful_count ?? 0) > 0 && <span>{t("helpful", { n: x.helpful_count })}</span>}
                          {(x.copy_count ?? 0) > 0    && <span>{t("copies",  { n: x.copy_count ?? 0 })}</span>}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div aria-hidden style={{ height: 1, backgroundColor: DESIGN_LINE, opacity: 0 }} />
      </div>
    </div>
  );
}

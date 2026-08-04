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
// 도시 카드 사진은 저장소의 권리 확인 자산(KOGL Type 1)만 쓴다. 그 자산은 전부
// 940x627 가로이고 metadata 에 vertical_fit:"unsuitable" 이 박혀 있어, 시안처럼
// 세로 사진으로 꽉 채우면 2배 가까이 확대돼 흐려진다. 그래서 카드는 시안처럼
// 세로로 길게 두되 사진은 위쪽에 원본 비율로 놓고 아래를 텍스트 패널로 채운다.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CITY_ENTRY_CONTENT } from "@/data/cities/entry-content";
import { CITY_CONFIGS, CITY_SLUGS } from "@/data/cities";
import { apiFetchPopularTrips } from "@/lib/itinerary-api";
import type { PopularTrip } from "@/lib/supabase";
import { assetById } from "@/lib/trip-cover/assets.data";
import { coverProxyPath } from "@/lib/trip-cover/cover-core";
import CityCardArt from "./CityCardArt";
import {
  DESIGN_PRIMARY, DESIGN_INK, DESIGN_SURFACE, DESIGN_SURFACE_LOW,
  DESIGN_OUTLINE, DESIGN_LINE, DESIGN_MINT, DESIGN_MINT_INK, HERO_MAX_WIDTH,
} from "./home-visual";

const CITY_LABEL: Record<string, string> = {
  busan: "Busan", seoul: "Seoul", jeju: "Jeju", gyeongju: "Gyeongju", jeonju: "Jeonju",
};

// 도시 대표 사진. 권리가 확인된 자산이 있는 도시만. 광안대교 컷은 밝고 넓어서
// 카드 한 장으로 부산을 설명한다 — 예전처럼 테마 첫 자산을 자동으로 집으면
// 흐린 시장 골목이나 도서관 자료실이 걸린다.
const CITY_ASSET: Record<string, string> = { busan: "busan-v1-night_view-023" };

function cityImage(slug: string): { src: string; note: string } | null {
  const id = CITY_ASSET[slug];
  const asset = id ? assetById(id) : undefined;
  return asset ? { src: coverProxyPath(asset.asset_id), note: asset.attribution_text } : null;
}

function dayCount(t: PopularTrip): number | null {
  if (!t.start_date || !t.end_date) return null;
  const d = (new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86400000;
  return Number.isFinite(d) ? Math.round(d) + 1 : null;
}

export default function PremiumDiscoveryHome({ active }: { active: boolean }) {
  const t = useTranslations("home");
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
    label: CITY_LABEL[slug] ?? slug,
    plannerReady: CITY_ENTRY_CONTENT[slug]?.plannerReady ?? false,
    tagline: CITY_ENTRY_CONTENT[slug]?.tagline || CITY_CONFIGS[slug]?.seoDescription || "",
    image: cityImage(slug),
  }));

  // 모든 지표가 0인 목록은 인기라고 부를 근거가 없다. 그러면 섹션을 숨긴다.
  const shown = (trips ?? []).filter(
    x => (x.view_count ?? 0) > 0 || (x.helpful_count ?? 0) > 0 || (x.copy_count ?? 0) > 0,
  );
  const attribution = cities.find(c => c.image)?.image?.note;

  return (
    <div style={{ backgroundColor: DESIGN_SURFACE }}>
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
              <li key={c.slug} className="snap-start shrink-0 w-[70vw] max-w-[268px]">
                <Link
                  href={`/${c.slug}/`}
                  className="gkm-focus block h-full overflow-hidden"
                  style={{ borderRadius: 24, backgroundColor: DESIGN_INK, boxShadow: "0 14px 32px rgba(19,27,46,0.16)" }}
                  aria-label={t("cityCardAria", { city: c.label })}
                >
                  <div className="relative w-full" style={{ aspectRatio: "3 / 2" }}>
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.image.src}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        width={940}
                        height={627}
                      />
                    ) : (
                      <CityCardArt slug={c.slug} label={c.label} />
                    )}
                    <span
                      className="absolute left-3 top-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black"
                      style={{ backgroundColor: "rgba(250,248,255,0.92)", color: DESIGN_PRIMARY }}
                    >
                      {c.label}
                    </span>
                    {!c.plannerReady && (
                      <span
                        className="absolute right-3 top-3 px-2.5 py-1.5 rounded-full text-[10px] font-black text-white"
                        style={{ backgroundColor: "rgba(19,27,46,0.72)" }}
                      >
                        {t("comingSoon")}
                      </span>
                    )}
                  </div>
                  <div className="px-5 pt-4 pb-5">
                    <p className="text-[19px] font-black text-white leading-tight mb-1.5">{c.label}</p>
                    {c.tagline && (
                      <p className="text-[12px] leading-snug line-clamp-2" style={{ color: "rgba(250,248,255,0.62)" }}>
                        {c.tagline}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {attribution && (
            <p className="px-6 pt-3 text-[10px]" style={{ color: DESIGN_OUTLINE }}>{attribution}</p>
          )}
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

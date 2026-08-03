// Page 2 — 발견.
//
// 장소 목록이 아니라 여행을 시작할 지점이다. 도시 → City Entry, 공개 여행 →
// 그 일정으로 이어진다.
//
// 사진이 있는 도시는 부산뿐이다. 나머지 네 도시에 다른 도시 사진을 돌려쓰거나
// 생성 이미지를 넣지 않고 CityCardArt 로 그린다. 사진 유무가 곧 준비 상태를
// 드러내는 셈이라, 숨기는 것보다 정직하다.
//
// 목업에 있던 @사용자명·하트 수치는 만들지 않는다. itineraries 스키마에
// 작성자 필드가 없고 좋아요 기능도 없다. 있는 값만 있는 이름으로 쓴다 —
// Views / Helpful / Copies.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CITY_ENTRY_CONTENT } from "@/data/cities/entry-content";
import { CITY_CONFIGS, CITY_SLUGS } from "@/data/cities";
import { apiFetchPopularTrips } from "@/lib/itinerary-api";
import type { PopularTrip } from "@/lib/supabase";
import { assetsByTheme } from "@/lib/trip-cover/assets.data";
import { coverProxyPath } from "@/lib/trip-cover/cover-core";
import CityCardArt from "./CityCardArt";

const CITY_LABEL: Record<string, string> = {
  busan: "Busan", seoul: "Seoul", jeju: "Jeju", gyeongju: "Gyeongju", jeonju: "Jeonju",
};

/** 권리가 확인된 도시 이미지. 지금은 부산만 있다. */
function cityImage(slug: string): { src: string; note: string } | null {
  if (slug !== "busan") return null;
  // 940x627 가로 자산이라(vertical_fit: unsuitable) 세로 카드로 쓰지 않는다.
  // 카드 비율을 4:3 으로 잡은 이유가 이것이다.
  const asset = assetsByTheme("beach_ocean")[0];
  return asset
    ? { src: coverProxyPath(asset.asset_id), note: asset.attribution_text }
    : null;
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

  return (
    <div className="min-h-full bg-surface-dim">
      {/* ── 인사 ───────────────────────────────────────────────────────── */}
      <section className="px-5 pt-10 pb-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-black text-ink leading-tight mb-2">
            {t("greeting")}
          </h1>
          <p className="text-sm sm:text-base text-sub">{t("greetingSub")}</p>
        </div>
      </section>

      {/* ── 도시 탐색 ──────────────────────────────────────────────────── */}
      <section className="pb-8" aria-label={t("exploreCities")}>
        <div className="max-w-2xl mx-auto px-5 flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-black text-ink">{t("exploreCities")}</h2>
          <Link href="/explore/busan/" className="gkm-focus text-xs font-black text-kpop">
            {t("viewAll")} →
          </Link>
        </div>

        {/* 가로 스크롤러. overscroll-x: contain 으로 안쪽 스크롤이 끝나도 바깥
            페이저로 넘어가지 않게 잡는다 — 안 그러면 도시 카드를 넘기다가
            Page 1 로 튕긴다. */}
        <ul
          className="flex gap-3 overflow-x-auto px-5 pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", overscrollBehaviorX: "contain" }}
        >
          {cities.map(c => (
            <li key={c.slug} className="snap-start shrink-0 w-[68vw] max-w-[280px]">
              <Link
                href={`/${c.slug}/`}
                className="gkm-focus block rounded-card overflow-hidden shadow-card"
                aria-label={t("cityCardAria", { city: c.label })}
              >
                <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
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
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to top, rgba(25,28,33,0.88) 0%, rgba(25,28,33,0.10) 60%, transparent 100%)" }}
                  />
                  {!c.plannerReady && (
                    <span className="absolute right-3 top-3 px-2.5 py-1 rounded-full text-[10px] font-black text-white"
                          style={{ backgroundColor: "rgba(25,28,33,0.7)", border: "1px dashed rgba(255,255,255,0.35)" }}>
                      {t("comingSoon")}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-lg font-black text-white leading-tight">{c.label}</p>
                    {c.tagline && (
                      <p className="text-[11px] text-white/60 leading-snug mt-0.5 line-clamp-2">{c.tagline}</p>
                    )}
                  </div>
                </div>
              </Link>
              {c.image && (
                <p className="px-1 pt-1.5 text-[10px] text-faint leading-tight">{c.image.note}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── 바로가기 ───────────────────────────────────────────────────── */}
      <section className="px-5 pb-8">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3">
          <Link
            href="/picks"
            className="gkm-focus rounded-card p-5 min-h-[104px] flex flex-col justify-end shadow-card"
            style={{ backgroundColor: "var(--gkm-ink)" }}
          >
            <span className="text-xl mb-1.5" aria-hidden>🧭</span>
            <span className="text-base font-black text-white leading-tight">{t("myPicks")}</span>
            <span className="text-[11px] text-white/50 mt-0.5">{t("myPicksSub")}</span>
          </Link>
          <Link
            href="/my-trips"
            className="gkm-focus rounded-card p-5 min-h-[104px] flex flex-col justify-end shadow-card border border-line bg-surface"
          >
            <span className="text-xl mb-1.5" aria-hidden>🧳</span>
            <span className="text-base font-black text-ink leading-tight">{t("myTrips")}</span>
            <span className="text-[11px] text-sub mt-0.5">{t("myTripsSub")}</span>
          </Link>
        </div>
      </section>

      {/* ── 인기 공개 여행 ─────────────────────────────────────────────── */}
      {shown.length > 0 && (
        <section className="px-5 pb-12" aria-label={t("popularTrips")}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-black text-ink mb-4">{t("popularTrips")}</h2>
            <ul className="flex flex-col gap-3">
              {shown.map(x => {
                const days = dayCount(x);
                return (
                  <li key={x.id}>
                    <Link
                      href={`/itinerary?id=${encodeURIComponent(x.id)}`}
                      className="gkm-focus flex gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
                    >
                      <div className="relative shrink-0 w-24 rounded-control overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/img/trip-cover/${encodeURIComponent(x.id)}`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-ink leading-snug line-clamp-2">
                          {x.trip_title || x.city}
                        </p>
                        <p className="text-[11px] text-sub mt-1">
                          {x.city}{days ? ` · ${t("days", { n: days })}` : ""}
                        </p>
                        {/* 실제 컬럼 이름 그대로. helpful 을 Like 로 바꾸지 않는다 */}
                        <p className="text-[11px] text-faint mt-1.5 flex flex-wrap gap-x-3">
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
          </div>
        </section>
      )}
    </div>
  );
}

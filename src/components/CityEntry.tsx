// 도시 진입 화면 — 다도시 공통.
//
// 도시마다 페이지를 따로 두지 않는다. 바뀌는 건 콘텐츠·Explore 목적지·SEO 뿐이라
// 화면은 하나로 두고 config 를 받는다. 도시 slug 를 조건문으로 늘어놓지 않는다.
//
// 팔레트는 GoKoreaMate 디자인 토큰(Coral / Ink / Neutral / Violet)을 쓴다.
// 예전 페이지의 베이지·골드는 토큰 밖에서 자란 두 번째 팔레트였다.
//
// 본문(대표 경험·실용 정보)은 영어 원문을 그대로 둔다 — 교통 요금·소요시간·계절
// 조언 같은 사실 정보를 번역으로 흔들지 않기 위해서다. UI chrome 만 4개 언어다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import KoreaReadySection from "@/components/KoreaReadySection";
import type { CityConfig } from "@/data/cities";
import type { CityEntryContent } from "@/data/cities/entry-content";

interface Props {
  city:    CityConfig;
  content: CityEntryContent;
}

export default function CityEntry({ city, content }: Props) {
  const t  = useTranslations("cityEntry");
  const tE = useTranslations("explore");

  const exploreHref = `/explore/${city.slug}/`;
  const hasHighlights = content.highlights.length > 0;
  const hasPractical  = content.practical.length > 0;
  // 콘텐츠가 없는 도시는 소개 대신 기존 seoDescription 한 문장을 쓴다.
  const intro = content.intro || city.seoDescription;

  return (
    <div className="min-h-screen bg-surface-dim">

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-16 sm:py-20 text-center bg-ink">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 60%, rgba(255,74,45,0.18) 0%, transparent 52%)," +
              "radial-gradient(circle at 72% 25%, rgba(95,91,214,0.16) 0%, transparent 48%)",
          }}
        />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black text-white/55 border border-white/20 mb-6 tracking-widest uppercase">
            {content.badge}
          </span>
          <h1 className="text-4xl sm:text-6xl font-black text-white mb-4 leading-tight" style={{ textWrap: "balance" }}>
            {content.title}
          </h1>
          {content.tagline && (
            <p className="text-lg sm:text-xl text-white/65 mb-4 font-medium">{content.tagline}</p>
          )}
          <p className="text-base text-white/55 max-w-xl mx-auto leading-relaxed mb-9">{intro}</p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={exploreHref}
              className="gkm-focus inline-flex items-center justify-center min-h-12 px-8 rounded-control bg-action text-white text-base font-black hover:bg-action-hover shadow-cta transition-colors"
            >
              {t("exploreCity", { city: content.title })} →
            </Link>

            {content.plannerReady ? (
              <Link
                href={`/?city=${city.slug}#planner`}
                className="gkm-focus inline-flex items-center justify-center min-h-12 px-8 rounded-control border border-white/25 text-white text-base font-bold hover:bg-white/10 transition-colors"
              >
                ✨ {t("planTrip")}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center justify-center min-h-12 px-8 rounded-control border border-dashed border-white/20 text-white/45 text-base font-semibold cursor-default"
              >
                {t("plannerComingSoon")}
              </span>
            )}
          </div>

          {content.heroSub && <p className="mt-3 text-xs text-white/35">{content.heroSub}</p>}
        </div>
      </section>

      {/* ── 대표 경험 ───────────────────────────────────────────────────── */}
      {hasHighlights ? (
        <section className="max-w-5xl mx-auto px-4 py-14">
          <h2 className="text-2xl sm:text-3xl font-black text-ink mb-2 text-center">{content.highlightsTitle}</h2>
          <p className="text-sub text-center mb-9">{content.highlightsSubtitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {content.highlights.map(h => (
              <article key={h.name} className="bg-surface rounded-card p-5 border border-line shadow-card">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl" aria-hidden>{h.emoji}</span>
                  <span className="text-[10px] font-black px-2 py-1 rounded-full text-kpop bg-kpop-tint">{h.tag}</span>
                </div>
                <h3 className="text-base font-black text-ink mb-1.5">{h.name}</h3>
                <p className="text-sm text-sub leading-relaxed">{h.desc}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        // 콘텐츠가 없는 도시 — 없는 장소를 지어내지 않고 준비 중임을 밝힌다.
        <section className="max-w-3xl mx-auto px-4 py-14">
          <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-3xl mb-3" aria-hidden>🚧</p>
            <h2 className="text-lg font-black text-ink mb-2">
              {tE("comingSoon.title")}
            </h2>
            <p className="text-sm text-sub leading-relaxed">
              {tE("comingSoon.description", { city: content.title })}
            </p>
          </div>
        </section>
      )}

      {/* ── 실용 정보 ───────────────────────────────────────────────────── */}
      {hasPractical && (
        <section className="bg-surface border-y border-line py-12 px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-ink mb-2 text-center">{content.practicalTitle}</h2>
            <p className="text-sub text-center mb-9">{content.practicalSubtitle}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.practical.map(p => (
                <div key={p.label} className="flex gap-3 p-4 rounded-control border border-line bg-surface-dim">
                  <span className="text-2xl shrink-0" aria-hidden>{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-faint uppercase tracking-wide mb-0.5">{p.label}</p>
                    <p className="text-sm text-ink font-medium leading-snug">{p.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Editorial 제휴 (도시 랜딩은 허용 표면) ──────────────────────── */}
      {content.koreaReady && (
        <KoreaReadySection city={city.slug as "seoul" | "busan" | "jeju" | "gyeongju"} surface="city-landing" />
      )}

      {/* ── Planner CTA ─────────────────────────────────────────────────── */}
      {content.plannerReady && (
        <section className="max-w-3xl mx-auto px-4 py-14 text-center">
          <div className="rounded-frame p-8 sm:p-10 bg-ink">
            <p className="text-xs font-black uppercase tracking-widest text-white/45 mb-3">{content.plannerLabel}</p>
            <h2 className="text-2xl font-black text-white mb-3">{content.plannerTitle}</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-7 max-w-md mx-auto">{content.plannerDesc}</p>
            <Link
              href={`/?city=${city.slug}#planner`}
              className="gkm-focus inline-flex items-center justify-center min-h-12 px-8 rounded-control bg-action text-white text-base font-black hover:bg-action-hover shadow-cta transition-colors"
            >
              ✨ {t("planTrip")}
            </Link>
          </div>
        </section>
      )}

      {/* ── 다른 도시 ───────────────────────────────────────────────────── */}
      <nav aria-label={t("otherCities")} className="max-w-5xl mx-auto px-4 pb-10">
        <p className="text-xs font-black uppercase tracking-wide text-faint mb-3">{t("otherCities")}</p>
        <div className="flex flex-wrap gap-2">
          {OTHER_CITIES.filter(s => s !== city.slug).map(slug => (
            <Link
              key={slug}
              href={`/${slug}/`}
              className="gkm-focus min-h-11 px-4 inline-flex items-center rounded-full border border-line bg-surface text-sm font-semibold text-sub hover:text-ink transition-colors"
            >
              {CITY_LABEL[slug]}
            </Link>
          ))}
        </div>
      </nav>

      {/* BottomNav 는 layout 이 전역으로 깐다. 여기서는 여백만 확보한다. */}
      <div aria-hidden className="h-4" />
    </div>
  );
}

// 도시 목록은 한 곳에서만 관리한다 — 페이지마다 링크를 하드코딩하면 도시를
// 추가할 때 네 곳을 고쳐야 하고, 실제로 jeonju 가 빠져 있었다.
const OTHER_CITIES = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;

const CITY_LABEL: Record<string, string> = {
  busan: "Busan", seoul: "Seoul", jeju: "Jeju", gyeongju: "Gyeongju", jeonju: "Jeonju",
};

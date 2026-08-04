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
import CityHeroArt from "@/components/home/CityHeroArt";
import { DESIGN_PRIMARY, DESIGN_INK, FONT_SERIF } from "@/components/home/home-visual";
import type { CityConfig } from "@/data/cities";
import type { CityEntryContent } from "@/data/cities/entry-content";

interface Props {
  city:    CityConfig;
  content: CityEntryContent;
}

/**
 * 도시 대표 사진. 승인 시안이 실제로 쓴 이미지만 둔다.
 * 경주·전주는 시안에도 저장소에도 사진이 없어 비워 두고 CityHeroArt 로 그린다 —
 * 다른 도시 사진을 돌려쓰면 그 도시가 아닌 곳을 보여주게 된다.
 */
const CITY_HERO: Record<string, { src: string; w: number; h: number }> = {
  busan: { src: "/images/home/city-busan-hero.jpg", w: 1408, h: 768 },
  seoul: { src: "/images/home/city-seoul.jpg",      w: 1408, h: 768 },
  jeju:  { src: "/images/home/city-jeju.jpg",       w: 704,  h: 1520 },
};

export default function CityEntry({ city, content }: Props) {
  const t  = useTranslations("cityEntry");
  const tE = useTranslations("explore");
  const tD = useTranslations("discovery");
  const hero = CITY_HERO[city.slug] ?? null;

  const exploreHref = `/explore/${city.slug}/`;
  const hasHighlights = content.highlights.length > 0;
  const hasPractical  = content.practical.length > 0;
  // 콘텐츠가 없는 도시는 소개 대신 기존 seoDescription 한 문장을 쓴다.
  const intro = content.intro || city.seoDescription;

  return (
    <div className="min-h-screen bg-surface-dim">

      {/* ── Hero — 도시 사진 위 에디토리얼 제목 ────────────────────────
          시안은 도시 사진이 화면을 채우고 그 위에 세리프 제목·기능 칩·CTA 가
          얹히는 구조다. 예전 구현은 사진 없이 다크 그라디언트에 가운데 정렬이라
          도시가 어떤 곳인지 한 장도 보여주지 못했다.

          칩 문구는 실제 기능만 말한다. 시안의 BUILD/OPTIMIZE 는 개인화 AI
          분석을 암시하는데 그런 계약이 없어서, 실제로 있는 AI 일정 생성 기능만
          가리키는 말로 바꿨다. */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: "clamp(420px, 62vh, 560px)" }}>
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero.src}
            alt={tD("cityHeroAlt", { city: content.title })}
            width={hero.w}
            height={hero.h}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "center 45%" }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <CityHeroArt slug={city.slug} />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(10,12,20,0.90) 0%, rgba(10,12,20,0.42) 46%, rgba(10,12,20,0.10) 100%)" }}
        />

        <div className="relative mx-auto max-w-3xl px-6 pt-10 pb-9 flex flex-col justify-end" style={{ minHeight: "clamp(420px, 62vh, 560px)" }}>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {content.plannerReady ? (
              <>
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-black tracking-[0.12em] text-white"
                  style={{ backgroundColor: DESIGN_PRIMARY }}
                >
                  {tD("cityPlannerChip")}
                </span>
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-black tracking-[0.12em]"
                  style={{ backgroundColor: "#26fedc", color: "#00201a" }}
                >
                  {tD("cityBuildChip")}
                </span>
              </>
            ) : (
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-black tracking-[0.12em] text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.32)" }}
              >
                {tD("cityComingSoonState")}
              </span>
            )}
          </div>

          <h1
            className="text-white mb-3"
            style={{
              fontFamily: FONT_SERIF, fontStyle: "italic", fontWeight: 700,
              fontSize: "clamp(2.1rem, 9.4vw, 3.2rem)", lineHeight: 1.06, letterSpacing: "-0.02em",
            }}
          >
            {content.title}
          </h1>
          {content.tagline && (
            <p className="text-[15px] text-white/78 font-medium mb-3">{content.tagline}</p>
          )}
          <p className="text-[13.5px] text-white/62 leading-relaxed mb-7 max-w-xl">{intro}</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={exploreHref}
              className="gkm-focus inline-flex items-center justify-center min-h-13 h-13 px-7 rounded-full text-white text-[15px] font-black shadow-cta transition-transform active:scale-95"
              style={{ backgroundColor: DESIGN_PRIMARY }}
            >
              {t("exploreCity", { city: content.title })}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6.5l5.5 5.5L13 17.5" /></svg>
            </Link>

            {content.plannerReady ? (
              <Link
                href={`/?city=${city.slug}#planner`}
                className="gkm-focus inline-flex items-center justify-center min-h-13 h-13 px-7 rounded-full text-white text-[15px] font-bold transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.30)" }}
              >
                {t("planTrip")}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex items-center justify-center min-h-13 h-13 px-7 rounded-full text-white/45 text-[15px] font-semibold cursor-default"
                style={{ border: "1px dashed rgba(255,255,255,0.22)" }}
              >
                {t("plannerComingSoon")}
              </span>
            )}
          </div>

          {content.heroSub && <p className="mt-3 text-[11px] text-white/38">{content.heroSub}</p>}
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
                {/* h.emoji 는 렌더하지 않는다 — 대체로 그 장소와 무관한 그림문자라
                    (해변 이모지가 문화마을을 가리키는 식) 정보가 아니라 장식이었다.
                    데이터는 다른 화면이 쓸 수 있어 지우지 않고 두었다. */}
                <div className="flex items-start justify-between mb-3">
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
            <p className="mb-3 flex justify-center text-faint" aria-hidden><svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg></p>
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
                /* p.icon 도 같은 이유로 렌더하지 않는다. 라벨(교통·통화 등)이
                   이미 무엇인지 말하고 있어 그림문자가 더할 정보가 없다. */
                <div key={p.label} className="flex gap-3 p-4 rounded-control border border-line bg-surface-dim">
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
          <div className="rounded-frame p-8 sm:p-10" style={{ backgroundColor: DESIGN_INK }}>
            <p className="text-xs font-black uppercase tracking-widest text-white/45 mb-3">{content.plannerLabel}</p>
            <h2 className="text-2xl font-black text-white mb-3">{content.plannerTitle}</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-7 max-w-md mx-auto">{content.plannerDesc}</p>
            <Link
              href={`/?city=${city.slug}#planner`}
              className="gkm-focus inline-flex items-center justify-center min-h-13 h-13 px-8 rounded-full text-white text-[15px] font-black shadow-cta transition-transform active:scale-95"
              style={{ backgroundColor: DESIGN_PRIMARY }}
            >
              {t("planTrip")}
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

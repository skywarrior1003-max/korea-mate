"use client";

// Home — Seoul A 편집형 (MAIN-HOME-SEOUL-A-REAL-APP-PREVIEW-V1, 2026-09-19).
//
//  HERO    : 서울 광화문(고전+현대) 이미지 + 여행 이야기 예시 문구. 홈의 주제는
//            "나의 여행과 추억이 이렇게 남는다"이지 관광지 나열이 아니다.
//  SEARCH  : 히어로와 본문 사이 하나의 검색창(Surviving Search 유지 — 이동·복제 없음).
//            기존 검색·URL 붙여넣기 계약을 그대로 재사용한다.
//  JOURNEY : 일정 → 순간 기록 → Story 공유 3단계. 데스크톱 3열 / 모바일 3행.
//  FLOOR   : 5도시 → KoreaMate Picks(전부 동일 크기 컴팩트 행 — 대형 배너 없음).
//
// 신규 CTA 버튼은 만들지 않는다. 히어로 이미지는 KTO 공식 원천을 프로젝트 자산으로
// 최적화해 사용한다(출처 기록: docs/product/home-seoul-a-hero-image-source-v1.md).
// RT-04: 밝은 사진에서도 글자가 살아남도록 하단 scrim 을 유지한다.
// RT-08: 사진 로드 실패 시에도 어두운 베이스 그라데이션이 구도를 지킨다.

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { cityVisual, cityHubHeroVisual } from "@/lib/city-visual";
import { getRecommendedTrips, tripDisplayTitle } from "@/data/regional/regional-recommendations";
import { QUIET_CITIES } from "./quiet-data";
import QuietSearch from "./QuietSearch";

// KTO 광화문(contentId 126512) 공식 이미지 — 프로젝트 자산(hotlink 아님).
const HERO_IMG = "/images/home/home-hero-seoul-gwanghwamun-v1.webp";

export default function QuietHome() {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const locale = useLocale();
  const heroRef = useRef<HTMLElement>(null);
  const [searchActive, setSearchActive] = useState(false);

  // 검색이 열리면 field 를 dock 위치까지 올린다 — 같은 요소가 이동하는 것이지 복제가 아니다.
  const onSearchActive = useCallback((active: boolean) => {
    setSearchActive(active);
    if (active) {
      const heroH = heroRef.current?.offsetHeight ?? 0;
      if (window.scrollY < heroH - 80) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, heroH - 72), behavior: reduced ? "auto" : "smooth" });
      }
    }
  }, []);

  // 홈 Picks: 5도시 공식 추천에서 도시 교차로 3개(부산·서울·제주의 첫 코스).
  // 결정적 선택 — 회전/랜덤/랭킹은 이 단계에서 발명하지 않는다(OPEN).
  const picks = ["busan", "seoul", "jeju"]
    .map(c => getRecommendedTrips(c)[0])
    .filter((tr): tr is NonNullable<typeof tr> => Boolean(tr));

  const steps = [1, 2, 3] as const;

  return (
    <div className="qh" style={{ backgroundColor: "var(--qh-paper)" }}>
      {/* ══ HERO — 광화문, 여행 이야기 예시 ══ */}
      <section
        ref={heroRef}
        className="relative overflow-hidden h-[448px] md:h-[520px]"
        style={{ backgroundColor: "#12161d" }}
        aria-label={t("heroEyebrow")}
      >
        {/* RT-08 art-direction fallback: 사진이 없어도 성립하는 어두운 베이스 */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(178deg,#12161d 0%,#1a212b 46%,#0d1015 100%)" }} />
        <Image
          src={HERO_IMG} alt="" fill priority sizes="100vw"
          className="object-cover" style={{ objectPosition: "50% 42%" }}
        />
        {/* RT-04: 하단 scrim — 밝은 사진 위 흰 글자 보호 */}
        <div className="absolute inset-x-0 bottom-0 h-[62%]" style={{ background: "linear-gradient(180deg,transparent,rgba(8,15,14,.18) 30%,rgba(8,15,14,.8))" }} />

        <div className="relative h-full max-w-3xl mx-auto px-5 md:px-6 flex flex-col">
          {/* keep-all: 한국어 단어 중간 줄바꿈 방지("오/늘의" 실측) — 라틴 문안엔 영향 없음 */}
          <div className="mt-auto pb-[64px] md:pb-[76px]" style={{ textShadow: "0 1px 16px rgba(0,0,0,.3)", wordBreak: "keep-all" }}>
            <p className="text-[12px] md:text-[14px] font-medium tracking-[.02em] text-white/85">{t("heroEyebrow")}</p>
            <h1 className="qh-serif mt-2.5 md:mt-3.5 text-white text-[31px] md:text-[46px] leading-[1.2] md:leading-[1.16]" style={{ textWrap: "balance", letterSpacing: "-.04em" }}>
              {t("heroTitle")}
            </h1>
            <p className="mt-3 md:mt-4 max-w-[560px] text-[13.5px] md:text-[16px] leading-[1.6] text-white/90">
              {t("heroDesc")}
            </p>
          </div>
        </div>
      </section>

      {/* ══ SURVIVING SEARCH — 히어로와 본문 사이, 스크롤하면 dock 으로 생존 ══ */}
      <div
        className="sticky z-30 px-4 md:px-6 -mt-[26px] pb-2 max-w-3xl mx-auto w-full"
        style={{ top: "calc(3.5rem + 8px)" }}
      >
        <div className="md:max-w-[620px] md:mx-auto">
          <QuietSearch variant="floor" onActiveChange={onSearchActive} />
        </div>
      </div>

      {/* ══ FLOOR — 3단계 → 5도시 → Picks ══ */}
      <section className="max-w-3xl mx-auto px-5 md:px-6 pt-10 pb-12" style={{ scrollMarginTop: "4.2rem" }}>
        {/* 모바일에서 검색 활성 중엔 결과 표면이 곧 화면 — 아래 섹션은 조용히 물러난다 */}
        <div className={searchActive ? "hidden md:block" : undefined}>
          {/* 여행이 이렇게 남습니다 — 01 일정 · 02 순간 · 03 Story */}
          <h2 className="qh-serif text-[22px] md:text-[27px] text-[var(--qh-ink)]" style={{ letterSpacing: "-.03em" }}>
            {t("journeyTitle")}
          </h2>
          <div className="mt-2 md:mt-6 md:grid md:grid-cols-3 border-t border-[var(--qh-line)] md:border-t-0 md:pb-2" style={{ wordBreak: "keep-all" }}>
            {steps.map((n, i) => (
              <div
                key={n}
                className={`grid grid-cols-[40px_1fr] gap-2.5 py-4 border-b border-[var(--qh-line)] md:border-b-0 md:py-1 ${
                  i > 0 ? "md:pl-8 md:border-l md:border-[var(--qh-line)]" : ""
                } ${i < steps.length - 1 ? "md:pr-8" : ""}`}
              >
                <span aria-hidden className="qh-serif text-[20px] md:text-[22px] leading-[1.15] text-[var(--qh-clay)]">
                  {`0${n}`}
                </span>
                <span>
                  <h3 className="text-[15px] font-semibold text-[var(--qh-ink)]">{t(`journeyStep${n}Title`)}</h3>
                  <p className="mt-1 text-[12.5px] md:text-[13px] leading-[1.55] text-[var(--qh-faint)]">{t(`journeyStep${n}Desc`)}</p>
                </span>
              </div>
            ))}
          </div>

          <h2 className="text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)] mt-8">{t("citiesLabel")}</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible" style={{ scrollbarWidth: "none" }}>
            {QUIET_CITIES.map(c => {
              // 도시 진입 selector 는 City Hub Hero 와 도시 identity 를 맞춘다
              // (Owner 2026-09-11 — busan 만 override, Home emotional cover 는 기존 유지).
              const v = cityHubHeroVisual(c.slug);
              return (
                <Link
                  key={c.slug}
                  href={`/city/${c.slug}`}
                  className="relative flex-none w-[124px] h-[164px] md:w-auto md:h-[176px] rounded-[4px] overflow-hidden bg-[#3a3f4a] gkm-focus"
                >
                  {v && (
                    <Image src={v.src} alt="" fill sizes="(max-width: 768px) 124px, 20vw"
                      className="object-cover" style={{ objectPosition: v.objectPosition }} />
                  )}
                  {/* RT-04: 도시 타일에도 항상 하단 scrim */}
                  <span className="absolute inset-x-0 bottom-0 h-[56px]" style={{ background: "linear-gradient(180deg,transparent,rgba(10,10,8,.66))" }} />
                  <span className="absolute left-3 bottom-2.5 text-white text-[15px] font-medium">{tForm(c.labelKey)}</span>
                </Link>
              );
            })}
          </div>

          {/* Picks — 전부 동일 크기의 컴팩트 행(대형 배너 없음). 순서·데이터 무변경 */}
          <h2 className="text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)] mt-8">{t("picksLabel")}</h2>
          <ul className="mt-1">
            {picks.map(p => (
              <li key={p.id}>
                <Link href={`/city/${p.city}/trips`} className="flex items-center gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
                  <span className="relative w-[82px] h-[56px] rounded-[4px] overflow-hidden flex-none bg-[#4f4234]">
                    {cityVisual(p.city) && (
                      <Image src={cityVisual(p.city)!.src} alt="" fill sizes="82px" className="object-cover"
                        style={{ objectPosition: cityVisual(p.city)!.objectPosition }} />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] truncate">{tripDisplayTitle(p, locale)}</span>
                    <span className="block text-[12px] text-[var(--qh-faint)] truncate">
                      {t("typeTrip")} · {tForm(`city_${p.city.charAt(0).toUpperCase()}${p.city.slice(1)}`)}
                      {p.days && Number.isInteger(p.days) && p.days >= 1 ? ` · ${p.days}d` : ""}
                    </span>
                  </span>
                  <span aria-hidden className="flex-none text-[15px] text-[var(--qh-faint)]">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

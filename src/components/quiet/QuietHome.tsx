"use client";

// Home — Quiet Travel Editorial (최종 디자인 GoKoreaMate App.dc.html Turn 3).
//
//  HOME 1 = COVER  : 실제 여행 기록 한 장(사진 + serif 캡션 + Search). 광고 아님.
//  HOME 2 = FLOOR  : Search dock → 5도시 → KoreaMate Picks(~3). 대시보드 금지.
//
// Cover → Floor 는 하나의 연속 수직 스크롤이다. Search 는 이 파일에서 "한 번만"
// 렌더되고 position:sticky 로 Cover 하단에서 Floor 상단으로 살아남는다 — 두 개의
// 검색이 교체되는 느낌 금지(Surviving Search). 스타일(유리질↔dock)만 스크롤
// 위치에 따라 바뀐다. prefers-reduced-motion 이면 smooth scroll 을 쓰지 않는다.
//
// Cover 사진은 repo 권리 안전 자산(도시 대표 비주얼)만 사용한다. 캡션은 장소·
// 시각을 지어내지 않는 범위의 담백한 문장(quiet.coverCaption/coverMeta).
// RT-04: 사진 상단·하단 모두 scrim — 밝은 사진으로 교체돼도 글자가 살아남는다.
// RT-08: 사진 로드 실패/미지정 시에도 어두운 베이스 그라데이션이 구도를 지킨다.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cityVisual } from "@/lib/city-visual";
import { curatedTripsForCity } from "@/data/curated-trips";
import { QUIET_CITIES } from "./quiet-data";
import QuietSearch from "./QuietSearch";

const COVER_IMG = cityVisual("busan"); // 서비스 도시 대표 비주얼 — 사실 기록사진 주장 없음

export default function QuietHome() {
  const t = useTranslations("quiet");
  const tForm = useTranslations("tripForm");
  const coverRef = useRef<HTMLElement>(null);
  const floorRef = useRef<HTMLElement>(null);
  const [overCover, setOverCover] = useState(true);
  const [searchActive, setSearchActive] = useState(false);

  // Search 스타일 전환: Cover 를 70% 지나면 dock. rAF 스로틀.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = coverRef.current?.offsetHeight ?? 0;
        setOverCover(window.scrollY < Math.max(1, h * 0.7));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  // 검색이 열리면 field 를 dock 위치까지 올린다 — 같은 요소가 이동하는 것이지 복제가 아니다.
  const onSearchActive = useCallback((active: boolean) => {
    setSearchActive(active);
    if (active) {
      const coverH = coverRef.current?.offsetHeight ?? 0;
      if (window.scrollY < coverH - 80) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, coverH - 72), behavior: reduced ? "auto" : "smooth" });
      }
    }
  }, []);

  const scrollToFloor = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    floorRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  // 홈 Picks: curated 코스에서 3개(현재 저장소의 curated = 경주 공식 코스).
  // 다른 도시 코스가 추가되면 자연히 섞인다 — 하드코드 제목 없음.
  const picks = curatedTripsForCity("gyeongju").slice(0, 3);

  return (
    <div className="qh" style={{ backgroundColor: "var(--qh-paper)" }}>
      {/* ══ HOME 1 — COVER ══ */}
      <section
        ref={coverRef}
        onClick={scrollToFloor}
        className="relative overflow-hidden cursor-pointer"
        style={{ height: "calc(100svh - 3.5rem)", minHeight: 520, backgroundColor: "#0b0e14" }}
        aria-label={t("coverMeta")}
      >
        {/* RT-08 art-direction fallback: 사진이 없어도 성립하는 어두운 베이스 */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(178deg,#0b0e14 0%,#131923 46%,#0a0c10 100%)" }} />
        {COVER_IMG && (
          <Image
            src={COVER_IMG.src} alt="" fill priority sizes="100vw"
            className="object-cover" style={{ objectPosition: COVER_IMG.objectPosition }}
          />
        )}
        {/* RT-04: 상단·하단 scrim — 밝은 하늘 사진에서도 텍스트 보호 */}
        <div className="absolute inset-x-0 top-0 h-[18%]" style={{ background: "linear-gradient(180deg,rgba(4,5,7,.55),transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 h-[46%]" style={{ background: "linear-gradient(180deg,transparent,rgba(4,5,7,.78))" }} />

        <div className="relative h-full flex flex-col max-w-3xl mx-auto px-6">
          <div className="mt-auto pb-[150px] md:pb-[170px]">
            <p className="qh-serif italic text-white text-[32px] md:text-[44px] leading-[1.2]" style={{ textWrap: "balance" }}>
              {t("coverCaption")}
            </p>
            <p className="mt-2.5 text-[13px] md:text-[14px] text-white/65">{t("coverMeta")}</p>
          </div>
          <p className="absolute left-0 right-0 bottom-6 text-center text-[11px] tracking-[.14em] text-white/50 uppercase">
            {t("continueHint")} ↓
          </p>
        </div>
      </section>

      {/* ══ SURVIVING SEARCH — Cover 하단 ↔ Floor 상단을 하나의 요소로 ══ */}
      <div
        className="sticky z-30 px-5 md:px-6 -mt-[104px] pb-2 max-w-3xl mx-auto w-full"
        style={{ top: "calc(3.5rem + 8px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="md:max-w-[620px] md:mx-auto">
          <QuietSearch variant={overCover ? "cover" : "floor"} onActiveChange={onSearchActive} />
        </div>
      </div>

      {/* ══ HOME 2 — FLOOR ══ */}
      <section ref={floorRef} className="max-w-3xl mx-auto px-5 md:px-6 pt-6 pb-12" style={{ scrollMarginTop: "3.4rem" }}>
        {/* 모바일에서 검색 활성 중엔 결과 표면이 곧 화면 — 아래 섹션은 조용히 물러난다 */}
        <div className={searchActive ? "hidden md:block" : undefined}>
          <h2 className="text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)] mt-4">{t("citiesLabel")}</h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible" style={{ scrollbarWidth: "none" }}>
            {QUIET_CITIES.map(c => {
              const v = cityVisual(c.slug);
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

          <h2 className="text-[12px] font-medium tracking-[.12em] text-[var(--qh-faint)] mt-8">{t("picksLabel")}</h2>
          {picks[0] && (
            <Link href={`/city/${picks[0].city}/trips`} className="block mt-3 gkm-focus rounded-[4px]">
              <span className="relative block h-[180px] rounded-[4px] overflow-hidden bg-[#4f4234]">
                {cityVisual(picks[0].city) && (
                  <Image src={cityVisual(picks[0].city)!.src} alt="" fill sizes="(max-width: 768px) 100vw, 680px"
                    className="object-cover" style={{ objectPosition: cityVisual(picks[0].city)!.objectPosition }} />
                )}
                <span className="absolute inset-x-0 bottom-0 h-[64px]" style={{ background: "linear-gradient(180deg,transparent,rgba(10,10,8,.6))" }} />
              </span>
              <span className="block mt-2 text-[16px] font-semibold text-[var(--qh-ink)]">{picks[0].title}</span>
              <span className="block mt-0.5 text-[12.5px] text-[var(--qh-faint)]">
                {t("typeTrip")} · {tForm(`city_${picks[0].city.charAt(0).toUpperCase()}${picks[0].city.slice(1)}`)}
                {picks[0].days ? ` · ${picks[0].days}d` : picks[0].category ? ` · ${picks[0].category}` : ""}
              </span>
            </Link>
          )}
          <ul>
            {picks.slice(1).map(p => (
              <li key={p.id}>
                <Link href={`/city/${p.city}/trips`} className="flex items-center gap-3.5 py-3 border-b border-[var(--qh-line)] gkm-focus min-h-11">
                  <span className="relative w-[82px] h-[56px] rounded-[4px] overflow-hidden flex-none bg-[#4f4234]">
                    {cityVisual(p.city) && (
                      <Image src={cityVisual(p.city)!.src} alt="" fill sizes="82px" className="object-cover"
                        style={{ objectPosition: cityVisual(p.city)!.objectPosition }} />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--qh-ink)] truncate">{p.title}</span>
                    <span className="block text-[12px] text-[var(--qh-faint)] truncate">
                      {t("typeTrip")} · {tForm(`city_${p.city.charAt(0).toUpperCase()}${p.city.slice(1)}`)}
                      {p.days ? ` · ${p.days}d` : p.category ? ` · ${p.category}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

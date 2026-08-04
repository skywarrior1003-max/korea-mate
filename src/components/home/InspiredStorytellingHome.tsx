// Page 1 기본 — 승인된 브랜드 에디토리얼.
//
// 시안(home_ai_inspired_storytelling)을 그대로 구현한다. 사진 위에 실제 HTML
// 텍스트와 버튼을 얹는 구조이며, screen.png 를 통이미지로 붙이지 않는다.
//
// Hero 이미지에는 표지 제목이 구워져 있다 —
//   BUSAN: GOLDEN HOUR / DAY 3 IN BUSAN / ISSUE 04: THE COASTAL ROUTE
// 이건 에디토리얼 표지 아트지 UI 문구가 아니다. 그래서 번역하지 않고, HTML 로
// 다시 쓰지도 않는다(중복 렌더 금지). 대신 sr-only 로 언어별 설명을 준다.
//
// 사진 속 인물은 생성 이미지이며 실존 인물이 아니다. 이름·후기·여행 기록을
// 붙이지 않는다. 표지의 "DAY 3" 도 사용자 일정이 아니다.
//
// 원본 폭이 768px 이라 그 이상 늘리면 흐려진다. HERO_MAX_WIDTH 로 묶는다.

"use client";

import { useTranslations } from "next-intl";
import {
  DESIGN_PRIMARY, DESIGN_INK, DESIGN_SURFACE, DESIGN_OUTLINE, HERO_MAX_WIDTH,
} from "./home-visual";

export default function InspiredStorytellingHome({ onPlanTrip }: { onPlanTrip: () => void }) {
  const t = useTranslations("home");

  return (
    <div style={{ backgroundColor: DESIGN_SURFACE }}>
      <div className="mx-auto" style={{ maxWidth: HERO_MAX_WIDTH }}>

        {/* ── Hero — 표지 이미지 + 실제 HTML 오버레이 ───────────────────── */}
        <section className="relative w-full overflow-hidden" style={{ aspectRatio: "768 / 1376" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/home/story-hero.jpg"
            alt={t("heroAlt")}
            width={768}
            height={1376}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "center top" }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          {/* 이미지에 구워진 표지 문구를 스크린리더에 한 번만 설명한다.
              화면에는 다시 그리지 않는다 */}
          <p className="sr-only">{t("heroCoverNote")}: {t("storyTitle")}</p>

          {/* 아래쪽만 어둡게 — 오버레이 글자가 읽히도록 */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(10,12,20,0.82) 0%, rgba(10,12,20,0.34) 42%, rgba(10,12,20,0) 62%)" }}
          />

          {/* 하단 내비가 겹치지 않게 safe-area 만큼 더 띄운다 */}
          <div
            className="absolute inset-x-0 bottom-0 px-6"
            style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-[0.14em] text-white"
                style={{ backgroundColor: "rgba(0,65,200,0.55)", border: "1px solid rgba(182,196,255,0.55)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l2.2 5.9L20 10l-5.8 2.1L12 18l-2.2-5.9L4 10l5.8-2.1z" />
                </svg>
                {t("storyBadge")}
              </span>
              <span className="text-[11px] font-bold tracking-[0.18em] text-white/70">
                {t("storyEyebrow")}
              </span>
            </div>

            <h1
              className="text-white font-black mb-4"
              style={{ fontSize: "clamp(2rem, 8.6vw, 2.75rem)", lineHeight: 1.14, letterSpacing: "-0.01em" }}
            >
              {t("storyTitle")}
            </h1>

            <p className="text-[17px] text-white font-semibold mb-2">{t("storyLead")}</p>
            <p className="text-[13.5px] leading-[1.65] text-white/75 mb-7" style={{ whiteSpace: "pre-line" }}>
              {t("storyQuote")}
            </p>

            <button
              type="button"
              onClick={onPlanTrip}
              className="gkm-focus inline-flex items-center gap-2 min-h-14 h-14 px-8 rounded-full text-white text-[16px] font-black transition-transform active:scale-95"
              style={{
                background: `linear-gradient(100deg, ${DESIGN_PRIMARY} 0%, #2f6bff 100%)`,
                boxShadow: "0 10px 26px rgba(0,65,200,0.42)",
              }}
            >
              {t("storyCta")}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h13M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </section>

        {/* ── 여행의 조각들 ─────────────────────────────────────────────── */}
        <section className="px-6 pt-10 pb-12">
          <h2 className="text-[13px] font-black tracking-[0.18em] uppercase mb-6" style={{ color: DESIGN_OUTLINE }}>
            {t("storySectionTitle")}
          </h2>

          <div className="flex flex-col gap-8">
            {[
              { src: "/images/home/story-card-market.jpg",  alt: t("cardMarketAlt"),  w: 1408, h: 768 },
              { src: "/images/home/story-card-village.jpg", alt: t("cardVillageAlt"), w: 768,  h: 1376 },
            ].map(img => (
              <figure key={img.src} className="m-0">
                {/* 시안의 카드 비율은 4:5 다. 가로 원본(시장 컷)도 같은 틀에 넣어
                    시안과 같은 리듬을 유지한다 — object-cover 로 중앙을 쓴다 */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: "4 / 5", borderRadius: 20, boxShadow: "0 14px 34px rgba(19,27,46,0.13)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.alt}
                    width={img.w}
                    height={img.h}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </figure>
            ))}
          </div>
        </section>

        {/* ── 하단 CTA ──────────────────────────────────────────────────── */}
        <section className="px-6 pb-12">
          <button
            type="button"
            onClick={onPlanTrip}
            className="gkm-focus w-full inline-flex items-center justify-center gap-2 min-h-14 h-14 px-8 rounded-full text-white text-[16px] font-black transition-transform active:scale-95"
            style={{
              background: `linear-gradient(100deg, ${DESIGN_PRIMARY} 0%, #2f6bff 100%)`,
              boxShadow: "0 10px 26px rgba(0,65,200,0.28)",
            }}
          >
            {t("planTrip")}
          </button>
          <p className="mt-4 text-center text-[11px]" style={{ color: DESIGN_OUTLINE }}>
            <span style={{ color: DESIGN_INK }}>{t("heroCoverNote")}</span>
          </p>
        </section>
      </div>
    </div>
  );
}

"use client";

// Immersive Cover — 최종 screen.png 의 첫 화면.
//
// 사진이 화면 전체를 차지하고, 아래에서 검게 깔리는 gradient 위에 날짜·도시,
// 제목, 소개문이 얹힌다. 맨 아래 가운데에 "Scroll to explore" 와 아래 화살표가
// 흔들린다. Copy·Save·일정 목록·지도는 여기 두지 않는다 — 첫 감정은
// "이 사람의 여행을 더 보고 싶다" 하나여야 한다.
//
// 반응형 제목 (STORY-HERO-TONE-SELECTION V2 §10·§11)
//   예전에는 고정 48px 표시 토큰을 전 폭에 그대로 써서, 모바일에서 긴 제목이
//   사진 절반을 덮었다. 이제 모바일/데스크톱을 별도 단계로 나누고 텍스트 그룹의
//   **실측 높이**가 예산(화면 40%)에 들어올 때까지만 단계 축소한다 — Focus
//   뷰어(SWIPE-RESPONSIVE V1)와 같은 원칙. 제목·소개문은 자르지 않는다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoryCoverData } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, BASE, FONT_SERIF,
  TITLE_MD, LABEL_CAPS, LABEL_CAPS_WIDE,
} from "./story-tokens";

const TITLE_STEPS_MOBILE  = [40, 36, 32, 28, 26] as const; // §10: 34~46 시작 범위
const TITLE_STEPS_DESKTOP = [64, 56, 48, 40] as const;     // §11: 52~72 시작 범위
/** eyebrow+제목+소개문 그룹이 쓸 수 있는 화면 높이 — 사진 절반 점유 금지(§10) */
const GROUP_BUDGET = 0.40;

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

interface Props {
  data: StoryCoverData;
  /** 아래로 넘어갈 자리. Journal 섹션의 id 를 준다. */
  scrollHint?: string;
  /** 스크롤 힌트 문구 — 호출부가 UI locale 로 넘긴다(영문 하드코딩 금지 §E). */
  scrollHintLabel?: string;
}

export default function StoryCover({ data, scrollHint, scrollHintLabel }: Props) {
  const isDesktop = useIsDesktop();
  const steps = isDesktop ? TITLE_STEPS_DESKTOP : TITLE_STEPS_MOBILE;
  const [step, setStep] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { setStep(0); }, [data.title, data.intro, isDesktop]);
  useLayoutEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    if (el.scrollHeight > window.innerHeight * GROUP_BUDGET && step < steps.length - 1) {
      setStep(s => s + 1);
    }
  }, [step, isDesktop, steps.length, data.title, data.intro]);
  const titlePx = steps[step]!;

  return (
    <section
      className="relative h-screen w-full flex flex-col justify-end overflow-hidden"
      style={{ padding: MARGIN_MOBILE }}
    >
      {/* 사진. 배경으로 깔아 글자가 위에 오게 한다. */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center w-full h-full"
        style={{ backgroundImage: `url('${data.imageUrl}')` }}
        role="img"
        aria-label={data.title}
      />
      {/* 아래로 갈수록 검어진다 — 글자가 사진 위에서 읽히게 하는 유일한 장치다.
          Tailwind 유틸 대신 값을 직접 적는다. 이 저장소의 Tailwind 는 gradient 를
          oklab 으로 섞어서, 같은 정지색을 줘도 시안(sRGB)과 중간 톤이 달라진다.
          390px reference 실측값 그대로다. */}
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundImage: "linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0))" }}
      />

      <div
        ref={groupRef}
        className="relative z-10 text-white"
        /* 스크롤 힌트(absolute bottom)와 겹치지 않게 + iPhone/Android 하단 안전영역 */
        style={{ paddingBottom: `calc(${STACK_LG}px + 40px + env(safe-area-inset-bottom, 0px))` }}
      >
        <p
          className="uppercase text-white/80"
          style={{ ...LABEL_CAPS_WIDE, marginBottom: BASE }}
        >
          {data.eyebrow}
        </p>
        <h1
          className="text-white drop-shadow-lg"
          style={{
            fontFamily: FONT_SERIF, fontWeight: 700, letterSpacing: "-0.02em",
            fontSize: `${titlePx}px`, lineHeight: 1.18,
            maxWidth: isDesktop ? "46rem" : undefined,
            overflowWrap: "break-word",
            marginBottom: STACK_MD,
          }}
        >
          {data.title}
        </h1>
        {/* 여행 전체 소개문 — 제목보다 명확히 작게, 원문 전체(절단 0) */}
        {data.intro && (
          <p
            className="text-white/90"
            style={{
              fontSize: isDesktop ? "20px" : "18px",
              lineHeight: 1.5,
              maxWidth: isDesktop ? "40rem" : undefined,
              overflowWrap: "break-word",
              marginBottom: data.authorName ? STACK_MD : 0,
            }}
          >
            {data.intro}
          </p>
        )}
        {data.authorName && (
          <div className="flex items-center gap-3">
            {data.authorAvatarUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                alt=""
                src={data.authorAvatarUrl}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/50"
              />
            )}
            <span style={TITLE_MD}>{data.authorName}</span>
          </div>
        )}
      </div>

      {scrollHint && (
        <a
          href={`#${scrollHint}`}
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center opacity-70 gkm-focus"
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
        >
          {/* prefers-reduced-motion 에서는 흔들지 않는다 */}
          <span className="motion-safe:animate-bounce flex flex-col items-center">
            <span className="text-white mb-1" style={LABEL_CAPS}>{scrollHintLabel ?? "Scroll to explore"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className="text-white">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </a>
      )}
    </section>
  );
}

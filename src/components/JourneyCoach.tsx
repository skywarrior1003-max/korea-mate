"use client";

// First Trip Journey Guide — coach mark 한 장.
// (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1 → NEW-VISITOR-GUIDED-TUTORIAL V1)
//
// 기존 원칙 유지: 오버레이 없음 · 대상을 가리지 않음 · 실제 버튼은 그대로 클릭
// 가능 · 한 순간에 하나만(전역 잠금) · 트리거는 "그 화면에 도착했다"뿐.
// TUTORIAL-V1 에서 더한 것:
//  · 가벼운 등장 모션(scale+fade ≈190ms, reduced-motion 은 fade 만)
//  · 실제 누를 곳을 가리키는 작은 화살표(bounce 2회 후 정지 — 무한 반복 없음)
//  · Chapter 진행 칩(A·2/4) + 건너뛰기(그 Chapter 전체)
//  · 대상 CTA 를 실제로 누르면 그 단계가 완료된다(completeOnClickSelector)
//  · Escape 로 닫기 · §8 내부 계측 이벤트

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  readGuideState, writeGuideState, shouldShowStep, markStepSeen, skipChapter,
  chapterOf, chapterCompleted, stepProgress, emitGuideEvent,
  type GuideStep, type GuideContext,
} from "@/lib/journey-guide/guide-core";

const ORANGE = "#FF4A2D";

// 전역 잠금 — 페이지 안에서 동시에 하나만.
let activeStep: GuideStep | null = null;
const release = (step: GuideStep) => { if (activeStep === step) activeStep = null; };

interface Props {
  step: GuideStep;
  className?: string;
  /** 카드가 가리키는 실제 CTA 의 방향 — 기본은 아래(카드 아래에 목표 버튼) */
  arrow?: "down" | "up" | "none";
  /** 이 selector 의 실제 CTA 를 누르면 단계 완료(§4). 못 찾으면 조용히 무시. */
  completeOnClickSelector?: string;
  /** §3 Chapter 노출 조건(hasTrip/hasMoment) — 전달된 필드만 판정 */
  ctx?: GuideContext;
}

export default function JourneyCoach({ step, className = "", arrow = "down", completeOnClickSelector, ctx }: Props) {
  const t = useTranslations("guide");
  const [visible, setVisible] = useState(false);
  const claimed = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    // ctx(hasTrip/hasMoment)는 화면 데이터가 비동기로 로드되며 바뀐다 —
    // 아직 안 뜬 카드는 재평가하고, 이미 뜬 카드는 흔들지 않는다.
    if (claimed.current) return;
    const state = readGuideState();
    if (!shouldShowStep(state, step, ctx)) return;
    if (activeStep !== null) return;          // 한 순간에 하나만
    activeStep = step;
    claimed.current = true;
    setVisible(true);
    // §8 — 여정 최초의 카드 한 번만 started
    if (!state.started) {
      writeGuideState({ ...state, started: true });
      emitGuideEvent("tutorial_started", { step, chapter: chapterOf(step) ?? undefined });
    }
  }, [step, ctx?.hasTrip, ctx?.hasMoment]);
  useEffect(() => () => { if (claimed.current) release(step); }, [step]);

  // 화면 밖이면 최초 1회만 부드럽게 보이는 곳으로(§4) — 스크롤 하이재킹 금지.
  useEffect(() => {
    if (!visible || scrolled.current || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      scrolled.current = true;
      boxRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visible]);

  const finish = (mode: "next" | "skip" | "cta") => {
    setVisible(false);
    const before = readGuideState();
    const after = mode === "skip" ? skipChapter(before, step) : markStepSeen(before, step);
    writeGuideState(after);
    release(step);
    const chapter = chapterOf(step);
    if (mode === "skip") emitGuideEvent("tutorial_skipped", { step, chapter: chapter ?? undefined });
    if (chapter && !chapterCompleted(before, chapter) && chapterCompleted(after, chapter)) {
      emitGuideEvent("chapter_completed", { chapter });
      if (chapter === "C") emitGuideEvent("tutorial_finished", {});
    }
  };

  // §4 — 실제 목표 CTA 클릭 = 단계 완료. capture 로 들어 CTA 동작은 그대로 둔다.
  useEffect(() => {
    if (!visible || !completeOnClickSelector) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      try { if (el?.closest?.(completeOnClickSelector)) finish("cta"); } catch { /* 잘못된 selector 는 무시 */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, completeOnClickSelector]);

  // Escape = 이 카드 넘김(§4 접근성)
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish("next"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;
  const prog = stepProgress(step);
  return (
    <div ref={boxRef} className={`gkm-coach-pop relative ${className}`} role="status" aria-live="polite">
      <style>{`
        @keyframes gkmCoachIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes gkmCoachArrow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
        .gkm-coach-pop { animation: gkmCoachIn 190ms cubic-bezier(.2,.9,.3,1.2) both; }
        .gkm-coach-arrow { animation: gkmCoachArrow 460ms ease-in-out 2; }
        .gkm-coach-arrow-up { animation: gkmCoachArrow 460ms ease-in-out 2 reverse; }
        @media (prefers-reduced-motion: reduce) {
          .gkm-coach-pop { animation: none; opacity: 1; transform: none; transition: opacity 190ms ease; }
          .gkm-coach-arrow, .gkm-coach-arrow-up { animation: none; }
        }
      `}</style>
      <div
        className="rounded-2xl border px-4 py-3"
        style={{ borderColor: "rgba(255,74,45,.35)", backgroundColor: "#fff4f0", boxShadow: "0 0 0 4px rgba(255,74,45,.06)" }}
      >
        <div className="flex items-center justify-between gap-2">
          {prog && (
            <span className="text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded-md"
                  style={{ backgroundColor: "rgba(255,74,45,.12)", color: ORANGE }}>
              {t(`chapter${prog.chapter}`)} · {prog.index}/{prog.total}
            </span>
          )}
          <button
            type="button"
            onClick={() => finish("skip")}
            className="gkm-focus text-[11px] font-bold min-h-9 px-1"
            style={{ color: "rgba(58,42,36,.55)" }}
          >
            {t("skip")}
          </button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed font-medium" style={{ color: "#3a2a24" }}>{t(step)}</p>
        <button
          type="button"
          onClick={() => finish("next")}
          className="gkm-focus mt-1.5 inline-flex items-center min-h-9 text-xs font-bold"
          style={{ color: ORANGE }}
        >
          {t("gotIt")}
        </button>
      </div>
      {arrow !== "none" && (
        <div
          aria-hidden
          className={`absolute left-6 flex ${arrow === "down" ? "-bottom-4 gkm-coach-arrow" : "-top-4 rotate-180 gkm-coach-arrow-up"}`}
          style={{ color: ORANGE }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v14M6 12l6 6 6-6" />
          </svg>
        </div>
      )}
    </div>
  );
}

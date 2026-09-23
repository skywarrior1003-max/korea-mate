"use client";

// First Trip Journey Guide — coach mark 한 장.
// (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1 → TUTORIAL V1 → V2 실행동 배선)
//
// 기존 원칙 유지: 오버레이 없음 · 대상을 가리지 않음 · 실제 버튼은 그대로 클릭
// 가능 · 한 순간에 하나만(전역 잠금) · 트리거는 "그 화면에 도착했다"뿐.
// V2 계약(REAL-ACTION-WIRING):
//  · 단계 완료는 정확히 한 조건 — 실제 CTA 클릭(click) 또는 화면 도착(arrive).
//  · "알겠어요"/Escape 는 완료가 아니라 닫기(나중에 보기 — 이번 세션만 숨김).
//  · 화살표·강조(pulse ring)는 안내 카드가 아니라 실제 대상 CTA 에 붙는다.
//    대상이 화면 밖이면 한 번만 스크롤, 못 찾으면 장식 없이 카드만.
//  · 건너뛰기 = 현재 Chapter 전체 seen(유지).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  readGuideState, writeGuideState, shouldShowStep, markStepSeen, skipChapter,
  chapterOf, chapterCompleted, stepProgress, emitGuideEvent,
  type GuideStep, type GuideContext,
} from "@/lib/journey-guide/guide-core";

const ORANGE = "#FF4A2D";

// 전역 잠금 — 페이지 안에서 동시에 하나만.
// V3 — 잠금이 풀리면 같은 화면에서 기다리던 다음 카드가 즉시 재평가된다.
// (이전에는 재시도가 없어 "1/3 닫음 → 2/3 안 나타남"이 실측됐고, 안 보인
// 단계가 다음 방문에서 자동 seen 되는 결함으로 이어졌다.)
let activeStep: GuideStep | null = null;
const lockWaiters = new Set<() => void>();
const notifyWaiters = () => {
  const ws = [...lockWaiters]; lockWaiters.clear();
  for (const w of ws) w();
};
const release = (step: GuideStep) => {
  if (activeStep !== step) return;
  activeStep = null;
  notifyWaiters();
};

/** V2 §4 — "나중에 보기"는 이번 세션에만 적용된다(seen 이 아니다). */
const laterKey = (step: GuideStep) => `gkm_tut_later_${step}`;
const laterSeen = (step: GuideStep) => {
  try { return sessionStorage.getItem(laterKey(step)) === "1"; } catch { return false; }
};
const markLater = (step: GuideStep) => {
  try { sessionStorage.setItem(laterKey(step), "1"); } catch { /* 조용히 */ }
};

/**
 * V4 — "ack": 표시만으로는 완료가 아니다. 사용자가 "알겠어요"를 눌러야 완료
 * (finale 전용 — 가림·순간 소실로 못 본 안내가 seen 으로 굳지 않는다).
 * Escape 는 여기서도 닫기(나중에 보기)일 뿐이다.
 */
export type CoachComplete = { on: "click"; selector: string } | { on: "arrive" } | { on: "ack" };

interface Props {
  step: GuideStep;
  className?: string;
  /** V2 §3 — 단계 완료 조건(정확히 하나). 기본 arrive(열람형 단계). */
  complete?: CoachComplete;
  /** 화살표·pulse 를 붙일 실제 대상 — click 형은 기본 complete.selector */
  targetSelector?: string;
  /** §3 Chapter 노출 조건(hasTrip/hasMoment) — 전달된 필드만 판정 */
  ctx?: GuideContext;
}

export default function JourneyCoach({ step, className = "", complete = { on: "arrive" }, targetSelector, ctx }: Props) {
  const t = useTranslations("guide");
  const [visible, setVisible] = useState(false);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  const targetEl = useRef<Element | null>(null);
  const scrolledOnce = useRef(false);

  const finishStep = useCallback((mode: "complete" | "skip") => {
    const before = readGuideState();
    const after = mode === "skip" ? skipChapter(before, step) : markStepSeen(before, step);
    writeGuideState(after);
    const chapter = chapterOf(step);
    if (mode === "skip") emitGuideEvent("tutorial_skipped", { step, chapter: chapter ?? undefined });
    if (chapter && !chapterCompleted(before, chapter) && chapterCompleted(after, chapter)) {
      emitGuideEvent("chapter_completed", { chapter });
      if (chapter === "C") emitGuideEvent("tutorial_finished", {});
    }
  }, [step]);

  const [lockTick, setLockTick] = useState(0);
  useEffect(() => {
    // ctx(hasTrip/hasMoment)는 비동기 로드로 바뀐다 — 안 뜬 카드만 재평가.
    if (claimed.current) return;
    // V4 — 아직 뜨지 않은 카드는 조건 충족 여부와 무관하게 항상 구독한다.
    // 다른 카드의 완료(seen 변화)나 잠금 해제가 이 카드의 조건을 참으로
    // 만들 수 있다 — 조건 불충족 시 구독 없이 나가면(V3 실측 finale) 그
    // 변화를 영영 못 듣는다.
    const w = () => setLockTick(t => t + 1);
    lockWaiters.add(w);
    const unsub = () => { lockWaiters.delete(w); };
    if (activeStep !== null) return unsub;   // 한 순간에 하나만
    const state = readGuideState();
    if (!shouldShowStep(state, step, ctx)) return unsub;
    if (complete.on !== "arrive" && laterSeen(step)) return unsub; // 나중에 보기(세션)
    activeStep = step;
    claimed.current = true;
    setVisible(true);
    if (!state.started) {
      writeGuideState({ ...state, started: true });
      emitGuideEvent("tutorial_started", { step, chapter: chapterOf(step) ?? undefined });
    }
    // V2 §3 — arrive 형은 이 화면에 도착한 것 자체가 행동이다: 표시와 동시에
    // 완료로 기록하고(다음 방문 재노출 0) 카드는 이번 화면에서 계속 보여 준다.
    if (complete.on === "arrive") finishStep("complete");
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ctx?.hasTrip, ctx?.hasMoment, lockTick]);
  useEffect(() => () => { if (claimed.current) release(step); }, [step]);

  // ── V2 §2 — 실제 대상 CTA 에 화살표·pulse. 못 찾으면 장식 없이 카드만. ──
  const sel = targetSelector ?? (complete.on === "click" ? complete.selector : undefined);
  useEffect(() => {
    if (!visible || !sel) return;
    let raf = 0;
    const find = () => {
      // 같은 selector 가 여럿이면 실제로 보이는 첫 요소를 고른다 — 숨김/오프캔버스
      // 링크에 화살표를 붙이지 않는다(V2 실측 결함 수정).
      let el: Element | null = null;
      try {
        for (const cand of document.querySelectorAll(sel)) {
          const r = cand.getBoundingClientRect();
          const style = getComputedStyle(cand as HTMLElement);
          if (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none") { el = cand; break; }
        }
      } catch { el = null; }
      if (!el) { targetEl.current?.classList.remove("gkm-tut-ring"); targetEl.current = null; setTarget(null); return; }
      if (targetEl.current !== el) {
        targetEl.current?.classList.remove("gkm-tut-ring");
        el.classList.add("gkm-tut-ring");
        targetEl.current = el;
        // 화면 밖이면 한 번만 부드럽게(§2) — 스크롤 하이재킹 금지.
        const r0 = el.getBoundingClientRect();
        if (!scrolledOnce.current && (r0.top < 0 || r0.bottom > window.innerHeight)) {
          scrolledOnce.current = true;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      const r = el.getBoundingClientRect();
      setTarget({ x: r.left + Math.min(28, r.width / 2), y: r.top });
    };
    find();
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(find); };
    window.addEventListener("scroll", onMove, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    const iv = window.setInterval(find, 800); // 늦게 마운트되는 대상도 잡는다
    return () => {
      window.removeEventListener("scroll", onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onMove);
      window.clearInterval(iv);
      cancelAnimationFrame(raf);
      targetEl.current?.classList.remove("gkm-tut-ring");
      targetEl.current = null;
    };
  }, [visible, sel]);

  // V2 §1·§3 — click 형: 실제 CTA 를 눌러야 완료(capture — CTA 동작은 그대로).
  // V3 — 카드를 "알겠어요"로 닫아 둔 상태(later)여도, 이 화면에 있는 동안
  // 실제 CTA 를 누르면 그 행동이 곧 완료다(닫았다고 행동이 무효가 되지 않는다).
  const doneRef = useRef(false);
  useEffect(() => {
    if (complete.on !== "click") return;
    if (readGuideState().seen[step]) return;
    const onClick = (e: MouseEvent) => {
      if (doneRef.current) return;
      const el = e.target as Element | null;
      try {
        if (el?.closest?.(complete.selector)) {
          doneRef.current = true;
          setVisible(false); release(step); finishStep("complete");
          // V4 — 카드가 이미 닫혀 잠금이 없던 경우에도, 완료로 조건이 참이 된
          // 다음 카드(finale)가 즉시 재평가되게 한다.
          if (activeStep === null) notifyWaiters();
        }
      } catch { /* 잘못된 selector 는 무시 */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [complete, step, finishStep]);

  // §4·V4 — 닫기(Escape): 어떤 유형이든 완료가 아니다. arrive 밖 유형은 세션
  // 동안만 숨긴다(다음 방문에 다시 뜬다).
  const closeOnly = useCallback(() => {
    setVisible(false);
    release(step);
    if (complete.on !== "arrive") markLater(step);
  }, [step, complete]);
  // V4 — "알겠어요": ack 형은 이것이 명시적 완료다. 나머지는 닫기와 같다.
  const acknowledge = useCallback(() => {
    if (complete.on === "ack") {
      setVisible(false); release(step); finishStep("complete");
      if (activeStep === null) notifyWaiters();
      return;
    }
    closeOnly();
  }, [complete, step, finishStep, closeOnly]);
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeOnly(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, closeOnly]);

  const skip = () => { setVisible(false); release(step); finishStep("skip"); };

  if (!visible) return null;
  const prog = stepProgress(step);
  return (
    <div className={`gkm-coach-pop relative ${className}`} role="status" aria-live="polite">
      <style>{`
        @keyframes gkmCoachIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes gkmCoachArrow { 0%,100% { transform: translate(-50%,0); } 50% { transform: translate(-50%,5px); } }
        @keyframes gkmTutRing { 0% { box-shadow: 0 0 0 0 rgba(255,74,45,.45); } 70% { box-shadow: 0 0 0 9px rgba(255,74,45,0); } 100% { box-shadow: 0 0 0 0 rgba(255,74,45,0); } }
        .gkm-coach-pop { animation: gkmCoachIn 190ms cubic-bezier(.2,.9,.3,1.2) both; }
        .gkm-tut-ring { animation: gkmTutRing 900ms ease-out 2; border-radius: 12px; }
        .gkm-tut-arrow { animation: gkmCoachArrow 460ms ease-in-out 2; }
        @media (prefers-reduced-motion: reduce) {
          .gkm-coach-pop { animation: none; opacity: 1; transform: none; transition: opacity 190ms ease; }
          .gkm-tut-ring, .gkm-tut-arrow { animation: none; }
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
            onClick={skip}
            className="gkm-focus text-[11px] font-bold min-h-9 px-1"
            style={{ color: "rgba(58,42,36,.55)" }}
          >
            {t("skip")}
          </button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed font-medium" style={{ color: "#3a2a24" }}>{t(step)}</p>
        <button
          type="button"
          onClick={acknowledge}
          className="gkm-focus mt-1.5 inline-flex items-center min-h-9 text-xs font-bold"
          style={{ color: ORANGE }}
        >
          {t("gotIt")}
        </button>
      </div>
      {/* V2 §2 — 화살표는 실제 대상 위에(fixed, 클릭 통과). 대상 미발견 시 없음.
          body 포털이어야 한다 — 카드의 scale 애니메이션(transform)이 fixed 의
          기준을 카드로 바꿔 좌표가 어긋난다(실측 결함). */}
      {target && createPortal(
        <div
          aria-hidden
          className="gkm-tut-arrow fixed z-[60] pointer-events-none"
          style={{ left: target.x, top: Math.max(4, target.y - 22), transform: "translate(-50%,0)", color: ORANGE }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v14M6 12l6 6 6-6" />
          </svg>
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

// First Trip Journey Guide — coach mark 한 장.
// (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1)
//
// 기존 Coachmark(This Trip 2단계 전용)의 문법을 따르는 카드형이다 — 오버레이 없음,
// 대상을 가리지 않음, 눌러서 지나감. 색만 가이드 계약대로 따뜻한 orange 다.
// 한 순간에 하나만: 모듈 전역 잠금이 같은 화면의 다른 coach 를 막는다.
// 트리거는 "그 화면에 실제로 도착했다" 뿐 — 의도 추측 없음.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  readGuideState, writeGuideState, shouldShowStep, markStepSeen, type GuideStep,
} from "@/lib/journey-guide/guide-core";

const ORANGE = "#FF4A2D";

// 전역 잠금 — 페이지 안에서 동시에 하나만.
let activeStep: GuideStep | null = null;
const release = (step: GuideStep) => { if (activeStep === step) activeStep = null; };

export default function JourneyCoach({ step, className = "" }: { step: GuideStep; className?: string }) {
  const t = useTranslations("guide");
  const [visible, setVisible] = useState(false);
  const claimed = useRef(false);

  useEffect(() => {
    const state = readGuideState();
    if (!shouldShowStep(state, step)) return;
    if (activeStep !== null) return;          // 한 순간에 하나만
    activeStep = step;
    claimed.current = true;
    setVisible(true);
    return () => { if (claimed.current) release(step); };
  }, [step]);

  const dismiss = () => {
    setVisible(false);
    writeGuideState(markStepSeen(readGuideState(), step));
    release(step);
  };

  if (!visible) return null;
  return (
    <div
      role="status"
      className={`rounded-2xl border px-4 py-3 ${className}`}
      style={{ borderColor: "rgba(255,74,45,.35)", backgroundColor: "#fff4f0" }}
    >
      <p className="text-[13px] leading-relaxed font-medium" style={{ color: "#3a2a24" }}>{t(step)}</p>
      <button
        type="button"
        onClick={dismiss}
        className="gkm-focus mt-1.5 inline-flex items-center min-h-9 text-xs font-bold"
        style={{ color: ORANGE }}
      >
        {t("gotIt")}
      </button>
    </div>
  );
}

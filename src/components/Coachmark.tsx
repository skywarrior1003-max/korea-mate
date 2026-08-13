"use client";

// 실제 화면의 실제 버튼 옆에 붙는 짧은 안내 한 장.
//
// 별도 튜토리얼 페이지도, 화면을 덮는 오버레이도 만들지 않는다. 가리키는
// 대상을 실제로 누를 수 있어야 한다 — 안내가 기능을 막으면 그건 안내가 아니다.
//
// 그래서 이 컴포넌트는 대상 옆에 놓이는 카드일 뿐이고, 대상 위에 아무것도
// 얹지 않는다. pulse 는 대상 쪽 className 으로 따로 건다.

import { useTranslations } from "next-intl";

export interface CoachmarkProps {
  title:      string;
  body:       string;
  onDismiss:  () => void;
  /** 대상보다 아래에 붙일지 위에 붙일지. 기본은 아래다. */
  placement?: "above" | "below";
}

export default function Coachmark({ title, body, onDismiss, placement = "below" }: CoachmarkProps) {
  const t = useTranslations("picks");
  return (
    <div
      role="status"
      className={`${placement === "above" ? "mb-2" : "mt-2"} rounded-2xl border border-action/30 bg-action/5 px-4 py-3`}
    >
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs text-sub leading-relaxed">{body}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="gkm-focus mt-2 inline-flex items-center min-h-11 text-xs font-bold text-action hover:text-action-hover"
      >
        {t("coachGotIt")}
      </button>
    </div>
  );
}

/**
 * 강조는 짧게 세 번이고 멈춘다. 계속 깜빡이면 안내가 아니라 소음이다.
 * 움직임을 줄여 달라고 한 사람에게는 테두리만 남긴다.
 */
export const COACH_PULSE =
  "gkm-coach-pulse ring-2 ring-action/60 motion-reduce:animate-none";

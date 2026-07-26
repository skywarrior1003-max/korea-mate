// Day 완주 축하 + Add a memory 진입 (TASK-DAY-COMPLETE-MEMORY-CTA)
//
// - 미완료 → 완료 전환 시점에만 부모가 마운트한다 (반복 노출 방지는 부모 책임)
// - 기존 Capture 흐름을 재사용하며, 완료한 day_number 를 기본 선택으로 넘긴다
// - 닫으면 즉시 사라져 일정 사용을 방해하지 않는다
// - Fable coral/ink/neutral 토큰 유지, 모바일 우선(BottomNav 위 고정)

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

interface Props {
  dayNumber: number;
  onAddMemory: () => void;
  onClose: () => void;
}

export default function DayCompleteToast({ dayNumber, onAddMemory, onClose }: Props) {
  const t = useTranslations("dayDone");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 md:left-auto md:right-6 md:w-[380px] z-[55] rounded-card border border-line bg-surface shadow-modal p-4 flex flex-col gap-3"
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">🎉</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink text-[15px]">{t("title", { n: dayNumber })}</p>
          <p className="text-sm text-sub mt-0.5 leading-relaxed">{t("hint")}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={t("dismiss")}
          className="gkm-focus shrink-0 text-faint hover:text-ink px-1.5 py-1 -mt-1 -mr-1"
        >✕</button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="gkm-focus flex-1 min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold"
        >{t("dismiss")}</button>
        <button
          onClick={onAddMemory}
          className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta"
        >📸 {t("cta")}</button>
      </div>
    </div>
  );
}

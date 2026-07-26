// Day 완주 축하 + Add a memory 진입 (TASK-DAY-COMPLETE-MEMORY-CTA)
//
// - 미완료 → 완료 전환 시점에만 부모가 마운트한다 (반복 노출 방지는 부모 책임)
// - 기존 Capture 흐름을 재사용하며, 완료한 day_number 를 기본 선택으로 넘긴다
// - 닫으면 즉시 사라져 일정 사용을 방해하지 않는다
// - Fable coral/ink/neutral 토큰 유지, 모바일 우선(BottomNav 위 고정)

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Props {
  dayNumber: number;
  onAddMemory: () => void;
  onClose: () => void;
  /** 복사본 소유자이며 아직 미전송일 때만 전달 — 없으면 Helpful CTA 미노출 */
  onSendHelpful?: () => Promise<void>;
}

export default function DayCompleteToast({ dayNumber, onAddMemory, onClose, onSendHelpful }: Props) {
  const t = useTranslations("dayDone");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [failed,  setFailed]  = useState(false);

  async function handleSend() {
    if (!onSendHelpful || sending || sent) return;   // 중복 전송 차단
    setSending(true);
    setFailed(false);
    try {
      await onSendHelpful();
      setSent(true);                                  // 서버 성공 후에만 완료 표시
    } catch {
      setFailed(true);                                // Day 완료·Memory 상태에는 영향 없음
    } finally {
      setSending(false);
    }
  }

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
      {/* Helpful — secondary. 복사본 소유자이며 미전송일 때만 노출 */}
      {onSendHelpful && (
        <>
          <button
            onClick={() => void handleSend()}
            disabled={sending || sent}
            className={`gkm-focus w-full min-h-11 rounded-control border text-sm font-semibold transition-colors ${
              sent
                ? "border-ok/30 bg-ok-tint text-ok cursor-default"
                : "border-line bg-surface text-ink hover:bg-surface-dim disabled:opacity-60"
            }`}
          >
            {sent ? `✓ ${t("sent")}` : sending ? t("sending") : t("send")}
          </button>
          {failed && (
            <p className="text-xs font-semibold text-error bg-error-tint rounded-control px-3 py-2">
              {t("failed")}
            </p>
          )}
        </>
      )}

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

"use client";

// 싫어요 후 비공개 피드백 sheet (§4)
//
//  · 싫어요 자체는 이미 반영됐다 — 이 sheet 는 선택 사항이고 닫아도 유지된다.
//  · 사유는 enum(서버 검증), 상세는 ≤500자 선택 입력. 렌더되는 곳이 없는
//    관리자 검토 전용 데이터다(042/054/068 place_reports 계약).
//  · 접근성: dialog + focus trap + Escape + safe-area + 로딩 중 중복 제출 차단.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";
import {
  PLACE_FEEDBACK_REASONS, STORY_FEEDBACK_REASONS,
} from "@/lib/community/community-core";

type TargetType = "city_spot" | "story";

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: TargetType;
  targetKey: string;
}

export default function FeedbackSheet({ open, onClose, targetType, targetKey }: Props) {
  const t = useTranslations("community");
  const reasons = targetType === "city_spot" ? PLACE_FEEDBACK_REASONS : STORY_FEEDBACK_REASONS;
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // reset 은 효과가 아니라 닫기 핸들러에서 한다 — 다음에 열릴 때 항상 초기 상태다.
  function handleClose() {
    setReason(null); setNote(""); setDone(false); setError(false);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); handleClose(); }
      if (e.key === "Tab" && panelRef.current) {
        // 단순 focus trap — sheet 안의 포커스 가능한 요소 사이에서만 순환
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    // 첫 포커스는 패널로
    const id = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey, true); window.clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose 는 매 렌더 새 참조지만 open 전환 시에만 재구독하면 충분하다
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (busy || !reason) return;
    setBusy(true); setError(false);
    try {
      const endpoint = targetType === "city_spot" ? "/api/place-report" : "/api/story-report";
      const body = targetType === "city_spot"
        ? { target_type: "city_spot", target_key: targetKey, category: reason,
            note: note.trim() || null }
        : { target_key: targetKey, category: reason,
            note: note.trim() || null, device_id: getDeviceId() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify(body),
      });
      // 409(최근 중복)도 사용자에게는 접수 완료와 같다 — 같은 문제를 두 번
      // 알릴 필요가 없다는 뜻이지 실패가 아니다.
      if (!res.ok && res.status !== 409) { setError(true); return; }
      setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
         role="dialog" aria-modal="true" aria-labelledby="gkm-feedback-title">
      <button type="button" aria-label={t("feedbackClose")} tabIndex={-1}
        className="absolute inset-0 bg-black/30 cursor-default" onClick={handleClose} />
      <div ref={panelRef} tabIndex={-1}
        className="relative w-full sm:max-w-md bg-white text-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 outline-none">
        {done ? (
          <>
            <p id="gkm-feedback-title" className="text-[15px] font-bold">{t("feedbackThanks")}</p>
            <p className="mt-1 text-[13px] text-gray-500">{t("feedbackThanksBody")}</p>
            <button type="button" onClick={handleClose}
              className="gkm-focus mt-4 w-full min-h-11 rounded-xl bg-gray-900 text-white text-sm font-bold">
              {t("feedbackDone")}
            </button>
          </>
        ) : (
          <>
            <p id="gkm-feedback-title" className="text-[15px] font-bold">{t("feedbackTitle")}</p>
            <p className="mt-1 text-[12.5px] text-gray-500">{t("feedbackSubtitle")}</p>
            <div className="mt-3 flex flex-col gap-1.5" role="radiogroup" aria-label={t("feedbackTitle")}>
              {reasons.map(r => {
                const on = reason === r;
                return (
                  <button key={r} type="button" role="radio" aria-checked={on}
                    onClick={() => setReason(on ? null : r)}
                    className={`gkm-focus min-h-11 rounded-xl border px-3.5 text-left text-[13.5px] font-medium ${
                      on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700"}`}>
                    {t(`reason_${r}`)}
                  </button>
                );
              })}
            </div>
            {reason && (
              <textarea
                value={note} onChange={e => setNote(e.target.value.slice(0, 500))}
                rows={3} maxLength={500}
                placeholder={t("feedbackNotePlaceholder")}
                aria-label={t("feedbackNotePlaceholder")}
                className="gkm-focus mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13.5px] resize-none"
              />
            )}
            {error && <p className="mt-2 text-[12.5px] text-red-600" role="alert">{t("feedbackError")}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleClose}
                className="gkm-focus flex-1 min-h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                {t("feedbackClose")}
              </button>
              <button type="button" onClick={submit} disabled={busy || !reason}
                className="gkm-focus flex-1 min-h-11 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">
                {busy ? t("feedbackSending") : t("feedbackSend")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

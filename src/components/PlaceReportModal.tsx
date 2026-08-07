"use client";

// 장소 제보 모달 — 공개 장소 전체가 함께 쓴다.
//
// 식당 전용이 아니다. restaurant·attraction·nature 어디서든 같은 것을 쓴다.
// 화면마다 복붙하지 않기 위해 여기 하나만 둔다.
//
// 무엇을 하지 않나
//   · 신고했다고 그 장소를 숨기지 않는다.
//   · 다른 사람의 신고 수를 보여주지 않는다.
//   · 사진을 받지 않는다(V1 범위 밖).
//   · 회원가입을 요구하지 않는다.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";
import {
  OBJECTIVE_CATEGORIES, EXPERIENCE_CATEGORIES, NOTE_MAX_CHARS,
  type ReportCategory, type ReportTargetType,
} from "@/lib/reports/place-report-core";

interface Props {
  onClose:     () => void;
  targetType:  ReportTargetType;
  targetKey:   string;
  placeName:   string;
}

type Phase = "form" | "sending" | "done" | "error";

// 부모가 열릴 때만 마운트한다. 그래서 상태를 effect 로 되돌릴 필요가 없다 —
// 닫으면 언마운트되고 다시 열면 새 상태로 시작한다.
export default function PlaceReportModal({ onClose, targetType, targetKey, placeName }: Props) {
  const t = useTranslations("report");
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note,     setNote]     = useState("");
  const [phase,    setPhase]    = useState<Phase>("form");
  const [errCode,  setErrCode]  = useState<string>("");
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const id = setTimeout(() => firstRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function submit() {
    if (!category || phase === "sending") return;   // 연타 방지
    setPhase("sending");
    try {
      const res = await fetch("/api/place-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({
          target_type: targetType, target_key: targetKey,
          category, note: note.trim() || undefined,
        }),
      });
      if (res.ok) { setPhase("done"); return; }
      const body = await res.json().catch(() => ({})) as { error?: string };
      setErrCode(body.error ?? "server_error");
      setPhase("error");
    } catch {
      setErrCode("server_error");
      setPhase("error");
    }
  }

  const groups: { label: string; items: readonly ReportCategory[] }[] = [
    { label: t("groupInfo"),       items: OBJECTIVE_CATEGORIES },
    { label: t("groupExperience"), items: EXPERIENCE_CATEGORIES },
    { label: t("groupOther"),      items: ["other"] },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label={t("title")}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-line">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black text-ink">{t("title")}</h2>
              <p className="text-xs text-sub mt-0.5 truncate">{placeName}</p>
            </div>
            <button
              ref={firstRef} onClick={onClose} aria-label={t("close")}
              className="gkm-focus shrink-0 w-9 h-9 rounded-full text-sub hover:text-ink inline-flex items-center justify-center"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {phase === "done" ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-bold text-ink">{t("thanksTitle")}</p>
            <p className="text-xs text-sub mt-1.5 leading-relaxed">{t("thanksBody")}</p>
            <button onClick={onClose}
              className="gkm-focus mt-6 w-full min-h-11 rounded-control bg-ink text-white text-sm font-bold">
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs text-sub mb-3">{t("prompt")}</p>

            {groups.map(g => (
              <div key={g.label} className="mb-4">
                <p className="text-[11px] font-bold text-sub uppercase tracking-wide mb-1.5">{g.label}</p>
                <div className="flex flex-col gap-1.5">
                  {g.items.map(c => (
                    <button
                      key={c} type="button" onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={`gkm-focus text-left min-h-11 px-3 rounded-control border text-sm transition-colors ${
                        category === c
                          ? "border-ink bg-surface-dim font-semibold text-ink"
                          : "border-line text-sub hover:text-ink"}`}
                    >
                      {t(`category.${c}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <label className="block text-[11px] font-bold text-sub uppercase tracking-wide mb-1.5">
              {t("noteLabel")}
            </label>
            <textarea
              value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX_CHARS))}
              maxLength={NOTE_MAX_CHARS} rows={3} placeholder={t("notePlaceholder")}
              className="gkm-focus w-full rounded-control border border-line p-3 text-sm text-ink resize-none"
            />
            <p className="text-[11px] text-sub mt-1 text-right tabular-nums">
              {note.length} / {NOTE_MAX_CHARS}
            </p>

            {phase === "error" && (
              <p className="text-xs text-[var(--gkm-accent-coral)] mt-2" role="alert">
                {t(`error.${errCode}`, { fallback: t("error.server_error") } as never)}
              </p>
            )}

            <p className="text-[11px] text-sub mt-3 leading-relaxed">{t("privacyNote")}</p>

            <button
              type="button" onClick={submit}
              disabled={!category || phase === "sending"}
              className="gkm-focus mt-3 w-full min-h-12 rounded-control bg-ink text-white text-sm font-bold disabled:opacity-40"
            >
              {phase === "sending" ? t("sending") : t("submit")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

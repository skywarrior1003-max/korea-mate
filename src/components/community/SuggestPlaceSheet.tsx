"use client";

// 추천 장소 제안 sheet (§5-1 V1) — 텍스트만 받는다. 사진·외부 이미지 URL 없음.
// 제안은 공개 렌더 0 — 관리자 검토 후 기존 카탈로그 파이프라인으로만 반영된다.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";

const CATEGORIES = ["restaurant", "cafe", "attraction", "nature", "culture", "shopping", "activity", "other"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  citySlug: string;
  cityLabel: string;
}

export default function SuggestPlaceSheet({ open, onClose, citySlug, cityLabel }: Props) {
  const t = useTranslations("community");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("restaurant");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // reset 은 닫기 핸들러에서 — 입력값(name 등)은 재열람 편의를 위해 남긴다.
  function handleClose() {
    setDone(false); setError(false);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); handleClose(); }
      if (e.key === "Tab" && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (els.length === 0) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const id = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey, true); window.clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 전환 시에만 재구독
  }, [open]);

  if (!open) return null;

  const canSend = name.trim().length > 0 && address.trim().length > 0 && reason.trim().length > 0;

  async function submit() {
    if (busy || !canSend) return;
    setBusy(true); setError(false);
    try {
      const res = await fetch("/api/place-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({
          city: citySlug, name: name.trim(), category,
          address: address.trim(), reason: reason.trim(),
          official_link: link.trim() || null,
        }),
      });
      if (!res.ok) { setError(true); return; }
      setDone(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  const field = "gkm-focus w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13.5px]";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
         role="dialog" aria-modal="true" aria-labelledby="gkm-suggest-title">
      <button type="button" aria-label={t("feedbackClose")} tabIndex={-1}
        className="absolute inset-0 bg-black/30 cursor-default" onClick={handleClose} />
      <div ref={panelRef} tabIndex={-1}
        className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-white text-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 outline-none">
        {done ? (
          <>
            <p id="gkm-suggest-title" className="text-[15px] font-bold">{t("suggestThanks")}</p>
            <p className="mt-1 text-[13px] text-gray-500">{t("suggestThanksBody")}</p>
            <button type="button" onClick={handleClose}
              className="gkm-focus mt-4 w-full min-h-11 rounded-xl bg-gray-900 text-white text-sm font-bold">
              {t("feedbackDone")}
            </button>
          </>
        ) : (
          <>
            <p id="gkm-suggest-title" className="text-[15px] font-bold">{t("suggestTitle", { city: cityLabel })}</p>
            <p className="mt-1 text-[12.5px] text-gray-500">{t("suggestSubtitle")}</p>
            <div className="mt-3 flex flex-col gap-2.5">
              <input value={name} onChange={e => setName(e.target.value.slice(0, 120))}
                placeholder={t("suggestName")} aria-label={t("suggestName")} className={field} />
              <select value={category} onChange={e => setCategory(e.target.value)}
                aria-label={t("suggestCategory")} className={field}>
                {CATEGORIES.map(c => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}
              </select>
              <input value={address} onChange={e => setAddress(e.target.value.slice(0, 300))}
                placeholder={t("suggestAddress")} aria-label={t("suggestAddress")} className={field} />
              <textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 500))}
                rows={3} placeholder={t("suggestReason")} aria-label={t("suggestReason")}
                className={`${field} resize-none`} />
              <input value={link} onChange={e => setLink(e.target.value.slice(0, 300))}
                placeholder={t("suggestLink")} aria-label={t("suggestLink")} className={field} inputMode="url" />
            </div>
            {error && <p className="mt-2 text-[12.5px] text-red-600" role="alert">{t("feedbackError")}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleClose}
                className="gkm-focus flex-1 min-h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
                {t("feedbackClose")}
              </button>
              <button type="button" onClick={submit} disabled={busy || !canSend}
                className="gkm-focus flex-1 min-h-11 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">
                {busy ? t("feedbackSending") : t("suggestSend")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

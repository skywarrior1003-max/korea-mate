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
  /**
   * RANKING-UX-HOTFIX §5 — My Places·본인 Story user_spot 진입점의 prefill.
   * 제출 전 사용자가 이 값들을 화면에서 그대로 보고 명시적으로 확인·수정한다.
   * 개인 메모·사진은 여기로 오지 않는다(sheet 는 텍스트 필드만 받는다).
   */
  initial?: { name?: string; category?: string; address?: string; link?: string };
}

export default function SuggestPlaceSheet({ open, onClose, citySlug, cityLabel, initial }: Props) {
  const t = useTranslations("community");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<string>(
    initial?.category && (CATEGORIES as readonly string[]).includes(initial.category) ? initial.category : "restaurant");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [reason, setReason] = useState("");
  const [link, setLink] = useState(initial?.link ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<false | "generic" | "duplicate">(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // ── 내가 보낸 제보 (UGC-DELETE-PROPAGATION-V1 §D — pending 철회) ──
  // 이력 화면을 새로 만들지 않는다. 제보가 태어나는 이 sheet 가 곧 관리 지점이다.
  type MySuggestion = { id: string; name: string; status: string; created_at: string };
  const [mine, setMine] = useState<MySuggestion[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null); // 철회 확인 대상 id
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  async function loadMine() {
    try {
      const res = await fetch(`/api/place-suggestion?city=${encodeURIComponent(citySlug)}`,
        { headers: { "x-device-id": getDeviceId() } });
      if (!res.ok) return; // 목록 실패는 조용히 — 제출 기능을 막지 않는다
      const body = await res.json() as { suggestions?: MySuggestion[] };
      setMine(Array.isArray(body.suggestions) ? body.suggestions : []);
    } catch { /* 목록은 보조 정보다 */ }
  }

  async function withdraw(id: string) {
    if (withdrawBusy) return;
    setWithdrawBusy(true);
    try {
      const res = await fetch(`/api/place-suggestion/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { "x-device-id": getDeviceId() } });
      if (res.ok || res.status === 404) {
        // 404 = 이미 철회됨(반복 요청) — 목록에서 빼면 그것으로 충분하다
        setMine(prev => prev.filter(m => m.id !== id));
        setConfirmWithdraw(null);
      } else if (res.status === 409) {
        // 그 사이 검토가 끝났다 — 최신 상태를 다시 가져와 그대로 보여준다
        setConfirmWithdraw(null);
        void loadMine();
      }
    } catch { /* 실패 시 버튼이 그대로 남아 재시도 가능 */ }
    finally { setWithdrawBusy(false); }
  }

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
    // sheet 를 열 때마다 이 도시의 내 제보를 새로 읽는다 — focus 타이머에 실어
    // effect 동기 실행 밖으로 뺀다(set-state-in-effect 회피, 기존 관행).
    const id = window.setTimeout(() => { panelRef.current?.focus(); void loadMine(); }, 30);
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
      if (!res.ok) { setError(res.status === 409 ? "duplicate" : "generic"); return; }
      setDone(true);
    } catch { setError("generic"); }
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
            {error && (
              <p className="mt-2 text-[12.5px] text-red-600" role="alert">
                {error === "duplicate" ? t("suggestDuplicate") : t("feedbackError")}
              </p>
            )}
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
            {mine.length > 0 && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-[12.5px] font-bold text-gray-700">{t("mySuggestionsTitle")}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {mine.map(m => (
                    <li key={m.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-semibold text-gray-800">{m.name}</span>
                        {m.status === "pending" ? (
                          confirmWithdraw === m.id ? null : (
                            <button type="button" onClick={() => setConfirmWithdraw(m.id)}
                              className="gkm-focus shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-[12px] font-semibold text-gray-600">
                              {t("suggestWithdraw")}
                            </button>
                          )
                        ) : (
                          <span className="shrink-0 text-[11.5px] font-semibold text-gray-400">
                            {t(m.status === "accepted" ? "suggestStatusAccepted" : "suggestStatusDeclined")}
                          </span>
                        )}
                      </div>
                      {confirmWithdraw === m.id && (
                        <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2.5">
                          <p className="text-[12px] text-gray-600">{t("suggestWithdrawConfirmBody")}</p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => setConfirmWithdraw(null)} disabled={withdrawBusy}
                              className="gkm-focus flex-1 min-h-9 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">
                              {t("feedbackClose")}
                            </button>
                            <button type="button" onClick={() => void withdraw(m.id)} disabled={withdrawBusy}
                              className="gkm-focus flex-1 min-h-9 rounded-lg bg-gray-900 text-white text-[12px] font-bold disabled:opacity-40">
                              {withdrawBusy ? t("feedbackSending") : t("suggestWithdrawConfirmYes")}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

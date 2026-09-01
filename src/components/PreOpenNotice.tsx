"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";

// 정식 오픈 전 안내 (Owner 결정 2026-09-01, TASK-PREOPEN-…-V2 §14–15).
//
// 이전에 제거한 전체 화면 사과/데이터 오류 modal 과는 다른 UI 다.
//   - Home 첫 진입에 화면 아래 절반 정도를 덮는 sheet 로 보인다 — 뒤의 Home 이 일부 보인다.
//   - 같은 브라우저 session 안에서는 다시 보이지 않는다(sessionStorage). 새 session 이면 다시 안내한다.
//     영구 dismiss 는 없다 — localStorage 를 쓰지 않는다.
//   - 닫으면 그대로 정상 이용. 스크롤도 막지 않는다.
export const PREOPEN_NOTICE_SESSION_KEY = "gkm_preopen_notice_seen_v1";

function markSeen(): void {
  try { window.sessionStorage.setItem(PREOPEN_NOTICE_SESSION_KEY, "1"); } catch { /* storage unavailable — show again next time */ }
}

export default function PreOpenNotice() {
  const t = useTranslations("preopen");
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(PREOPEN_NOTICE_SESSION_KEY) === "1") return;
    } catch { /* private mode 등 — 그냥 보여 준다 */ }
    // hydration 이 끝난 다음 틱에 연다 — 서버 HTML(닫힘)과 첫 클라이언트 렌더가 같아야 한다.
    const id = window.setTimeout(() => { setOpen(true); markSeen(); }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const handleClose = useCallback(() => { markSeen(); setOpen(false); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div data-preopen-notice="" className="fixed inset-0 z-[70] flex flex-col justify-end sm:items-center sm:justify-center" role="presentation">
      {/* 뒤 화면이 비쳐 보이는 얇은 dim — 누르면 닫힌다 */}
      <button type="button" aria-label={t("close")} onClick={handleClose} className="absolute inset-0 bg-black/25 cursor-default" tabIndex={-1} />
      <section
        data-preopen-panel=""
        role="dialog"
        aria-labelledby="gkm-preopen-title"
        aria-describedby="gkm-preopen-body"
        className="relative w-full sm:max-w-lg min-h-[48vh] sm:min-h-[46vh] max-h-[60vh] flex flex-col bg-white text-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8"
      >
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-600">{t("kicker")}</p>
        <h2 id="gkm-preopen-title" className="mt-3 text-xl sm:text-2xl font-black leading-snug text-balance">{t("title")}</h2>
        <p id="gkm-preopen-body" className="mt-4 text-[15px] sm:text-base leading-relaxed text-gray-600 flex-1">{t("body")}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={handleClose}
          className="mt-6 w-full rounded-2xl bg-gray-900 text-white font-bold py-3.5 text-base hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          {t("close")}
        </button>
      </section>
    </div>
  );
}

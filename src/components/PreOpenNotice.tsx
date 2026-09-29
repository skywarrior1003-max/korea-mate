"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  readConsentState, writeConsentState, gaAllowed, deferConsent, consentDeferred, configuredGaId, ANALYTICS_CONSENT_EVENT,
  type AnalyticsConsentState,
} from "@/lib/analytics-consent";
import AnalyticsConsentSheet from "@/components/AnalyticsConsentSheet";

// 정식 오픈 전 안내 (Owner 결정 2026-09-01, TASK-PREOPEN-…-V2 §14–15).
//
// 이전에 제거한 전체 화면 사과/데이터 오류 modal 과는 다른 UI 다.
//   - Home 첫 진입에 화면 아래 절반 정도를 덮는 sheet 로 보인다 — 뒤의 Home 이 일부 보인다.
//   - 같은 브라우저 session 안에서는 다시 보이지 않는다(sessionStorage). 새 session 이면 다시 안내한다.
//     영구 dismiss 는 없다 — localStorage 를 쓰지 않는다.
//   - 닫으면 그대로 정상 이용. 스크롤도 막지 않는다.
//
// 첫 방문 통계 선택(GA-CONSENT-UX-V3): 이 안내가 뜨는 방문에서는 사용 통계 선택을 **같은 화면 안의 한 구역**으로
// 보인다 — 안내를 닫은 뒤 다른 카드가 끼어들지 않게 한다. 구역은 GA 가 켜질 수 있는 빌드이고 아직 고르지 않은
// 방문자에게만 보인다. [모두 거부]·[허용 선택]은 같은 무게이고, [허용 선택]은 두 동의를 따로 받는 시트를 연다.
// 고르지 않고 '확인하고 둘러보기'를 누르면 이번 세션은 '나중에 결정'이다(다음 세션 안내에서 다시 묻는다).
export const PREOPEN_NOTICE_SESSION_KEY = "gkm_preopen_notice_seen_v1";

function markSeen(): void {
  try { window.sessionStorage.setItem(PREOPEN_NOTICE_SESSION_KEY, "1"); } catch { /* storage unavailable — show again next time */ }
}

export default function PreOpenNotice({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const t = useTranslations("preopen");
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const statsHeadingRef = useRef<HTMLHeadingElement>(null);
  const tStats = useTranslations("analyticsConsent");
  // 통계 선택 구역 — 열릴 때 한 번 정한다(GA 가능 빌드 + 아직 고르지 않음)
  const [statsAsk, setStatsAsk] = useState(false);
  const [stats, setStats] = useState<AnalyticsConsentState | null>(null);
  const [statsSheet, setStatsSheet] = useState(false);
  const closeStatsSheet = useCallback(() => setStatsSheet(false), []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(PREOPEN_NOTICE_SESSION_KEY) === "1") return;
    } catch { /* private mode 등 — 그냥 보여 준다 */ }
    // hydration 이 끝난 다음 틱에 연다 — 서버 HTML(닫힘)과 첫 클라이언트 렌더가 같아야 한다.
    const id = window.setTimeout(() => {
      // 이번 세션에 이미 '나중에'였으면(다른 화면의 카드에서) 안내에서 다시 묻지 않는다 — 한 세션에 한 번만 묻는다
      const ask = !!configuredGaId() && !readConsentState() && !consentDeferred();
      setStatsAsk(ask);
      // 보여 준 순간 '이번 세션에 물었음' — 어떤 식으로 화면을 떠나도(링크·주소 입력) 다른 곳에서 다시 묻지 않는다
      if (ask) deferConsent();
      setOpen(true); markSeen(); onOpenChange?.(true);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    // 통계를 고르지 않고 닫으면 이번 세션은 '나중에 결정' — 이후 다른 카드로 다시 묻지 않는다
    if (statsAsk && !readConsentState()) deferConsent();
    markSeen(); setOpen(false); onOpenChange?.(false);
  }, [onOpenChange, statsAsk]);

  // 시트에서 저장하면 구역에 결과를 한 줄로 보인다
  useEffect(() => {
    if (!statsAsk) return;
    const sync = () => setStats(readConsentState());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, [statsAsk]);

  useEffect(() => {
    if (!open) return;
    // 통계 시트가 위에 떠 있으면 Esc 는 시트만 닫는다
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !statsSheet) handleClose(); };
    window.addEventListener("keydown", onKey);
    // 통계 구역이 있으면 그 제목부터 — Tab 이 읽는 순서대로 [모두 거부]→[허용 선택]→[확인하고 둘러보기]
    (statsHeadingRef.current ?? closeRef.current)?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose, statsSheet]);

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
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
          <p id="gkm-preopen-body" className="text-[15px] sm:text-base leading-relaxed text-gray-600">{t("body")}</p>
          {/* 테스트 기간 데이터 보존 안내 (Owner 확정 문구 — PRELAUNCH-DATA-NOTICE V1).
              "초기화될 수 있다" 표현을 유지하고, 공유 링크를 백업 수단으로 안내하지 않는다. */}
          <p className="mt-3 text-[15px] sm:text-base leading-relaxed text-gray-600">{t("dataNotice")}</p>
          {statsAsk && (
            <section data-preopen-stats="" aria-labelledby="gkm-preopen-stats-title" className="mt-5 pt-4 border-t border-gray-200">
              <h3 id="gkm-preopen-stats-title" ref={statsHeadingRef} tabIndex={-1} className="text-[14px] font-black text-gray-900 focus:outline-none">{tStats("noticeTitle")}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{tStats("noticeBody")}</p>
              {stats ? (
                <p role="status" data-preopen-stats-result={gaAllowed(stats) ? "on" : (stats.collect || stats.transfer) ? "one" : "off"}
                  className="mt-2 text-[13px] font-bold text-gray-900">
                  {tStats(gaAllowed(stats) ? "statusOn" : (stats.collect || stats.transfer) ? "statusPartial" : "statusOff")}
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => writeConsentState({ collect: false, transfer: false })}
                    className="h-10 rounded-xl border border-gray-900 bg-white text-[13px] font-bold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                    {tStats("rejectAll")}
                  </button>
                  <button type="button" onClick={() => setStatsSheet(true)}
                    className="h-10 rounded-xl border border-gray-900 bg-white text-[13px] font-bold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                    {tStats("cardChoose")}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={handleClose}
          className="mt-6 w-full rounded-2xl bg-gray-900 text-white font-bold py-3.5 text-base hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
        >
          {t("close")}
        </button>
      </section>
      <AnalyticsConsentSheet open={statsSheet} onClose={closeStatsSheet} />
    </div>
  );
}

"use client";

// 사용 통계 선택 — 첫 방문 카드 + GA 로더 (GA-CONSENT-V1, 화면 개편 GA-CONSENT-UX-V2)
//
// layout 이 환경 게이트(production + analytics live + 유효한 ID)를 통과한 경우에만
// gaId 를 넘겨 마운트한다. 게이트 밖(Preview·로컬)에서는 이 컴포넌트가 아예 없다.
//
// 전송 계약은 src/lib/analytics-consent.ts 그대로다: 수집·이용 + 국외 이전 두 동의가 모두 있어야
// GA 를 싣고, 선택 전·나중에·한쪽만·거부면 싣지 않는다. 철회하면 전송 수단까지 막는다.
//
// 화면(UX-V2)
//   · 첫 방문에는 짧은 카드 하나 — 한 줄 설명과 같은 무게의 [모두 거부] [허용 선택], × = 나중에 결정.
//     긴 고지 전문은 [허용 선택]이 여는 시트(AnalyticsConsentSheet)에서 동의 전에 읽는다.
//   · 첫 방문 안내 모달(PreOpenNotice)을 닫자마자 연달아 막지 않는다 — 다음 화면으로 이동하거나
//     잠시(12초) 지난 뒤에 카드를 보인다. 다른 모달(로그인 동의 등)이 떠 있는 동안에는 숨는다.
//   · 더보기에서는 카드를 띄우지 않는다 — 더보기에 상태와 '통계 선택 변경'이 있다.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  readConsentState, writeConsentState, gaAllowed, loadGtag, disableGtag,
  hasStaleConsent, clearStaleConsent, deferConsent, consentDeferred,
  ANALYTICS_CONSENT_EVENT, type AnalyticsConsentState,
} from "@/lib/analytics-consent";
import AnalyticsConsentSheet from "@/components/AnalyticsConsentSheet";

/** 카드가 비켜 설 화면 요소 — 첫 방문 안내, 그리고 이 카드의 시트가 아닌 모든 모달 */
const BLOCKER_SELECTOR = "[data-preopen-notice], [aria-modal=\"true\"]:not([data-gkm-analytics-sheet])";
const AFTER_NOTICE_MS = 12_000;

export default function AnalyticsConsent({ gaId }: { gaId: string }) {
  const t = useTranslations("analyticsConsent");
  const pathname = usePathname() || "/";
  const [undecided, setUndecided] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [sheet, setSheet] = useState(false);
  const noticeSeen = useRef(false);
  const firstPath = useRef(pathname);

  useEffect(() => {
    // 이전 버전·이전 형식 선택은 무효 — 남은 GA 쿠키도 정리하고 다시 묻는다
    if (hasStaleConsent()) { clearStaleConsent(); disableGtag(gaId); }
    const s = readConsentState();
    if (gaAllowed(s)) loadGtag(gaId);
    Promise.resolve().then(() => setUndecided(!s && !consentDeferred()));

    // 더보기의 스위치·시트도 writeConsentState 로만 바꾼다 — 실제 켜고 끄기는 여기 한 곳에서
    const apply = (e: Event) => {
      const next = (e as CustomEvent<AnalyticsConsentState>).detail;
      if (gaAllowed(next)) loadGtag(gaId); else disableGtag(gaId);
      setUndecided(false);
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, apply);

    let timer: number | undefined;
    const sync = () => {
      const notice = !!document.querySelector("[data-preopen-notice]");
      if (notice) noticeSeen.current = true;
      setBlocked(!!document.querySelector(BLOCKER_SELECTOR));
      // 첫 방문 안내를 닫은 뒤에는 잠시 기다린다(연속으로 가로막지 않기)
      if (!notice && noticeSeen.current && timer === undefined) timer = window.setTimeout(() => setReady(true), AFTER_NOTICE_MS);
    };
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    // 안내가 없는 화면이면 짧게 기다린 뒤 보인다(안내가 먼저 마운트될 틈)
    const first = window.setTimeout(() => { sync(); if (!noticeSeen.current) setReady(true); }, 800);
    return () => { window.clearTimeout(first); if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener(ANALYTICS_CONSENT_EVENT, apply); mo.disconnect(); };
  }, [gaId]);

  // 안내를 본 뒤 다른 화면으로 이동하면 기다리지 않고 보인다
  useEffect(() => {
    if (pathname !== firstPath.current && noticeSeen.current) Promise.resolve().then(() => setReady(true));
  }, [pathname]);

  const onMore = /^\/more\/?$/.test(pathname);
  const later = () => { deferConsent(); setUndecided(false); };

  return (
    <>
      {undecided && ready && !blocked && !onMore && !sheet && (
        <div id="gkm-ga-card" role="region" aria-labelledby="gkm-analytics-consent-title"
          className="fixed inset-x-0 bottom-16 md:bottom-0 z-50 px-3 pb-3 md:px-6 md:pb-6 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-[#E4DCCF] bg-[#FFFDF9] text-[#2C2520] shadow-[0_8px_30px_rgba(44,37,32,0.16)] p-4">
            <div className="flex items-start gap-3">
              <p id="gkm-analytics-consent-title" className="flex-1 text-[14px] font-black leading-snug">{t("cardTitle")}</p>
              <button type="button" onClick={later} aria-label={t("later")} title={t("later")}
                className="gkm-focus -mr-1 -mt-1 shrink-0 w-8 h-8 rounded-full text-[#61554D] hover:bg-[#F3EEE3] inline-flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[#4A3F38]">{t("cardBody")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => writeConsentState({ collect: false, transfer: false })}
                className="gkm-focus h-10 rounded-xl border border-[#2C2520] bg-white text-[13px] font-black text-[#2C2520]">
                {t("rejectAll")}
              </button>
              <button type="button" onClick={() => setSheet(true)}
                className="gkm-focus h-10 rounded-xl border border-[#2C2520] bg-white text-[13px] font-black text-[#2C2520]">
                {t("cardChoose")}
              </button>
            </div>
          </div>
        </div>
      )}
      <AnalyticsConsentSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

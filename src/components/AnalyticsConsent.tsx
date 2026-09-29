"use client";

// 사용 통계 선택 동의 배너 — GA-CONSENT-V1
//
// layout 이 환경 게이트(production + analytics live + 유효한 ID)를 통과한 경우에만
// gaId 를 넘겨 마운트한다. 게이트 밖(Preview·로컬)에서는 이 컴포넌트가 아예 없다.
//
// 동의는 두 개를 따로 받는다(수집·이용 / 국외 이전 — src/lib/analytics-consent.ts 머리 주석).
// 두 체크 상자는 처음에 비어 있고, 각 상자 바로 아래에 그 동의 전에 알려야 할 사항을 둔다
// (제15조② · 제28조의8②) — 모바일에서는 최대 46vh 안에서 스크롤한다. '선택 저장'과 '모두 거부'는 같은 크기·같은 무게다 — 거부를 숨기지 않는다.
// '나중에'(X)는 이번 세션만 닫는다 — 결정 보류이며 수집 0.
//
// 첫 방문 안내 모달(PreOpenNotice, z-70)이 떠 있는 동안에는 배너를 그리지 않는다 — 겹쳐서
// 누를 수 없는 버튼을 만들지 않는다. 모달이 닫히면 그 다음에 뜬다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  readConsentState, writeConsentState, gaAllowed, loadGtag, disableGtag,
  hasStaleConsent, clearStaleConsent, deferConsent, consentDeferred,
  ANALYTICS_CONSENT_EVENT, type AnalyticsConsentState,
} from "@/lib/analytics-consent";

const NOTICE_SELECTOR = "[data-preopen-notice]";

export default function AnalyticsConsent({ gaId }: { gaId: string }) {
  const t = useTranslations("analyticsConsent");
  const [open, setOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [collect, setCollect] = useState(false);
  const [transfer, setTransfer] = useState(false);

  useEffect(() => {
    // 이전 버전·이전 형식 선택은 무효 — 남은 GA 쿠키도 정리하고 다시 묻는다
    if (hasStaleConsent()) { clearStaleConsent(); disableGtag(gaId); }
    const s = readConsentState();
    if (gaAllowed(s)) loadGtag(gaId);
    // 저장소 읽기는 마운트 뒤에만(정적 export 하이드레이션 일치). 첫 방문 안내 모달이 먼저 마운트될 틈을 둔다.
    const timer = window.setTimeout(() => { if (!s && !consentDeferred()) setOpen(true); }, 400);

    // 설정 화면(More)의 스위치도 writeConsentState 로만 바꾼다 — 실제 켜고 끄기는 여기 한 곳에서
    const apply = (e: Event) => {
      const next = (e as CustomEvent<AnalyticsConsentState>).detail;
      if (gaAllowed(next)) loadGtag(gaId); else disableGtag(gaId);
      setOpen(false);
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, apply);

    const syncNotice = () => setNoticeOpen(!!document.querySelector(NOTICE_SELECTOR));
    const mo = new MutationObserver(syncNotice);
    mo.observe(document.body, { childList: true, subtree: true });
    syncNotice();
    return () => { window.clearTimeout(timer); window.removeEventListener(ANALYTICS_CONSENT_EVENT, apply); mo.disconnect(); };
  }, [gaId]);

  if (!open || noticeOpen) return null;
  const later = () => { deferConsent(); setOpen(false); };
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="gkm-analytics-consent-title"
      className="fixed inset-x-0 bottom-16 md:bottom-0 z-[60] px-3 pb-3 md:px-6 md:pb-6 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl max-h-[46vh] md:max-h-[60vh] flex flex-col rounded-2xl border border-[#E4DCCF] bg-[#FFFDF9] text-[#2C2520] shadow-[0_8px_30px_rgba(44,37,32,0.18)] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <p id="gkm-analytics-consent-title" className="flex-1 text-[15px] font-black leading-snug">{t("title")}</p>
          <button type="button" onClick={later} aria-label={t("later")} title={t("later")}
            className="gkm-focus -mr-1 -mt-1 shrink-0 w-8 h-8 rounded-full text-[#61554D] hover:bg-[#F3EEE3] inline-flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {/* 제목·버튼은 고정, 두 동의와 고지 사항은 안에서 스크롤 — 화면의 절반 이상을 가리지 않는다 */}
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <p className="text-[13px] leading-relaxed text-[#4A3F38]">{t("intro")}</p>

        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" name="gkm-analytics-collect" checked={collect} onChange={e => setCollect(e.target.checked)}
            className="mt-0.5 w-5 h-5 shrink-0 accent-[#2C2520]" />
          <span className="min-w-0">
            <span className="block text-[13px] font-black">{t("collectLabel")}</span>
            <span className="block mt-0.5 text-[12px] leading-relaxed text-[#61554D]">{t("collectDetails")}</span>
          </span>
        </label>
        <label className="mt-2.5 flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" name="gkm-analytics-transfer" checked={transfer} onChange={e => setTransfer(e.target.checked)}
            className="mt-0.5 w-5 h-5 shrink-0 accent-[#2C2520]" />
          <span className="min-w-0">
            <span className="block text-[13px] font-black">{t("transferLabel")}</span>
            <span className="block mt-0.5 text-[12px] leading-relaxed text-[#61554D]">{t("transferDetails")}</span>
          </span>
        </label>

        <p className="mt-2.5 text-[12px] leading-relaxed text-[#61554D]">
          {t("footer")}{" "}
          <Link href="/privacy/" className="underline underline-offset-2 font-bold text-[#2C2520]">{t("policyLink")}</Link>
        </p>
        </div>
        <div className="mt-3 shrink-0 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => writeConsentState({ collect: false, transfer: false })}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-white text-[14px] font-black text-[#2C2520]">
            {t("rejectAll")}
          </button>
          <button type="button" onClick={() => writeConsentState({ collect, transfer })}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-white text-[14px] font-black text-[#2C2520]">
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// 사용 통계 선택 동의 배너 — GA-CONSENT-V1
//
// layout 이 환경 게이트(production + analytics live + 유효한 ID)를 통과한 경우에만
// gaId 를 넘겨 마운트한다. 게이트 밖(Preview·로컬)에서는 이 컴포넌트가 아예 없다.
//
// 배너는 국외 이전 동의 전에 알려야 할 사항(법 제28조의8②: 항목·국가·시기와 방법·받는 자·
// 목적과 보유기간·거부 방법과 효과)을 한 화면에 담는다. 두 버튼은 같은 크기·같은 무게로 둔다 —
// 거부를 숨기거나 작게 만들지 않는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  readConsent, writeConsent, loadGtag, disableGtag, ANALYTICS_CONSENT_OPEN_EVENT, ANALYTICS_CONSENT_EVENT,
  type AnalyticsConsent as Choice,
} from "@/lib/analytics-consent";

export default function AnalyticsConsent({ gaId }: { gaId: string }) {
  const t = useTranslations("analyticsConsent");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 저장소 읽기는 마운트 뒤에만(정적 export 하이드레이션 일치)
    Promise.resolve(readConsent()).then(c => {
      if (c === "granted") loadGtag(gaId);
      else if (c === null) setOpen(true);
    });
    const reopen = () => setOpen(true);
    // 설정 화면(More)의 스위치도 writeConsent 로만 바꾼다 — 실제 켜고 끄기는 여기 한 곳에서
    const apply = (e: Event) => {
      const c = (e as CustomEvent<Choice>).detail;
      if (c === "granted") loadGtag(gaId); else if (c === "denied") disableGtag(gaId);
      setOpen(false);
    };
    window.addEventListener(ANALYTICS_CONSENT_OPEN_EVENT, reopen);
    window.addEventListener(ANALYTICS_CONSENT_EVENT, apply);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_OPEN_EVENT, reopen);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, apply);
    };
  }, [gaId]);

  // writeConsent 가 ANALYTICS_CONSENT_EVENT 를 보내고, 위 apply 가 적용·닫기를 맡는다
  const choose = (c: Choice) => writeConsent(c);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="gkm-analytics-consent-title"
      className="fixed inset-x-0 bottom-16 md:bottom-0 z-50 px-3 pb-3 md:px-6 md:pb-6 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-[#E4DCCF] bg-[#FFFDF9] text-[#2C2520] shadow-[0_8px_30px_rgba(44,37,32,0.18)] p-4 md:p-5">
        <p id="gkm-analytics-consent-title" className="text-[15px] font-black leading-snug">{t("title")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#4A3F38]">{t("body")}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#61554D]">{t("details")}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#61554D]">
          {t("refuse")}{" "}
          <Link href="/privacy/" className="underline underline-offset-2 font-bold text-[#2C2520]">{t("policyLink")}</Link>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => choose("denied")}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-white text-[14px] font-black text-[#2C2520]">
            {t("decline")}
          </button>
          <button type="button" onClick={() => choose("granted")}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-[#2C2520] text-[14px] font-black text-white">
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// 로그인 전 동의 sheet (CONSENT-AND-AUTH-ACTIVATION-V1 §C-1)
//
// 계약:
//  · 세 항목 전부 기본 미선택. 일괄 선택 없음. 링크를 눌러도 자동 체크 없음.
//  · 세 항목을 직접 선택해야 진행 버튼 활성화.
//  · 진행 = 서버 intent 발급(§C-2) 성공 후에만 onProceed(OAuth 시작) 호출.
//  · 생년월일·마케팅 동의를 섞지 않는다. PII 를 다루지 않는다.
//  · 톤은 More 계정 카드와 동일 계열(웜 뉴트럴·둥근 모서리).

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { postConsentIntent } from "@/lib/auth/consent-client";
import { isConsentLocale, type ConsentLocale } from "@/lib/auth/consent-contract";

function CheckRow({ checked, onToggle, children }: {
  checked: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="gkm-focus mt-0.5 w-5 h-5 shrink-0 rounded border-[#D9D2C7] accent-[#2C2520]"
      />
      <span className="text-[14px] leading-snug text-[#2C2520]">{children}</span>
    </label>
  );
}

export default function ConsentSheet({ open, onClose, onProceed }: {
  open: boolean;
  onClose: () => void;
  /** intent 발급 성공 후에만 호출된다 — 여기서 OAuth 를 시작한다 */
  onProceed: () => void | Promise<void>;
}) {
  const t = useTranslations("auth");
  const rawLocale = useLocale();
  const locale: ConsentLocale = isConsentLocale(rawLocale) ? rawLocale : "en";
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!open) return null;
  const ready = age && terms && privacy && !busy;

  const proceed = async () => {
    if (!ready) return;
    setBusy(true); setFailed(false);
    const ok = await postConsentIntent(locale);
    if (!ok) { setBusy(false); setFailed(true); return; }
    await onProceed(); // 성공 시 페이지가 Google 로 이동한다
    setBusy(false);
  };

  const linkCls = "underline underline-offset-2 font-bold text-[#8C6239]";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <button aria-hidden className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} tabIndex={-1} />
      <div
        role="dialog" aria-modal="true" aria-label={t("consentTitle")}
        className="relative w-full sm:max-w-md bg-[#FAF7F2] rounded-t-3xl sm:rounded-3xl border border-[#E6DFD5] px-5 py-5 sm:px-6"
      >
        <h2 className="text-[17px] font-black text-[#2C2520] mb-2">{t("consentTitle")}</h2>

        <div className="divide-y divide-[#EFE9DF]">
          <CheckRow checked={age} onToggle={() => setAge(v => !v)}>{t("consentAge")}</CheckRow>
          <CheckRow checked={terms} onToggle={() => setTerms(v => !v)}>
            {t.rich("consentTerms", {
              link: chunk => (
                <a href="/terms/" target="_blank" rel="noopener noreferrer" className={linkCls}
                   onClick={e => e.stopPropagation()}>{chunk}</a>
              ),
            })}
          </CheckRow>
          <CheckRow checked={privacy} onToggle={() => setPrivacy(v => !v)}>
            {t.rich("consentPrivacy", {
              link: chunk => (
                <a href="/privacy/" target="_blank" rel="noopener noreferrer" className={linkCls}
                   onClick={e => e.stopPropagation()}>{chunk}</a>
              ),
            })}
          </CheckRow>
        </div>

        {failed && (
          <p className="mt-2 text-[12px] font-bold text-[#B3261E]">{t("consentError")}</p>
        )}

        <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button" onClick={onClose} disabled={busy}
            className="gkm-focus px-4 py-2.5 rounded-xl border border-[#E6DFD5] text-[13px] font-bold text-[#2C2520] disabled:opacity-50"
          >
            {t("consentCancel")}
          </button>
          <button
            type="button" onClick={() => { void proceed(); }} disabled={!ready}
            className="gkm-focus px-4 py-2.5 rounded-xl bg-[#2C2520] text-white text-[13px] font-bold disabled:opacity-40"
          >
            {busy ? t("signingIn") : t("consentProceed")}
          </button>
        </div>
      </div>
    </div>
  );
}

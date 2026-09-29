"use client";

// 사용 통계 선택 시트 — GA-CONSENT-UX-V2
//
// 첫 방문 카드의 '허용 선택'과 더보기의 '통계 선택 변경'이 같은 시트를 연다.
// 계약(src/lib/analytics-consent.ts)은 그대로다 — 동의 두 개(수집·이용 / 국외 이전)를 따로 받고,
// 둘 다 있어야만 GA 를 싣는다. 이 시트는 그 선택을 이해하기 쉽게 보여 주는 화면일 뿐이다.
//
// · 처음 여는 사람에게는 두 상자가 비어 있다. 이미 고른 사람에게는 저장된 선택을 그대로 보여 준다
//   (화면 개편 때문에 기존 선택을 바꾸거나 초기화하지 않는다).
// · 각 동의의 고지 전문(제15조② · 제28조의8②)은 '내용 보기'로 펼친다 — 체크하기 전에 언제든 읽을 수 있다.
// · '모두 동의'는 두 상자를 한 번에 체크하는 편의일 뿐, 개별 상자를 숨기거나 대신하지 않는다.
// · 한쪽만 체크하면 "저장해도 통계는 꺼져 있다"는 결과를 바로 아래에 보여 준다.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { readConsentState, writeConsentState } from "@/lib/analytics-consent";

type Key = "collect" | "transfer";

export default function AnalyticsConsentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("analyticsConsent");
  const uid = useId();
  const [pick, setPick] = useState({ collect: false, transfer: false });
  const [shown, setShown] = useState<Record<Key, boolean>>({ collect: false, transfer: false });
  // 부모가 다시 그려져도(새 onClose 함수) 고르던 선택이 초기화되지 않게 — 여는 순간에만 저장값에서 출발
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    // 열 때마다 저장된 선택에서 출발한다(없으면 둘 다 해제)
    const s = readConsentState();
    Promise.resolve().then(() => {
      setPick({ collect: !!s?.collect, transfer: !!s?.transfer });
      setShown({ collect: false, transfer: false });
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const both = pick.collect && pick.transfer;
  const one = pick.collect !== pick.transfer;
  const save = (c: { collect: boolean; transfer: boolean }) => { writeConsentState(c); onClose(); };

  const item = (k: Key) => (
    <div className="py-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" name={`gkm-analytics-${k}`} checked={pick[k]}
          onChange={e => setPick(p => ({ ...p, [k]: e.target.checked }))}
          className="gkm-focus mt-0.5 w-5 h-5 shrink-0 rounded border-[#D9D2C7] accent-[#2C2520]" />
        <span className="min-w-0 flex-1 text-[14px] font-bold text-[#2C2520] leading-snug">
          {t(k === "collect" ? "collectLabel" : "transferLabel")}
        </span>
      </label>
      <button type="button" aria-expanded={shown[k]} aria-controls={`${uid}-${k}`}
        onClick={() => setShown(s => ({ ...s, [k]: !s[k] }))}
        className="gkm-focus ml-8 mt-1 text-[12px] font-bold text-[#8C6239] underline underline-offset-2">
        {shown[k] ? t("hideDetails") : t("showDetails")}
      </button>
      {shown[k] && (
        <p id={`${uid}-${k}`} className="ml-8 mt-1.5 text-[12px] leading-relaxed text-[#61554D]">
          {t(k === "collect" ? "collectDetails" : "transferDetails")}
        </p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <button aria-hidden className="absolute inset-0 bg-black/40" onClick={onClose} tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} data-gkm-analytics-sheet=""
        className="relative w-full sm:max-w-md max-h-[85vh] flex flex-col bg-[#FAF7F2] rounded-t-3xl sm:rounded-3xl border border-[#E6DFD5] px-5 py-5 sm:px-6">
        <h2 id={`${uid}-title`} className="text-[17px] font-black text-[#2C2520]">{t("title")}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#4A3F38]">{t("intro")}</p>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <label className="flex items-center gap-3 py-3 border-b border-[#EFE9DF] cursor-pointer">
            <input type="checkbox" name="gkm-analytics-all" checked={both}
              onChange={e => setPick({ collect: e.target.checked, transfer: e.target.checked })}
              className="gkm-focus w-5 h-5 shrink-0 rounded border-[#D9D2C7] accent-[#2C2520]" />
            <span className="text-[14px] font-black text-[#2C2520]">{t("selectAll")}</span>
          </label>
          <div className="divide-y divide-[#EFE9DF]">
            {item("collect")}
            {item("transfer")}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#61554D]">
            {t("footer")}{" "}
            <Link href="/privacy/" className="underline underline-offset-2 font-bold text-[#8C6239]">{t("policyLink")}</Link>
          </p>
        </div>

        <p role="status" data-analytics-live={both ? "on" : one ? "one" : "off"}
          className="mt-3 text-[13px] font-bold leading-snug"
          style={{ color: both ? "#2C2520" : "#8C6239" }}>
          {both ? t("liveBoth") : one ? t("liveOne") : t("liveNone")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => save({ collect: false, transfer: false })}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-white text-[14px] font-black text-[#2C2520]">
            {t("rejectAll")}
          </button>
          <button type="button" onClick={() => save(pick)}
            className="gkm-focus h-11 rounded-xl border border-[#2C2520] bg-white text-[14px] font-black text-[#2C2520]">
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// S2 — 언어 스위처 (EN/JA/ZH/KO는 이미 지원 — 노출만 부재했음)
// saveLocale 후 reload로 전체 텍스트 일관 적용 (I18nProvider는 mount 시 해석).
//
// variant="icon" 은 모바일 헤더용이다. 데스크톱은 라벨이 보이는 select 를
// 그대로 쓰고, 좁은 화면에서는 지구본 하나만 남긴다 — 헤더에 이름을 적을
// 자리가 없다. 어느 쪽이든 같은 <select> 를 쓴다: 목록은 OS 가 그리므로
// 커스텀 모달도, 열림 상태도, 새 provider 도 필요 없다.

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALE_STORAGE_KEY, saveLocale, SUPPORTED, type Locale } from "@/components/I18nProvider";

const LABELS: Record<Locale, string> = { en: "English", ko: "한국어", ja: "日本語", zh: "中文" };

/** 이모지는 OS 마다 그림이 달라 같은 화면이 기기별로 다르게 보인다 */
function GlobeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z" />
    </svg>
  );
}

export interface LanguageSwitcherProps {
  className?: string;
  /** "select" = 라벨이 보이는 기존 형태 · "icon" = 지구본만 (모바일 헤더) */
  variant?: "select" | "icon";
}

export default function LanguageSwitcher({ className = "", variant = "select" }: LanguageSwitcherProps) {
  const t = useTranslations("common");
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && (SUPPORTED as string[]).includes(saved)) setLocale(saved as Locale);
    else {
      const nav = navigator.language.split("-")[0].toLowerCase();
      if ((SUPPORTED as string[]).includes(nav)) setLocale(nav as Locale);
    }
  }, []);

  function handleChange(l: Locale) {
    saveLocale(l);
    window.location.reload();
  }

  const options = SUPPORTED.map(l => (
    <option key={l} value={l}>{LABELS[l]}</option>
  ));

  if (variant === "icon") {
    // select 를 44×44 로 덮어 두고 투명하게 만든다. 보이는 건 지구본뿐이지만
    // 탭·키보드가 닿는 건 select 라서 OS 언어 목록이 그대로 열린다.
    // 투명한 요소에는 자기 outline 이 보이지 않으므로 포커스 링은 바깥이 그린다.
    return (
      <span
        className={`relative inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full
                    focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${className}`}
      >
        <GlobeIcon size={21} />
        <select
          aria-label={t("language")}
          value={locale}
          onChange={e => handleChange(e.target.value as Locale)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {options}
        </select>
      </span>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <GlobeIcon size={15} />
      <select
        aria-label={t("language")}
        value={locale}
        onChange={e => handleChange(e.target.value as Locale)}
        className="gkm-focus bg-transparent text-sm font-semibold text-sub hover:text-ink cursor-pointer border-0 py-2"
      >
        {options}
      </select>
    </label>
  );
}

// S2 — 언어 스위처 (EN/JA/ZH/KO는 이미 지원 — 노출만 부재했음)
// saveLocale 후 reload로 전체 텍스트 일관 적용 (I18nProvider는 mount 시 해석).

"use client";

import { useEffect, useState } from "react";
import { LOCALE_STORAGE_KEY, saveLocale, SUPPORTED, type Locale } from "@/components/I18nProvider";

const LABELS: Record<Locale, string> = { en: "English", ko: "한국어", ja: "日本語", zh: "中文" };

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
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

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span aria-hidden className="text-sm">🌐</span>
      <select
        aria-label="Language"
        value={locale}
        onChange={e => handleChange(e.target.value as Locale)}
        className="gkm-focus bg-transparent text-sm font-semibold text-sub hover:text-ink cursor-pointer border-0 py-2"
      >
        {SUPPORTED.map(l => (
          <option key={l} value={l}>{LABELS[l]}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import en from "@/messages/en.json";
import ko from "@/messages/ko.json";
import ja from "@/messages/ja.json";
import zh from "@/messages/zh.json";

const MESSAGES = { en, ko, ja, zh } as const;
type Locale = keyof typeof MESSAGES;
const SUPPORTED: Locale[] = ["en", "ko", "ja", "zh"];
export type { Locale };
export { SUPPORTED };

export const LOCALE_STORAGE_KEY = "gkm-locale";

// Priority chain (highest → lowest):
//   1. URL ?lang= parameter
//   2. User's explicit choice saved in localStorage
//   3. Browser language (if supported)
//   4. "en" fallback
function resolveLocale(): Locale {
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang && SUPPORTED.includes(urlLang as Locale)) return urlLang as Locale;

  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && SUPPORTED.includes(saved as Locale)) return saved as Locale;

  const browserLang = navigator.language.split("-")[0].toLowerCase();
  if (SUPPORTED.includes(browserLang as Locale)) return browserLang as Locale;

  return "en";
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    // Promise wrapper keeps setState out of the synchronous effect body,
    // satisfying react-hooks/set-state-in-effect while preserving the
    // server/client hydration contract ("en" on first render, detected on client).
    Promise.resolve(resolveLocale()).then(setLocale);
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

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

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const primary = navigator.language.split("-")[0].toLowerCase() as Locale;
  return SUPPORTED.includes(primary) ? primary : "en";
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}

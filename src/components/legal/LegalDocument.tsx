"use client";

// 법적 문서 공용 렌더러 (PRIVACY-TERMS-V1)
//
// More 화면과 같은 조용한 문서 톤([#FAF7F2] 계열)을 그대로 쓴다 — 새 디자인
// 시스템을 만들지 않는다. 로그인·인증 요구 0, 광고·마케팅 표현 0.
//
// DRAFT 규칙: ownerInput 또는 시행일 미확정이 하나라도 있으면
// "DRAFT — NOT FOR PRODUCTION" 배너를 강제 표시한다. Owner 확정 정보가
// 콘텐츠 모듈에 반영되어 마커가 모두 사라져야 배너도 사라진다.

import Link from "next/link";
import { useLocale } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import type { LegalDocSet, LegalLocale } from "@/lib/legal/legal-types";
import { hasOwnerInput } from "@/lib/legal/legal-types";

const DATE_TBD: Record<LegalLocale, string> = {
  en: "Effective date: to be announced",
  ko: "시행일: 게시 시 확정",
  ja: "施行日: 掲載時に確定",
  zh: "生效日期: 发布时确定",
};

export default function LegalDocument({ docs }: { docs: LegalDocSet }) {
  const rawLocale = useLocale();
  const locale: LegalLocale = (["en", "ko", "ja", "zh"] as const).includes(rawLocale as LegalLocale)
    ? (rawLocale as LegalLocale) : "en";
  const doc = docs[locale];
  const draft = hasOwnerInput(doc);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="gkm-focus text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <LanguageSwitcher variant="icon" className="text-[#2C2520]" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-16">
        {draft && (
          <div role="status" className="mb-8 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3">
            <p className="text-sm font-black tracking-wide text-amber-800">DRAFT — NOT FOR PRODUCTION</p>
            <p className="mt-1 text-xs text-amber-700">
              This document contains items awaiting owner confirmation and is not yet in effect.
            </p>
          </div>
        )}

        <h1 className="text-4xl font-black tracking-tight leading-tight">{doc.title}</h1>
        <p className="mt-3 text-[13px] text-[#8A7D72]">
          {doc.effectiveDate ?? DATE_TBD[locale]}
          {doc.lastUpdated ? ` · ${doc.lastUpdated}` : ""}
        </p>

        <div className="mt-6 space-y-4">
          {doc.intro.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-[#3D342C]">{p}</p>
          ))}
        </div>

        <div className="mt-10 space-y-10">
          {doc.sections.map(s => (
            <section key={s.no} aria-labelledby={`sec-${s.no}`}>
              <h2 id={`sec-${s.no}`} className="text-xl font-black tracking-tight leading-snug">
                {s.no}. {s.title}
              </h2>
              <div className="mt-3 space-y-3">
                {s.paragraphs.map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-[#3D342C]">{p}</p>
                ))}
                {s.items && (
                  <ul className="list-disc pl-5 space-y-2">
                    {s.items.map((it, i) => (
                      <li key={i} className="text-[15px] leading-relaxed text-[#3D342C]">{it}</li>
                    ))}
                  </ul>
                )}
                {s.ownerInput && (
                  <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-3 py-2">
                    <p className="text-[12px] font-bold text-amber-800">OWNER INPUT REQUIRED</p>
                    <p className="text-[12px] text-amber-700">{s.ownerInput}</p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <p>© {new Date().getFullYear()} gokoreamate. All rights reserved.</p>
      </footer>
    </div>
  );
}

"use client";

// About 화면 본문.
//
// 이 앱의 locale 은 브라우저에서 정해진다(`I18nProvider` — ?lang= → localStorage →
// navigator.language). 서버 쪽 next-intl 설정이 없어서 서버 컴포넌트는 사용자의
// 언어를 알 수 없다. 그래서 화면은 클라이언트로 내리고, `metadata` 는 서버에
// 남는 `page.tsx` 가 계속 들고 있는다 — 정적 export 라 metadata 는 언어별로
// 만들 수 없고, 이번 범위에서는 영어로 고정한다.

import Link from "next/link";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { useTranslations } from "next-intl";
import ContactSection from "@/components/ContactSection";

const LAST_UPDATED = "2026-05-31";

export default function AboutClient() {
  const t = useTranslations("about");
  const tNav = useTranslations("nav");
  const tFooter = useTranslations("footer");

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
              {/* 브랜드는 어느 언어에서도 소문자 gokoreamate 다 — 번역하지 않는다 */}
              <span className="font-black tracking-tight">gokoreamate</span>
            </Link>
          </div>
          {/* 모바일에서는 이 메뉴가 브랜드와 붙어 "gokoreamateBlog" 처럼 읽혔다.
              좁은 화면에서는 하단 내비가 같은 곳으로 데려가므로 숨긴다. */}
          <LanguageSwitcher variant="icon" className="sm:hidden text-[#2C2520]" />
          <nav className="hidden sm:flex items-center gap-8">
            <Link
              href="/blog"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              {tNav("blog")}
            </Link>
            <Link
              href="/survival-guide"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              {tNav("survivalGuide")}
            </Link>
            <Link
              href="/about"
              className="text-base font-bold text-[#D4AF37] transition-colors"
            >
              {tNav("about")}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Header */}
      <section className="bg-gradient-to-b from-[#F3EEE3] to-[#FAF7F2] border-b border-[#E6DFD5] py-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-6xl font-black text-[#2C2520] tracking-tight leading-tight">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 text-xl sm:text-2xl text-[#61554D] font-bold">
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-20 flex-1 space-y-12">
        <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 sm:p-12 shadow-sm space-y-10">

          {/* Section 1 - Mission */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-[#2C2520] flex items-center gap-2">
              🎯 {t("missionTitle")}
            </h2>
            <p className="text-lg text-[#61554D] leading-relaxed">
              {t("missionBody")}
            </p>
          </section>

          <hr className="border-[#FAF7F2]" />

          {/* Section 2 - Data Source Attribution */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-[#2C2520] flex items-center gap-2">
              📊 {t("dataTitle")}
            </h2>
            {/* 문장 가운데에 출처 링크가 들어간다. 도메인은 고유명사라 번역하지
                않고, 앞뒤 문장만 언어별로 나눈다. */}
            <p className="text-lg text-[#61554D] leading-relaxed">
              {t("dataBodyBefore")}
              <a
                href="https://visitkorea.or.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline hover:text-[#D4AF37]"
              >
                visitkorea.or.kr
              </a>
              {t("dataBodyAfter")}
            </p>
          </section>

          <hr className="border-[#FAF7F2]" />

          {/* Section 3 - AI usage disclosure */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-[#2C2520] flex items-center gap-2">
              🤖 {t("aiTitle")}
            </h2>
            <p className="text-lg text-[#61554D] leading-relaxed">
              {t("aiBody")}
            </p>
          </section>

          <hr className="border-[#FAF7F2]" />

          {/* Section 4 - Contact */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-[#2C2520] flex items-center gap-2">
              ✉️ {t("contactTitle")}
            </h2>
            <p className="text-lg text-[#61554D] leading-relaxed">
              {t("contactBody")}
            </p>
            <ContactSection />
          </section>

          <hr className="border-[#FAF7F2]" />

          <p className="text-sm text-[#8C6239]">{t("lastUpdated", { date: LAST_UPDATED })}</p>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          <p className="font-bold tracking-wide">
            {t("footerNote")}
          </p>
        </div>
      </footer>
    </div>
  );
}

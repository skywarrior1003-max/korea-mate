// Survival Guide 본문.
//
// 왜 클라이언트인가
//   이 앱의 locale 은 브라우저에서 정해진다. 서버 컴포넌트는 번역을 읽을 수
//   없어서, 문구가 있는 부분을 여기로 옮겼다. metadata 와 정적 export 는
//   page.tsx 가 그대로 갖는다 — /about 이 쓰는 것과 같은 분리다.
//
// 무엇이 바뀌지 않았나
//   카드 순서·타이포·간격·이모지·링크·제휴 게이트 전부 그대로다. 옮긴 것은
//   문구뿐이고, 데스크톱 nav 는 Blog 에서 만든 EditorialNav 를 그대로 쓴다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import EditorialNav from "@/components/ui/EditorialNav";
import { isEditorialAffiliateEnabled } from "@/config/commerce-surfaces";

export default function SurvivalGuideClient() {
  const t       = useTranslations("survival");
  const tAbout  = useTranslations("about");
  const tFooter = useTranslations("footer");

  // 앱 이름·기관명은 번역하지 않는다. 문장 안에서 굵게만 표시한다.
  const bold = { b: (chunks: React.ReactNode) => <strong>{chunks}</strong> };

  const faqs = [1, 2, 3, 4, 5].map(n => ({
    q: t(`q${n}`),
    a: t(`a${n}`),
  }));

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="font-black tracking-tight">gokoreamate</span>
            </Link>
          </div>
          <LanguageSwitcher variant="icon" className="sm:hidden text-[#2C2520]" />
          {/* 좁은 화면에서는 이 링크들이 하단 More 탭(/more)에 모여 있다.
              가로 폭이 이미 x=378 까지 차 있어 지구본과 공존할 수 없다. */}
          <EditorialNav active="survivalGuide" />
        </div>
      </header>

      {/* Hero Header */}
      <section className="bg-gradient-to-b from-[#F3EEE3] to-[#FAF7F2] border-b border-[#E6DFD5] py-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-6xl font-black text-[#2C2520] tracking-tight leading-tight">
            {t("title")}
          </h1>
          <p className="mt-5 text-xl sm:text-2xl text-[#61554D] font-bold">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {/* Main Content Sections */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-20 flex-1 space-y-16">

        {/* Grid for Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Section 1 - Before You Land */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] flex items-center gap-2">
                🛫 {t("beforeTitle")}
              </h2>
              <ul className="space-y-4 text-base text-[#61554D]">
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">📱 {t("esimTitle")}</strong>
                  {t("esimBody")}
                </li>
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">💳 {t("transitTitle")}</strong>
                  {t("transitBody")}
                </li>
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">📲 {t("appsTitle")}</strong>
                  {t.rich("appsBody", bold)}
                </li>
              </ul>
            </div>
            {/* Editorial Content Affiliate (§14-1-C) — survival-guide 는 사용자
                가시 제휴 고지가 없어 승인 표면 목록에 없다. 고지 보강 전까지
                anchor 를 생성하지 않는다. 링크·코드는 후속 정상화를 위해 보존한다. */}
            {isEditorialAffiliateEnabled("survival-guide") && (
            <a
              href="https://affiliate.klook.com/sl/KiT3U74"
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="mt-8 inline-flex items-center justify-center px-4 py-3 text-sm font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors w-full text-center"
            >
              {t("esimCta")}
            </a>
            )}
          </div>

          {/* Section 2 - Money & Payments */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm">
            <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] mb-4 flex items-center gap-2">
              💳 {t("moneyTitle")}
            </h2>
            <ul className="space-y-4 text-base text-[#61554D]">
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">💳 {t("cardsTitle")}</strong>
                {t("cardsBody")}
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">💵 {t("cashTitle")}</strong>
                {t("cashBody")}
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🏦 {t("atmTitle")}</strong>
                {t.rich("atmBody", bold)}
              </li>
            </ul>
          </div>

          {/* Section 3 - Getting Around */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm">
            <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] mb-4 flex items-center gap-2">
              🚇 {t("aroundTitle")}
            </h2>
            <ul className="space-y-4 text-base text-[#61554D]">
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚇 {t("tmoneyTitle")}</strong>
                {t("tmoneyBody")}
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚇 {t("subwayTitle")}</strong>
                {t("subwayBody")}
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚕 {t("taxiTitle")}</strong>
                {t.rich("taxiBody", bold)}
              </li>
            </ul>
          </div>
        </div>

        {/* Section 4 - FAQ */}
        <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 sm:p-12 shadow-sm">
          <h2 className="text-3xl font-black text-[#2C2520] mb-8 pb-4 border-b border-[#FAF7F2] flex items-center gap-2">
            ❓ {t("faqTitle")}
          </h2>
          <div className="space-y-8 divide-y divide-[#E6DFD5]">
            {faqs.map((faq, idx) => (
              <div key={idx} className={idx > 0 ? "pt-6" : ""}>
                <h3 className="text-lg sm:text-xl font-black text-[#2C2520] mb-2.5">
                  {t("qPrefix")} {faq.q}
                </h3>
                <p className="text-base sm:text-lg text-[#61554D] leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          <p className="font-bold tracking-wide">
            {tAbout("footerNote")}
          </p>
        </div>
      </footer>
    </div>
  );
}

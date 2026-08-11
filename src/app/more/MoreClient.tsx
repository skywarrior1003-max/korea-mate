// More — 보조 정보 허브.
//
// 이 화면은 언어 선택 화면이 아니다. 언어는 전역 모바일 헤더의
// <LanguageSwitcher variant="icon" /> 이 담당한다.
//
// 시안(more_support_settings)에서 시각 언어만 가져온다. 시안의 Currency ·
// App Theme · 24/7 Live Assistance · v2.4.0 · Privacy · Terms 는 이 제품에
// 존재하지 않는 기능이라 행을 만들지 않는다. 눌러도 아무 데도 가지 않는
// 줄을 늘어놓는 것이 "설정 화면처럼 보이는 것"보다 나쁘다.
//
// 에디토리얼 헤더(About·Blog·Survival Guide 와 같은 계열)를 쓴다. 좁은
// 화면에서 상단 텍스트 nav 를 접은 대신, 그 링크들이 도착하는 곳이 바로
// 이 화면이다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

/** 아이콘은 이 저장소가 쓰는 방식 그대로 인라인 SVG · currentColor 다 */
const ICON = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

const CHEVRON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-[#B7AC9E]"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

function Row({ href, icon, label, desc }: {
  href: string; icon: React.ReactNode; label: string; desc: string;
}) {
  return (
    <Link
      href={href}
      className="gkm-focus flex items-center gap-4 px-5 min-h-16 py-4 hover:bg-[#F3EEE3] transition-colors"
    >
      <span aria-hidden className="shrink-0 w-11 h-11 rounded-2xl bg-[#F3EEE3] text-[#8C6239] inline-flex items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-black text-[#2C2520] leading-snug">{label}</span>
        <span className="block text-[13px] text-[#61554D] mt-0.5 leading-snug">{desc}</span>
      </span>
      {CHEVRON}
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="px-1 mb-2 text-[12px] font-black uppercase tracking-[0.12em] text-[#8C6239]">{title}</h2>
      <div className="rounded-3xl bg-white border border-[#E6DFD5] overflow-hidden divide-y divide-[#E6DFD5]">
        {children}
      </div>
    </section>
  );
}

export default function MoreClient() {
  const t = useTranslations("more");
  const tShell = useTranslations("shell");
  const tNav = useTranslations("nav");
  const tAbout = useTranslations("about");
  const tFooter = useTranslations("footer");

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="gkm-focus text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
            {/* 브랜드는 어느 언어에서도 소문자 gokoreamate 다 — 번역하지 않는다 */}
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <LanguageSwitcher variant="icon" className="text-[#2C2520]" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <h1 className="text-4xl font-black tracking-tight leading-tight">{tShell("more")}</h1>
        <p className="mt-2 mb-8 text-[15px] text-[#61554D] leading-relaxed">{t("subtitle")}</p>

        <Group title={t("groupInfo")}>
          <Row
            href="/about/"
            label={tNav("about")}
            desc={t("aboutDesc")}
            icon={<svg {...ICON} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5v.01" /></svg>}
          />
          <Row
            href="/blog/"
            label={tNav("blog")}
            desc={t("blogDesc")}
            icon={<svg {...ICON} aria-hidden><path d="M5 4.5h11l3 3V19a1 1 0 01-1 1H5a1 1 0 01-1-1V5.5a1 1 0 011-1z" /><path d="M8 10h8M8 14h5" /></svg>}
          />
          <Row
            href="/survival-guide/"
            label={tNav("survivalGuide")}
            desc={t("guideDesc")}
            icon={<svg {...ICON} aria-hidden><path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5z" /><path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z" /></svg>}
          />
        </Group>

        <Group title={t("groupSupport")}>
          {/* 문의는 실제로 /about 안의 ContactSection 이다. 죽은 route 를 새로
              만들지 않고 그 자리로 바로 보낸다. */}
          <Row
            href="/about/#contact"
            label={tAbout("contactTitle")}
            desc={t("contactDesc")}
            icon={<svg {...ICON} aria-hidden><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>}
          />
        </Group>
      </main>

      <footer className="border-t border-[#E6DFD5] py-8 px-4 text-center text-sm text-[#8C6239]">
        <p>{tFooter("copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}

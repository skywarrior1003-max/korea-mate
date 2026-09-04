"use client";

// PLANNER-SPOTS-SEPARATION-V1: Home 은 이제 Cover→Floor(검색·5도시·제한된
// 추천)만 갖는다 — Owner 결정으로 #planner 는 /planner route 로 분리했고
// #spots-main 대량 디렉토리는 제거했다(발견은 Search·City Hub·Explore 담당).
// 예전 이 파일에 있던 플래너 폼·draft·clone 처리는 전부
// src/app/planner/PlannerClient.tsx 로 옮겨졌다 — 동작은 그대로다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import AdBanner from "@/components/AdBanner";
import ContactModal from "@/components/ContactModal";
import PreOpenNotice from "@/components/PreOpenNotice";
import QuietHome from "@/components/quiet/QuietHome";

export default function HomeClient() {
  const tn = useTranslations("nav");
  const th = useTranslations("homeUi");
  const tFooter = useTranslations("footer");
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);

  // ── legacy deep-link 호환 ────────────────────────────────────────────────
  //
  // 플래너가 Home 섹션이던 시절의 진입 계약을 조용히 승계한다:
  //   /#planner            → /planner
  //   /?city=slug#planner  → /planner?city=slug (도시 판정은 PlannerClient 의
  //                          기존 resolveCityParam 이 그대로 한다)
  //   /?ref=clone&from=…   → /planner?ref=clone&from=… (clone 복원도 그쪽)
  // 새 query 계약은 만들지 않는다 — 기존 파라미터를 그대로 넘길 뿐이다.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (window.location.hash === "#planner" || p.get("city") || p.get("ref") === "clone") {
      router.replace(`/planner${window.location.search}`);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans antialiased overflow-x-clip">

      {/* ── 네비게이션 ──────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <Link href="/" className="text-lg sm:text-xl font-normal text-gray-900 flex items-center gap-1 sm:gap-1.5 shrink min-w-0">
            <span className="font-black tracking-tight">gokoreamate</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 lg:gap-8">
            <Link href="/blog"           className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("blog")}</Link>
            <Link href="/restaurants"    className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("foodGuide")}</Link>
            <Link href="/survival-guide" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("survivalGuide")}</Link>
            <Link href="/about"          className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("about")}</Link>
            <Link href="/my-trips"       className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">{tn("myTrips")}</Link>
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            {/* 플래너 분리 후 CTA 는 스크롤이 아니라 /planner 로 간다 */}
            <Link
              href="/planner"
              className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#0041c8" }}
            >
              {tn("planMyTrip")}
            </Link>
          </nav>
          {/* 모바일 헤더 — 로고 + 아이콘 두 개. 검색 아이콘은 예전 #spots-main
              스크롤 대신 최종 검색 계약인 Anchored Inline Search 에 focus 한다. */}
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <LanguageSwitcher variant="icon" className="text-gray-700" />
            <button
              onClick={() => document.getElementById("qh-global-search")?.focus()}
              aria-label={th("searchPlaces")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700 cursor-pointer"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
              </svg>
            </button>
            <Link
              href="/my-trips"
              aria-label={tn("myTrips")}
              className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full text-gray-700"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden
                   stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="7.5" width="17" height="12.5" rx="2.4" />
                <path d="M9 7.5V6a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 6v1.5" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Quiet Travel Editorial — 최종 Home(Cover→Floor). */}
      <QuietHome />

      {/* AdBanner — 수익 surface. ID 없으면 null 렌더 */}
      <div className="max-w-4xl mx-auto w-full px-4 py-8">
        <AdBanner />
      </div>

      {/* ── 푸터 ────────────────────────────────────────────────── */}
      <footer className="py-12 px-4" style={{ backgroundColor: "#111827" }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <span className="text-xl font-normal text-white flex items-center gap-1.5">
              <span className="font-black tracking-tight">gokoreamate</span>
            </span>
            <div className="flex items-center gap-6">
              <Link href="/blog"           className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("blog")}</Link>
              <Link href="/survival-guide" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("survivalGuide")}</Link>
              <Link href="/about"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("about")}</Link>
              <button
                onClick={() => setContactOpen(true)}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                {tn("contact")}
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center sm:text-right leading-relaxed">
              {th("footerData")}<br />{th("footerAi")}
            </p>
          </div>
          <div className="border-t border-white/5 pt-6 text-center">
            <p className="text-xs text-gray-600">{tFooter("copyright", { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
      {/* 정식 오픈 전 안내 — session 당 한 번, Home 첫 진입 (Owner 결정 2026-09-01) */}
      <PreOpenNotice />
    </div>
  );
}

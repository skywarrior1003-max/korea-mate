"use client";

// PLANNER-SPOTS-SEPARATION-V1: Home 은 이제 Cover→Floor(검색·5도시·제한된
// 추천)만 갖는다 — Owner 결정으로 #planner 는 /planner route 로 분리했고
// #spots-main 대량 디렉토리는 제거했다(발견은 Search·City Hub·Explore 담당).
// 예전 이 파일에 있던 플래너 폼·draft·clone 처리는 전부
// src/app/planner/PlannerClient.tsx 로 옮겨졌다 — 동작은 그대로다.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import AdBanner from "@/components/AdBanner";
import ContactModal from "@/components/ContactModal";
import PreOpenNotice from "@/components/PreOpenNotice";
import QuietHome from "@/components/quiet/QuietHome";
import JourneyCoach from "@/components/JourneyCoach";

// hasTrip 로컬 신호 — 페이지 수명 동안 갱신 이벤트가 없는 일회성 판정이라
// 구독은 no-op 이다. snapshot 은 원시값(boolean|undefined)이라 캐시 없이 안정.
const subscribeHasTrip = () => () => {};
function readHasTrip(): boolean | undefined {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)?.startsWith("koreamate_itin3_id_")) return true;
    }
    return false;
  } catch { return undefined; }
}
const readHasTripServer = (): boolean | undefined => undefined;

export default function HomeClient() {
  const tn = useTranslations("nav");
  const th = useTranslations("homeUi");
  const tFooter = useTranslations("footer");
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);
  // §7 — 사전 오픈 sheet 가 열려 있는 동안 튜토리얼 coach 를 미룬다(동시 노출 0)
  const [preOpenSheetOpen, setPreOpenSheetOpen] = useState(false);

  // TUTORIAL-V1 Chapter A — 이 기기에 여행이 하나라도 있으면 "여행 시작" 장은
  // 지나간 것이다. 판정은 로컬 신호뿐(계정 없는 device 구조 그대로 — 네트워크 0).
  // LINT-HOTFIX-V1: effect 내 동기 setState 대신 useSyncExternalStore — 서버
  // snapshot 은 undefined 라 hydration 은 기존과 동일하게 안전하고, 값 판정
  // 시점(hydration 직후)도 그대로다.
  const hasTrip = useSyncExternalStore(subscribeHasTrip, readHasTrip, readHasTripServer);

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
            {/* 상단 Trips 아이콘 제거(디자인 SSOT §5 헤더): 하단 BottomNav Trips 와
                기능 중복이라 global nav 를 상단에서 반복하지 않는다. */}
          </div>
        </div>
      </header>

      {/* Quiet Travel Editorial — 최종 Home(Cover→Floor). */}
      {/* TUTORIAL-V1 §3 Chapter A 시작 — 발견을 가리키는 첫 coach.
          §7 — 사전 오픈 안내 sheet 가 열려 있는 동안은 그리지 않는다: 두 안내가
          같은 화면에 겹치지 않고, sheet 를 닫은 뒤 튜토리얼이 시작된다. */}
      {hasTrip === false && !preOpenSheetOpen && (
        <div className="max-w-xl mx-auto px-4 pt-4">
          {/* V2 — 실제 도시 링크를 눌러야 완료(알겠어요는 닫기만) */}
          <JourneyCoach step="discover" ctx={{ hasTrip }} complete={{ on: "click", selector: 'a[href^="/city/"]' }} />
        </div>
      )}
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
              <Link href="/privacy"        className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("privacy")}</Link>
              <Link href="/terms"          className="text-sm font-semibold text-gray-400 hover:text-white transition-colors">{tn("terms")}</Link>
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
      <PreOpenNotice onOpenChange={setPreOpenSheetOpen} />
    </div>
  );
}

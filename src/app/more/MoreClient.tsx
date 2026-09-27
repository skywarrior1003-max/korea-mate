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

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import {
  readGuideState, writeGuideState, setGuideEnabled, resetGuideSeen, emitGuideEvent,
} from "@/lib/journey-guide/guide-core";
import {
  getCurrentUser, signInWithGoogle, signOutAndReset, onAuthChange, type AuthUserView,
} from "@/lib/auth/auth-client";
import { fetchAuthStatus, activateAccount } from "@/lib/auth/consent-client";
import ConsentSheet from "@/components/auth/ConsentSheet";

/** 로그인 상태 영역 (V2-MINIMAL-GOOGLE-AUTH-V1 §12 + CONSENT-V1 §G) — More 최소 진입점.
 *  이메일 전체를 노출하지 않고, Google 프로필 이미지는 쓰지 않는다(외부 이미지
 *  추적·깨짐 여지). AI 사용 가능을 약속하는 문구·잔여 횟수·크레딧 표시는 없다.
 *
 *  CONSENT-V1: session 존재 ≠ active. session 이 있으면 서버 status 로 활성
 *  여부를 확인하고, 확인 전에는 이름 등 계정 정보를 표시하지 않는다(§G).
 *  미동의(inactive)면 재동의 sheet → intent → activate (재-OAuth 불필요). */
function AccountSection() {
  const tAuth = useTranslations("auth");
  const [user, setUser] = useState<AuthUserView | null>(null);
  const [activation, setActivation] = useState<"none" | "checking" | "active" | "inactive">("none");
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reconsent, setReconsent] = useState(false); // sheet 성공 후 OAuth 대신 activate
  // callback 실패 복귀 안내(?auth=…) — 렌더 시점에 1회 읽는다(PII 없는 사유 코드).
  // effect 내 동기 setState 를 피하고, URL 정리는 아래 effect 가 담당한다.
  const [callbackError, setCallbackError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const r = new URL(window.location.href).searchParams.get("auth");
      return r === "consent_required" || r === "consent_expired" || r === "link_conflict" ? r : null;
    } catch { return null; }
  });

  const refreshActivation = async () => {
    setActivation("checking");
    const s = await fetchAuthStatus();
    setActivation(s.state === "active" ? "active" : "inactive");
  };

  useEffect(() => {
    let alive = true;
    // ?auth=… 사유 코드는 초기 state 가 이미 읽었다 — 여기서는 URL 만 정리
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("auth")) {
        url.searchParams.delete("auth");
        window.history.replaceState({}, "", url.pathname + (url.search || ""));
      }
    } catch { /* URL 정리는 최선 노력 */ }
    void getCurrentUser().then(u => {
      if (!alive) return;
      setUser(u);
      if (u) void refreshActivation();
    });
    const off = onAuthChange(u => {
      if (!alive) return;
      setUser(u);
      if (u) void refreshActivation(); else setActivation("none");
    });
    return () => { alive = false; off(); };
  }, []);

  const startConsent = (isReconsent: boolean) => {
    setReconsent(isReconsent);
    setCallbackError(null);
    setSheetOpen(true);
  };

  return (
    <section className="mb-8">
      <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#8A7D72] mb-3">{tAuth("accountGroup")}</h2>
      <div className="rounded-2xl border border-[#E6DFD5] bg-white px-5 py-4">
        {user && activation === "active" ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-black text-[#2C2520]">{user.displayName ?? tAuth("signedInFallback")}</p>
              <p className="text-[12px] text-[#61554D] mt-0.5">{tAuth("signedInHint")}</p>
              <p className="text-[12px] text-[#61554D] mt-0.5">{tAuth("accountLinkedHint")}</p>
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                const r = await signOutAndReset(); // §9 — 성공 시 reload, 실패 시 초기화하지 않는다
                if (!r.ok) setBusy(false);
              }}
              disabled={busy}
              className="gkm-focus px-4 py-2 rounded-xl border border-[#E6DFD5] text-[13px] font-bold text-[#2C2520] disabled:opacity-50"
            >
              {tAuth("signOut")}
            </button>
          </div>
        ) : user && activation === "checking" ? (
          // 활성 확인 중 — 계정 정보(이름)를 먼저 그리지 않는다(§G)
          <p className="text-[13px] text-[#61554D]">{tAuth("statusChecking")}</p>
        ) : user ? (
          // session 은 있으나 현재 버전 동의 없음 — 재동의로 활성화(§G-7)
          <div>
            <p className="text-[13px] font-bold text-[#2C2520] mb-1">{tAuth("consentRequiredNotice")}</p>
            <p className="text-[12px] text-[#61554D] mb-3">{tAuth("aiLoginKeepsTrips")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => startConsent(true)}
                className="gkm-focus px-4 py-2 rounded-xl bg-[#2C2520] text-white text-[13px] font-bold"
              >
                {tAuth("consentReconsent")}
              </button>
              <button
                onClick={async () => {
                setBusy(true);
                const r = await signOutAndReset(); // §9 — 성공 시 reload, 실패 시 초기화하지 않는다
                if (!r.ok) setBusy(false);
              }}
                disabled={busy}
                className="gkm-focus px-4 py-2 rounded-xl border border-[#E6DFD5] text-[13px] font-bold text-[#2C2520] disabled:opacity-50"
              >
                {tAuth("signOut")}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {callbackError && (
              <p className="text-[12px] font-bold text-[#B3261E] mb-2">
                {callbackError === "consent_expired" ? tAuth("consentExpired")
                  : callbackError === "link_conflict" ? tAuth("consentLinkConflict")
                  : tAuth("consentRequiredNotice")}
              </p>
            )}
            <p className="text-[13px] text-[#61554D] mb-3">{tAuth("aiLoginKeepsTrips")}</p>
            <button
              onClick={() => startConsent(false)}
              disabled={busy}
              className="gkm-focus px-4 py-2 rounded-xl bg-[#2C2520] text-white text-[13px] font-bold disabled:opacity-50"
            >
              {busy ? tAuth("signingIn") : tAuth("googleContinue")}
            </button>
          </div>
        )}
      </div>
      <ConsentSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onProceed={async () => {
          if (reconsent) {
            // session 보유 — OAuth 재시작 없이 intent cookie 로 곧장 활성화
            const r = await activateAccount();
            setSheetOpen(false);
            if (r.state === "active") setActivation("active");
            return;
          }
          setBusy(true);
          const r = await signInWithGoogle("/more");
          if (!r.ok) { setBusy(false); setSheetOpen(false); }
          // 성공이면 페이지가 Google 로 이동한다
        }}
      />
    </section>
  );
}

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

  // First Trip Journey Guide 설정 — 상태는 이 기기(localStorage)뿐이다
  const [tipsOn, setTipsOn] = useState(true);
  const [replayed, setReplayed] = useState(false);
  useEffect(() => { setTipsOn(readGuideState().enabled); }, []);
  const toggleTips = () => {
    const next = !tipsOn;
    setTipsOn(next);
    writeGuideState(setGuideEnabled(readGuideState(), next));
  };
  const replayTips = () => {
    writeGuideState(setGuideEnabled(resetGuideSeen(readGuideState()), true));
    setTipsOn(true);
    setReplayed(true);
    emitGuideEvent("tutorial_replayed", {});
  };

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

        <AccountSection />

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
          <Row
            href="/privacy/"
            label={tNav("privacy")}
            desc={t("privacyDesc")}
            icon={<svg {...ICON} aria-hidden><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /></svg>}
          />
          <Row
            href="/terms/"
            label={tNav("terms")}
            desc={t("termsDesc")}
            icon={<svg {...ICON} aria-hidden><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h5" /><path d="M10 17h5" /></svg>}
          />
        </Group>

        {/* First Trip Journey Guide — 팁 ON/OFF · 다시 보기 (Owner 확정) */}
        <Group title={t("groupTips")}>
          <div className="flex items-center gap-4 px-5 min-h-16 py-4">
            <span aria-hidden className="shrink-0 w-11 h-11 rounded-2xl bg-[#FFF0EB] text-[#FF4A2D] inline-flex items-center justify-center">
              <svg {...ICON} aria-hidden><path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M18.4 5.6L17 7M21 12h-2" /><path d="M9.5 18h5M10.5 21h3M8.5 14.5a4.5 4.5 0 117 0c-.8.8-1.5 1.6-1.5 2.5h-4c0-.9-.7-1.7-1.5-2.5z" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-black text-[#2C2520] leading-snug">{t("tipsToggle")}</span>
              <span className="block text-[13px] text-[#61554D] mt-0.5 leading-snug">{t("tipsDesc")}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={tipsOn}
              onClick={toggleTips}
              className="gkm-focus relative shrink-0 w-12 h-7 rounded-full transition-colors"
              style={{ backgroundColor: tipsOn ? "#FF4A2D" : "#D9D2C7" }}
            >
              <span
                className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all"
                style={{ left: tipsOn ? "calc(100% - 1.625rem)" : "0.125rem" }}
              />
            </button>
          </div>
          <button
            type="button"
            onClick={replayTips}
            className="gkm-focus w-full text-left flex items-center gap-4 px-5 min-h-16 py-4 hover:bg-[#F3EEE3] transition-colors"
          >
            <span aria-hidden className="shrink-0 w-11 h-11 rounded-2xl bg-[#FFF0EB] text-[#FF4A2D] inline-flex items-center justify-center">
              <svg {...ICON} aria-hidden><path d="M3.5 8a8.5 8.5 0 111.2 8" /><path d="M3.5 3.5V8H8" /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-black text-[#2C2520] leading-snug">{t("tipsReplay")}</span>
              <span className="block text-[13px] text-[#61554D] mt-0.5 leading-snug">
                {replayed ? t("tipsReplayDone") : t("tipsReplayDesc")}
              </span>
            </span>
            {CHEVRON}
          </button>
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

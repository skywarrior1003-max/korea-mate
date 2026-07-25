// S1 — 전역 모바일 BottomNav 셸.
// Saved 카운트는 favorites localStorage 실측치만 사용 (no invented counts).
// 관리자 화면에서는 표시하지 않는다. 데스크톱 TopNav는 신규 페이지(/saved·/place)에서
// 개별 렌더 — 기존 페이지 자체 헤더와 중복 방지 (S2에서 통일 예정).

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import { getFavorites, FAVORITES_EVENT } from "@/lib/favorites";

export default function NavShell() {
  const pathname = usePathname();
  const [savedCount, setSavedCount] = useState(0);
  // Suspense 내부의 번역 텍스트는 지연 hydration 중 locale 전환(en→브라우저 언어)과
  // 레이스가 발생해 텍스트 mismatch를 던진다 → 마운트 후에만 nav를 렌더한다.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setSavedCount(getFavorites().length);
    sync();
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_EVENT, sync);
  }, []);

  if (pathname.startsWith("/korea-mate-admin")) return null;

  return (
    <>
      {/* fixed nav에 가려지는 콘텐츠 방지용 스페이서 (모바일 전용, 정적 — SSR 안전) */}
      <div aria-hidden className="h-16 md:hidden shrink-0" />
      {mounted && <BottomNav savedCount={savedCount} />}
    </>
  );
}

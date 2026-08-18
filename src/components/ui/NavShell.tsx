// S1 — 전역 모바일 BottomNav 셸.
// 배지 카운트는 Selected(cart) localStorage 실측치만 사용 (no invented counts).
// 관리자 화면에서는 표시하지 않는다. 데스크톱 TopNav는 신규 페이지(/saved·/place)에서
// 개별 렌더 — 기존 페이지 자체 헤더와 중복 방지 (S2에서 통일 예정).

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import { getCart, CART_EVENT } from "@/lib/cart";
import { STORY_MODE_ATTR } from "@/components/story/StoryNavHide";

export default function NavShell() {
  const pathname = usePathname();
  const [selectedCount, setSelectedCount] = useState(0);
  /**
   * 공개 Story 가 떠 있는가.
   *
   * Story 는 `/shared` 안의 상태라 경로만으로는 가릴 수 없다. 같은 주소에서
   * 공개한 기억이 있으면 Story 로, 없으면 기존 공유 화면으로 갈린다. 경로로
   * 통째 숨기면 기억이 없는 기존 공유 화면까지 하단 메뉴를 잃는다.
   * 그래서 Story 쪽이 남기는 표시만 본다(`StoryNavHide`).
   */
  const [storySurface, setStorySurface] = useState(false);
  // Suspense 내부의 번역 텍스트는 지연 hydration 중 locale 전환(en→브라우저 언어)과
  // 레이스가 발생해 텍스트 mismatch를 던진다 → 마운트 후에만 nav를 렌더한다.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const el = document.documentElement;
    const readStory = () => setStorySurface(el.hasAttribute(STORY_MODE_ATTR));
    readStory();
    // Story 는 데이터를 받은 뒤에 켜진다 — 그 순간을 놓치지 않게 지켜본다
    const obs = new MutationObserver(readStory);
    obs.observe(el, { attributes: true, attributeFilter: [STORY_MODE_ATTR] });
    const sync = () => setSelectedCount(getCart().length);
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => {
      obs.disconnect();
      window.removeEventListener(CART_EVENT, sync);
    };
  }, []);

  if (pathname.startsWith("/korea-mate-admin")) return null;
  // 공개 Story 는 바깥 사람이 보는 독립 화면이다 — 앱 메뉴가 낄 자리가 아니다.
  if (storySurface) return null;

  return (
    <>
      {/* fixed nav에 가려지는 콘텐츠 방지용 스페이서 (모바일 전용, 정적 — SSR 안전) */}
      <div aria-hidden className="h-16 md:hidden shrink-0" />
      {mounted && <BottomNav selectedCount={selectedCount} />}
    </>
  );
}

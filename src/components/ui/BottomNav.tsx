// GoKoreaMate UI 기반 — 모바일 하단 5-탭 내비 셸
// Home · Explore · Picks(count badge) · Trips · More
// More 는 /more 보조 정보 허브다 — 예전엔 /about 글로 바로 떨어져서
// Blog·Survival Guide 가 좁은 화면에서 갈 곳이 없었다.
// 배지는 Selected(cart) 개수다. Saved 개수가 아니다 — 사용자가 다음에 할 일
// (일정 만들기)에 직접 연결된 숫자만 배지로 보여준다.
// 라벨은 i18n shell.* — 4개 언어 확장 대응(고정폭 금지, truncate 금지).
//
// 활성 색은 토큰(--gkm-action-primary) 하나를 따른다. 예전엔 Home 만 파랑이고
// 나머지는 코랄이라 같은 내비가 화면마다 다른 색이었다.
//
// 아이콘은 인라인 SVG 다. 예전엔 이모지(🏠🧭🔖🧳☰)를 썼는데 기기·OS 마다
// 모양과 색이 제각각이라 화면 톤이 흔들렸다. 시안 자산에도 아이콘 스프라이트가
// 있었지만 투명 배경이 체커보드로 구워진 JPEG 라 쓸 수 없어 직접 그렸다.
// currentColor 를 쓰므로 활성/비활성 색이 글자와 항상 같이 간다.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export interface BottomNavProps {
  selectedCount?: number; // 실측치만 — 없으면 배지 미표시 (no invented counts)
}

/** 24x24 그리드, stroke 기반. 채우기를 쓰지 않아 얇은 인상을 유지한다 */
const ICON: Record<string, React.ReactNode> = {
  home:    <><path d="M4 10.5L12 4l8 6.5" /><path d="M6 9.8V19a1 1 0 001 1h10a1 1 0 001-1V9.8" /></>,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="M15.4 8.6l-2.1 4.7-4.7 2.1 2.1-4.7z" /></>,
  picks:   <><path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-3.4L5.5 20V5.5a1 1 0 011-1z" /></>,
  trips:   <><rect x="3.5" y="7.5" width="17" height="12.5" rx="2.4" /><path d="M9 7.5V6a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 6v1.5" /></>,
  more:    <><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></>,
};

const TABS = [
  { key: "home",    href: "/" },
  { key: "explore", href: "/explore/busan" },
  { key: "picks",   href: "/picks" },
  { key: "trips",   href: "/my-trips" },
  { key: "more",    href: "/more" },
] as const;

export default function BottomNav({ selectedCount }: BottomNavProps) {
  const t = useTranslations("shell");
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line flex md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(tab => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href.split("/").slice(0, 2).join("/"));
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`gkm-focus relative flex-1 flex flex-col items-center justify-center gap-1 min-h-15 py-2 ${
              active ? "text-action" : "text-faint"
            }`}
          >
            <svg
              width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden
              stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}
              strokeLinecap="round" strokeLinejoin="round"
            >
              {ICON[tab.key]}
            </svg>
            <span className={`text-[10.5px] leading-tight ${active ? "font-black" : "font-medium"}`}>
              {t(tab.key)}
            </span>
            {tab.key === "picks" && typeof selectedCount === "number" && selectedCount > 0 && (
              <span className="absolute top-1 right-[22%] min-w-4 h-4 px-1 rounded-full bg-action text-white text-[10px] font-bold flex items-center justify-center">
                {selectedCount > 99 ? "99+" : selectedCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

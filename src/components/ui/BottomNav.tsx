// GoKoreaMate UI 기반 — 모바일 하단 5-탭 내비 셸 (handoff §1 IA)
// Home · Explore · My Trip · Saved(count badge) · More
// S0에서는 어떤 페이지에도 마운트하지 않는다 — S1+에서 layout에 채택.
// 라벨은 i18n shell.* — 4개 언어 확장 대응(고정폭 금지, truncate 금지).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export interface BottomNavProps {
  savedCount?: number; // 실측치만 — 없으면 배지 미표시 (no invented counts)
}

const TABS = [
  { key: "home",    href: "/",         icon: "🏠" },
  { key: "explore", href: "/explore/busan", icon: "🧭" },
  { key: "myTrip",  href: "/my-trips", icon: "🧳" },
  { key: "saved",   href: "/saved",    icon: "🔖" },
  { key: "more",    href: "/about",    icon: "☰" },
] as const;

export default function BottomNav({ savedCount }: BottomNavProps) {
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
            className={`gkm-focus relative flex-1 flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 ${
              active ? "text-action" : "text-faint"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[10.5px] font-medium leading-tight">{t(tab.key)}</span>
            {tab.key === "saved" && typeof savedCount === "number" && savedCount > 0 && (
              <span className="absolute top-1 right-[22%] min-w-4 h-4 px-1 rounded-full bg-action text-white text-[10px] font-bold flex items-center justify-center">
                {savedCount > 99 ? "99+" : savedCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

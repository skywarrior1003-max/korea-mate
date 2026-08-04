// GoKoreaMate UI 기반 — 데스크톱 상단 내비 셸 (모바일 탭의 literal copy 금지)
// logo · Explore · Picks(count badge) · Trips · More
// 배지는 BottomNav 와 같은 Selected(cart) 개수다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";

export interface TopNavProps {
  selectedCount?: number; // 실측치만
}

export default function TopNav({ selectedCount }: TopNavProps) {
  const t = useTranslations("shell");

  return (
    <header className="hidden md:block bg-surface border-b border-line sticky top-0 z-40">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="gkm-focus text-xl font-normal text-ink flex items-center gap-1.5">
          <span className="font-black tracking-tight">gokoreamate</span>
        </Link>
        <nav aria-label="Primary desktop" className="flex items-center gap-6">
          <Link href="/explore/busan/" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("explore")}
          </Link>
          <Link href="/picks/" className="gkm-focus relative text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("picks")}
            {typeof selectedCount === "number" && selectedCount > 0 && (
              <span className="ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full bg-action text-white text-[10px] font-bold items-center justify-center align-middle">
                {selectedCount > 99 ? "99+" : selectedCount}
              </span>
            )}
          </Link>
          <Link href="/my-trips/" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("trips")}
          </Link>
          <Link href="/about/" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("more")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}

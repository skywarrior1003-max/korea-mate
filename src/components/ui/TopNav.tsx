// GoKoreaMate UI 기반 — 데스크톱 상단 내비 셸 (handoff §1: 모바일 탭의 literal copy 금지)
// logo · Explore · My Trip · Saved · More — S0에서는 마운트하지 않는다.

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";

export interface TopNavProps {
  savedCount?: number; // 실측치만
}

export default function TopNav({ savedCount }: TopNavProps) {
  const t = useTranslations("shell");

  return (
    <header className="hidden md:block bg-surface border-b border-line sticky top-0 z-40">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="gkm-focus text-xl font-normal text-ink flex items-center gap-1.5">
          <span aria-hidden className="text-2xl">🇰🇷</span>
          go<span className="font-extrabold">korea</span>mate
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-6">
          <Link href="/explore/busan" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("explore")}
          </Link>
          <Link href="/my-trips" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("myTrip")}
          </Link>
          <Link href="/saved" className="gkm-focus relative text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("saved")}
            {typeof savedCount === "number" && savedCount > 0 && (
              <span className="ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full bg-action text-white text-[10px] font-bold items-center justify-center align-middle">
                {savedCount > 99 ? "99+" : savedCount}
              </span>
            )}
          </Link>
          <Link href="/about" className="gkm-focus text-sm font-semibold text-sub hover:text-ink transition-colors">
            {t("more")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}

// GoKoreaMate UI 기반 — Badge (design-system.md §1 badge taxonomy)
// 카드당 최대 1개. 색상군은 의미 고정:
//   blue = source(Official) · green/amber = editorial · coral = behavioral(실측 수치+동사 필수) · violet = K-POP
// coral behavioral 배지는 실측 카운트가 없으면 렌더하지 않는 것이 규칙 — 호출부 책임.

import type { ReactNode } from "react";

export type BadgeKind = "source" | "editorial" | "editorial-warm" | "behavioral" | "kpop";

const KIND_CLASS: Record<BadgeKind, string> = {
  source:          "bg-official-tint text-official",
  editorial:       "bg-ok-tint text-ok",
  "editorial-warm": "bg-warn-tint text-warn",
  behavioral:      "bg-action-tint text-action",
  kpop:            "bg-kpop-tint text-kpop",
};

interface BadgeProps {
  kind: BadgeKind;
  children: ReactNode;
  className?: string;
}

export default function Badge({ kind, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${KIND_CLASS[kind]} ${className}`}
    >
      {children}
    </span>
  );
}

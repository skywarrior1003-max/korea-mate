// GoKoreaMate UI 기반 — SectionHeader (type.title.section 18–20px/700)

import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  action?: ReactNode; // 우측 quiet 액션 (예: "See all" 링크)
  className?: string;
}

export default function SectionHeader({ title, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-4 mb-4 ${className}`}>
      <h2 className="text-lg font-bold text-ink" style={{ textWrap: "balance" }}>{title}</h2>
      {action && <div className="shrink-0 text-sm text-sub">{action}</div>}
    </div>
  );
}

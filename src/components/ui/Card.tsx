// GoKoreaMate UI 기반 — Card surface (design-system.md §3)
// radius-card(16px) + shadow-card 1단계 + line border.

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-card border border-line shadow-card overflow-hidden ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

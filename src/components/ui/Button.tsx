// GoKoreaMate UI 기반 — Button (design-system.md §4 Buttons)
// 규칙: primary(coral)는 화면당 1개. 모든 변형 min-height 44px (터치 영역).
// 토큰만 참조 — 원시 hex 금지.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ink" | "tint" | "outline" | "text";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-action text-white hover:bg-action-hover shadow-cta",
  ink:     "bg-ink text-white hover:opacity-90",
  tint:    "bg-action-tint text-action hover:bg-action-tint/80",
  outline: "bg-surface text-ink border border-line hover:border-faint",
  text:    "bg-transparent text-sub hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export default function Button({
  variant = "outline",
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const base =
    "gkm-focus inline-flex items-center justify-center gap-1.5 min-h-11 px-4 " +
    "rounded-control text-sm font-semibold transition-colors cursor-pointer " +
    "disabled:cursor-not-allowed disabled:shadow-none disabled:bg-surface-dim disabled:text-[var(--gkm-disabled-text)]";
  return (
    <button
      className={`${base} ${VARIANT_CLASS[variant]} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

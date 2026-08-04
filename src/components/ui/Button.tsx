// GoKoreaMate UI 기반 — Button (design-system.md §4 Buttons)
// 규칙: primary 는 화면당 1개. 모든 변형 min-height 44px (터치 영역).
// 토큰만 참조 — 원시 hex 금지. primary 는 시안 파랑(--gkm-action-primary).
//
// 버튼 안에 이모지를 넣지 않는다. 아이콘이 필요하면 SVG 를 children 으로 준다.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary" | "secondary" | "ghost" | "outline" | "destructive" | "icon"
  /** 기존 화면이 쓰고 있는 이름 — 지우면 전부 깨진다 */
  | "ink" | "tint" | "text";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:     "bg-action text-white hover:bg-action-hover shadow-cta",
  secondary:   "bg-action-tint text-action hover:bg-action-tint/70",
  ghost:       "bg-transparent text-action hover:bg-action-tint",
  outline:     "bg-surface text-ink border border-line hover:border-faint",
  destructive: "bg-error text-white hover:opacity-90",
  icon:        "bg-transparent text-sub hover:text-ink min-w-11 px-0",
  // 별칭 — 기존 호출부 호환
  ink:  "bg-ink text-white hover:opacity-90",
  tint: "bg-action-tint text-action hover:bg-action-tint/70",
  text: "bg-transparent text-sub hover:text-ink",
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

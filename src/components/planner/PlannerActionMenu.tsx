"use client";

// 일정 화면의 보조 액션 메뉴 (TASK-MY-TRIP-PLANNING-FINAL-V1).
//
// 공개/비공개 · 링크 복사 · 공유 카드 · 순간 기록 · 일정 편집 · 홈 — 전부 이미 있던 기능이다.
// 시안은 일정이 주인공이라 이 버튼들을 커버 아래 한 줄로 펼치지 않는다. 기능은 하나도 빼지 않고
// 한 개의 "더보기" 로 접는다. 열면 목록, 항목을 고르거나 ESC·바깥을 누르면 닫힌다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface PlannerMenuItem {
  key:      string;
  label:    string;
  onClick?: () => void;
  href?:    string;
  disabled?: boolean;
  /** 강조(코랄) 항목 — 공유 카드처럼 다음 행동을 권하는 것 */
  accent?:  boolean;
}

interface Props {
  items:      PlannerMenuItem[];
  label:      string;
  closeLabel: string;
}

export default function PlannerActionMenu({ items, label, closeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(o => !o)}
        className="gkm-focus w-11 h-11 inline-flex items-center justify-center rounded-full border border-line bg-white text-ink hover:bg-surface-dim transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18.5" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-12 z-40 min-w-[220px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white shadow-modal py-1.5"
        >
          {visible.map(it => {
            const cls = `gkm-focus w-full text-left px-4 min-h-11 flex items-center text-sm font-bold transition-colors ${
              it.disabled ? "text-faint cursor-default" : it.accent ? "text-accent-coral hover:bg-surface-dim" : "text-ink hover:bg-surface-dim"
            }`;
            if (it.href && !it.disabled) {
              return (
                <Link key={it.key} role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>{it.label}</Link>
              );
            }
            return (
              <button
                key={it.key}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                className={cls}
                onClick={() => { setOpen(false); it.onClick?.(); }}
              >
                {it.label}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="gkm-focus w-full text-left px-4 min-h-11 flex items-center text-xs font-semibold text-sub border-t border-line mt-1"
          >
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

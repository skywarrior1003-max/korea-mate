// 전체 Day 빠른 선택 — 14일 이상 일정에서 3일 창만으로는 먼 날짜에 못 간다.
//
// 새 Day 편집 기능(추가·삭제·날짜 변경)은 만들지 않는다. 이동 전용이다.

"use client";

import { useEffect, useRef } from "react";

export interface DayOption {
  dayNumber: number;
  dateLabel: string;
  placeCount: number;
}

interface Props {
  open: boolean;
  days: DayOption[];
  currentDay: number;
  title: string;
  closeLabel: string;
  placesLabel: (n: number) => string;
  onSelect: (dayNumber: number) => void;
  onClose: () => void;
}

export default function DaySelectorDialog({
  open, days, currentDay, title, closeLabel, placesLabel, onSelect, onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // 열릴 때 현재 Day 로 focus 를 옮기고, 닫을 때 원래 버튼으로 되돌리는 일은
  // 호출부가 맡는다(트리거를 아는 쪽이 거기다). 여기서는 진입 focus 만 잡는다.
  useEffect(() => {
    if (!open) return;
    currentRef.current?.focus();
  }, [open]);

  // ESC 로 닫기 + focus 를 패널 안에 가둔다
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // 열려 있는 동안 배경 스크롤을 막는다
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center"
      style={{ backgroundColor: "rgba(19,27,46,0.45)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="w-full sm:w-[420px] sm:max-w-[92vw] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl
                   max-h-[72vh] sm:max-h-[70vh] flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#E5E7EA]">
          <h2 className="text-base font-black text-[#131b2e]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="gkm-focus w-10 h-10 -mr-2 inline-flex items-center justify-center rounded-full text-[#565D66] hover:text-[#131b2e]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* 14일 이상이어도 여기서 스크롤된다 */}
        <div className="overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-1">
            {days.map(d => {
              const active = d.dayNumber === currentDay;
              return (
                <li key={d.dayNumber}>
                  <button
                    type="button"
                    ref={active ? currentRef : undefined}
                    aria-current={active ? "true" : undefined}
                    onClick={() => { onSelect(d.dayNumber); onClose(); }}
                    className="gkm-focus w-full min-h-12 px-4 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors"
                    style={active
                      ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff" }
                      : { backgroundColor: "var(--gkm-action-tint)", color: "#131b2e" }}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-black shrink-0">Day {d.dayNumber}</span>
                      <span className={`text-xs truncate ${active ? "text-white/75" : "text-[#565D66]"}`}>
                        {d.dateLabel}
                      </span>
                    </span>
                    <span className={`text-[11px] font-bold shrink-0 ${active ? "text-white/75" : "text-[#565D66]"}`}>
                      {placesLabel(d.placeCount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

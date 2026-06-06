"use client";

import { useState, useRef, useEffect } from "react";

// Hardcoded English — never reads from browser locale
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface DatePickerProps {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  min?: string;           // "YYYY-MM-DD" — dates before this are disabled
  className?: string;
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayYMD(): string {
  const d = new Date();
  return toYMD(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDisplay(val: string): string {
  if (!val) return "";
  const [y, m, d] = val.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  min,
  className,
}: DatePickerProps) {
  const today = todayYMD();

  const initDate = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleSelect(day: number) {
    const ymd = toYMD(viewYear, viewMonth, day);
    if (min && ymd < min) return;
    onChange(ymd);
    setOpen(false);
  }

  // Build calendar grid
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const displayText = formatDisplay(value);

  return (
    <div ref={containerRef} className={`relative${className ? ` ${className}` : ""}`}>

      {/* ── Trigger button ─────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 flex items-center justify-between text-left transition-colors hover:border-orange-300"
        style={{ color: displayText ? "#111827" : "#9ca3af" }}
      >
        <span>{displayText || placeholder}</span>
        {/* Calendar icon */}
        <svg
          className="w-5 h-5 shrink-0"
          style={{ color: open ? "#f97316" : "#d1d5db" }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
          <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
          <line x1="8"  y1="2" x2="8"  y2="6" strokeWidth="2" strokeLinecap="round" />
          <line x1="3"  y1="10" x2="21" y2="10" strokeWidth="2" />
        </svg>
      </button>

      {/* ── Calendar popup ─────────────────────────── */}
      {open && (
        <div
          className="absolute z-[100] mt-1.5 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5"
          style={{ minWidth: "288px", width: "100%", maxWidth: "320px" }}
        >
          {/* Month / year navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-50 hover:text-orange-500 transition-colors text-xl leading-none"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-black text-gray-900 select-none tracking-wide">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-orange-50 hover:text-orange-500 transition-colors text-xl leading-none"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Day-of-week headers — always English */}
          <div className="grid grid-cols-7 mb-2">
            {DAY_HEADERS.map(d => (
              <div
                key={d}
                className="text-center text-[10px] font-black text-gray-400 uppercase pb-1.5 tracking-wider"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (!day) return <div key={`blank-${idx}`} className="h-8" />;

              const ymd        = toYMD(viewYear, viewMonth, day);
              const isSelected = value === ymd;
              const isToday    = ymd === today;
              const isDisabled = !!(min && ymd < min);

              let cellClass = "h-8 w-8 mx-auto flex items-center justify-center rounded-full text-xs font-bold transition-all select-none ";

              if (isDisabled) {
                cellClass += "text-gray-300 cursor-not-allowed";
              } else if (isSelected) {
                cellClass += "text-white cursor-pointer shadow-sm";
              } else if (isToday) {
                cellClass += "ring-2 ring-orange-400 text-orange-600 cursor-pointer hover:bg-orange-50";
              } else {
                cellClass += "text-gray-700 cursor-pointer hover:bg-orange-50 hover:text-orange-600";
              }

              return (
                <button
                  key={`day-${idx}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelect(day)}
                  className={cellClass}
                  style={isSelected ? { backgroundColor: "#f97316" } : {}}
                  aria-label={`${MONTHS[viewMonth]} ${day}, ${viewYear}`}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Clear date */}
          {value && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-xs font-bold text-gray-400 hover:text-red-400 transition-colors py-1 rounded-lg hover:bg-red-50"
              >
                ✕ Clear date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

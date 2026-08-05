// 날짜 탐색 — `Day N / total ▾` + 날씨 칩 + 3일 완전 노출 + 스와이프.
//
// 승인 시안은 날짜를 가로 스크롤 알약으로 두어 세 번째 날짜가 잘려 보인다.
// 사용자 확정 결정은 "정확히 3개 완전 노출, 잘라 보여주기 금지" 이므로 폭을
// 3등분한다. 320px 에서 한 칸이 ~99px 이라 날짜는 짧게(10/15) 표기한다.
//
// 스와이프만이 유일한 이동 수단이 되지 않게 클릭·키보드·전체 선택을 모두 둔다.

"use client";

import { useEffect, useRef, useState } from "react";
import { dayWindow, canStep, stepDay, swipeIntent } from "@/lib/planner/day-window-core";
import DaySelectorDialog, { type DayOption } from "./DaySelectorDialog";
import WeatherLinkChip from "./WeatherLinkChip";

interface Props {
  days: DayOption[];
  currentDay: number;
  onSelectDay: (dayNumber: number) => void;
  labels: {
    /** "Day 4 / 14" */
    dayOfTotal: string;
    dayTabList: string;
    openSelector: string;
    selectorTitle: string;
    close: string;
    weather: string;
    weatherAria: string;
    placesLabel: (n: number) => string;
    dayAria: (dayNumber: number, dateLabel: string) => string;
  };
}

export default function PlannerDayNav({ days, currentDay, onSelectDay, labels }: Props) {
  const total = days.length;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // 스와이프 — pointer 이벤트 하나로 터치·마우스·펜을 함께 받는다.
  // listener 는 track 에만 붙이고 unmount·재구성 때 반드시 뗀다.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      // 앞선 스와이프의 click 이 끝내 오지 않았더라도 다음 탭까지 삼키지 않는다
      swiped.current = false;
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dir = swipeIntent(e.clientX - s.x, e.clientY - s.y);
      if (dir === 0) return;                       // 탭이거나 세로 스크롤
      if (!canStep(total, currentDay, dir)) return; // 경계를 넘지 않는다
      swiped.current = true;
      onSelectDay(stepDay(total, currentDay, dir));
    };
    const cancel = () => { start.current = null; };
    // 스와이프가 끝난 지점에는 다른 Day 칩이 놓여 있다. 브라우저는 pointerup 뒤에
    // 그 칩으로 click 을 마저 보내고, 그러면 방금 옮긴 Day 가 곧바로 되돌려진다
    // (실측: Day 7 → 스와이프 → 8 → click 이 7 로 원복). 그 한 번만 막는다.
    const swallowClick = (e: MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("click", swallowClick, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", cancel);
      el.removeEventListener("click", swallowClick, true);
    };
  }, [total, currentDay, onSelectDay]);

  if (total === 0) return null;
  const windowDays = dayWindow(total, currentDay);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    if (!canStep(total, currentDay, dir as -1 | 1)) return;
    onSelectDay(stepDay(total, currentDay, dir as -1 | 1));
  }

  return (
    <div className="mb-4">
      {/* ── 상단 요약 행 — 두 요소가 서로 침범하지 않게 한쪽만 줄어들게 둔다 ── */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={labels.openSelector}
          className="gkm-focus inline-flex items-center gap-1 min-h-11 min-w-0 pr-1 rounded-xl text-[#131b2e]"
        >
          <span className="text-[17px] font-black truncate">{labels.dayOfTotal}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0"
               stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9.5l6 6 6-6" />
          </svg>
        </button>

        <WeatherLinkChip label={labels.weather} ariaLabel={labels.weatherAria} />
      </div>

      {/* ── 날짜 3개 — 폭을 균등 분할해 전부 완전히 보이게 한다 ── */}
      <div
        ref={trackRef}
        role="tablist"
        aria-label={labels.dayTabList}
        onKeyDown={onKeyDown}
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${windowDays.length}, minmax(0, 1fr))`,
          touchAction: "pan-y",   // 세로 스크롤은 브라우저에 그대로 넘긴다
        }}
      >
        {windowDays.map(n => {
          const d = days[n - 1];
          const active = n === currentDay;
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              aria-label={labels.dayAria(n, d?.dateLabel ?? "")}
              onClick={() => onSelectDay(n)}
              className="gkm-focus min-h-[54px] min-w-0 rounded-2xl px-1 py-2 flex flex-col items-center justify-center transition-colors"
              style={active
                ? { backgroundColor: "var(--gkm-action-primary)", color: "#fff" }
                : { backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-text-sub)" }}
            >
              <span className="text-[13px] font-black leading-tight truncate max-w-full">Day {n}</span>
              <span className={`text-[11px] leading-tight truncate max-w-full ${active ? "text-white/75" : "opacity-70"}`}>
                {d?.dateLabel ?? ""}
              </span>
            </button>
          );
        })}
      </div>

      <DaySelectorDialog
        open={open}
        days={days}
        currentDay={currentDay}
        title={labels.selectorTitle}
        closeLabel={labels.close}
        placesLabel={labels.placesLabel}
        onSelect={onSelectDay}
        onClose={() => { setOpen(false); triggerRef.current?.focus(); }}
      />
    </div>
  );
}

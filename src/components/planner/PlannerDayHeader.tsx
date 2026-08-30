"use client";

// Day 헤더 — my_trip_planning_final 의 "Day 2 · 날씨칩 · + Add · Map" 행.
//
// 시안의 날씨 칩은 PlannerDayNav 가 이미 가지고 있어 여기서 두 번 그리지 않는다.
// Add 는 장소 추가 패널을 그 날로 연다. Map 은 지도 전체화면 — 접기/펼치기가 아니다:
// 지도는 늘 화면에 있고, 더 크게 보고 싶을 때 전체화면으로 연다
// (OWNER-UX-CORRECTION-V1 #5: "지도 닫기" 제거).
// 샘플 기능을 새로 만들지 않는다 — 둘 다 이미 있던 동작의 진입점이다.

interface Props {
  dayNumber:   number;
  dateLabel:   string;
  countLabel:  string;
  /** 방문 진행률 문구 — 체크된 것이 있을 때만 */
  progressLabel?: string | null;
  onAdd?:      (() => void) | null;
  addLabel:    string;
  /** 지도 전체화면 열기 */
  onMapFullscreen: () => void;
  mapFullscreenLabel: string;
}

export default function PlannerDayHeader({ dayNumber, dateLabel, countLabel, progressLabel, onAdd, addLabel, onMapFullscreen, mapFullscreenLabel }: Props) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="gkm-trip-headline text-[26px] leading-tight font-bold text-ink flex items-baseline gap-2 flex-wrap">
          <span>Day {dayNumber}</span>
          <span className="text-sm font-semibold text-sub">{dateLabel}</span>
        </h2>
        <p className="mt-1 text-xs font-semibold text-faint flex items-center gap-2 flex-wrap">
          <span>{countLabel}</span>
          {progressLabel && <span className="text-emerald-600">{progressLabel}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="gkm-focus inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-sm font-bold text-action hover:bg-surface-dim transition-colors"
          >
            <span aria-hidden className="text-lg leading-none">+</span>{addLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onMapFullscreen}
          className="gkm-focus inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-sm font-bold text-action hover:bg-surface-dim transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6.5l6-2.5 6 2.5 6-2.5v14l-6 2.5-6-2.5-6 2.5z" /><path d="M9 4v14M15 6.5v14" />
          </svg>
          {mapFullscreenLabel}
        </button>
      </div>
    </div>
  );
}

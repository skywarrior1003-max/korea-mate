"use client";

// Trips 목록의 작은 조각들 — 최종 시안 `my_trips_final/code.html` 의 마크업을
// 실제 데이터에 맞게 옮겼다. (TASK-MY-TRIPS-FINAL-UI-V1)
//
//   SectionLabel  : "TRAVELING NOW" · "UPCOMING" 소제목 (label-lg, uppercase, on-surface-variant)
//   TripThumb     : 64×64 둥근 썸네일. 대표 비주얼이 없는 도시는 다른 도시 사진으로
//                   메우지 않는다 — 중립 면에 도시 이름만 둔다 (기존 규칙).
//   TripRow       : 예정 여행 한 줄 — 썸네일 · 제목(headline-md serif) · 날짜 · chevron.
//                   줄 전체가 진입 링크다. 시안에 없는 기존 기능(삭제)은 줄 끝의 작은
//                   ⋯ 버튼 하나로만 남긴다 — 링크 안에 버튼을 넣지 않는다.
//   DashedAction  : 점선 "+ New trip"
//   InlineConfirm : 삭제 2단계 확인 — 시안 색만 쓴다.

import Link from "next/link";
import type { ReactNode } from "react";
import type { CityVisual } from "@/lib/city-visual";
import {
  TRIPS_COLORS as C, RADIUS_LG, RADIUS_XL, SP,
  HEADLINE_MD, BODY_MD, LABEL_LG, LABEL_MD,
} from "./trips-tokens";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="uppercase tracking-wider" style={{ ...LABEL_LG, color: C.onSurfaceVariant, marginBottom: SP.md }}>
      {children}
    </h2>
  );
}

export function TripThumb({ visual, cityLabel, size = 64 }: { visual: CityVisual | null; cityLabel: string; size?: number }) {
  return (
    <div className="shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: RADIUS_LG, backgroundColor: C.surfaceContainerLow }}>
      {visual ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={visual.src} alt="" width={visual.w} height={visual.h}
          style={{ objectPosition: visual.objectPosition }}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-center px-1"
             style={{ ...LABEL_MD, color: C.onSurfaceVariant, wordBreak: "keep-all" }}>
          {cityLabel}
        </div>
      )}
    </div>
  );
}

/** 시안의 material `chevron_right` — 외부 아이콘 폰트를 받지 않고 같은 모양을 그린다 */
export function ChevronRight({ color = C.outlineVariant }: { color?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function MoreHoriz({ color = C.onSurfaceVariant }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill={color}>
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

interface TripRowProps {
  href:       string;
  title:      string;
  dates:      string;
  visual:     CityVisual | null;
  cityLabel:  string;
  /** 기존 기능(삭제) 진입 — 시안에는 없으므로 작은 ⋯ 하나만 */
  onMore?:    () => void;
  moreLabel?: string;
  /** 삭제 확인 줄 — 열려 있을 때만 아래에 붙는다 */
  confirm?:   ReactNode;
}

export function TripRow({ href, title, dates, visual, cityLabel, onMore, moreLabel, confirm }: TripRowProps) {
  return (
    <div
      className="shadow-sm transition-colors"
      style={{ backgroundColor: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: RADIUS_XL }}
    >
      <div className="flex items-center" style={{ padding: SP.mobile }}>
        <Link href={href} className="gkm-focus flex items-center flex-1 min-w-0" style={{ gap: SP.mobile, borderRadius: RADIUS_LG }}>
          <TripThumb visual={visual} cityLabel={cityLabel} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate" style={{ ...HEADLINE_MD, color: C.onSurface, marginBottom: SP.xs }}>{title}</h3>
            {dates && <p style={{ ...BODY_MD, color: C.onSurfaceVariant }}>{dates}</p>}
          </div>
          <ChevronRight />
        </Link>
        {onMore && (
          <button
            type="button" onClick={onMore} aria-label={moreLabel}
            className="gkm-focus shrink-0 flex items-center justify-center w-10 h-10 -mr-2 rounded-full hover:bg-black/5 cursor-pointer"
          >
            <MoreHoriz />
          </button>
        )}
      </div>
      {confirm}
    </div>
  );
}

export function DashedAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="gkm-focus w-full flex items-center justify-center transition-colors hover:bg-[#f3f4f5]"
      style={{ border: `1px dashed ${C.outlineVariant}`, borderRadius: RADIUS_XL, padding: SP.mobile, gap: SP.base, color: C.secondary, backgroundColor: "transparent" }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span style={LABEL_LG}>{children}</span>
    </Link>
  );
}

interface InlineConfirmProps {
  question:  string;
  confirmLabel: string;
  cancelLabel:  string;
  busy?:     boolean;
  onConfirm: () => void;
  onCancel:  () => void;
}

export function InlineConfirm({ question, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: InlineConfirmProps) {
  return (
    <div className="flex items-center justify-between flex-wrap" style={{ gap: SP.sm, padding: `0 ${SP.mobile}px ${SP.mobile}px`, borderTop: `1px solid ${C.outlineVariant}`, paddingTop: SP.sm }}>
      <span style={{ ...LABEL_MD, color: C.onSurfaceVariant }}>{question}</span>
      <span className="flex" style={{ gap: SP.base }}>
        <button type="button" onClick={onCancel} disabled={busy}
                className="gkm-focus cursor-pointer disabled:opacity-50"
                style={{ ...LABEL_MD, color: C.onSurface, padding: `${SP.base}px ${SP.sm}px`, border: `1px solid ${C.outlineVariant}`, borderRadius: RADIUS_LG, backgroundColor: C.surfaceContainerLowest }}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy}
                className="gkm-focus cursor-pointer disabled:opacity-50"
                style={{ ...LABEL_MD, color: "#ffffff", padding: `${SP.base}px ${SP.sm}px`, borderRadius: RADIUS_LG, backgroundColor: C.error }}>
          {busy ? "…" : confirmLabel}
        </button>
      </span>
    </div>
  );
}

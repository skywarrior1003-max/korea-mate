"use client";

// Journey Summary — Story 의 끝.
//
// 시안대로 위 모서리가 크게 둥근(40px) 밝은 회색 판이 올라오고, 가운데 정렬로
// [Journey Complete 칩] → [큰 serif 제목] → [주황 통계] → [설명] → [지도 자리]
// → [Copy this trip] → [Share] → [gokoreamate] 순으로 놓인다.
//
// 지도는 만들지 않는다
//   여행 중 채워지는 My Trip 지도가 이미 앱에 있다. 그걸 흉내 낸 새 지도를
//   여기서 그리면 두 개가 갈라진다. 그래서 자리(`mapSlot`)만 두고, 아무것도
//   주지 않으면 시안의 빈 상자를 그대로 보여 준다. 실제 연결은 기존 지도를
//   읽어 본 뒤 별도 작업에서 한다.

import type { ReactNode } from "react";
import type { StorySummaryData } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD,
  DISPLAY_MEMORY, TITLE_MD, BODY_LG, LABEL_CAPS,
  ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_VARIANT, SURFACE_CONTAINER_LOW,
  PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY_CONTAINER, OUTLINE_VARIANT,
  RADIUS_PHOTO, AMBIENT_SHADOW,
} from "./story-tokens";

interface Props {
  data: StorySummaryData;
  /** 기존 My Trip 완료 지도가 들어올 자리. 없으면 시안의 빈 상자. */
  mapSlot?: ReactNode;
  /**
   * 지도 자리를 통째로 감춘다.
   *
   * 아직 붙일 지도가 없을 때 쓴다. 빈 상자를 그대로 두면 보는 사람이 "지도가
   * 로딩 중이거나 고장났다" 고 읽는다 — 없는 것은 없는 대로 두는 편이 낫다.
   * 지도가 생기면 이 값을 빼고 `mapSlot` 을 주면 된다.
   */
  hideMapSlot?: boolean;
  /** 붙이지 않으면 버튼을 그리지 않는다 — 눌러도 안 되는 CTA 를 두지 않는다. */
  onCopy?: () => void;
  copyLabel: string;
  copyBusy?: boolean;
  onShare?: () => void;
  shareLabel: string;
}

export default function StorySummary({
  data, mapSlot, hideMapSlot, onCopy, copyLabel, copyBusy, onShare, shareLabel,
}: Props) {
  return (
    <section
      style={{
        backgroundColor: SURFACE_CONTAINER_LOW,
        paddingTop: 80, paddingBottom: 80,
        paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE,
        marginTop: STACK_LG,
        borderTopLeftRadius: 40, borderTopRightRadius: 40,
      }}
    >
      <div className="max-w-2xl mx-auto text-center flex flex-col items-center">
        <span
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
          style={{
            ...LABEL_CAPS, marginBottom: 24,
            backgroundColor: `${PRIMARY_CONTAINER}33`,   // primary-container / 20%
            color: ON_PRIMARY_CONTAINER,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor">
            <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z" />
          </svg>
          Journey Complete
        </span>

        <h2 className="mb-2" style={{ ...DISPLAY_MEMORY, color: ON_SURFACE }}>{data.title}</h2>
        <p style={{ ...TITLE_MD, color: PRIMARY, letterSpacing: "0.02em", marginBottom: 24 }}>
          {data.stats}
        </p>
        <p className="max-w-md" style={{ ...BODY_LG, color: ON_SURFACE_VARIANT, marginBottom: STACK_LG }}>
          {data.description}
        </p>

        {/* 지도 자리 — 실제 지도는 후속 작업에서 이 안에 들어온다 */}
        {!hideMapSlot && (
        <div
          className="w-full h-64 overflow-hidden relative flex items-center justify-center"
          style={{
            borderRadius: RADIUS_PHOTO, marginBottom: STACK_LG,
            backgroundColor: SURFACE_VARIANT, boxShadow: AMBIENT_SHADOW,
            border: `1px solid ${OUTLINE_VARIANT}4d`,
          }}
        >
          {mapSlot ?? (
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden fill="none"
                 stroke={ON_SURFACE_VARIANT} strokeOpacity="0.5" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
            </svg>
          )}
        </div>
        )}

        <div className="flex flex-col gap-4 w-full sm:w-auto" style={{ minWidth: 200 }}>
          {onCopy && (
            <button
              type="button" onClick={onCopy} disabled={copyBusy}
              className="rounded-full transition-colors flex items-center justify-center gap-2 gkm-focus disabled:opacity-60"
              style={{
                ...TITLE_MD, backgroundColor: PRIMARY, color: "#ffffff",
                paddingTop: 16, paddingBottom: 16, paddingLeft: 32, paddingRight: 32,
                boxShadow: AMBIENT_SHADOW,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
              </svg>
              {copyLabel}
            </button>
          )}
          {onShare && (
            <button
              type="button" onClick={onShare}
              className="py-2 flex items-center justify-center gap-2 transition-colors gkm-focus"
              style={{ ...BODY_LG, color: ON_SURFACE_VARIANT }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {shareLabel}
            </button>
          )}
        </div>

        <div
          className="w-full"
          style={{ marginTop: STACK_LG, paddingTop: STACK_MD, borderTop: `1px solid ${OUTLINE_VARIANT}4d` }}
        >
          <h3 style={{ fontFamily: DISPLAY_MEMORY.fontFamily, fontSize: "26px", fontWeight: 700,
                       letterSpacing: "-0.02em", color: `${PRIMARY}80` }}>
            gokoreamate
          </h3>
        </div>
      </div>
    </section>
  );
}

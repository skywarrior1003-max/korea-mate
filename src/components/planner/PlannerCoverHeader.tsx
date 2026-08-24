// Planner 상세 대표 이미지 헤더.
//
// 무엇을 띄울지는 cover-source-core 가 정한다(우선순위: 개인 사진 → 도시 대표
// 비주얼 → 브랜드 gradient). 여기서는 그리기만 한다.
//
// 이미지가 실패하면 같은 높이의 gradient 로 떨어진다. 높이를 이미지 유무와
// 무관하게 고정해 두어 로드 전후로 화면이 밀리지 않는다.

"use client";

import { useState } from "react";
import { resolvePlannerCover, type CoverInput } from "@/lib/planner/cover-source-core";
import { cityVisual } from "@/lib/city-visual";

interface Props {
  cover: CoverInput;
  title: string;
  /** "2026-10-15 to 2026-10-28 (2 Travelers)" 같은 완성된 문구 */
  dateLine: string;
  /** 도시 이미지 대체 문구 — locale 문구를 주입받는다 */
  imageAlt: string;
  /** 소유자에게만 true. viewer 에게는 연필이 아예 렌더되지 않는다. */
  canEditTitle: boolean;
  editLabel: string;
  onEditTitle: () => void;
  /** 제목 편집 중이면 입력 필드를 대신 그린다 */
  editing?: boolean;
  editSlot?: React.ReactNode;
  /** 소유자에게만 준다 — 없으면 날짜 줄은 그냥 글자다 */
  onEditDates?: (() => void) | null;
  editDatesLabel?: string;
}

const BRAND_GRADIENT =
  "linear-gradient(140deg, #131b2e 0%, #1d2b52 46%, var(--gkm-action-primary) 100%)";

export default function PlannerCoverHeader({
  cover, title, dateLine, imageAlt, canEditTitle, editLabel, onEditTitle, editing, editSlot, onEditDates, editDatesLabel,
}: Props) {
  const [failed, setFailed] = useState(false);
  const source = resolvePlannerCover({ ...cover, imageFailed: failed }, cityVisual);

  return (
    <section
      className="relative w-full overflow-hidden rounded-3xl mb-6"
      style={{ minHeight: "clamp(232px, 38vh, 340px)", background: BRAND_GRADIENT }}
    >
      {source.kind !== "gradient" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.src}
          alt={imageAlt}
          {...(source.kind === "city" ? { width: source.width, height: source.height } : {})}
          className="absolute inset-0 w-full h-full object-cover"
          style={source.kind === "city" ? { objectPosition: source.objectPosition } : undefined}
          onError={() => setFailed(true)}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      )}

      {/* 제목이 사진 위에서도 읽히도록 — 아래쪽만 짙게 */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(10,12,20,0.88) 0%, rgba(10,12,20,0.40) 48%, rgba(10,12,20,0.06) 100%)" }}
      />

      <div
        className="relative flex flex-col justify-end px-5 sm:px-7 pb-6 pt-10"
        style={{ minHeight: "clamp(232px, 38vh, 340px)" }}
      >
        {editing ? (
          editSlot
        ) : (
          // 긴 제목이 2줄 이상이어도 연필이 밀리지 않게 제목만 줄어들게 둔다
          <div className="flex items-start gap-2 min-w-0">
            <h1 className="min-w-0 text-[26px] sm:text-4xl font-black text-white leading-tight break-words">
              {title}
            </h1>
            {canEditTitle && (
              <button
                type="button"
                onClick={onEditTitle}
                aria-label={editLabel}
                className="gkm-focus shrink-0 w-11 h-11 -mt-1.5 inline-flex items-center justify-center rounded-full text-white/85 hover:text-white hover:bg-white/15 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden
                     stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
            )}
          </div>
        )}
        {/* 여행 날짜 — 소유자는 여기서 바로 기간을 바꾼다 (PICKS-TO-TRIP-JOURNEY-RESTORE-V1).
            제목 ✎ 는 제목 편집 그대로다. */}
        {onEditDates ? (
          <button
            type="button"
            onClick={onEditDates}
            aria-label={editDatesLabel}
            className="gkm-focus mt-2 inline-flex items-center gap-1.5 text-[13px] sm:text-sm font-bold text-white/80 underline decoration-white/40 underline-offset-4 hover:text-white"
          >
            {dateLine}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
        ) : (
          <p className="mt-2 text-[13px] sm:text-sm font-bold text-white/80">{dateLine}</p>
        )}
      </div>
    </section>
  );
}

"use client";

// Story Focus — 사진을 누르면 여행 전체의 사진을 한 줄로 넘겨 본다.
//
// 시안(memory_focus_view/screen.png)의 언어를 그대로 쓴다: 사진이 화면을 채우고
// 위아래가 검게 깔리며, 맨 위에 구간 progress, 그 줄에 닫기 · `k / N` · Day,
// 아래에 장소명과 큰 serif 인용문, 가운데 `‹ SWIPE ›`.
//
// 바뀐 것 (TASK-STORY-FOCUS-PREMIUM-UX-V1)
//   - 한 장소의 사진만이 아니라 **여행 전체**(Day → 장소 → 사진)를 한 방향으로
//     넘긴다. 장소가 바뀌면 캡션이 바뀌고 사진이 부드럽게 교차한다. 닫았다가
//     다음 장소를 다시 누를 필요가 없다.
//   - 구간 progress 는 지금 장소 안의 사진 수를 보여 준다(이 곳에 몇 장 남았나).
//     `k / N` 은 여행 전체 기준이다.
//   - 세로 드래그는 무시한다 — 페이지 스크롤·브라우저 뒤로가기 제스처와 겹치지
//     않게. 가로로 40px 이상 움직였을 때만 넘긴다.
//   - 앞뒤 한 장을 미리 받아 둔다. 첫 넘김에서 SWIPE 안내는 조용히 사라진다.
//
// 닫으면 Journal 의 원래 자리로 돌아간다. 그 복귀는 여는 쪽의 책임이다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusSlide } from "@/lib/share/story-focus-core";
import { crossesMemory, neighborUrls } from "@/lib/share/story-focus-core";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, BASE,
  DISPLAY_MEMORY, TITLE_MD, BODY_SM, LABEL_CAPS_WIDE,
} from "./story-tokens";

interface Props {
  /** 여행 전체 순서 (buildFocusSequence). 비어 있으면 그리지 않는다 */
  slides: FocusSlide[];
  /** 처음 보여줄 슬라이드 */
  startIndex?: number;
  /** 유리 칩에 넣을 넓은 지역 이름. 정확한 주소가 아니다. */
  regionLabel?: string;
  onClose: () => void;
}

export default function StoryMemoryFocus({ slides, startIndex = 0, regionLabel, onClose }: Props) {
  const total = slides.length;
  const [i, setI] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, total - 1)));
  const [moved, setMoved] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((d: number) => {
    setI(prev => {
      const next = Math.min(Math.max(0, prev + d), Math.max(0, total - 1));
      if (next !== prev) {
        setMoved(true);
        // 장소가 바뀌는 경계에서만 교차 연출 — 같은 장소 안에서는 즉시 넘긴다
        if (crossesMemory(slides, prev, next)) setFadeKey(k => k + 1);
      }
      return next;
    });
  }, [total, slides]);

  // 열려 있는 동안 뒤 화면이 스크롤되지 않게 한다. Esc·뒤로가기로도 닫힌다.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    const onPop = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [onClose, go]);

  if (total === 0) return null;
  const current = slides[i]!;
  const hasMemo = current.memo.trim() !== "";
  const atStart = i === 0, atEnd = i === total - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-white overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={current.placeName ?? (hasMemo ? current.memo.slice(0, 40) : undefined)}
      onTouchStart={e => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
      onTouchEnd={e => {
        const start = touch.current; touch.current = null;
        const t = e.changedTouches[0];
        if (!start || !t) return;
        const dx = t.clientX - start.x, dy = t.clientY - start.y;
        // 세로로 더 많이 움직였으면 스와이프가 아니다 — 뒤로가기·스크롤 제스처와 겹치지 않게
        if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;
        go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="relative h-full w-full flex flex-col justify-between">
        {/* 사진 — 장소가 바뀔 때만 key 가 바뀌어 짧게 교차한다 */}
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={fadeKey}
            src={current.url}
            alt={current.alt ?? current.placeName ?? ""}
            className="w-full h-full object-cover"
            style={{ animation: "gkmFocusIn 260ms ease-out" }}
          />
          {/* 앞뒤 한 장 미리받기 — 보이지 않는다 */}
          {neighborUrls(slides, i).map(u => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={u} src={u} alt="" aria-hidden className="hidden" />
          ))}
        </div>
        <style>{`@keyframes gkmFocusIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        {/* Cover 와 같은 이유로 값을 직접 적는다 (oklab 보간 회피) */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(to bottom, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.8))" }}
        />

        {/* 위 — 이 장소 안의 구간 progress + 도구 줄 */}
        <div
          className="relative z-20 w-full flex flex-col gap-4"
          style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingTop: 32 }}
        >
          <div className="flex gap-2 w-full max-w-2xl mx-auto" aria-hidden>
            {Array.from({ length: current.photoCount }, (_, n) => (
              <div key={n} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-md">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: n <= current.photoIndex ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center w-full max-w-2xl mx-auto">
            <button
              type="button" onClick={onClose} aria-label="close"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-lg gkm-focus"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <span className="text-white/80" style={LABEL_CAPS_WIDE}>
              {i + 1} / {total}
            </span>
            {/* 시안의 ⋯ 자리에 Day 를 둔다 — 여행 전체를 넘기므로 지금 며칠째인지 보여야 한다 */}
            <span className="text-white/70 uppercase" style={LABEL_CAPS_WIDE}>
              Day {current.dayNumber}
            </span>
          </div>
        </div>

        {/* 좌우 1/3 — 이전 / 다음. 끝에서는 비활성 */}
        <button
          type="button" aria-label="previous" onClick={() => go(-1)} disabled={atStart}
          className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer disabled:cursor-default"
        />
        <button
          type="button" aria-label="next" onClick={() => go(1)} disabled={atEnd}
          className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer disabled:cursor-default"
        />

        {/* 아래 — 지역칩 · 장소명 · 인용 · SWIPE */}
        <div
          className="relative z-20 w-full max-w-2xl mx-auto"
          style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingBottom: 48 }}
          aria-live="polite"
        >
          {regionLabel && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20"
              style={{ marginBottom: STACK_MD }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
              </svg>
              <span className="font-medium" style={BODY_SM}>{regionLabel}</span>
            </div>
          )}
          <div className="flex flex-col" style={{ gap: BASE }}>
            {current.placeName && (
              <h2 className="text-white/90 uppercase tracking-wider" style={TITLE_MD}>
                {current.placeName}
              </h2>
            )}
            {/* 긴 글도 자르지 않는다. 넘치면 이 칸 안에서 스크롤한다. */}
            {/* 적은 글이 없으면 빈 제목 칸을 만들지 않는다 — Journal 과 같은 규칙 */}
            {hasMemo && (
            <h1
              className="text-white leading-tight overflow-y-auto"
              /* 줄간격 1.25 — 시안이 leading-tight 를 얹어 48px×1.25 = 60px 로 렌더한다 */
              style={{ ...DISPLAY_MEMORY, lineHeight: 1.25, maxHeight: "45vh" }}
            >
              {current.memo}
            </h1>
            )}
          </div>
          {/* 첫 넘김 뒤에는 사라진다 — 배운 뒤에도 계속 안내하지 않는다. 한 장뿐이면 애초에 없다 */}
          {!moved && total > 1 && (
            <div
              className="flex justify-center items-center gap-2 opacity-50"
              style={{ marginTop: STACK_LG }}
              aria-hidden
            >
              <span>‹</span>
              <span className="uppercase" style={LABEL_CAPS_WIDE}>Swipe</span>
              <span>›</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

// Memory Focus — 최종 memory_focus_view/screen.png 그대로.
//
// 사진이 화면을 꽉 채우고 위아래로 검게 깔린다. 맨 위에 사진 수만큼 나뉜 선형
// progress 가 있고(지난 칸은 꽉 참, 현재 칸은 채워짐, 남은 칸은 흐림), 그 아래
// 줄에 닫기 · `1 / 4` · ⋯ 가 놓인다. 아래에는 유리 칩(지역), 대문자 장소명,
// 큰 serif 인용문, 그리고 가운데 `‹ SWIPE ›`.
//
// 좌우 1/3 영역이 이전/다음이다. 시안이 그렇게 만들어 두었다(prev-btn/next-btn).
// 손가락 스와이프도 함께 받는다 — 시안의 SWIPE 안내가 약속하는 동작이다.
//
// 닫으면 Journal 의 원래 자리로 돌아간다. 그 복귀는 이 컴포넌트가 아니라 여는
// 쪽이 책임진다(스크롤 위치를 알고 있는 것은 그쪽이다).

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryMemory } from "./story-types";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, BASE,
  DISPLAY_MEMORY, TITLE_MD, BODY_SM, LABEL_CAPS,
} from "./story-tokens";

interface Props {
  memory: StoryMemory;
  /** 처음 보여줄 사진 */
  startIndex?: number;
  /** 유리 칩에 넣을 넓은 지역 이름. 정확한 주소가 아니다. */
  regionLabel?: string;
  onClose: () => void;
}

export default function StoryMemoryFocus({ memory, startIndex = 0, regionLabel, onClose }: Props) {
  const photos = memory.photos;
  const total  = photos.length;
  const [i, setI] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, total - 1)));
  const touchX = useRef<number | null>(null);

  const go = useCallback((d: number) => {
    setI(prev => Math.min(Math.max(0, prev + d), Math.max(0, total - 1)));
  }, [total]);

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
  const current = photos[i]!;

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-white overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={memory.placeName ?? memory.memo.slice(0, 40)}
      onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={e => {
        const start = touchX.current; touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="relative h-full w-full flex flex-col justify-between">
        {/* 사진 */}
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt ?? memory.placeName ?? ""}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

        {/* 위 — progress + 도구 줄 */}
        <div
          className="relative z-20 w-full flex flex-col gap-4"
          style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingTop: 32 }}
        >
          <div className="flex gap-2 w-full max-w-2xl mx-auto">
            {photos.map((p, n) => (
              <div key={p.url} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-md">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: n <= i ? "100%" : "0%" }}
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
            <span className="text-white/80 tracking-widest" style={LABEL_CAPS}>
              {i + 1} / {total}
            </span>
            {/* 시안의 ⋯ 자리. 붙일 동작이 아직 없어 자리만 비워 둔다. */}
            <span className="w-10 h-10" aria-hidden />
          </div>
        </div>

        {/* 좌우 1/3 — 이전 / 다음 */}
        <button
          type="button" aria-label="previous" onClick={() => go(-1)}
          className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer"
        />
        <button
          type="button" aria-label="next" onClick={() => go(1)}
          className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer"
        />

        {/* 아래 — 지역칩 · 장소명 · 인용 · SWIPE */}
        <div
          className="relative z-20 w-full max-w-2xl mx-auto"
          style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, paddingBottom: 48 }}
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
            {memory.placeName && (
              <h2 className="text-white/90 uppercase tracking-wider" style={TITLE_MD}>
                {memory.placeName}
              </h2>
            )}
            {/* 긴 글도 자르지 않는다. 넘치면 이 칸 안에서 스크롤한다. */}
            <h1
              className="text-white leading-tight overflow-y-auto"
              style={{ ...DISPLAY_MEMORY, maxHeight: "45vh" }}
            >
              {memory.memo}
            </h1>
          </div>
          <div className="flex justify-center items-center gap-2 opacity-50" style={{ marginTop: STACK_LG }}>
            <span aria-hidden>‹</span>
            <span className="uppercase tracking-widest" style={LABEL_CAPS}>Swipe</span>
            <span aria-hidden>›</span>
          </div>
        </div>
      </div>
    </div>
  );
}

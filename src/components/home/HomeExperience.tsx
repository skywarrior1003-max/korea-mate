// Home 상단 — 수동 가로 2페이지.
//
// Page 1 은 브랜드 에디토리얼(또는 사용자가 마무리한 여행), Page 2 는 발견이다.
// 페이저는 이 블록 안에서만 가로로 움직인다. Planner 이하 섹션은 그 아래로
// 평소처럼 세로로 이어진다 — Home 전체를 carousel 에 넣지 않는다.
//
// 자동 전환이 없다. 타이머도 없다. 사용자가 넘긴 만큼만 넘어간다.
// URL 도 바꾸지 않는다 — 페이지를 넘겼다고 뒤로가기 기록이 쌓이면, 뒤로가기가
// 이전 화면이 아니라 이전 슬라이드로 가버린다.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetchItinerariesByDevice } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";
import { loadMoments } from "@/lib/trip-moments";
import InspiredStorytellingHome from "./InspiredStorytellingHome";
import MemorySynergyHome from "./MemorySynergyHome";
import PremiumDiscoveryHome from "./PremiumDiscoveryHome";
import { selectHomeExperience, NO_FINISH_SIGNAL } from "./home-experience-selector";
import type { HomeExperienceState } from "./home-experience-types";

const PAGES = 2;

/** 여행 마무리 신호 계약이 저장소에 생기면 켠다. 지금은 없다(§10 B1). */
const FINISH_SIGNAL_AVAILABLE = false;

export default function HomeExperience() {
  const t = useTranslations("home");
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [page, setPage] = useState(0);
  const [trackH, setTrackH] = useState<number | undefined>(undefined);
  const [state, setState] = useState<HomeExperienceState>({ page1: "storytelling", moments: [] });

  // ── Page 1 판정 ──────────────────────────────────────────────────────────
  //
  // 마무리 신호 계약이 아직 없다. 그러면 selector 결과가 무조건 storytelling 이라
  // 일정을 불러올 이유가 없다 — 결과를 바꾸지 못하는 요청을 Home 진입마다 보내지
  // 않는다. 신호가 생기면 FINISH_SIGNAL_AVAILABLE 을 켜고 신호 함수만 갈아끼운다.
  useEffect(() => {
    if (!FINISH_SIGNAL_AVAILABLE) return;
    let cancelled = false;
    apiFetchItinerariesByDevice(getDeviceId())
      .then(rows => {
        if (cancelled) return;
        const next = selectHomeExperience({
          trips: rows,
          momentsOf: id => loadMoments(id),
          finishSignalOf: NO_FINISH_SIGNAL,
        });
        setState(next);
      })
      .catch(() => { /* 실패는 Storytelling 유지로 흡수한다 */ });
    return () => { cancelled = true; };
  }, []);

  // ── 스크롤 위치 → 현재 페이지 ────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setPage(p => (p === next ? p : Math.min(PAGES - 1, Math.max(0, next))));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // 트랙 높이를 지금 보이는 페이지에 맞춘다.
  //
  // 두 페이지의 길이가 다른데 트랙을 그대로 두면 높이가 항상 긴 쪽에 맞춰지고,
  // 짧은 페이지로 넘어갔을 때 아래에 빈 공간이 크게 남는다. ResizeObserver 를
  // 쓰는 이유는 이미지가 늦게 로드되면서 높이가 나중에 바뀌기 때문이다.
  useEffect(() => {
    const el = panelRefs.current[page];
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTrackH(el.offsetHeight));
    ro.observe(el);           // observe 시점에 콜백이 한 번 실행된다
    return () => ro.disconnect();
  }, [page]);

  // 새로고침하면 Page 1 부터다. 브라우저가 스크롤 위치를 복원하는 경우가 있어
  // 마운트 직후 한 번 되돌린다.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(Math.min(PAGES - 1, page + 1)); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); goTo(Math.max(0, page - 1)); }
  };

  const scrollToPlanner = useCallback(() => {
    document.getElementById("planner")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const pageLabel = [t("pageStory"), t("pageDiscover")];

  return (
    <section aria-label={t("experienceLabel")} className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex items-start overflow-x-auto snap-x snap-mandatory motion-safe:transition-[height] motion-safe:duration-200"
        style={{
          height: trackH ? `${trackH}px` : undefined,
          // 가로 스와이프가 브라우저 뒤로가기 제스처나 페이지 스크롤로 새지 않게 한다
          overscrollBehaviorX: "contain",
          scrollbarWidth: "none",
          // 세로 스크롤은 그대로 페이지로 넘어간다 — 여기서 가로만 잡는다
          touchAction: "pan-y pinch-zoom",
        }}
      >
        <div
          ref={el => { panelRefs.current[0] = el; }}
          id="home-page-0"
          role="tabpanel"
          aria-labelledby="home-tab-0"
          className="w-full shrink-0 snap-start"
        >
          {state.page1 === "memory" && state.trip ? (
            <MemorySynergyHome
              trip={state.trip}
              moments={state.moments}
              onPlanTrip={scrollToPlanner}
            />
          ) : (
            <InspiredStorytellingHome onPlanTrip={scrollToPlanner} />
          )}
        </div>

        <div
          ref={el => { panelRefs.current[1] = el; }}
          id="home-page-1"
          role="tabpanel"
          aria-labelledby="home-tab-1"
          className="w-full shrink-0 snap-start"
        >
          <PremiumDiscoveryHome active={page === 1} />
        </div>
      </div>

      {/* ── 페이지 표시기 ──────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label={t("pagerLabel")}
        onKeyDown={onKeyDown}
        className="flex items-center justify-center gap-2 py-3 bg-surface-dim border-t border-line"
      >
        {Array.from({ length: PAGES }, (_, i) => (
          <button
            key={i}
            id={`home-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={page === i}
            aria-controls={`home-page-${i}`}
            tabIndex={page === i ? 0 : -1}
            onClick={() => goTo(i)}
            className="gkm-focus inline-flex items-center gap-2 min-h-11 px-4 rounded-full transition-colors"
          >
            <span
              aria-hidden
              className="block rounded-full transition-all"
              style={{
                width: page === i ? 22 : 8, height: 8,
                backgroundColor: page === i ? "var(--gkm-action-primary)" : "var(--gkm-line)",
              }}
            />
            <span className={`text-xs font-black ${page === i ? "text-ink" : "text-faint"}`}>
              {pageLabel[i]}
            </span>
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {t("pageStatus", { current: page + 1, total: PAGES, name: pageLabel[page] })}
      </p>
    </section>
  );
}

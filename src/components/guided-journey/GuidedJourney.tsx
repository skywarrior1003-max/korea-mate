"use client";

// Guided Journey — 실제 버튼을 가리키는 안내 (GOKOREAMATE-GUIDED-JOURNEY-TUTORIAL-V1)
//
// · 한 번에 한 행동만 말한다. 말풍선은 대상 옆(위/아래)에 붙고 대상을 덮지 않는다. 대상에는 고정된
//   테두리만 두른다(깜박임·반복 튕김 없음). 나타날 때 한 번만 짧게 움직이고, 움직임 줄이기 설정이면 없다.
// · 완료는 실제 결과로만: 화면 이동(route)·화면 상태(dom)·저장 신호(signal)·실제 버튼 누름(click).
// · 대상이 화면 밖이면 단계가 시작될 때 한 번만 보이게 옮긴다(입력 중이면 옮기지 않는다). 이후 사용자가
//   스크롤하면 따라가기만 하고, 대상이 가려지면 '버튼으로 이동'을 사용자가 누르게 한다.
// · 대상이 없거나(로딩 실패·조건 미충족) 다른 화면이면 허공을 가리키지 않는다 — 이동·건너뛰기·끝내기를 보인다.
// · 튜토리얼은 버튼을 대신 누르지 않는다. 공개·공유·업로드는 사용자가 직접 결정한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MERGE_STEPS, readJourney, writeJourney, completeStep, skipStep, pauseJourney, endJourney, switchToPlacesAt, progressOf,
  JOURNEY_SIGNAL_EVENT, JOURNEY_CHANGE_EVENT,
  type JourneyState, type JourneyStep, type JourneySignal,
} from "@/lib/guided-journey/journey-core";
import JourneyStartChooser from "@/components/guided-journey/JourneyStartChooser";

type Loc = { path: string; search: URLSearchParams };
const reCityHub = /^\/city\/[^/]+\/?$/;
const reCityTrips = /^\/city\/[^/]+\/trips\/?$/;
const reCourse = /^\/city\/[^/]+\/trips\/[^/]+\/?$/;
// 저장된 내 여행 화면 — 방금 만든 일정은 주소에 id 가 없을 수 있어 저장 표시(data-tut-itin)로도 판단한다
const isMyTrip = (l: Loc) => /^\/itinerary\/?$/.test(l.path)
  && (!!l.search.get("id") || (typeof document !== "undefined" && !!document.querySelector('[data-tut-itin="saved"]')));

interface StepDef {
  /** 이 단계의 행동이 일어나는 화면 */
  on: (l: Loc) => boolean;
  /** 다른 화면에 있을 때 사용자가 누를 이동 링크 */
  goto?: string;
  /** 가리킬 대상 — 보이는 첫 번째 */
  targets: string[];
  done: { route?: (l: Loc) => boolean; dom?: string; signal?: JourneySignal; click?: string[] };
  /** 확인 자체가 행동인 단계(날짜가 맞아요·끝내기) */
  confirm?: boolean;
  /** 여행 중에 이어하기(사진·기록) */
  pausable?: boolean;
  /** 실패 화면 감지(가져오기 오류) */
  failDom?: string;
}

const STEPS: Record<JourneyStep, StepDef> = {
  pickCity: { on: l => l.path === "/", goto: "/", targets: ['[data-tut="tut-city"]'], done: { route: l => /^\/city\//.test(l.path) } },
  pickCourse: { on: l => reCityHub.test(l.path) || reCityTrips.test(l.path), goto: "/", targets: ['[data-tut="tut-course"]'], done: { route: l => reCourse.test(l.path) } },
  adoptCourse: { on: l => reCourse.test(l.path), targets: ['[data-tut="tut-adopt"]'], done: { dom: '[data-tut="tut-adopt-go"]' } },
  adoptDates: { on: l => reCourse.test(l.path), targets: ['[data-tut="tut-adopt-go"]:not(:disabled)', '[data-tut="tut-adopt-start"][value=""]', '[data-tut="tut-adopt-end"]'], done: { route: isMyTrip } },
  pickPlace: { on: l => reCityHub.test(l.path), goto: "/", targets: ['[data-tut="tut-place"]'], done: { route: l => /^\/place\//.test(l.path) } },
  savePlace: { on: l => /^\/place\//.test(l.path), targets: ['[data-tut="tut-save"]'], done: { dom: '[data-tut="tut-save"][aria-pressed="true"]' } },
  openPicks: { on: () => true, goto: "/picks/", targets: ['[data-tut="tut-nav-picks"]'], done: { route: l => /^\/picks/.test(l.path) } },
  addToThisTrip: { on: l => /^\/picks/.test(l.path), goto: "/picks/", targets: ['[data-tut="tut-this-trip"]', '[data-tut="tut-tab-saved"][aria-selected="false"]'], done: { click: ['[data-tut="tut-this-trip"]'] } },
  openThisTrip: { on: l => /^\/picks/.test(l.path), goto: "/picks/", targets: ['[data-tut="tut-tab-selected"]'], done: { dom: '[data-tut="tut-tab-selected"][aria-selected="true"]' } },
  buildTrip: { on: l => /^\/picks/.test(l.path), goto: "/picks/", // 여행 도시·날짜가 아직 없으면(시작 카드) 날짜 → [이 조건으로 시작] 을 먼저 가리킨다
    targets: ['[data-tut="tut-starter-go"]:not(:disabled)', '[data-tut="tut-starter-start"][value=""]', '[data-tut="tut-starter-end"]', '[data-tut="tut-build"]'], done: { route: l => /^\/itinerary/.test(l.path) } },
  openImport: { on: () => true, goto: "/import/", targets: [], done: { route: l => /^\/import/.test(l.path) } },
  // IMPORT-V2 — 글 붙여넣기·링크 두 입력 모두. 비어 있는 입력칸 → [가져오기] 순서로 가리킨다. 완료 = 확인 화면 도착.
  pasteLink: { on: l => /^\/import/.test(l.path), goto: "/import/", targets: ['[data-tut="tut-import-text"]:placeholder-shown', '[data-tut="tut-import-url"]:placeholder-shown', '[data-tut="tut-import-go"]:not(:disabled)'], done: { dom: '[data-tut="tut-import-preview"]' }, failDom: '[data-tut="tut-import-error"]' },
  // 일정 → [내 여행으로 만들기], 장소 하나 → [내 장소에 저장] → [이 장소로 새 여행], 여러 곳 → [새 여행 만들기]. 완료 = My Trip 도착(또는 This Trip)
  reviewImport: { on: l => /^\/import/.test(l.path), goto: "/import/", targets: ['[data-tut="tut-import-confirm"]', '[data-tut="tut-import-place-trip"]', '[data-tut="tut-import-place-save"]', '[data-tut="tut-import-multi-trip"]'], done: { route: l => isMyTrip(l) || /^\/picks/.test(l.path) } },
  openMyTrip: { on: () => true, goto: "/my-trips/", targets: ['[data-tut="tut-trip-row"]'], done: { route: isMyTrip } },
  tripSaved: { on: l => /^\/itinerary/.test(l.path), goto: "/my-trips/", targets: ['[data-tut="tut-sync"]'], done: { signal: "trip-saved", dom: '[data-tut-sync="saved"]' } },
  checkDates: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-dates-apply"]', '[data-tut="tut-dates"]'], done: { signal: "dates-applied" }, confirm: true },
  // 일정 탭의 장소별 기록 버튼은 여행 기간에만 보인다 — 없으면 늘 기록 버튼이 있는 Story 탭부터 가리킨다
  addRecord: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-add-record"]', '[data-tut="tut-story-tab"]'], done: { signal: "moment-saved" }, pausable: true },
  openStory: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-story-tab"]'], done: { dom: '[data-tut="tut-story-tab"][aria-selected="true"]' } },
  publishOpen: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-menu-visibility"]', '[data-tut="tut-more-menu"]'], done: { dom: '[data-tut="tut-publish-go"], [data-tut-public="1"]' } },
  publishStory: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-publish-go"]'], done: { dom: '[data-tut-public="1"]' } },
  makeShareCard: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-publish-card"]', '[data-tut="tut-menu-storyCard"]', '[data-tut="tut-more-menu"]'], done: { dom: '[data-tut="tut-card-modal"]' } },
  shareCard: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-card-share"]', '[data-tut="tut-card-create"]'], done: { click: ['[data-tut="tut-card-share"]', '[data-tut="tut-card-save"]'] } },
  submitRecommend: { on: isMyTrip, goto: "/my-trips/", targets: ['[data-tut="tut-brag-confirm"]', '[data-tut="tut-brag"]', '[data-tut="tut-story-tab"][aria-selected="false"]'], done: { dom: '[data-tut="tut-brag-status"]' } },
  finish: { on: () => true, targets: [], done: {}, confirm: true },
};

function visible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("[hidden]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
}
function findTarget(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    for (const el of Array.from(document.querySelectorAll(s))) if (visible(el)) return el as HTMLElement;
  }
  return null;
}
const locNow = (): Loc => ({ path: window.location.pathname, search: new URLSearchParams(window.location.search) });
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const typing = () => { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || (a as HTMLElement).isContentEditable); };

const MISSING_AFTER_MS = 3500;

/**
 * 대상을 화면 가운데로 — 페이지 자체가 스크롤되는 대상은 window 좌표로 옮긴다.
 * scrollIntoView 는 Chrome 에서 "Tab 시작점"을 대상 쪽으로 옮겨, 키보드 사용자의 첫 Tab 이
 * 맨 앞의 '안내로 이동' 링크를 건너뛰었다(실측). 창·시트 안처럼 자체 스크롤 상자에 든 대상만 scrollIntoView.
 */
function bringIntoView(el: HTMLElement): void {
  const behavior: ScrollBehavior = reduceMotion() ? "auto" : "smooth";
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const cs = getComputedStyle(parent);
    if (/(auto|scroll)/.test(cs.overflowY) && parent.scrollHeight > parent.clientHeight + 4) { el.scrollIntoView({ block: "center", behavior }); return; }
    parent = parent.parentElement;
  }
  const r = el.getBoundingClientRect();
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - (window.innerHeight / 2 - r.height / 2)), behavior });
}

export default function GuidedJourney() {
  const t = useTranslations("journey");
  const pathname = usePathname() || "/";
  const [js, setJs] = useState<JourneyState | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mode, setMode] = useState<"target" | "offRoute" | "missing" | "failed" | "floating" | "offscreen" | "covered" | "blocked">("floating");
  /** 지금 가리키는 대상의 data-tut — 말풍선 문장을 대상에 맞춘다(메뉴가 닫혀 있으면 "더보기를 누르세요") */
  const [tutKey, setTutKey] = useState<string | null>(null);
  /** 대상이 창(공개 미리보기·공유 카드) 안에 있으면 말풍선을 한 줄로 줄인다 — 창의 내용을 덮지 않게.
      설명·건너뛰기는 '자세히'를 눌러 펼친다. */
  const [inWindow, setInWindow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** 키보드 건너뛰기 링크 자리 — body 맨 앞(Tab 첫 번째)에 둔다. 말풍선 자체는 초점을 빼앗지 않는다. */
  const [skipHost, setSkipHost] = useState<HTMLElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const stepStart = useRef<{ step: JourneyStep | null; at: number; scrolled: boolean }>({ step: null, at: 0, scrolled: false });

  // 상태 읽기·동기화(다른 탭·더보기에서 바꿔도 따라온다)
  useEffect(() => {
    const sync = () => setJs(readJourney());
    Promise.resolve().then(() => {
      sync(); setMounted(true);
      let host = document.getElementById("gkm-journey-skip-host");
      if (!host) {
        host = document.createElement("div"); host.id = "gkm-journey-skip-host";
        // 화면 맨 위에 고정 — 스크롤된 화면에서도 Tab 시작점(보이는 영역) 안에 있게 한다
        host.style.cssText = "position:fixed;top:0;left:0;z-index:96;";
        document.body.prepend(host);
      }
      setSkipHost(host);
    });
    window.addEventListener(JOURNEY_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(JOURNEY_CHANGE_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  // 화면이 바뀌면 숨김을 풀고 다시 판단
  useEffect(() => { Promise.resolve().then(() => setHidden(false)); }, [pathname]);
  // 단계가 바뀌면 '자세히'는 다시 접힌다
  const stepNow = js?.step ?? null;
  useEffect(() => { Promise.resolve().then(() => setExpanded(false)); }, [stepNow]);

  const active = js?.status === "active" && !!js.step;
  const step = active ? (js!.step as JourneyStep) : null;
  const def = step ? STEPS[step] : null;

  const advance = useCallback((from: JourneyStep) => {
    const cur = readJourney();
    let next = completeStep(cur, from);
    // 가져온 장소가 This Trip 으로 갔으면 장소 경로의 This Trip 단계로 이어 간다
    if (from === "reviewImport" && /^\/picks/.test(window.location.pathname)) next = switchToPlacesAt({ ...cur, status: "active" }, "openThisTrip");
    if (next !== cur) setJs(writeJourney(next));
  }, []);

  // 완료 판정 + 대상 추적(가벼운 주기 점검 — 화면·상태가 바뀌는 대부분의 경우를 잡는다)
  useEffect(() => {
    if (!step || !def) return;
    if (stepStart.current.step !== step) stepStart.current = { step, at: Date.now(), scrolled: false };
    const tick = () => {
      const l = locNow();
      // 첫 방문 안내(오픈 전 안내·통계 선택)가 열려 있으면 그 위에 겹치지 않는다.
      // 사용자가 지금 그 행동을 하는 창(기록 쓰기 등, data-journey-quiet)도 가리지 않는다.
      if (document.querySelector("[data-preopen-notice], [data-journey-quiet]")) { setMode("blocked"); targetRef.current = null; setRect(null); setTutKey(null); return; }
      if ((def.done.route && def.done.route(l)) || (def.done.dom && document.querySelector(def.done.dom))) { advance(step); return; }
      if (def.failDom && document.querySelector(def.failDom)) { setMode("failed"); targetRef.current = null; setRect(null); setTutKey(null); return; }
      // My Trip 단계인데 여행 목록에 있으면(이어하기·뒤로 가기) 이어 갈 여행을 가리킨다
      const viaList = !def.on(l) && def.goto === "/my-trips/" && /^\/my-trips\/?$/.test(l.path);
      if (!def.on(l) && !viaList) { setMode("offRoute"); targetRef.current = null; setRect(null); setTutKey(null); return; }
      const targets = viaList ? ['[data-tut="tut-trip-row"]'] : def.targets;
      if (targets.length === 0) { setMode("floating"); setRect(null); setTutKey(null); return; }
      const el = findTarget(targets);
      if (!el) {
        targetRef.current = null; setRect(null); setTutKey(null);
        setMode(Date.now() - stepStart.current.at > MISSING_AFTER_MS ? "missing" : "floating");
        return;
      }
      targetRef.current = el;
      setTutKey(el.getAttribute("data-tut"));
      setInWindow(!!el.closest('[aria-modal="true"], [data-tut="tut-card-modal"]'));
      const r = el.getBoundingClientRect();
      // 대상 가운데를 실제로 덮고 있는 것 — 고정 머리글·하단 탭 아래로 들어간 것은 '화면 밖'과 같고,
      // 그 밖의 창(모달·시트)에 가려진 것은 '가려짐'이다(허공을 가리키지 않고 창을 닫으라고만 한다)
      const outside = r.bottom <= 0 || r.top >= window.innerHeight;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
      const top = !outside ? document.elementFromPoint(cx, cy) : null;
      const hit = top && !el.contains(top) && !top.closest("[data-journey-bubble]") ? top : null;
      const underBar = !!hit && !!hit.closest("nav, header");
      const off = outside || underBar;
      if (off && !stepStart.current.scrolled && !typing()) {
        // 단계가 시작될 때 한 번만 대상을 보이게 한다 — 이후의 스크롤은 사용자의 것이다
        stepStart.current.scrolled = true;
        bringIntoView(el);
      }
      setRect(r);
      setMode(off ? (stepStart.current.scrolled ? "offscreen" : "target") : hit ? "covered" : "target");
    };
    tick();
    const id = window.setInterval(tick, 400);
    const onMove = () => { const el = targetRef.current; if (el && el.isConnected) setRect(el.getBoundingClientRect()); };
    window.addEventListener("scroll", onMove, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    // 실제 버튼을 눌렀는가(대신 누르지 않는다 — 사용자의 클릭을 관찰만)
    const onClick = (e: MouseEvent) => {
      if (!def.done.click) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el && def.done.click.some(s => el.closest(s))) window.setTimeout(() => advance(step), 0);
    };
    document.addEventListener("click", onClick, true);
    const onSignal = (e: Event) => { if (def.done.signal && (e as CustomEvent<JourneySignal>).detail === def.done.signal) advance(step); };
    window.addEventListener(JOURNEY_SIGNAL_EVENT, onSignal);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("scroll", onMove, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(JOURNEY_SIGNAL_EVENT, onSignal);
    };
  }, [step, def, advance]);

  // Esc = 이 화면에서 잠시 숨기기(안내를 끝내지 않는다)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) setHidden(true); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!mounted || !active || !step || !def || hidden || mode === "blocked") return null;

  const set = (next: JourneyState) => setJs(writeJourney(next));
  const prog = progressOf(js!);
  // 대상별 문장(예: 메뉴가 닫혀 있으면 "[더보기]를 누르세요") — 없으면 단계 문장
  const sayKey = tutKey && t.has(`steps.${step}.say_${tutKey}`) ? `steps.${step}.say_${tutKey}` : tutKey && t.has(`target.${tutKey}`) ? `target.${tutKey}` : `steps.${step}.say`;
  const say = t(sayKey);
  const why = t.has(`steps.${step}.why`) ? t(`steps.${step}.why`) : null;

  // 말풍선 위치 — 대상 아래(공간이 없으면 위), 화면 안으로 고정. 대상과 겹치지 않는다.
  const W = Math.min(320, (typeof window !== "undefined" ? window.innerWidth : 390) - 24);
  let style: React.CSSProperties = { position: "fixed", left: 12, right: 12, bottom: 84, margin: "0 auto", maxWidth: 420 };
  let arrow: { left: number; up: boolean } | null = null;
  if (mode === "target" && rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const below = vh - rect.bottom, above = rect.top;
    const up = below >= 190 || below >= above; // true = 말풍선이 대상 아래(화살표는 위를 가리킴)
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
    style = up ? { position: "fixed", left, top: rect.bottom + 12, width: W } : { position: "fixed", left, bottom: vh - rect.top + 12, width: W };
    arrow = { left: Math.min(Math.max(16, rect.left + rect.width / 2 - left - 7), W - 30), up };
  }

  const compact = inWindow && mode === "target";
  const body = (() => {
    if (mode === "offRoute") return { head: t("offRoute"), text: say, goto: def.goto };
    // 대상이 없으면(예: 데스크톱 도시 화면에는 픽 탭이 없다) 다른 화면에 있을 때에 한해 그 단계의 이동 링크를 준다
    if (mode === "missing") {
      const gotoHere = !!def.goto && pathname.startsWith(def.goto.replace(/\/$/, ""));
      const way = def.goto && !gotoHere && !(MERGE_STEPS as readonly string[]).includes(step) ? def.goto : undefined;
      return { head: t.has(`steps.${step}.missing`) ? t(`steps.${step}.missing`) : t("missing"), text: t(`steps.${step}.say`), goto: way };
    }
    if (mode === "covered") return { head: t("covered"), text: say, goto: undefined };
    if (mode === "failed") return { head: t("importFailed"), text: t("importFailedBody"), goto: undefined };
    if (mode === "offscreen") return { head: null, text: say, goto: undefined };
    return { head: null, text: say, goto: step === "openImport" ? def.goto : undefined };
  })();

  const node = (
    <>
      <style>{`
        @keyframes gkmJourneyIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        .gkm-journey-in { animation: gkmJourneyIn 180ms ease-out 1; }
        @media (prefers-reduced-motion: reduce) { .gkm-journey-in { animation: none; } }
      `}</style>
      {mode === "target" && rect && (
        <div aria-hidden data-journey-ring="" className="gkm-journey-in pointer-events-none fixed z-[94] rounded-xl border-2 border-action"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />
      )}
      <div key={`${step}-${mode}`} id="gkm-journey-bubble" tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="gkm-journey-say" data-journey-bubble={step} data-journey-mode={mode}
        className="gkm-journey-in z-[95] rounded-2xl border border-line bg-white text-ink shadow-[0_10px_30px_rgba(20,24,33,.18)] p-3.5" style={style}>
        {arrow && (
          <span aria-hidden className="absolute w-3.5 h-3.5 bg-white border-line rotate-45"
            style={arrow.up ? { top: -7, left: arrow.left, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -7, left: arrow.left, borderRightWidth: 1, borderBottomWidth: 1 }} />
        )}
        {choosing ? (
          <JourneyStartChooser compact hasTrip onDone={() => setChoosing(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              {prog && <span className="text-[11px] font-black text-sub">{t(prog.phase === "start" ? "phaseStart" : "phaseMyTrip")} · {prog.index}/{prog.total}</span>}
              <button type="button" onClick={() => setHidden(true)} aria-label={t("hide")} title={t("hide")}
                className="gkm-focus ml-auto -mr-1 w-8 h-8 rounded-full text-sub hover:bg-surface-dim inline-flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {body.head && <p className="mt-0.5 text-[12.5px] font-bold text-sub">{body.head}</p>}
            <p id="gkm-journey-say" aria-live="polite" className="mt-0.5 text-[14.5px] font-black leading-snug">{body.text}</p>
            {why && mode !== "failed" && (!compact || expanded) && <p className="mt-1 text-[12.5px] leading-relaxed text-sub">{why}</p>}
            {(body.goto || mode === "offscreen" || (def.confirm && mode !== "offRoute" && mode !== "missing") || def.pausable || mode === "failed") && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {body.goto && (
                <Link href={body.goto} className="gkm-focus inline-flex items-center min-h-10 px-3.5 rounded-xl bg-ink text-white text-[13px] font-bold">{t(`goto.${step}`)}</Link>
              )}
              {mode === "offscreen" && (
                <button type="button" onClick={() => { if (targetRef.current) bringIntoView(targetRef.current); }}
                  className="gkm-focus inline-flex items-center min-h-10 px-3.5 rounded-xl border border-ink text-[13px] font-bold">{t("scrollTo")}</button>
              )}
              {def.confirm && mode !== "offRoute" && mode !== "missing" && (
                <button type="button" onClick={() => step === "finish" ? set(endJourney(completeStep(js!, "finish"), "done")) : advance(step)}
                  className="gkm-focus inline-flex items-center min-h-10 px-3.5 rounded-xl border border-ink text-[13px] font-bold">{t(`confirm.${step}`)}</button>
              )}
              {def.pausable && (
                <button type="button" onClick={() => set(pauseJourney(js!))}
                  className="gkm-focus inline-flex items-center min-h-10 px-3.5 rounded-xl border border-line text-[13px] font-bold">{t("pauseForTrip")}</button>
              )}
              {mode === "failed" && (
                <button type="button" onClick={() => set(switchToPlacesAt(js!, "pickCity"))}
                  className="gkm-focus inline-flex items-center min-h-10 px-3.5 rounded-xl border border-ink text-[13px] font-bold">{t("switchToPlaces")}</button>
              )}
            </div>
            )}
            {compact && !expanded && (
              <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className="gkm-focus mt-1 min-h-9 text-[12px] font-bold text-sub underline underline-offset-2">{t("more")}</button>
            )}
            {step !== "finish" && (!compact || expanded) && (
              <div className="mt-2 flex flex-wrap gap-x-3 text-[12px] font-bold text-sub">
                <button type="button" onClick={() => set(skipStep(js!))} className="gkm-focus min-h-9 underline underline-offset-2">{t("skipStep")}</button>
                <button type="button" onClick={() => setChoosing(true)} className="gkm-focus min-h-9 underline underline-offset-2">{t("changePath")}</button>
                <button type="button" onClick={() => set(endJourney(js!, "later"))} className="gkm-focus min-h-9 underline underline-offset-2">{t("endJourney")}</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
  // 건너뛰기 링크 — 평소에는 보이지 않고, Tab 으로 초점을 받으면 나타난다. 누르면 말풍선의 첫 버튼으로 간다.
  const skip = skipHost ? createPortal(
    <a href="#gkm-journey-bubble"
      onClick={e => {
        e.preventDefault();
        const box = document.getElementById("gkm-journey-bubble");
        const first = box?.querySelector<HTMLElement>("a[href], button:not([disabled])");
        (first ?? box)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[96] focus:rounded-xl focus:bg-ink focus:text-white focus:px-3.5 focus:py-2.5 focus:text-[13px] focus:font-bold"
    >{t("skipToGuide")}</a>,
    skipHost,
  ) : null;
  return <>{skip}{createPortal(node, document.body)}</>;
}

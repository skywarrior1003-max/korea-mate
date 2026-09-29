// Guided Journey — 상태 기계 (GOKOREAMATE-GUIDED-JOURNEY-TUTORIAL-V1)
//
// 기능을 설명하는 투어가 아니다. 사용자가 고른 출발 방법대로 실제 화면의 버튼을 따라가며
// 여행을 하나 만들고, My Trip 에서 합류한 뒤 기록 → Story → 공유까지 이어 가는 안내다.
//
// 원칙
//  · 출발 방법은 사용자가 고른다 — 어느 쪽도 기본 선택·우선 강조하지 않는다.
//  · 단계 완료는 실제 행동의 결과로만 판정한다(화면 도착·버튼 상태·저장 신호). "다음"을 눌렀다고
//    완료하지 않는다. 예외는 '날짜가 맞아요'처럼 확인 자체가 행동인 단계뿐이다.
//  · 언제든 건너뛰기·끝내기·다른 경로 선택·다시 시작이 된다. 사진·기록 단계는 '여행 중에 이어하기'로
//    멈췄다가 더보기에서 다시 이어 간다.
//  · 튜토리얼은 사진을 올리거나 공개·공유를 대신 실행하지 않는다. 사용자의 데이터를 바꾸지 않는다.
//  · 상태는 이 기기(localStorage)에만 둔다. 서버·AI 호출 없음.

export const JOURNEY_KEY = "gkm_guided_journey_v1";
/** 이전 안내(First Trip Journey Guide)의 저장 키 — 꺼 둔 사용자는 새 안내도 꺼진 채로 시작한다 */
export const LEGACY_GUIDE_KEY = "koreamate_journey_guide_v1";
/** 행동 결과 신호(저장·날짜 적용 등) — 제품 코드가 보내고 안내가 듣는다 */
export const JOURNEY_SIGNAL_EVENT = "gkm:journey-signal";

export type JourneyPath = "course" | "places" | "import" | "mytrip";

/** My Trip 에서 모든 경로가 합류한 뒤의 공통 단계 */
export const MERGE_STEPS = [
  "tripSaved",       // 일정이 My Trip 에 자동 저장됐다(저장됨)
  "checkDates",      // 여행 날짜 확인·수정
  "addRecord",       // 사진·메모(선택, 여행 중에 이어하기 가능)
  "openStory",       // Story 탭
  "publishOpen",     // 공개 설정 열기(더보기 → 비공개/공개) — 이미 공개면 바로 지나간다
  "publishStory",    // 보이는 내용을 확인하고 공개 여부를 직접 결정(스토리 공개하기)
  "makeShareCard",   // 공유 카드 만들기
  "shareCard",       // 바로 공유 / 이미지 저장 — 사용자가 직접
  "submitRecommend", // 나의 여행 자랑하기 = 지역 추천에 제출(검토 후 게시)
  "finish",
] as const;

export const PATH_STEPS = {
  course: ["pickCity", "pickCourse", "adoptCourse", "adoptDates", ...MERGE_STEPS],
  places: ["pickCity", "pickPlace", "savePlace", "openPicks", "addToThisTrip", "openThisTrip", "buildTrip", ...MERGE_STEPS],
  import: ["openImport", "pasteLink", "reviewImport", ...MERGE_STEPS],
  mytrip: ["openMyTrip", ...MERGE_STEPS],
} as const;

export type JourneyStep = (typeof PATH_STEPS)[JourneyPath][number];

export type JourneyStatus = "idle" | "active" | "paused" | "later" | "done" | "off";

export interface JourneyState {
  v: 1;
  status: JourneyStatus;
  path: JourneyPath | null;
  step: JourneyStep | null;
  /** 실제 행동으로 끝낸 단계 */
  done: JourneyStep[];
  /** 건너뛴 단계(완료와 구분해 기록) */
  skipped: JourneyStep[];
  updatedAt: number;
}

export function defaultJourney(): JourneyState {
  return { v: 1, status: "idle", path: null, step: null, done: [], skipped: [], updatedAt: 0 };
}

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (s?: Store): Store | undefined => s ?? (typeof window !== "undefined" ? window.localStorage : undefined);

const STATUSES: JourneyStatus[] = ["idle", "active", "paused", "later", "done", "off"];
const PATHS: JourneyPath[] = ["course", "places", "import", "mytrip"];

export function readJourney(s?: Store): JourneyState {
  const st = store(s);
  if (!st) return defaultJourney();
  try {
    const raw = st.getItem(JOURNEY_KEY);
    if (!raw) {
      // 이전 안내를 꺼 둔 사용자는 새 안내도 꺼진 채로(동의 없이 다시 켜지 않는다)
      const legacy = st.getItem(LEGACY_GUIDE_KEY);
      if (legacy && (JSON.parse(legacy) as { enabled?: boolean }).enabled === false) return { ...defaultJourney(), status: "off" };
      return defaultJourney();
    }
    const p = JSON.parse(raw) as Partial<JourneyState>;
    const path = PATHS.includes(p.path as JourneyPath) ? (p.path as JourneyPath) : null;
    const steps = path ? (PATH_STEPS[path] as readonly string[]) : [];
    const step = path && steps.includes(p.step as string) ? (p.step as JourneyStep) : null;
    return {
      v: 1,
      status: STATUSES.includes(p.status as JourneyStatus) ? (p.status as JourneyStatus) : "idle",
      path, step,
      done: Array.isArray(p.done) ? (p.done.filter(x => steps.includes(x)) as JourneyStep[]) : [],
      skipped: Array.isArray(p.skipped) ? (p.skipped.filter(x => steps.includes(x)) as JourneyStep[]) : [],
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
    };
  } catch { return defaultJourney(); }
}

export const JOURNEY_CHANGE_EVENT = "gkm:journey-change";

export function writeJourney(state: JourneyState, s?: Store): JourneyState {
  const next = { ...state, updatedAt: Date.now() };
  try { store(s)?.setItem(JOURNEY_KEY, JSON.stringify(next)); } catch { /* 저장 실패는 조용히 */ }
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(JOURNEY_CHANGE_EVENT, { detail: next })); } catch { /* ignore */ }
  return next;
}

/** 경로 선택 = 그 경로의 첫 단계부터(다른 경로에서 넘어와도 처음부터) */
export function startJourney(state: JourneyState, path: JourneyPath): JourneyState {
  return { ...state, status: "active", path, step: PATH_STEPS[path][0] as JourneyStep, done: [], skipped: [] };
}

function nextOf(path: JourneyPath, step: JourneyStep): JourneyStep | null {
  const list = PATH_STEPS[path] as readonly JourneyStep[];
  const i = list.indexOf(step);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}

/** 실제 행동으로 끝낸 단계 → 다음 단계. 현재 단계가 아니면 무시(늦게 도착한 신호로 건너뛰지 않는다) */
export function completeStep(state: JourneyState, step: JourneyStep): JourneyState {
  if (state.status !== "active" || !state.path || state.step !== step) return state;
  const next = nextOf(state.path, step);
  const done = state.done.includes(step) ? state.done : [...state.done, step];
  return next ? { ...state, step: next, done } : { ...state, step: null, done, status: "done" };
}

/** 건너뛰기 — 완료와 구분해 기록하고 다음 단계로 */
export function skipStep(state: JourneyState): JourneyState {
  if (state.status !== "active" || !state.path || !state.step) return state;
  const step = state.step;
  const next = nextOf(state.path, step);
  const skipped = state.skipped.includes(step) ? state.skipped : [...state.skipped, step];
  return next ? { ...state, step: next, skipped } : { ...state, step: null, skipped, status: "done" };
}

/** 여행 중에 이어하기 — 현재 단계에 멈춰 둔다(더보기·홈에서 이어하기) */
export function pauseJourney(state: JourneyState): JourneyState {
  return state.status === "active" ? { ...state, status: "paused" } : state;
}
export function resumeJourney(state: JourneyState): JourneyState {
  return state.status === "paused" && state.step ? { ...state, status: "active" } : state;
}

/** 가져온 결과가 This Trip 으로 갔으면(여러 장소) 장소 경로의 This Trip 단계로 이어 간다 */
export function switchToPlacesAt(state: JourneyState, step: JourneyStep): JourneyState {
  const list = PATH_STEPS.places as readonly JourneyStep[];
  if (!list.includes(step)) return state;
  return { ...state, status: "active", path: "places", step, done: [...state.done], skipped: [...state.skipped] };
}

export function endJourney(state: JourneyState, status: "done" | "later" | "off"): JourneyState {
  return { ...state, status, step: status === "done" ? null : state.step };
}

/** 진행 표시 — 합류 전(경로 고유) / 합류 후(공통) 를 나눠 "2/4" 처럼 보인다 */
export function progressOf(state: JourneyState): { phase: "start" | "mytrip"; index: number; total: number } | null {
  if (!state.path || !state.step) return null;
  const merge = MERGE_STEPS as readonly string[];
  if (merge.includes(state.step)) return { phase: "mytrip", index: merge.indexOf(state.step) + 1, total: merge.length };
  const own = (PATH_STEPS[state.path] as readonly string[]).filter(s => !merge.includes(s));
  return { phase: "start", index: own.indexOf(state.step) + 1, total: own.length };
}

export type JourneySignal = "dates-applied" | "moment-saved";

/** 제품 코드가 행동 결과를 알린다(안내가 꺼져 있어도 부작용 없음) */
export function signalJourney(name: JourneySignal): void {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(JOURNEY_SIGNAL_EVENT, { detail: name })); } catch { /* ignore */ }
}

/** 이 기기에 여행이 하나라도 있는가(기존 Home 판정과 같은 규칙) */
export function deviceHasTrip(s?: Pick<Storage, "length" | "key">): boolean {
  const st = s ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!st) return false;
  try {
    for (let i = 0; i < st.length; i++) if (st.key(i)?.startsWith("koreamate_itin3_id_")) return true;
  } catch { /* ignore */ }
  return false;
}

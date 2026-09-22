// First Trip Journey Guide — 상태 기계 (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1)
//
// 기능 투어가 아니다. 첫 사용자가 실제 한 번의 여행을 완성하는 동안, 그 기능을
// 실제로 만나는 순간에만 나타나는 가벼운 안내다.
//
// 원칙(Owner 확정):
//  · 강제 blocking overlay 없음 — 항상 지나칠 수 있다.
//  · 한 순간에 하나만(전역 잠금).
//  · 첫 사용자 자동 · 이미 본 안내는 자동 반복 없음.
//  · 사용자의 의도를 AI 로 추측해 띄우지 않는다 — 트리거는 화면 등장뿐이다.
//  · More 에서 tips ON/OFF · 다시 보기 제공. 완료 후 마지막 한 번만 그 위치를 알려 준다.

export const GUIDE_STEPS = [
  "discover",    // Home — 도시·장소 발견 (TUTORIAL-V1: Chapter A 의 첫 걸음)
  "save",        // Place Detail — 저장
  "thisTrip",    // Picks — This Trip
  "planner",     // Planner — This Trip with AI 의 의미·날짜/속도
  "myTripEdit",  // My Trip — 장소 추가/제거/순서
  "directions",  // My Trip — 지도앱 길찾기 handoff
  "photo",       // My Trip — 순간(사진) 남기기
  "aiWriting",   // My Trip — AI 글 방향 3가지
  "story",       // My Trip — 내용이 Story 로 이어짐
  "myPlaces",    // Place Detail — 내 장소로 남기기
  "share",       // My Trip — Share
  "finale",      // 마지막 한 번 — More 의 팁 ON/OFF·다시 보기 안내
] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

// ── TUTORIAL-V1 §3 — 세 Chapter: 한 번에 전부 설명하지 않는다 ────────────────
// A(여행 시작): 아직 여행이 없는 사용자. B(내 일정 보기): 일정은 있는데 기록이
// 없다. C(Story): 첫 기록이 생겼거나 Story 탭을 처음 열었다. myPlaces 는
// 여정 밖 보조 안내라 chapter 진행 표시에 넣지 않는다.
export const GUIDE_CHAPTERS = {
  A: ["discover", "save", "thisTrip", "planner"],
  B: ["myTripEdit", "directions", "photo"],
  C: ["aiWriting", "story", "share", "finale"],
} as const;
export type GuideChapter = keyof typeof GUIDE_CHAPTERS;

export function chapterOf(step: GuideStep): GuideChapter | null {
  for (const c of Object.keys(GUIDE_CHAPTERS) as GuideChapter[]) {
    if ((GUIDE_CHAPTERS[c] as readonly string[]).includes(step)) return c;
  }
  return null;
}
/** Chapter 안에서의 진행(1-base) — 진행 칩 "A · 2/4" 용 */
export function stepProgress(step: GuideStep): { chapter: GuideChapter; index: number; total: number } | null {
  const c = chapterOf(step);
  if (!c) return null;
  const list = GUIDE_CHAPTERS[c] as readonly string[];
  return { chapter: c, index: list.indexOf(step) + 1, total: list.length };
}

/**
 * §3 노출 조건 — 화면 도착 트리거는 그대로 두고, 사용자가 아직 도달하지 않은
 * 기능을 너무 일찍 설명하지 않게 하는 결정적 문맥이다. 미전달 필드는 판정에
 * 쓰지 않는다(하위호환 — 기존 호출부는 기존 동작 그대로).
 */
export interface GuideContext {
  /** 이 기기에 여행이 하나라도 있는가 — Chapter A 는 없음일 때만 */
  hasTrip?: boolean;
  /** 이 여행에 기록(moment)이 하나라도 있는가 — C 의 story/share 는 있고 나서 */
  hasMoment?: boolean;
}

export interface GuideState {
  enabled: boolean;
  seen: Partial<Record<GuideStep, true>>;
  /** TUTORIAL-V1 — 상태 version. v1(필드 없음) 데이터는 그대로 읽힌다. */
  version?: number;
  /** tutorial_started 를 한 번만 보내기 위한 표식 */
  started?: true;
}

export const GUIDE_STATE_VERSION = 2;
export const GUIDE_STORAGE_KEY = "koreamate_journey_guide_v1";

/** finale 는 핵심 여정을 한 바퀴 돈 뒤에만 — 사진과 스토리까지 봤다면 여행 하나가 끝났다 */
const CORE_FOR_FINALE: GuideStep[] = ["save", "planner", "myTripEdit", "photo", "story"];

export function defaultGuideState(): GuideState {
  return { enabled: true, seen: {} };
}

export function readGuideState(storage?: Pick<Storage, "getItem">): GuideState {
  const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!s) return defaultGuideState();
  try {
    const raw = s.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return defaultGuideState();
    const p = JSON.parse(raw) as Partial<GuideState>;
    return {
      enabled: p.enabled !== false,
      seen: p.seen && typeof p.seen === "object" ? p.seen : {},
      ...(typeof p.version === "number" ? { version: p.version } : {}),
      ...(p.started === true ? { started: true as const } : {}),
    };
  } catch { return defaultGuideState(); }
}

export function writeGuideState(state: GuideState, storage?: Pick<Storage, "setItem">): void {
  const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!s) return;
  try { s.setItem(GUIDE_STORAGE_KEY, JSON.stringify({ ...state, version: GUIDE_STATE_VERSION })); } catch { /* 저장 실패는 조용히 */ }
}

export function shouldShowStep(state: GuideState, step: GuideStep, ctx?: GuideContext): boolean {
  if (!state.enabled) return false;
  if (state.seen[step]) return false;
  if (step === "finale") return CORE_FOR_FINALE.every(k => state.seen[k]);
  // §3 — Chapter 문맥 gating(전달된 필드만 판정):
  if (ctx) {
    const c = chapterOf(step);
    // A(여행 시작)는 아직 여행이 없는 사용자에게만 — 이미 여행이 있으면 지나간 장이다.
    if (c === "A" && ctx.hasTrip === true) return false;
    // C 의 story/share 는 첫 기록이 생기고 나서(도달 전 기능을 미리 설명하지 않는다).
    // aiWriting 은 캡처 화면 안(사진을 고른 순간)이라 문맥 자체가 트리거다.
    if ((step === "story" || step === "share") && ctx.hasMoment === false) return false;
  }
  return true;
}

/** §5 건너뛰기 — 그 Chapter 의 남은 안내 전부를 본 것으로 기록한다(데이터 무변경). */
export function skipChapter(state: GuideState, step: GuideStep): GuideState {
  const c = chapterOf(step);
  if (!c) return markStepSeen(state, step);
  const seen = { ...state.seen };
  for (const s of GUIDE_CHAPTERS[c]) seen[s as GuideStep] = true;
  return { ...state, seen };
}

/** Chapter 의 모든 step 이 seen 인가 — chapter_completed 판정 */
export function chapterCompleted(state: GuideState, chapter: GuideChapter): boolean {
  return (GUIDE_CHAPTERS[chapter] as readonly string[]).every(s => state.seen[s as GuideStep]);
}

// ── §8 계측 — 내부 event interface 만. 외부 analytics 신규 추가 없음:
// 기존 GA4(gtag)가 페이지에 있으면 그 계층을 재사용하고, 없으면 CustomEvent 로
// 남겨 나중에 구독할 수 있게 한다. 사용자 문장·사진·장소 목록은 싣지 않는다.
export type GuideEventName =
  | "tutorial_started" | "chapter_completed" | "tutorial_skipped"
  | "tutorial_replayed" | "tutorial_finished";
export function emitGuideEvent(name: GuideEventName, payload: { chapter?: GuideChapter; step?: GuideStep } = {}): void {
  if (typeof window === "undefined") return;
  try {
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof g === "function") g("event", name, payload);
    window.dispatchEvent(new CustomEvent(`gkm:${name}`, { detail: payload }));
  } catch { /* 계측 실패는 조용히 */ }
}

export function markStepSeen(state: GuideState, step: GuideStep): GuideState {
  return { ...state, seen: { ...state.seen, [step]: true } };
}

export function setGuideEnabled(state: GuideState, enabled: boolean): GuideState {
  return { ...state, enabled };
}

/** 다시 보기 — 본 기록만 지운다(ON/OFF 는 유지) */
export function resetGuideSeen(state: GuideState): GuideState {
  return { ...state, seen: {} };
}

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

export interface GuideState {
  enabled: boolean;
  seen: Partial<Record<GuideStep, true>>;
}

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
    };
  } catch { return defaultGuideState(); }
}

export function writeGuideState(state: GuideState, storage?: Pick<Storage, "setItem">): void {
  const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!s) return;
  try { s.setItem(GUIDE_STORAGE_KEY, JSON.stringify(state)); } catch { /* 저장 실패는 조용히 */ }
}

export function shouldShowStep(state: GuideState, step: GuideStep): boolean {
  if (!state.enabled) return false;
  if (state.seen[step]) return false;
  if (step === "finale") return CORE_FOR_FINALE.every(k => state.seen[k]);
  return true;
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

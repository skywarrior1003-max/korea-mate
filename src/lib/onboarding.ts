// 처음 쓰는 사람에게 딱 한 번만 보여주는 안내의 진행 상태.
//
// 서버도 DB 도 쓰지 않는다. 이 사람이 이 기기에서 안내를 봤는지가 전부이고,
// 그건 기기에 두면 되는 정보다.
//
// 다시 보여주지 않는 쪽으로 실수한다. 안내를 두 번 보는 것은 방해지만
// 한 번 덜 보는 것은 그냥 화면을 직접 쓰는 것이다.

export const THIS_TRIP_COACH_KEY = "koreamate_this_trip_coach_v1";

/** 2단계다. 끝나면 "done" 이고 다시 시작하지 않는다. */
export type CoachStep = "plan" | "time" | "done";

const ORDER: CoachStep[] = ["plan", "time", "done"];

export function readCoachStep(): CoachStep {
  if (typeof window === "undefined") return "done";
  try {
    const raw = localStorage.getItem(THIS_TRIP_COACH_KEY);
    if (raw === null) return "plan";
    return (ORDER as string[]).includes(raw) ? (raw as CoachStep) : "done";
  } catch {
    // 저장소를 못 읽는 브라우저에서 매번 안내를 띄우지 않는다.
    return "done";
  }
}

export function writeCoachStep(step: CoachStep): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(THIS_TRIP_COACH_KEY, step); } catch { /* 저장 못 해도 흐름은 막지 않는다 */ }
}

/** 다음 단계. "time" 다음은 끝이다. */
export function nextCoachStep(step: CoachStep): CoachStep {
  if (step === "plan") return "time";
  return "done";
}

/** 사용자가 닫아도 완료로 본다 — 다시 붙잡지 않는다. */
export function dismissCoach(): CoachStep {
  return "done";
}

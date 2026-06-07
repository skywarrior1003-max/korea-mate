// ─────────────────────────────────────────────────────────────────────
//  KoreaMate · Shared Planner Store (localStorage)
//  /planner 와 /itinerary 가 동일한 스케줄 데이터를 공유한다.
//  key: koreamate_planner_v1
// ─────────────────────────────────────────────────────────────────────

export const PLANNER_KEY   = "koreamate_planner_v1";
export const PLANNER_EVENT = "koreamate-planner-updated";

export interface PlannerDay {
  label:       string;  // "Day 1"
  date:        string;  // "2026-10-15"
  arrivalTime: string;  // "09:00"
}

export interface PlannerSnapshot {
  startDate:    string;
  numDays:      number;
  arrivalTimes: string[];
  /** key = day index (0-based), value = CartItem id array (serialized) */
  scheduledIds: Record<number, string[]>;
  updatedAt:    number;
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// ── CRUD ──────────────────────────────────────────────────────────────

export function readPlannerSnapshot(): PlannerSnapshot | null {
  if (typeof window === "undefined") return null;
  return safe(() => {
    const raw = localStorage.getItem(PLANNER_KEY);
    return raw ? (JSON.parse(raw) as PlannerSnapshot) : null;
  }, null);
}

export function writePlannerSnapshot(snap: PlannerSnapshot): void {
  safe(() => {
    localStorage.setItem(PLANNER_KEY, JSON.stringify(snap));
    window.dispatchEvent(new CustomEvent(PLANNER_EVENT));
  }, undefined);
}

export function clearPlannerSnapshot(): void {
  safe(() => {
    localStorage.removeItem(PLANNER_KEY);
    window.dispatchEvent(new CustomEvent(PLANNER_EVENT));
  }, undefined);
}

/** Itinerary 페이지에서 "내 플래너에 저장된 날짜" 정보만 빠르게 읽기 */
export function getPlannerMeta(): { startDate: string; numDays: number } | null {
  const snap = readPlannerSnapshot();
  if (!snap) return null;
  return { startDate: snap.startDate, numDays: snap.numDays };
}

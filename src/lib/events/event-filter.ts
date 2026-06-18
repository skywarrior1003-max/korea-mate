// GoKoreaMate / gokoreamate.com — Events Filter
// TASK-016: Explore & Events API
// 날짜 비교: ISO 문자열 사전순 비교 (new Date() 호출 금지 — UTC/KST 경계선 버그 원천 차단)

import type { RawEvent, EventsInput, EventType } from "./types";

// ─── Date Filter ──────────────────────────────────────────────────────────────
// trip_date 기준 활성 이벤트 판별.
// startDate & endDate 모두 null → evergreen (항상 활성).
// displayUntil은 무시 — trip_date 모드는 여행 계획용이며 미래 이벤트도 조회해야 함.

export function isActiveOnTripDate(event: RawEvent, tripDate: string): boolean {
  const { startDate, endDate } = event;

  if (!startDate && !endDate) return true;           // evergreen

  if (startDate && tripDate < startDate) return false;
  if (endDate   && tripDate > endDate)   return false;

  return true;
}

// ─── Cluster Filter ───────────────────────────────────────────────────────────

export function matchesCluster(event: RawEvent, clusters?: string[]): boolean {
  if (!clusters || clusters.length === 0) return true;
  return clusters.includes(event.journeyCluster);
}

// ─── Type Filter ──────────────────────────────────────────────────────────────

export function matchesType(event: RawEvent, types?: EventType[]): boolean {
  if (!types || types.length === 0) return true;
  return types.includes(event.type);
}

// ─── Combined Filter ──────────────────────────────────────────────────────────

export function filterEvents(events: RawEvent[], input: EventsInput): RawEvent[] {
  return events.filter(
    (e) =>
      isActiveOnTripDate(e, input.trip_date) &&
      matchesCluster(e, input.journey_clusters) &&
      matchesType(e, input.types),
  );
}

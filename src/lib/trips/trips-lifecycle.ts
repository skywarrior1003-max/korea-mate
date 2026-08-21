// Trips 목록이 여행을 세 묶음으로 가르는 규칙과, 진행 중 여행의 "오늘 · 장소" 한 줄.
// (TASK-MY-TRIPS-FINAL-UI-V1)
//
// 기준은 실제 날짜 하나뿐이다 — 진행률·완료 신호 같은 추정값을 쓰지 않는다.
//   traveling : start ≤ today ≤ end
//   upcoming  : today < start (날짜가 없는 여행도 여기 — 아직 떠나지 않은 것으로 본다)
//   past      : end < today → Story 로 들어간다
//
// "오늘 · 장소"는 GPS 가 아니다. 오늘 Day 의 일정 시간으로 "일정상 어디쯤인지"만
// 본다(Story 와 같은 `stopReached` 규칙). 오늘 Day 가 없거나 장소가 없으면 null —
// 없는 사실을 만들지 않는다.

import { stopReached } from "../share/private-story-adapter.ts";

export interface TripLifecycleInput {
  startDate: string;   // "YYYY-MM-DD" 또는 ""
  endDate:   string;   // "YYYY-MM-DD" 또는 ""
}

export type TripBucket = "traveling" | "upcoming" | "past";

export function tripBucket(t: TripLifecycleInput, todayISO: string): TripBucket {
  if (t.endDate && t.endDate < todayISO) return "past";
  if (t.startDate && t.endDate && t.startDate <= todayISO && todayISO <= t.endDate) return "traveling";
  return "upcoming";
}

export function classifyTrips<T extends TripLifecycleInput>(trips: T[], todayISO: string) {
  const traveling: T[] = [], upcoming: T[] = [], past: T[] = [];
  for (const t of trips) {
    const b = tripBucket(t, todayISO);
    (b === "traveling" ? traveling : b === "upcoming" ? upcoming : past).push(t);
  }
  // 예정은 가까운 출발일부터, 지난 여행은 최근 종료일부터. 날짜 없는 예정은 뒤로.
  upcoming.sort((a, b) => (a.startDate || "9999") < (b.startDate || "9999") ? -1 : 1);
  past.sort((a, b) => (a.endDate > b.endDate ? -1 : 1));
  return { traveling, upcoming, past };
}

/** 일정 JSON(v1 Day[] · v2 {__v:2, scheduled}) 에서 Day 목록만 꺼낸다. 모양이 다르면 빈 배열. */
export function scheduledDaysOf(days: unknown): Array<{ date?: string; places?: Array<{ name?: string; time?: string | null }> }> {
  if (Array.isArray(days)) return days as Array<{ date?: string; places?: Array<{ name?: string; time?: string | null }> }>;
  if (days && typeof days === "object" && Array.isArray((days as { scheduled?: unknown }).scheduled)) {
    return (days as { scheduled: Array<{ date?: string; places?: Array<{ name?: string; time?: string | null }> }> }).scheduled;
  }
  return [];
}

/**
 * 오늘 Day 에서 "지금 일정상" 장소 이름. 시간이 지난 장소가 있으면 그중 마지막,
 * 아직 하나도 안 됐으면 오늘의 첫 장소(오늘 가는 곳이라는 사실은 참이다).
 * 오늘 Day 가 없거나 이름 있는 장소가 없으면 null.
 */
export function todayStopLabel(days: unknown, todayISO: string, nowHHMM: string): string | null {
  const day = scheduledDaysOf(days).find(d => typeof d.date === "string" && d.date === todayISO);
  if (!day) return null;
  const places = (day.places ?? []).filter(p => typeof p?.name === "string" && p.name.trim() !== "");
  if (places.length === 0) return null;
  const reached = places.filter(p => stopReached(todayISO, p.time ?? null, { todayISO, nowHHMM }));
  const pick = reached.length > 0 ? reached[reached.length - 1]! : places[0]!;
  return pick.name!.trim();
}

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * "Aug 19 – Aug 24" — 사용자의 locale 로. 한쪽만 있으면 그 날짜만, 둘 다 없으면 "".
 * 시안은 양쪽에 달을 다 적는다("Aug 19 – Aug 24"). Intl.formatRange 는 같은 달이면
 * "Aug 19 – 24" 로 줄이므로 쓰지 않는다.
 */
export function formatTripDates(start: string, end: string, locale: string): string {
  const s = parseISODate(start), e = parseISODate(end);
  const f = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  if (!s && !e) return "";
  if (!s || !e) return f.format((s ?? e)!);
  return `${f.format(s)} – ${f.format(e)}`;
}

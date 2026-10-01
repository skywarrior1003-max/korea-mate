// 내 장소 하나로 My Trip 시작하기 · 지금 여행에 더하기.
//
// 사용자가 버튼을 누르기 전에는 여행을 만들지 않는다. AI 를 부르지 않는다 — 일정은
// 이 장소 하나로 시작하고, 나머지는 사용자가 채운다. 끝 날짜를 정하라고 하지 않는다
// (시작일 = 끝일, My Trip 에서 늘린다). 5개 도시 중 고르라고 하지 않는다 — 장소가
// 가진 도시를 그대로 쓰고, 없으면 비워 둔다(지어내지 않는다).
//
// 위치 우선순위: 장소에 확정된 좌표(링크·지도 확인·사용자가 고른 촬영 위치)만 쓴다.
// 휴대폰 GPS 를 여기서 읽지 않는다.
//
// 순수 계산(buildPlaceStop · appendStopToDays)과 네트워크(startTripFromSpot ·
// addSpotToTrip)를 나눠, 앞쪽은 브라우저 없이 테스트한다.

import { userSpotSourceKey } from "../place-identity.ts";

export interface SpotForTrip {
  id:        string;
  name?:     string | null;
  display_title?: string | null;
  address?:  string | null;
  city?:     string | null;
  category?: string | null;
  lat?:      number | null;
  lng?:      number | null;
}

/** KST 기준 오늘 날짜와 지금 시각(5분 단위 내림). */
export function nowKst(now: Date = new Date()): { date: string; time: string } {
  const k = new Date(now.getTime() + 9 * 3600_000);
  const date = k.toISOString().slice(0, 10);
  const h = k.getUTCHours(), m = Math.floor(k.getUTCMinutes() / 5) * 5;
  return { date, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

const VALID_CATEGORY = new Set(["attraction", "nature", "restaurant", "event", "accommodation"]);

/** 일정 한 칸. sourceKey = user_spot:<id> — 이 열쇠로 장소 기록이 카드에 붙는다. */
export function buildPlaceStop(spot: SpotForTrip, displayName: string, time: string | null) {
  const hasCoord = typeof spot.lat === "number" && typeof spot.lng === "number"
    && Number.isFinite(spot.lat) && Number.isFinite(spot.lng);
  return {
    name: displayName,
    time: time ?? "",
    ...(time ? { timeSource: "user" as const } : {}),
    ...(spot.category && VALID_CATEGORY.has(spot.category) ? { category: spot.category } : {}),
    location: (spot.address ?? "").trim(),
    duration: "",
    tips: "",
    googleMapsUrl: "",
    source: "user_spot" as const,
    place_id: spot.id,
    sourceKey: userSpotSourceKey(spot.id),
    ...(hasCoord ? { lat: spot.lat as number, lng: spot.lng as number } : {}),
  };
}

type Day = { date?: string; dayNumber?: number; places?: Array<Record<string, unknown>> } & Record<string, unknown>;

export type AppendResult =
  | { ok: true; days: unknown; dayNumber: number; date: string | null }
  | { ok: false; reason: "duplicate"; dayNumber: number }
  | { ok: false; reason: "bad_days" };

/**
 * 여행 days(v1 배열 · v2 {__v:2, scheduled, unscheduled})에 장소를 더한다.
 * 오늘 날짜의 Day 가 있으면 거기, 없으면 마지막 Day 끝에. 이미 같은 장소가
 * 있으면 더하지 않는다(중복 안내).
 */
export function appendStopToDays(daysRaw: unknown, stop: ReturnType<typeof buildPlaceStop>, today: string, timeForToday: string | null): AppendResult {
  const isV2 = !!daysRaw && typeof daysRaw === "object" && !Array.isArray(daysRaw) && (daysRaw as { __v?: unknown }).__v === 2;
  const scheduled: Day[] | null = isV2
    ? (Array.isArray((daysRaw as { scheduled?: unknown }).scheduled) ? (daysRaw as { scheduled: Day[] }).scheduled : null)
    : (Array.isArray(daysRaw) ? (daysRaw as Day[]) : null);
  if (!scheduled) return { ok: false, reason: "bad_days" };

  for (let i = 0; i < scheduled.length; i++) {
    const ps = Array.isArray(scheduled[i].places) ? scheduled[i].places as Array<Record<string, unknown>> : [];
    if (ps.some(p => p.sourceKey === stop.sourceKey || (p.source === "user_spot" && p.place_id === stop.place_id))) {
      return { ok: false, reason: "duplicate", dayNumber: Number(scheduled[i].dayNumber) || i + 1 };
    }
  }

  const next = scheduled.map(d => ({ ...d, places: Array.isArray(d.places) ? [...d.places] : [] }));
  let idx = next.findIndex(d => d.date === today);
  const isToday = idx >= 0;
  if (idx < 0) idx = next.length - 1;
  if (idx < 0) {
    next.push({ date: today, dayNumber: 1, places: [] });
    idx = 0;
  }
  // 오늘이 아닌 Day 에는 시각을 넣지 않는다 — 다른 날의 "지금" 은 뜻이 없다.
  const placed = isToday && timeForToday ? { ...stop, time: timeForToday, timeSource: "user" as const } : { ...stop, time: "", timeSource: undefined };
  if (!placed.timeSource) delete (placed as { timeSource?: unknown }).timeSource;
  (next[idx].places as Array<Record<string, unknown>>).push(placed);

  const days = isV2 ? { ...(daysRaw as object), scheduled: next } : next;
  return { ok: true, days, dayNumber: Number(next[idx].dayNumber) || idx + 1, date: (next[idx].date as string) ?? null };
}

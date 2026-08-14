// 이번 여행의 조건 — 지금은 도시와 날짜뿐이다.
//
// 왜 새로 만드나
//   `PlannerSnapshot` 이 있었지만 쓰는 코드가 없었다. 저장하는 곳이 하나도 없고,
//   itinerary 페이지는 그 키를 구버전 캐시로 보고 열릴 때마다 지운다. 그래서
//   This Trip 의 `tripDays` 는 언제나 빈 배열이었고, 고정 일정 입력이 화면에
//   나타난 적이 없다. 약속을 넣는 길이 사용자에게 닫혀 있었다.
//
//   저장 한 줄을 더해 그것을 되살리지 않는다. 그 모양이 V2 와 맞지 않는다 —
//   `city` 도 `endDate` 도 없고, `numDays`·`arrivalTimes`·`scheduledIds` 는
//   지금 아무도 필요로 하지 않는다.
//
// 지금 담는 것
//   도시, 시작일, 종료일. 그게 전부다.
//   도착·출발·숙박·동행·취향은 아직 각자의 자리에 있고, 필요해질 때 옮긴다.
//   쓸 곳이 없는 필드를 미리 만들어 두지 않는다.

import { tripDates } from "../trip-fixed/fixed-core.ts";

export const TRIP_DRAFT_KEY = "koreamate_trip_draft_v1";

export interface TripDraft {
  city:      string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD" — 여행의 마지막 날. 체크아웃이 아니라 일정이 있는 날이다. */
  endDate:   string;
  updatedAt: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 날짜 목록의 상한.
 *
 * 상품 규칙이 아니라 화면을 지키는 선이다. 손으로 고친 localStorage 에
 * 100 년짜리 구간이 들어오면 날짜 select 가 36,500 개가 되어 브라우저가 멈춘다.
 * 그런 값은 여행 일정이 아니라 깨진 값으로 본다.
 */
export const MAX_TRIP_DAYS = 60;

function utcDay(iso: string): number | null {
  if (!ISO.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  if (!Number.isFinite(t)) return null;
  // 2026-02-31 같은 값은 여기서 다른 날짜로 굴러간다. 되돌려 비교해 걸러낸다.
  const back = new Date(t).toISOString().slice(0, 10);
  return back === iso ? t : null;
}

/** 며칠짜리 여행인가. 시작일과 종료일을 모두 포함한다. 말이 안 되면 null. */
export function tripDayCount(startDate: string, endDate: string): number | null {
  const a = utcDay(startDate), b = utcDay(endDate);
  if (a === null || b === null || b < a) return null;
  const n = Math.round((b - a) / 86_400_000) + 1;
  return n >= 1 && n <= MAX_TRIP_DAYS ? n : null;
}

export function isUsableTripDraft(value: unknown): value is TripDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.city === "string" && d.city.trim().length > 0 &&
    typeof d.startDate === "string" && typeof d.endDate === "string" &&
    tripDayCount(d.startDate, d.endDate) !== null
  );
}

/** 없으면 null 이다. 깨져 있어도 null 이다 — 날짜를 지어내지 않는다. */
export function readTripDraft(): TripDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRIP_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isUsableTripDraft(parsed)) return null;
    return {
      city:      parsed.city,
      startDate: parsed.startDate,
      endDate:   parsed.endDate,
      updatedAt: typeof (parsed as TripDraft).updatedAt === "number" ? (parsed as TripDraft).updatedAt : 0,
    };
  } catch {
    return null;                       // 깨진 JSON 때문에 화면이 죽지 않는다
  }
}

/**
 * 유효할 때만 저장한다. 아니면 아무것도 하지 않고 null 을 돌려준다.
 *
 * 반쯤 입력한 값을 덮어쓰지 않는다 — 날짜를 하나만 고른 순간에 저장하면
 * This Trip 이 이상한 하루짜리 여행을 보게 된다.
 */
export function writeTripDraft(input: {
  city: string; startDate: string; endDate: string; now?: number;
}): TripDraft | null {
  if (typeof window === "undefined") return null;
  const city = String(input.city ?? "").trim();
  if (!city || tripDayCount(input.startDate, input.endDate) === null) return null;

  const draft: TripDraft = {
    city,
    startDate: input.startDate,
    endDate:   input.endDate,
    updatedAt: typeof input.now === "number" ? input.now : Date.now(),
  };
  try {
    window.localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    return null;                       // 저장 실패도 조용히 넘긴다. 화면은 계속 돈다
  }
  return draft;
}

export function clearTripDraft(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(TRIP_DRAFT_KEY); } catch { /* ignore */ }
}

/**
 * 이 여행의 날짜들. 고정 일정 입력이 고를 수 있는 날이 곧 이것이다.
 *
 * 날짜 계산을 새로 만들지 않고 기존 `tripDates` 를 그대로 쓴다.
 * draft 가 없거나 깨져 있으면 빈 배열이고, 그때 화면은 "날짜를 먼저 정하세요"
 * 라고 말한다. 가짜 여행을 만들어 주지 않는다.
 */
export function tripDraftDates(draft: TripDraft | null | undefined): string[] {
  if (!draft) return [];
  const n = tripDayCount(draft.startDate, draft.endDate);
  return n === null ? [] : tripDates(draft.startDate, n);
}

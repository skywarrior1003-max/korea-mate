// 내 장소 → My Trip (네트워크 쪽). 계산은 start-trip.ts.
//
// 순서: 여행 저장 → 장소 기록(사진·메모 복사) 만들기. 기록이 실패해도 여행은 남는다 —
// 사용자는 여행을 시작했고, 기록은 카드에서 다시 붙일 수 있다. 결과를 숨기지 않는다.

import { apiSaveItinerary, apiFetchItinerary, apiFetchItinerariesByDevice } from "@/lib/itinerary-api";
import { getDeviceId } from "@/lib/deviceId";
import { withAuthHeader } from "@/lib/auth/device-auth-headers";
import { tripCityKey } from "@/data/cities/trip-city";
import type { ItineraryRow } from "@/lib/supabase";
import { appendStopToDays, buildPlaceStop, type SpotForTrip } from "./start-trip";

export interface MomentCopyResult {
  ok: boolean;
  existed?: boolean;
  photosCopied: number;
  photosFailed: number;
}

export async function apiMomentFromUserSpot(
  itineraryId: string, spotId: string, dayNumber: number, capturedAt?: string | null,
): Promise<MomentCopyResult> {
  try {
    const res = await fetch("/api/trip-moments/from-user-spot", {
      method: "POST",
      headers: await withAuthHeader({ "Content-Type": "application/json", "x-device-id": getDeviceId() }),
      body: JSON.stringify({
        itinerary_id: itineraryId, user_spot_id: spotId, moment_id: crypto.randomUUID(),
        day_number: dayNumber, ...(capturedAt ? { captured_at: capturedAt } : {}),
      }),
    });
    if (!res.ok) return { ok: false, photosCopied: 0, photosFailed: 0 };
    const j = (await res.json()) as { existed?: boolean; photos_copied?: number; photos_failed?: number };
    return { ok: true, existed: j.existed === true, photosCopied: j.photos_copied ?? 0, photosFailed: j.photos_failed ?? 0 };
  } catch {
    return { ok: false, photosCopied: 0, photosFailed: 0 };
  }
}

export interface StartTripInput {
  spot:        SpotForTrip;
  displayName: string;
  /** 편집 가능한 기본값 — 오늘 · 지금(또는 사용자가 고른 사진 촬영 시각) */
  date:        string;
  time:        string | null;
  title?:      string | null;
}

export type StartTripResult =
  | { ok: true; itineraryId: string; moment: MomentCopyResult }
  | { ok: false };

export async function startTripFromSpot(input: StartTripInput): Promise<StartTripResult> {
  const id = crypto.randomUUID();
  const stop = buildPlaceStop(input.spot, input.displayName, input.time);
  const okSave = await apiSaveItinerary({
    id,
    // 장소가 가진 도시만 — 없으면 비운다(5개 도시 강요·추정 금지)
    city: tripCityKey(input.spot.city ?? ""),
    start_date: input.date,
    end_date: input.date,
    travelers: "1",
    travel_style: "my_place",
    trip_title: (input.title ?? "").trim() || input.displayName,
    days: { __v: 2, scheduled: [{ date: input.date, dayNumber: 1, places: [stop] }], unscheduled: [] },
  } as never, getDeviceId());
  if (!okSave) return { ok: false };
  const capturedAt = input.time ? `${input.date}T${input.time}:00+09:00` : null;
  const moment = await apiMomentFromUserSpot(id, input.spot.id, 1, capturedAt);
  return { ok: true, itineraryId: id, moment };
}

export interface TripChoice {
  id:    string;
  title: string;
  city:  string;
  start: string;
  end:   string;
}

/** 내 여행 목록(최근 순). 고를 때만 부른다. */
export async function listMyTrips(): Promise<TripChoice[]> {
  const rows = await apiFetchItinerariesByDevice(getDeviceId());
  return rows.map(r => ({
    id: r.id, title: (r.trip_title ?? "").trim(), city: r.city ?? "", start: r.start_date ?? "", end: r.end_date ?? "",
  }));
}

export type AddToTripResult =
  | { ok: true; itineraryId: string; dayNumber: number; moment: MomentCopyResult }
  | { ok: false; reason: "duplicate"; itineraryId: string; dayNumber: number }
  | { ok: false; reason: "not_found" | "bad_days" | "save_failed" };

export async function addSpotToTrip(
  tripId: string, spot: SpotForTrip, displayName: string, today: string, time: string | null,
): Promise<AddToTripResult> {
  const deviceId = getDeviceId();
  const row = await apiFetchItinerary(tripId, deviceId);
  if (!row) return { ok: false, reason: "not_found" };
  const r = appendStopToDays(row.days, buildPlaceStop(spot, displayName, null), today, time);
  if (!r.ok) {
    if (r.reason === "duplicate") return { ok: false, reason: "duplicate", itineraryId: tripId, dayNumber: r.dayNumber };
    return { ok: false, reason: "bad_days" };
  }
  const okSave = await apiSaveItinerary({ ...(row as ItineraryRow), days: r.days } as never, deviceId);
  if (!okSave) return { ok: false, reason: "save_failed" };
  const capturedAt = r.date === today && time ? `${today}T${time}:00+09:00` : null;
  const moment = await apiMomentFromUserSpot(tripId, spot.id, r.dayNumber, capturedAt);
  return { ok: true, itineraryId: tripId, dayNumber: r.dayNumber, moment };
}

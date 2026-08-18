// PATCH /api/trip-moments/:id — 본인 메모 수정 로직 (주입식, 단위 테스트용)
//
// SECURITY CONTRACT:
// - moment.device_id 일치 + 연결 itinerary 소유권 2단계 확인
// - 비소유자·미존재 = 404 (정보 누출 방지)
// - 화이트리스트: memo · place_name · city_spot_id 만 반영.
//   device_id·itinerary_id·**is_public**·storage_path·photo_data 등은 수신해도
//   무시한다. 공개 여부는 여기서 바꿀 수 없다 — 동의를 함께 확인해야 하므로
//   전용 경로(`PUT /api/trip-moments/:id/public`)가 따로 있다.
// - 응답에 device_id·storage_path·photo_data 미포함
// - DB 오류는 500 + 내부 메시지 미노출

import { normalizePlaceName, normalizeCitySpotId } from "./public-consent-core.ts";

export const MEMO_MAX = 2000 as const;

interface QueryChain {
  select(fields: string): QueryChain;
  eq(col: string, val: unknown): QueryChain;
  update(values: Record<string, unknown>): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
}

export interface MomentAdminLike {
  from(table: string): QueryChain;
}

export interface MemoPatchResult {
  status: number;
  body: Record<string, unknown>;
}

/** memo 입력 정규화·검증. 초과는 절단하지 않고 오류로 처리한다(무음 절단 금지). */
export function normalizeMemo(raw: unknown): { ok: true; memo: string } | { ok: false } {
  if (typeof raw !== "string") return { ok: false };
  const memo = raw.trim();                    // 공백만 입력 → 빈 문자열(허용)
  if (memo.length > MEMO_MAX) return { ok: false };
  return { ok: true, memo };
}

export async function patchMomentMemo(
  momentId: string,
  deviceId: string,
  body: Record<string, unknown>,
  admin: MomentAdminLike,
): Promise<MemoPatchResult> {
  // 셋 다 없으면 바꿀 것이 없다
  const wantsMemo  = "memo" in body;
  const wantsPlace = "place_name" in body;
  const wantsSpot  = "city_spot_id" in body;
  if (!wantsMemo && !wantsPlace && !wantsSpot) {
    return { status: 400, body: { error: "memo is required" } };
  }

  const norm = wantsMemo ? normalizeMemo(body.memo) : ({ ok: true, memo: "" } as const);
  if (!norm.ok) return { status: 400, body: { error: "Invalid memo" } };

  // 장소 표시명 — 비우는 것은 정상이고, 좌표 문자열은 거절한다
  const placeRes = wantsPlace ? normalizePlaceName(body.place_name) : null;
  if (placeRes && !placeRes.ok) return { status: 400, body: { error: placeRes.error } };

  // 공식 장소 id — 형식만 여기서 본다. 실재 확인은 호출자가 DB 로 한다.
  const spotRes = wantsSpot ? normalizeCitySpotId(body.city_spot_id) : null;
  if (spotRes && !spotRes.ok) return { status: 400, body: { error: spotRes.error } };

  // 1단계: moment 존재 + device_id 일치 → itinerary_id 취득
  const { data: moment, error: momentErr } = (await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle()) as {
    data: { moment_id: string; itinerary_id: string } | null;
    error: { code?: string } | null;
  };
  if (momentErr) {
    console.error("[trip-moments PATCH] db error (moment):", momentErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!moment) return { status: 404, body: { error: "Not found" } };

  // 2단계: 연결 itinerary 소유권 재확인 (FK 부재 보완)
  const { data: itinerary, error: itinErr } = (await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle()) as { data: { id: string } | null; error: { code?: string } | null };
  if (itinErr) {
    console.error("[trip-moments PATCH] db error (itinerary):", itinErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!itinerary) return { status: 404, body: { error: "Not found" } };

  // 3단계: memo 만 UPDATE. WHERE 에 device_id 를 함께 걸어 경합 상황을 방어한다.
  const { data: updated, error: updErr } = (await admin
    .from("trip_moments")
    .update({
      ...(wantsMemo  ? { memo: norm.memo } : {}),
      ...(placeRes   ? { place_name:   placeRes.placeName }   : {}),
      ...(spotRes    ? { city_spot_id: spotRes.citySpotId }   : {}),
    })
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .select("moment_id, itinerary_id, memo, category, lat, lng, location_label, captured_at, day_number, place_name, city_spot_id, is_public")
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null };
  if (updErr) {
    console.error("[trip-moments PATCH] db error (update):", updErr.code);
    return { status: 500, body: { error: "Server error" } };
  }
  if (!updated) return { status: 404, body: { error: "Not found" } };

  return { status: 200, body: updated };
}

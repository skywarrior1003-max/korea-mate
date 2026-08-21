// 일정 장소(stop)에서 순간을 남길 때 어떤 안정 열쇠를 Moment 에 실을지 정한다.
// (TASK-TRIP-MOMENT-STOP-BINDING-V1)
//
// 관계는 Moment 단위 하나다 — 사진이 몇 장이든 `city_spot_id` 하나, Day 하나.
// 장소명 문자열로 추측하지 않는다. 공식 장소(city_spots)가 아닌 stop(내 장소,
// 숙소, 직접 추가한 항목)은 현재 계약에 맞는 열쇠가 없으므로 null 을 돌려주고,
// Story 어댑터는 그 순간을 독립 항목으로 둔다. 가짜 id 를 만들지 않는다.

export interface StopIdentityInput {
  place_id?: string | null;
  source?:   string | null;
}

/** city_spots 정본 id. 공식 장소가 아니거나 숫자 id 가 아니면 null. */
export function stopCitySpotId(stop: StopIdentityInput): number | null {
  if (stop.source !== "city_spot") return null;
  const id = typeof stop.place_id === "string" ? stop.place_id.trim() : "";
  if (!/^\d+$/.test(id)) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

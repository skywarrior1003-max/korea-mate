// 숙박 입력의 판단들 — 화면 없이.
//
// 여기 있는 것은 버튼도 지도도 아니고 "지금 사용자가 숙박에 대해 무엇을 아는가"
// 를 정하는 규칙이다. Home 이 먼저 쓰지만 This Trip 도 같은 것을 쓴다. 화면마다
// 다시 만들면 한쪽에서만 좌표가 남거나 한쪽에서만 지워진다.
//
// 가장 조심스러운 규칙은 하나다 — **좌표는 사용자가 지도에서 확인했을 때만
// 생긴다.** 주소를 적었다고, 링크를 붙였다고 위치를 아는 것이 아니다. 모르는
// 위치를 아는 척하면 닿을 수 없는 일정이 만들어진다.

import { isValidCoordinate } from "../geo.ts";
import type { TripStayDetail } from "../trip-draft/trip-draft-core.ts";
import { findStayArea, stayAreaOptions } from "./stay-core.ts";
import { cityPresetOptions } from "../../data/city-presets.ts";

/**
 * 사용자가 숙박에 대해 지금 무엇을 정했는가 — 화면이 고르는 것.
 *
 * `TripDraft` 의 `stayKind` 와 다르다. 저쪽은 저장된 값이 어느 단계인지 읽는
 * 것이고, 이쪽은 사용자가 무엇을 하겠다고 고른 것이다. 정확한 숙소를 고르고
 * 아직 아무것도 안 적은 순간에도 모드는 `exact` 다.
 */
export type StayMode = "none" | "area" | "exact";

export interface StayFields {
  name:    string;
  address: string;
  link:    string;
}

export const EMPTY_STAY_FIELDS: StayFields = { name: "", address: "", link: "" };

export function stayFieldsFrom(stay: TripStayDetail | null | undefined): StayFields {
  return {
    name:    stay?.name    ?? "",
    address: stay?.address ?? "",
    link:    stay?.link    ?? "",
  };
}

export function hasAnyStayField(f: StayFields): boolean {
  return [f.name, f.address, f.link].some(v => v.trim().length > 0);
}

/**
 * 저장된 것에서 화면이 열릴 때의 모드를 정한다.
 *
 * 정확한 숙소 정보가 하나라도 있으면 `exact` 다. 좌표까지 확인했든 이름만
 * 적었든 사용자는 "숙소를 정했다" 고 말한 것이다.
 */
export function stayModeFrom(
  stayArea: string | null | undefined, stay: TripStayDetail | null | undefined,
): StayMode {
  if (stay && (stayFieldsFrom(stay).name || stayFieldsFrom(stay).address ||
               stayFieldsFrom(stay).link || stay.coordinate)) return "exact";
  return stayArea && stayArea.trim() ? "area" : "none";
}

// ── 좌표를 잃을지 지킬지 ────────────────────────────────────────────────────

/**
 * 두 입력이 **같은 숙소를 가리키는가**.
 *
 * 앞뒤 공백과 대소문자만 무시한다. 그 이상은 판단하지 않는다 — "파라다이스"
 * 와 "Paradise" 가 같은 곳인지 우리는 모른다.
 */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * 확인해 둔 좌표를 계속 믿어도 되는가.
 *
 * 해운대 호텔에서 위치를 확인해 놓고 이름을 남포동 게스트하우스로 바꾸면, 그
 * 좌표는 이제 다른 건물을 가리킨다. 그대로 두면 일정이 조용히 엉뚱한 곳을
 * 기준으로 잡힌다 — 사용자는 자기가 지도에서 확인했다고 기억하므로 의심하지
 * 않는다.
 *
 * 반대로 커서만 지나가거나 같은 값을 다시 저장했다고 좌표가 사라지면, 사용자는
 * 이유 없이 지도를 다시 열어야 한다. 그래서 **세 값이 모두 그대로면 지킨다.**
 */
export function stayIdentityChanged(before: StayFields, after: StayFields): boolean {
  return !(
    sameText(before.name, after.name) &&
    sameText(before.address, after.address) &&
    sameText(before.link, after.link)
  );
}

/**
 * 바뀐 입력에 맞춰 좌표를 지킬지 버릴지 정해서 저장할 모양을 만든다.
 *
 * 저장할 것이 하나도 없으면 null 이다 — 빈 껍데기를 남기지 않는다.
 */
export function nextStayDetail(
  fields: StayFields,
  previous: TripStayDetail | null | undefined,
): TripStayDetail | null {
  const name = fields.name.trim(), address = fields.address.trim(), link = fields.link.trim();

  const keepCoordinate =
    previous?.coordinate != null &&
    !stayIdentityChanged(stayFieldsFrom(previous), fields);

  const next: TripStayDetail = {};
  if (name)    next.name    = name;
  if (address) next.address = address;
  if (link)    next.link    = link;
  if (keepCoordinate) next.coordinate = previous!.coordinate;

  return Object.keys(next).length > 0 ? next : null;
}

/**
 * 지도에서 확인한 좌표를 붙인다.
 *
 * 좌표를 만드는 길은 이 함수 하나다. 주소 문자열도 링크도 여기로 들어오지
 * 않는다 — 들어올 인자가 없다.
 */
export function confirmStayCoordinate(
  fields: StayFields, lat: number, lng: number,
): TripStayDetail | null {
  if (!isValidCoordinate(lat, lng)) return null;
  const base = nextStayDetail(fields, null) ?? {};
  return { ...base, coordinate: { lat, lng } };
}

// ── 지도를 어디서 열까 ───────────────────────────────────────────────────────

export interface StayMapCenter {
  lat: number;
  lng: number;
  /** 이 중심이 어디서 왔는가. 화면이 안내 문구를 고르는 데 쓴다. */
  source: "confirmed" | "area" | "city";
}

/**
 * 지도의 첫 화면.
 *
 * 주소나 링크를 읽어 위치를 잡지 않는다. 이미 아는 좌표 → 고른 지역 → 도시
 * 중심 순으로 내려간다. 어느 것도 없으면 null 이고, 그때 화면은 지도를 열지
 * 않는다 — 세계지도 한가운데를 보여 주지 않는다.
 */
export function stayMapCenter(
  city: string,
  stayArea: string | null | undefined,
  confirmed: { lat: number; lng: number } | null | undefined,
): StayMapCenter | null {
  if (confirmed && isValidCoordinate(confirmed.lat, confirmed.lng)) {
    return { lat: confirmed.lat, lng: confirmed.lng, source: "confirmed" };
  }
  const area = findStayArea(city, stayArea);
  if (area && isValidCoordinate(area.lat, area.lng)) {
    return { lat: area.lat, lng: area.lng, source: "area" };
  }
  // 마지막은 그 도시의 기존 지점 하나다. 새 좌표표를 만들지 않고 화면이 이미
  // 쓰는 프리셋을 그대로 쓴다 — 숙박 지역이 있으면 그중 첫 번째가 도심 쪽이고,
  // 없으면 도착 지점이다. 어차피 사용자가 곧 지도를 움직인다.
  const fallback = stayAreaOptions(city)[0] ?? cityPresetOptions(city)[0];
  if (fallback && isValidCoordinate(fallback.lat, fallback.lng)) {
    return { lat: fallback.lat, lng: fallback.lng, source: "city" };
  }
  return null;
}

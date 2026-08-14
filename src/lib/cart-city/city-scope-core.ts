// 이 장소를 **어느 도시 여행에서** 골랐는가.
//
// 장소가 어느 도시에 있는가와는 다른 물음이다. 해운대는 언제나 부산에 있지만,
// 사용자가 그것을 부산 여행에 넣었는지 서울 여행에 넣었는지는 별개다. 그래서
// 장소 원본의 city 를 건드리지 않고 **선택에만** 도시를 기록한다.
//
// 예전에 담은 것들
//   `tripCity` 가 없던 시절의 항목이 남아 있다. 그중 공식 장소·행사·지역 정보는
//   장소의 실제 도시가 분명하므로 그 도시 여행의 선택으로 읽는다. 사용자가
//   부산 장소를 서울 여행에 담았을 리는 없다.
//
//   내가 등록한 장소는 다르다. 그 장소들은 도시가 비어 있고, 좌표로 도시를
//   추정하지 않는다 — 부산과 경주는 70km 거리이고 잘못 찍으면 사용자가 고른
//   장소가 엉뚱한 여행에 들어간다. 그래서 **모른다고 두고** 화면에서 사용자에게
//   물어본다. 지우지도, 아무 도시로 밀어 넣지도 않는다.

import { normalizeCityKey } from "../place-identity.ts";

/** 도시 비교는 언제나 이 형태로 한다 — "Busan" 과 "busan" 은 같은 도시다. */
export function normalizeTripCity(value: string | null | undefined): string | null {
  const k = normalizeCityKey(value);
  return k.length > 0 ? k : null;
}

/** 이 계층이 필요로 하는 것만. CartItem 전체를 알 필요가 없다. */
export interface CityScopedItem {
  /** 이 선택이 어느 도시 여행의 것인가. 예전 항목에는 없다. */
  tripCity?: string | null;
  /** 장소 자체가 어느 도시에 있는가. 내가 등록한 장소는 비어 있을 수 있다. */
  city?: string;
}

/**
 * 이 선택이 속한 도시. 모르면 null 이다.
 *
 * 새로 담는 것에는 담는 순간 `tripCity` 를 적는다. 여기서 장소의 city 를 보는
 * 것은 그 필드가 없던 시절의 항목을 읽기 위해서다 — 저장소를 고쳐 쓰지 않아
 * 되돌리기도 안전하다.
 */
export function effectiveTripCity(item: CityScopedItem | null | undefined): string | null {
  if (!item) return null;
  return normalizeTripCity(item.tripCity) ?? normalizeTripCity(item.city);
}

/** 지금 보고 있는 도시 여행의 선택인가. */
export function isForCity(item: CityScopedItem, city: string | null | undefined): boolean {
  const want = normalizeTripCity(city);
  return want !== null && effectiveTripCity(item) === want;
}

/** 어느 여행 것인지 아직 모르는 예전 선택인가. */
export function isUnresolvedCity(item: CityScopedItem): boolean {
  return effectiveTripCity(item) === null;
}

/** 현재 도시의 선택만. 도시를 모르면 아무것도 돌려주지 않는다. */
export function forCity<T extends CityScopedItem>(items: readonly T[], city: string | null | undefined): T[] {
  const want = normalizeTripCity(city);
  if (want === null) return [];
  return items.filter(i => effectiveTripCity(i) === want);
}

/** 어느 여행 것인지 모르는 예전 선택만. */
export function unresolved<T extends CityScopedItem>(items: readonly T[]): T[] {
  return items.filter(isUnresolvedCity);
}

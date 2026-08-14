// 숙박 지역 — 여행자가 밤을 보내고 **다음 날 아침 출발하는 위치**.
//
// 지금까지 다음 날 시작점은 "어제 마지막으로 들른 곳" 이었다. 어제 저녁을
// 남포에서 먹었으면 오늘 아침이 남포에서 시작한다. 해운대에서 잤는데도.
//
// 이 파일이 하는 일은 그 한 가지다 — 그날 아침 어디서 출발하는가.
//
// 하지 않는 것
//   호텔을 고르지 않는다. 정확한 주소도 받지 않는다. 지역 프리셋 좌표만 쓴다.
//   스케줄러에게는 7km 조회 원점과 이동시간 구간(500m/1km/3km/7km)이 전부라
//   건물 단위 좌표가 주는 이득이 없다. 그리고 사용자가 자는 정확한 위치는
//   URL 에도 히스토리에도 남기지 않는 편이 낫다.
//
//   **하루의 끝** 도 하지 않는다. 숙소로 돌아가는 것은 시각이 없는 도착지인데
//   엔진에는 그런 개념이 없다. 없다고 21:00 같은 시각을 지어내면 사용자가 정한
//   적 없는 통금이 생긴다. 그건 별도 계약이 필요한 일이고 여기서 하지 않는다.

import { CITY_ARRIVAL_OPTIONS, type CityPresetOption } from "../../data/city-presets.ts";

/** 숙박 지역으로 내놓을 프리셋 종류. 공항·역·터미널·항만은 자는 곳이 아니다. */
export const STAY_AREA_TYPES = ["downtown", "tourist_area"] as const;

/**
 * 그 도시에서 고를 수 있는 숙박 지역.
 *
 * 도시 이름이나 지역 이름으로 분기하지 않는다 — type 으로만 거른다. 새 도시가
 * 들어와도 프리셋에 downtown/tourist_area 가 있으면 그대로 동작한다.
 */
export function stayAreaOptions(city: string): CityPresetOption[] {
  const all = CITY_ARRIVAL_OPTIONS[city] ?? [];
  return all.filter(o => (STAY_AREA_TYPES as readonly string[]).includes(o.type));
}

/** 고른 값으로 프리셋을 되찾는다. 없으면 null — 없는 지역을 지어내지 않는다. */
export function findStayArea(city: string, value: string | null | undefined): CityPresetOption | null {
  if (!value) return null;
  return stayAreaOptions(city).find(o => o.value === value) ?? null;
}

export interface TripStay {
  coordinate:   { lat: number; lng: number };
  /** 체크인 날짜 "YYYY-MM-DD". 이 날 밤부터 잔다. */
  checkInDate:  string;
  /** 체크아웃 날짜 "YYYY-MM-DD". 이 날 아침에 나온다 — 이 날 밤은 자지 않는다. */
  checkOutDate: string;
  displayName?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isUsable(s: TripStay): boolean {
  return (
    ISO.test(s.checkInDate) && ISO.test(s.checkOutDate) &&
    s.checkInDate < s.checkOutDate &&
    typeof s.coordinate?.lat === "number" && Number.isFinite(s.coordinate.lat) &&
    typeof s.coordinate?.lng === "number" && Number.isFinite(s.coordinate.lng)
  );
}

/**
 * 화면에서 고른 지역 하나를 여행 전체 숙박으로 만든다.
 *
 * 배열로 돌려주는 이유는 나중에 "날짜마다 숙소가 달라요" 를 붙일 때 계약을
 * 바꾸지 않기 위해서다. 지금 화면은 항상 0 개 또는 1 개만 만든다.
 */
export function buildSingleStay(
  city: string, areaValue: string | null | undefined,
  startDate: string, endDate: string,
  /**
   * 지도에서 확인된 정확한 숙소. 있으면 지역 중심 대신 이 좌표를 쓴다.
   *
   * 지역은 구의 무게중심이라 실제로 자는 건물과 수 km 떨어질 수 있다. 확인된
   * 좌표가 있는데도 중심을 쓰면 아침 출발지가 틀린 채로 하루가 짜인다.
   *
   * 여기서 좌표를 만들지는 않는다 — 넘어온 것만 쓰고, 없으면 예전 그대로다.
   */
  exactCoordinate?: { lat: number; lng: number } | null,
): TripStay[] {
  const area = findStayArea(city, areaValue);
  const usableExact =
    exactCoordinate != null &&
    typeof exactCoordinate.lat === "number" && Number.isFinite(exactCoordinate.lat) &&
    typeof exactCoordinate.lng === "number" && Number.isFinite(exactCoordinate.lng) &&
    !(exactCoordinate.lat === 0 && exactCoordinate.lng === 0);

  // 정확한 좌표만 있고 지역을 안 골랐어도 숙박은 성립한다.
  if (!area && !usableExact) return [];

  const stay: TripStay = {
    coordinate:   usableExact ? { lat: exactCoordinate!.lat, lng: exactCoordinate!.lng }
                              : { lat: area!.lat, lng: area!.lng },
    checkInDate:  startDate,
    checkOutDate: endDate,
    ...(area ? { displayName: area.label } : {}),
  };
  return isUsable(stay) ? [stay] : [];
}

/**
 * 이 날 아침 어디서 출발하는가.
 *
 * 규칙은 하나다 — **전날 밤을 덮는 숙박이 있으면 거기서 출발한다.**
 *
 * 날짜 계산을 하지 않는다. "전날 밤을 덮는다" 는 곧 `checkIn < D <= checkOut`
 * 이다. 체크인한 날 아침에는 아직 그 숙소에 없었고(checkIn < D), 체크아웃한 날
 * 아침에는 아직 거기 있다(D <= checkOut). 문자열 비교로 끝나서 시간대 문제가
 * 생길 여지가 없다.
 *
 * 첫날은 자연히 null 이다 — 그 전날 밤이 이 여행에 없다.
 */
export function stayStartFor(
  stays: readonly TripStay[] | null | undefined,
  tripDate: string,
): { lat: number; lng: number } | null {
  if (!stays?.length || !ISO.test(tripDate)) return null;
  for (const s of stays) {
    if (!isUsable(s)) continue;                       // 깨진 항목은 조용히 건너뛴다
    if (s.checkInDate < tripDate && tripDate <= s.checkOutDate) {
      return { lat: s.coordinate.lat, lng: s.coordinate.lng };
    }
  }
  return null;
}

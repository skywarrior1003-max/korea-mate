// 출발 공항·역은 **검색 중심점이 아니라 도착해야 하는 지점** 이다.
//
// 전에는 출발 시각에서 교통수단별 분을 빼서 하루를 일찍 끝내는 것이 전부였다.
// 그 값은 사실상 "이동시간 대충 빼기" 였고, 마지막 장소에서 공항까지 실제로 갈
// 수 있는지는 어디에서도 확인하지 않았다. 해운대에서 20km 떨어진 김해공항으로
// 가는 일정이든 부산역에서 가는 일정이든 똑같이 통과했다.
//
// 이제 두 가지를 분리한다.
//
//   ① process buffer — 목적지에 **도착한 뒤** 출발 전까지 필요한 시간
//      (체크인·보안검색·승차). 숫자는 예전 값을 그대로 쓴다.
//   ② 실제 이동시간 — 마지막 장소에서 목적지까지. 이것은 스케줄러의 기존
//      hard 규칙(HC-8)이 잰다. 여기서 다시 빼지 않는다.
//
//        requiredDestinationArrival = departureTime − processBuffer
//        lastPlace.end + travel(lastPlace → destination) ≤ requiredDestinationArrival
//
// 두 번째 줄은 이 파일이 아무것도 하지 않는다. 목적지를 기존 `fixed_events`
// 채널에 실어 보내면 엔진이 이미 하고 있던 일을 그대로 한다 — 새 타입도,
// 새 제약 코드도 만들지 않는다.

import type { Coordinate, FixedEventItem, ZoneId } from "../scheduler/types.ts";

/**
 * 목적지 도착 후 출발까지 확보하는 시간(분). 교통수단별.
 *
 * 이 숫자들은 예전 departure buffer 에서 값 그대로 옮겨 온 것이다. 의미만
 * 바뀌었고 숫자는 바뀌지 않았다 — 적절한지는 별도 상품 정책 판단이다.
 */
export const DEPARTURE_PROCESS_BUFFER_MINUTES: Record<string, number> = {
  airport:       60,
  port:          45,
  bus_terminal:  45,
  train_station: 30,
};

/** 교통수단을 모르거나 표에 없을 때. 기존 fallback 과 같은 값이다. */
export const DEFAULT_DEPARTURE_PROCESS_BUFFER_MINUTES = 30;

/**
 * 내부 전용 식별자. 관광 장소가 아니므로 city_spots place_id 도 cart item 도 없다.
 * 화면에 일반 일정 카드로 나오면 안 되고, 그 판별을 이 상수 하나로 한다.
 */
export const DEPARTURE_DESTINATION_EVENT_ID = "__departure_destination__";

export function isDepartureDestination(
  item: { item_type?: string; event_id?: string | null } | null | undefined,
): boolean {
  return item?.event_id === DEPARTURE_DESTINATION_EVENT_ID;
}

export function departureProcessBufferMinutes(transportType?: string | null): number {
  const v = DEPARTURE_PROCESS_BUFFER_MINUTES[transportType ?? ""];
  return typeof v === "number" ? v : DEFAULT_DEPARTURE_PROCESS_BUFFER_MINUTES;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toHHMM(total: number): string {
  const t = Math.max(0, total);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * 목적지에 늦어도 몇 시까지 도착해야 하는가.
 *
 * 하루의 자동 추천 창도 여기서 끝난다 — 이 시각 뒤에 추천을 넣으면 이미 공항에
 * 있어야 할 시간에 관광을 시키는 것이다. 그래서 값을 한 번만 계산해 두 곳에
 * 같이 쓴다. 같은 buffer 를 day end 에서 또 빼지 않는다.
 */
export function requiredDestinationArrival(
  departureTime: string,
  bufferMinutes: number,
): string | null {
  const dep = toMinutes(departureTime);
  if (dep === null) return null;
  return toHHMM(dep - bufferMinutes);
}

export interface DepartureDestinationInput {
  /** 출발지 좌표. 없으면 목적지를 만들지 않는다 — 모르는 위치를 지어내지 않는다. */
  coordinate?: Coordinate | null;
  /** 사용자가 입력한 출발 시각 "HH:MM". */
  departureTime?: string | null;
  /** city-presets 의 transport point type. 새 enum 을 만들지 않는다. */
  transportType?: string | null;
  /** 그날 기준점에서 본 목적지의 zone. 모르면 가장 바깥(3). */
  zoneId?: ZoneId;
}

export interface DepartureDestination {
  event:                      FixedEventItem;
  requiredDestinationArrival: string;
  processBufferMinutes:       number;
}

/**
 * 마지막 날의 출발 목적지를 기존 fixed_events 한 건으로 만든다.
 *
 * 체류시간 0 이다. 여기는 머무는 곳이 아니라 **닿아야 하는 시각과 지점** 이다.
 * 15 분짜리 가짜 체류를 만들어 붙이지 않는다.
 *
 * 좌표나 시각이 없으면 null 이고, 호출부는 예전 그대로 동작한다.
 */
export function buildDepartureDestination(
  input: DepartureDestinationInput,
): DepartureDestination | null {
  const { coordinate, departureTime, transportType } = input;
  if (!coordinate || !departureTime) return null;

  const processBufferMinutes = departureProcessBufferMinutes(transportType);
  const arrival = requiredDestinationArrival(departureTime, processBufferMinutes);
  if (arrival === null) return null;

  return {
    processBufferMinutes,
    requiredDestinationArrival: arrival,
    event: {
      event_id:   DEPARTURE_DESTINATION_EVENT_ID,
      start_time: arrival,
      end_time:   arrival,
      coordinate: { lat: coordinate.lat, lng: coordinate.lng },
      zone_id:    input.zoneId ?? 3,
    },
  };
}

// 일정 생성으로 넘어가는 주소를 만드는 곳 — 한 군데다.
//
// 왜 필요한가
//   지금까지 이 조립은 Home 화면 안에 있었다. 그래서 This Trip 에서 일정을
//   만들려면 Home 으로 먼저 보내야 했다("/#planner"). 사용자는 장소를 다 골라
//   놓고 다른 화면으로 튕겨 나가 날짜를 다시 확인해야 했다.
//
//   Picks 에 같은 조립을 한 벌 더 쓰지 않는다. 두 곳에 두면 파라미터 이름 하나가
//   어긋나는 순간 한쪽 화면에서만 조용히 값이 빠진다.
//
// 무엇을 넣지 않는가
//   장소는 넣지 않는다. This Trip 항목·좌표·고정 시각은 이미 cart 저장소에 있고
//   일정 화면이 거기서 읽는다. 주소에 다시 실으면 개인 좌표와 개인 제목이
//   브라우저 기록과 공유 링크에 남는다.
//
//   좌표도 프리셋에서 되찾는다. 사용자가 고른 것은 지역 이름이고, 그 이름으로
//   같은 표를 다시 보면 좌표가 나온다.

import { cityPresetOptions } from "../../data/city-presets.ts";
import type { TripDraft } from "../trip-draft/trip-draft-core.ts";
import type { TripPaceChoice } from "../trip-pace/pace-core.ts";

/**
 * 일정 생성에 넘기는 여행 조건.
 *
 * 도시와 날짜만 필수다. 나머지는 없으면 넣지 않는다 — 일정 화면이 이미 자기
 * 기본값을 갖고 있고, 여기서 그 기본값을 한 벌 더 정의하면 두 곳이 어긋난다.
 */
export interface ItineraryGenerationContext {
  city:            string;
  startDate:       string;
  endDate:         string;
  travelers?:      string;
  travelStyle?:    string;
  /** 도착지 프리셋의 value. 좌표는 이 값으로 되찾는다. */
  startLocation?:  string;
  arrivalTime?:    string;
  departurePlace?: string;
  departureTime?:  string;
  /** 숙박 지역 프리셋의 value. */
  stayArea?:       string;
  /** 여행 속도. 없으면 일정 화면이 기본값(balanced)으로 읽는다. */
  tripPace?:       TripPaceChoice;
}

/**
 * 저장된 이번 여행 조건을 그대로 생성 조건으로 옮긴다.
 *
 * 옮기기만 한다 — 기본값을 채우지도, 이름을 바꾸지도 않는다. Home 과 This Trip
 * 이 같은 여행을 보면서 서로 다른 주소를 만들지 않게 하는 것이 전부다.
 *
 * 정확한 숙소(`draft.stay`)는 넘기지 않는다. 받을 계약이 아직 없고, 주소에
 * 실으면 사용자가 적어 넣은 숙소 이름과 주소가 브라우저 기록에 남는다.
 *
 * `travelStyle` 은 draft 에 없다. 아직 자기 자리에 있고, 아는 화면이 넘긴다.
 */
export function tripDraftGenerationContext(
  draft: TripDraft, extra?: { travelStyle?: string },
): ItineraryGenerationContext {
  const ctx: ItineraryGenerationContext = {
    city:      draft.city,
    startDate: draft.startDate,
    endDate:   draft.endDate,
  };
  if (draft.travelers)       ctx.travelers      = draft.travelers;
  if (extra?.travelStyle)    ctx.travelStyle    = extra.travelStyle;
  if (draft.startLocation)   ctx.startLocation  = draft.startLocation;
  if (draft.arrivalTime)     ctx.arrivalTime    = draft.arrivalTime;
  if (draft.departurePlace)  ctx.departurePlace = draft.departurePlace;
  if (draft.departureTime)   ctx.departureTime  = draft.departureTime;
  if (draft.stayArea)        ctx.stayArea       = draft.stayArea;
  if (draft.tripPace)        ctx.tripPace       = draft.tripPace;
  return ctx;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 이 조건으로 일정을 만들 수 있는가. 도시와 날짜가 없으면 시작하지 않는다. */
export function canBuildItineraryUrl(ctx: Partial<ItineraryGenerationContext> | null | undefined): boolean {
  if (!ctx) return false;
  const { city, startDate, endDate } = ctx;
  return (
    typeof city === "string" && city.trim().length > 0 &&
    typeof startDate === "string" && ISO.test(startDate) &&
    typeof endDate === "string" && ISO.test(endDate) &&
    startDate <= endDate
  );
}

function preset(city: string, value: string | undefined) {
  if (!value) return null;
  // 도시 키 대소문자 무시 — draft/route 의 소문자 도시에서도 도착·출발 프리셋을 되찾는다.
  return cityPresetOptions(city).find(o => o.value === value) ?? null;
}

/**
 * `/itinerary?...` 주소. 만들 수 없으면 null 이고, 호출부는 이동하지 않는다.
 *
 * 빈 값은 넣지 않는다. 일정 화면이 `searchParams.get(k) || 기본값` 으로 읽으므로
 * 빈 문자열을 넣는 것과 빼는 것의 결과가 같고, 빼는 쪽이 주소가 깨끗하다.
 */
export function buildItineraryGenerationUrl(
  ctx: ItineraryGenerationContext,
): string | null {
  if (!canBuildItineraryUrl(ctx)) return null;

  const city = ctx.city.trim();
  const params = new URLSearchParams({
    city,
    startDate: ctx.startDate,
    endDate:   ctx.endDate,
  });

  const put = (key: string, value: string | undefined) => {
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  };
  put("travelers",      ctx.travelers);
  put("travelStyle",    ctx.travelStyle);
  put("startLocation",  ctx.startLocation);
  put("arrivalTime",    ctx.arrivalTime);
  put("departurePlace", ctx.departurePlace);
  put("departureTime",  ctx.departureTime);
  put("stayArea",       ctx.stayArea);
  put("pace",           ctx.tripPace);

  // 좌표는 사용자가 고른 프리셋에서 되찾는다. 고르지 않았으면 넣지 않는다 —
  // 도시 중심 같은 값을 대신 채우면 일정이 엉뚱한 데서 시작한다.
  const arrival = preset(city, ctx.startLocation);
  if (arrival) {
    params.set("arrivalLat",  String(arrival.lat));
    params.set("arrivalLng",  String(arrival.lng));
    params.set("arrivalType", arrival.type);
  }
  const departure = preset(city, ctx.departurePlace);
  if (departure) {
    params.set("departureLat",  String(departure.lat));
    params.set("departureLng",  String(departure.lng));
    params.set("departureType", departure.type);
  }

  return `/itinerary?${params.toString()}`;
}

/** 며칠짜리 여행인지 — 분석 이벤트에 쓰던 계산을 그대로 옮겼다. */
export function itineraryDayCount(startDate: string, endDate: string): number {
  if (!ISO.test(startDate) || !ISO.test(endDate)) return 0;
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

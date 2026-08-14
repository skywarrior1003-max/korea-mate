// 짐을 든 채로 하루를 시작한 사람이 언제 숙소에 들르는가.
//
// 숙소는 매일 밤 돌아와야 하는 곳이 아니다. 중요한 것은 **처음 들어가는 날**
// 하루다. 그날 여행자는 캐리어를 끌고 다니고, 체크인은 대개 오후부터 열린다.
//
// 그래서 목표는 17~18시 사이 도착이다. 목표이지 마감이 아니다 — 그 시각을 먼저
// 못 박고 일정을 맞추면, 사용자가 정하지도 않은 시각 때문에 오후 장소가 잘린다.
// 실측에서 17:00 을 고정하면 한 곳을 잃고 16:00·18:00 은 잃지 않았다. 손실이
// 시각에 비례하지도 않는다. gap 경계에 어떻게 떨어지느냐일 뿐이다.
//
// 그래서 순서를 뒤집는다. 먼저 하루를 짜고, 그 결과에서 **실제로 숙소에 닿을 수
// 있는 시각** 을 계산해 그 자리에 넣는다. 잘라내는 대신 읽어 낸다.
//
// 21:00 은 여기서 쓰지 않는다. 그것은 자동 추천이 채우는 창의 끝이지 통금이
// 아니다. 숙소 도착 마감으로 재사용하면 아무도 정하지 않은 귀가 시간이 생긴다.

import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import type { Coordinate, FixedEventItem } from "../scheduler/types.ts";
import type { TripDraft } from "../trip-draft/trip-draft-core.ts";
import { isValidCoordinate } from "../geo.ts";

/**
 * 내부 전용 식별자. 관광 장소가 아니므로 city_spots place_id 도 cart item 도 없다.
 * 가짜 city_spot 이나 user_spot 을 만들지 않는다 — 사용자가 적어 준 숙소는 우리
 * 장소 데이터가 아니다.
 */
export const ACCOMMODATION_CHECKIN_EVENT_ID = "__accommodation_checkin__";

export function isAccommodationCheckin(
  item: { event_id?: string | null } | null | undefined,
): boolean {
  return item?.event_id === ACCOMMODATION_CHECKIN_EVENT_ID;
}

/**
 * 체크인에 잡아 두는 시간.
 *
 * 0 분은 좌표만 스치고 지나가는 것이라 짐을 내려놓는 현실을 담지 못한다.
 * 60 분은 실측에서 저녁 한 곳을 잘라냈다. 15·30 분은 둘 다 손실이 없었고,
 * 그중 저녁 시작을 덜 미루는 쪽을 고른다.
 */
export const CHECKIN_DURATION_MINUTES = 15;

/** 목표로 삼는 도착 범위. 마감이 아니다. */
export const CHECKIN_TARGET_START = "17:00";
export const CHECKIN_TARGET_END   = "18:00";

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h >= 0 && h < 24 && mm >= 0 && mm < 60 ? h * 60 + mm : null;
}

function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// ── 이 여행의 숙소가 맞는가 ──────────────────────────────────────────────────

/**
 * 저장된 draft 가 **지금 만들고 있는 그 여행**인가.
 *
 * `readTripDraft()` 는 "준비 중인 여행 하나" 다. 사용자가 지난달 서울 일정을
 * 다시 열면 draft 는 다음 달 부산 여행일 수 있고, 그때 부산 숙소 좌표를 서울
 * 일정에 끼워 넣으면 가 본 적 없는 곳을 기준으로 동선이 다시 짜인다.
 *
 * 도시와 두 날짜가 모두 같을 때만 같은 여행으로 본다.
 */
export function draftMatchesTrip(
  draft: TripDraft | null | undefined,
  trip: { city: string; startDate: string; endDate: string },
): boolean {
  if (!draft) return false;
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    norm(draft.city) === norm(trip.city ?? "") &&
    draft.startDate  === trip.startDate &&
    draft.endDate    === trip.endDate
  );
}

/**
 * 이동 계산에 쓸 수 있는 숙소 위치.
 *
 * 지도에서 확인한 좌표만이다. 이름·주소·링크만 있는 상태는 "어디인지 아직
 * 모른다" 는 뜻이고, 모르는 지점을 기준으로 동선을 짜지 않는다.
 */
export function exactStayCoordinate(
  draft: TripDraft | null | undefined,
  trip: { city: string; startDate: string; endDate: string },
): Coordinate | null {
  if (!draftMatchesTrip(draft, trip)) return null;
  const c = draft!.stay?.coordinate;
  if (!c || !isValidCoordinate(c.lat, c.lng)) return null;
  return { lat: c.lat, lng: c.lng };
}

/**
 * 화면에 쓸 숙소 이름. 없으면 null 이고, 그때 화면은 일반 문구를 쓴다.
 *
 * 이름은 숨기지 않는다 — 호텔 이름은 식당 이름과 같은 종류의 정보이고, 좋은
 * 숙소에 묵었다는 것은 여행에서 보여 주고 싶은 부분이다. 숨기는 것은 주소와
 * 링크와 좌표, 그리고 몇 시에 들어갔는가다.
 */
export function exactStayName(
  draft: TripDraft | null | undefined,
  trip: { city: string; startDate: string; endDate: string },
): string | null {
  if (!draftMatchesTrip(draft, trip)) return null;
  const n = draft!.stay?.name?.trim();
  return n && n.length > 0 ? n : null;
}

// ── 체크인 시각 고르기 ───────────────────────────────────────────────────────

/** 1차 일정에서 읽어 온, 시각과 위치를 아는 항목 하나. */
export interface PlacedStop {
  start_time: string;
  end_time:   string;
  coordinate: Coordinate | null;
  /** 사용자가 정한 약속인가. 이 항목 위로는 체크인을 올리지 않는다. */
  is_fixed?:  boolean;
}

export interface CheckinPlan {
  /** 숙소에 도착하는 시각. */
  startTime:      string;
  /** 짐을 내려놓고 나서는 시각. */
  endTime:        string;
  /** 어느 항목 다음에 들르는가 — 1차 일정에서의 위치. */
  afterIndex:     number;
  /** 그 항목에서 숙소까지 걸리는 시간. */
  travelMinutes:  number;
  /** 목표 범위(17~18시)를 넘겼는가. 실패가 아니라 사실이다. */
  laterThanTarget: boolean;
}

/**
 * 1차 일정을 보고 체크인을 어디에 끼울지 정한다.
 *
 * 규칙은 세 줄이다.
 *
 *   ① 각 항목 뒤에 숙소로 갈 때의 실제 도착 시각을 전부 구한다
 *   ② 그중 17~18시 안에 드는 것이 있으면 **가장 이른 것** 을 쓴다
 *   ③ 없으면 목표에 가장 가까운 것을 쓴다
 *
 * ②가 "가장 이른 것" 인 이유는 15 시에 들어가는 편이 자연스러운 사람을 17 시까지
 * 기다리게 하지 않기 위해서다. 17~18 시는 하한이 아니다. 다만 그보다 이른 시각을
 * 굳이 찾아 올리지도 않는다 — 짐을 맡기러 일부러 일찍 돌아가는 일정이 되면
 * 오후가 반토막 난다. 그래서 **범위 안에 드는 첫 순간** 을 고른다.
 *
 * 사용자가 정한 약속(`is_fixed`) 은 넘지 않는다. 체크인 때문에 약속이 밀리거나
 * 사라지지 않는다.
 *
 * 하루의 끝을 넘겨야만 닿을 수 있으면 null 이다 — 그날 숙소에 들르는 일정을
 * 만들 수 없다는 뜻이고, 억지로 만들지 않는다.
 */
export function planCheckin(
  stops:      readonly PlacedStop[],
  hotel:      Coordinate,
  dayEndTime: string,
  durationMinutes: number = CHECKIN_DURATION_MINUTES,
): CheckinPlan | null {
  const dayEnd = toMin(dayEndTime);
  if (dayEnd === null || !isValidCoordinate(hotel.lat, hotel.lng)) return null;

  const targetStart = toMin(CHECKIN_TARGET_START)!;
  const targetEnd   = toMin(CHECKIN_TARGET_END)!;

  const options: CheckinPlan[] = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    if (!s.coordinate || !isValidCoordinate(s.coordinate.lat, s.coordinate.lng)) continue;
    const endM = toMin(s.end_time);
    if (endM === null) continue;

    const travel  = estimateTravelMinutes(s.coordinate, hotel);
    const arrive  = endM + travel;
    // 뒤에 사용자가 정한 약속이 있으면 그 앞을 침범하지 않는다.
    const nextFixed = stops.slice(i + 1).find(x => x.is_fixed);
    const limit = nextFixed ? (toMin(nextFixed.start_time) ?? dayEnd) : dayEnd;
    if (arrive + durationMinutes > Math.min(limit, dayEnd)) continue;

    options.push({
      startTime: toHHMM(arrive),
      endTime:   toHHMM(arrive + durationMinutes),
      afterIndex: i,
      travelMinutes: travel,
      laterThanTarget: arrive > targetEnd,
    });
  }
  if (options.length === 0) return null;

  // 목표 범위 안에 드는 첫 순간.
  const inTarget = options.find(o => {
    const m = toMin(o.startTime)!;
    return m >= targetStart && m <= targetEnd;
  });
  if (inTarget) return inTarget;

  // 없으면 목표에 가장 가까운 것. 같은 거리면 이른 쪽을 쓴다 — 짐을 오래 들고
  // 다니는 쪽보다 낫다.
  let best = options[0]!;
  const dist = (o: CheckinPlan) => {
    const m = toMin(o.startTime)!;
    return m < targetStart ? targetStart - m : m - targetEnd;
  };
  for (const o of options) if (dist(o) < dist(best)) best = o;
  return best;
}

/** 정해진 체크인을 엔진이 아는 모양으로. 기존 fixed_events 채널 그대로다. */
export function checkinFixedEvent(
  plan: CheckinPlan, hotel: Coordinate, zoneId: FixedEventItem["zone_id"] = 1,
): FixedEventItem {
  return {
    event_id:   ACCOMMODATION_CHECKIN_EVENT_ID,
    start_time: plan.startTime,
    end_time:   plan.endTime,
    coordinate: { lat: hotel.lat, lng: hotel.lng },
    zone_id:    zoneId,
  };
}

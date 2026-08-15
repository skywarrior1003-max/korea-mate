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
import { isTripPaceChoice, type TripPaceChoice } from "../trip-pace/pace-core.ts";

export const TRIP_DRAFT_KEY = "koreamate_trip_draft_v1";

/**
 * 사용자가 알려 준 정확한 숙소.
 *
 * 날짜별 목록이 아니다. 첫날 A 호텔, 둘째 날 B 호텔을 관리하는 기능은 만들지
 * 않는다 — 지금 필요한 것은 "이번 여행에 어디서 자는가" 하나다.
 *
 * 링크를 받았다고 주소를 아는 것이 아니고, 주소를 받았다고 좌표를 아는 것도
 * 아니다. 사용자가 준 것은 준 그대로 담고, `coordinate` 는 실제로 확인된
 * 경우에만 채운다. 링크를 열어 보거나 주소를 좌표로 바꾸는 일은 여기서 하지
 * 않는다.
 */
export interface TripStayDetail {
  /** 숙소 이름. 사용자가 적은 그대로. */
  name?:       string;
  /** 사용자가 적은 주소 그대로. 우리가 정규화하거나 만들어 내지 않는다. */
  address?:    string;
  /** 사용자가 붙여넣은 장소·공유 링크 원문. 해석하지 않는다. */
  link?:       string;
  /**
   * 실제로 확인된 위치일 때만 있다.
   *
   * 링크나 주소가 있다는 이유로 채우지 않는다 — 그러면 확인되지 않은 지점이
   * 일정의 이동 계산에 들어간다.
   */
  coordinate?: { lat: number; lng: number };
}

export interface TripDraft {
  city:      string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD" — 여행의 마지막 날. 체크아웃이 아니라 일정이 있는 날이다. */
  endDate:   string;
  updatedAt: number;

  // ── 아래는 전부 선택이다 ───────────────────────────────────────────────────
  //
  // 이 필드들이 없던 시절의 draft 도 그대로 읽힌다. 이름과 뜻은 일정 생성이
  // 이미 쓰고 있는 것을 그대로 가져왔다 — 같은 뜻에 새 이름을 만들지 않는다.

  travelers?:      string;
  /** 도착 지점 프리셋의 value. */
  startLocation?:  string;
  arrivalTime?:    string;
  /** 출발 지점 프리셋의 value. */
  departurePlace?: string;
  departureTime?:  string;
  /** 대략적인 숙박 지역 프리셋의 value. 정확한 숙소가 아니다. */
  stayArea?:       string;
  /** 사용자가 정확한 숙소를 알려 준 경우. */
  stay?:           TripStayDetail;
  /**
   * 어떤 속도로 다닐 것인가. 없으면 `balanced` 로 읽는다.
   *
   * 동행(Solo·Couple·Family·Group)에서 유추하지 않는다 — 그건 다른 질문이다.
   */
  tripPace?:       TripPaceChoice;
}

/**
 * 숙박이 지금 어느 단계인가.
 *
 *   none    아직 아무것도 정하지 않았다 — 그래도 일정은 만들 수 있다
 *   area    대략 어느 동네에서 잘지만 정했다
 *   detail  숙소 이름·주소·링크를 받았지만 위치는 아직 확인되지 않았다
 *   located 실제 위치까지 확인됐다
 *
 * `detail` 과 `located` 를 구분하는 것이 핵심이다. 확인되지 않은 지점을 확인된
 * 것처럼 다루면 엉뚱한 곳을 기준으로 이동시간을 계산하게 된다.
 */
export type StayKind = "none" | "area" | "detail" | "located";

export function stayKind(draft: TripDraft | null | undefined): StayKind {
  if (!draft) return "none";
  const s = draft.stay;
  if (s?.coordinate && Number.isFinite(s.coordinate.lat) && Number.isFinite(s.coordinate.lng)) {
    return "located";
  }
  if (s && [s.name, s.address, s.link].some(v => typeof v === "string" && v.trim().length > 0)) {
    return "detail";
  }
  return typeof draft.stayArea === "string" && draft.stayArea.trim().length > 0 ? "area" : "none";
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

/** 선택 필드 하나. 문자열이고 비어 있지 않을 때만 값이다. */
function optText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * 정확한 숙소를 읽는다.
 *
 * 배열이면 통째로 버린다 — 날짜별 숙박은 이 계약이 아니다. 손으로 고친 값이
 * 배열로 들어와도 첫 항목을 골라 쓰지 않는다.
 *
 * `coordinate` 는 두 수가 모두 실제 범위 안일 때만 살린다. 링크나 주소가 있다는
 * 이유로 만들어 넣지 않는다.
 */
function readStayDetail(value: unknown): TripStayDetail | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const s = value as Record<string, unknown>;

  const detail: TripStayDetail = {};
  const name = optText(s.name), address = optText(s.address), link = optText(s.link);
  if (name)    detail.name = name;
  if (address) detail.address = address;
  if (link)    detail.link = link;

  const c = s.coordinate;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const { lat, lng } = c as Record<string, unknown>;
    if (typeof lat === "number" && typeof lng === "number" &&
        Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      detail.coordinate = { lat, lng };
    }
  }
  return Object.keys(detail).length > 0 ? detail : undefined;
}

/** 없으면 null 이다. 깨져 있어도 null 이다 — 날짜를 지어내지 않는다. */
export function readTripDraft(): TripDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRIP_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isUsableTripDraft(parsed)) return null;
    // 타입은 저장된 값을 보증하지 않는다 — 손으로 고친 localStorage 도 여기로
    // 들어온다. 아래 검사들은 그래서 타입이 아니라 실제 값을 본다.
    const p = parsed as unknown as Record<string, unknown>;

    const draft: TripDraft = {
      city:      parsed.city,
      startDate: parsed.startDate,
      endDate:   parsed.endDate,
      updatedAt: typeof (parsed as TripDraft).updatedAt === "number" ? (parsed as TripDraft).updatedAt : 0,
    };
    // 선택 필드는 있을 때만 붙인다. 새 필드를 모르던 시절의 draft 도 여기서
    // 그대로 살아난다 — 도시와 날짜는 위에서 이미 읽었다.
    const travelers      = optText(p.travelers);
    const startLocation  = optText(p.startLocation);
    const arrivalTime    = optText(p.arrivalTime);
    const departurePlace = optText(p.departurePlace);
    const departureTime  = optText(p.departureTime);
    const stayArea       = optText(p.stayArea);
    const stay           = readStayDetail(p.stay);
    const tripPace       = isTripPaceChoice(p.tripPace) ? p.tripPace : undefined;
    if (travelers)      draft.travelers      = travelers;
    if (startLocation)  draft.startLocation  = startLocation;
    if (arrivalTime)    draft.arrivalTime    = arrivalTime;
    if (departurePlace) draft.departurePlace = departurePlace;
    if (departureTime)  draft.departureTime  = departureTime;
    if (stayArea)       draft.stayArea       = stayArea;
    if (stay)           draft.stay           = stay;
    if (tripPace)       draft.tripPace       = tripPace;
    return draft;
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

  // 선택 필드는 세 가지 뜻을 갖는다.
  //
  //   생략(undefined)  이 값은 내 관심사가 아니다 — 저장된 것을 그대로 둔다
  //   빈 문자열·null   사용자가 비웠다 — 지운다
  //   값               저장한다
  //
  // 이 구분이 없으면 도시와 날짜만 아는 화면이 저장할 때마다 도착·출발·숙박이
  // 함께 지워진다.
  travelers?:      string | null;
  startLocation?:  string | null;
  arrivalTime?:    string | null;
  departurePlace?: string | null;
  departureTime?:  string | null;
  stayArea?:       string | null;
  stay?:           TripStayDetail | null;
  tripPace?:       TripPaceChoice | null;
}): TripDraft | null {
  if (typeof window === "undefined") return null;
  const city = String(input.city ?? "").trim();
  if (!city || tripDayCount(input.startDate, input.endDate) === null) return null;

  const prev = readTripDraft();

  const draft: TripDraft = {
    city,
    startDate: input.startDate,
    endDate:   input.endDate,
    updatedAt: typeof input.now === "number" ? input.now : Date.now(),
  };

  const carry = (
    key: "travelers" | "startLocation" | "arrivalTime" | "departurePlace" | "departureTime" | "stayArea",
  ) => {
    const given = input[key];
    const value = given === undefined ? prev?.[key] : optText(given);
    if (value) draft[key] = value;
  };
  carry("travelers");
  carry("startLocation");
  carry("arrivalTime");
  carry("departurePlace");
  carry("departureTime");
  carry("stayArea");

  const stay = input.stay === undefined ? prev?.stay : readStayDetail(input.stay);
  if (stay) draft.stay = stay;

  const pace = input.tripPace === undefined ? prev?.tripPace
             : (isTripPaceChoice(input.tripPace) ? input.tripPace : undefined);
  if (pace) draft.tripPace = pace;

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

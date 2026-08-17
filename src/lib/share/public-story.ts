// 공개 Story 로 내보낼 일정을 만든다.
//
// 왜 있나
//   공개한 일정은 `days` JSON 이 통째로 밖으로 나갔다. 그 안에는 화면이 쓰지도
//   않는 값들이 함께 있었다 — 좌표, 지도 링크, 내부 식별자, 그리고 My Place 를
//   This Trip 에 담았다면 그 장소의 **비공개 메모**까지. 공개 미리보기는 그때도
//   "메모는 비공개로 유지됩니다" 라고 적고 있었다.
//
// 어떻게 막나
//   지울 것을 고르지 않는다. **내보낼 것만 고른다**(whitelist). 나중에 저장
//   구조에 필드가 하나 더 늘어도 그것은 자동으로 공개되지 않는다. 반대로 하면
//   새 필드가 생길 때마다 조용히 새 나간다.
//
// 무엇을 공식 장소로 보나
//   `source === "city_spot"` 인 것만이다. 그때만 `tips`(관광 안내문)와
//   `place_id`(정본 열쇠)를 내보낸다. 증명되지 않은 장소의 `tips` 는 버린다 —
//   그 자리에 사용자가 적은 메모가 들어와 있을 수 있고, 오래된 기록에는
//   `sourceKey` 조차 없어서 "user_spot 인가" 를 물어볼 수단이 없다. 잃는 것은
//   옛 기록의 안내문 한 줄이고, 지키는 것은 남의 일기다.
//
// 좌표
//   공개물에는 넣지 않는다. 공유 화면은 지도를 그리지 않고 장소 이름으로만
//   지도를 연다. 내부로 가져올 때(Copy·Saved)는 서버가 원본에서 다시 읽는다 —
//   `copied-itinerary.ts` 참조. 두 통로는 요구가 달라 함수도 둘이다.
//
// Trip Memory 는 여기 없다
//   사용자가 공개하려고 만든 사진·감성 기록은 `trip_moments` 에 있고 `days` 에
//   들어오지 않는다. 이 파일이 지우는 대상이 아니다.

/** 저장된 일정은 필드가 계속 늘어난다. 모양을 고정하지 않고 느슨하게 받는다. */
type RawPlace = Record<string, unknown>;
type RawDay   = Record<string, unknown>;

/** `src/lib/place-identity.ts` 가 만드는 접두사. 여기서는 읽기만 한다. */
const USER_SPOT_PREFIX = "user_spot:";

/** 공식 장소로 증명된 것만 true. 애매하면 false — 그쪽이 안전하다. */
function isCanonicalPlace(p: RawPlace): boolean {
  return p.source === "city_spot";
}

export function isUserSpotPlace(p: RawPlace): boolean {
  if (p.source === "user_spot") return true;
  const key = p.sourceKey;
  return typeof key === "string" && key.startsWith(USER_SPOT_PREFIX);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** 있는 값만 담는다. `undefined` 를 키로 남기면 JSON 에 그대로 나간다. */
function put(into: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) into[key] = value;
}

// ── 장소 ─────────────────────────────────────────────────────────────────────
export function publicPlace(raw: unknown): Record<string, unknown> {
  const p: RawPlace = (raw && typeof raw === "object") ? raw as RawPlace : {};
  const out: Record<string, unknown> = {
    name:     str(p.name),
    category: str(p.category),
    location: str(p.location),
    time:     str(p.time),
    duration: str(p.duration),
  };
  if (typeof p.slot === "string")            put(out, "slot", p.slot);
  if (p.isAccommodation === true)            out.isAccommodation = true;

  // 공식 장소만 안내문과 정본 열쇠를 가진다
  if (isCanonicalPlace(p)) {
    if (typeof p.tips === "string" && p.tips.length > 0) out.tips = p.tips;
    if (typeof p.place_id === "string" || typeof p.place_id === "number") {
      out.place_id = p.place_id;
    }
  }
  return out;
}

// ── 하루 ─────────────────────────────────────────────────────────────────────
export function publicDay(raw: unknown): Record<string, unknown> {
  const d: RawDay = (raw && typeof raw === "object") ? raw as RawDay : {};
  const out: Record<string, unknown> = {
    places: Array.isArray(d.places) ? d.places.map(publicPlace) : [],
  };
  put(out, "dayNumber", typeof d.dayNumber === "number" ? d.dayNumber : undefined);
  put(out, "date",      typeof d.date === "string" ? d.date : undefined);
  return out;
}

// ── days ─────────────────────────────────────────────────────────────────────
/**
 * 저장 형식을 바꾸지 않는다. 배열로 저장된 옛 기록은 배열로, `__v:2` 는
 * `__v:2` 로 돌려준다 — 읽는 쪽(`parseScheduledDays`)을 건드리지 않기 위해서다.
 * `unscheduled` 는 언제나 빈 배열이다. 옛 기록에 This Trip snapshot 이 통째로
 * 들어 있어도 밖으로 나가지 않는다.
 */
export function serializePublicDays(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(publicDay);

  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2) {
      return {
        __v: 2,
        scheduled:   Array.isArray(v2.scheduled) ? v2.scheduled.map(publicDay) : [],
        unscheduled: [],
      };
    }
  }
  // 모르는 모양이면 아무것도 내보내지 않는다
  return [];
}

// ── 일정 한 건 ───────────────────────────────────────────────────────────────
export interface PublicItinerary {
  id:             string;
  city:           string;
  start_date:     string;
  end_date:       string;
  travelers:      string;
  travel_style:   string;
  days:           unknown;
  trip_title:     string;
  updated_at:     string | null;
  view_count:     number;
  helpful_count:  number;
  copy_count:     number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * 공개 응답 컬럼은 `get_shared_itinerary`(migration 030) 계약 그대로 12 개다.
 * device_id·email·is_public·copy_of 는 그때도 지금도 나가지 않는다.
 */
export function serializePublicItinerary(row: unknown): PublicItinerary {
  const r = (row && typeof row === "object") ? row as Record<string, unknown> : {};
  return {
    id:            str(r.id),
    city:          str(r.city),
    start_date:    str(r.start_date),
    end_date:      str(r.end_date),
    travelers:     str(r.travelers),
    travel_style:  str(r.travel_style),
    days:          serializePublicDays(r.days),
    trip_title:    str(r.trip_title),
    updated_at:    typeof r.updated_at === "string" ? r.updated_at : null,
    view_count:    num(r.view_count),
    helpful_count: num(r.helpful_count),
    copy_count:    num(r.copy_count),
  };
}

/** 서버가 읽어야 하는 컬럼. 이 목록 밖의 값은 애초에 가져오지 않는다. */
export const PUBLIC_SELECT_COLUMNS =
  "id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count, copy_count";

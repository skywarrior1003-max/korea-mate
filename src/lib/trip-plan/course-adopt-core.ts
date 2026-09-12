// 공식 추천코스 → My Trip 직접 생성 (Owner 2026-09-12, COURSE-ADOPT)
//
// 업계형 "코스 = 내 일정의 시드": 날짜만 받으면 코스 stop 을 **순서 그대로**
// Day 에 균등 배분해 완성된 일정을 만든다. 스케줄러를 거치지 않으므로 코스의
// 의도된 동선이 재배치되지 않고, 사용자는 다시 스케줄을 짤 필요가 없다.
//
// 발명 금지 계약:
//  · 시각·소요시간을 지어내지 않는다 — timeSource 없는 항목은 화면 규칙상
//    시계가 아니라 흐름 순서로만 보인다(orderDayPlaces 는 시각 없는 항목의
//    배열 순서를 보존한다 — planning-view-core 계약).
//  · spotId 가 연결된 stop 만 카탈로그 사실(category/좌표/이미지)을 옮기고,
//    미연결 stop 은 이름만 남긴다(임의 매칭 금지 — 코스 화면과 같은 원칙).
//  · 순서·구성 무변경: 입력 stop 배열이 그대로 Day1..N 에 앞에서부터 담긴다.

export interface CourseStopInput {
  /** 원천 코스의 표기 그대로 — null/빈 이름 stop 은 담지 않는다(발명 금지) */
  name: string | null;
  spotId?: number | null;
}

/** 코스 채택에 필요한 카탈로그 사실만 — CitySpot 전체를 요구하지 않는다 */
export interface AdoptSpotFacts {
  id: number | string;
  name: string;
  category?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
  mapUrl?: string | null;
}

/**
 * My Trip 화면의 Place 계약은 location/time/duration/tips/googleMapsUrl 을
 * 필수 문자열로 다룬다(생략 시 p.location.toLowerCase() 류에서 크래시 —
 * 2026-09-12 LIVE 실측). 모르는 값은 **빈 문자열**로 정직하게 둔다:
 * 빈 값은 "정보 없음"이지 발명이 아니고, 화면 규칙상 시계/슬롯도 안 그린다.
 */
export interface AdoptedPlace {
  name: string;
  category: string;
  location: string;
  time: string;
  duration: string;
  tips: string;
  googleMapsUrl: string;
  source?: "city_spot";
  place_id?: string;
  lat?: number;
  lng?: number;
  image?: string;
}

export interface AdoptedDay {
  date: string;
  dayNumber: number;
  places: AdoptedPlace[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 두 날짜(포함) 사이의 일수. 형식/순서가 깨졌으면 null. */
export function adoptDayCount(startDate: string, endDate: string): number | null {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return null;
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  const days = Math.round((e - s) / 86400000) + 1;
  return days >= 1 && days <= 30 ? days : null;
}

const isoPlus = (startDate: string, offsetDays: number): string =>
  new Date(Date.parse(`${startDate}T00:00:00Z`) + offsetDays * 86400000).toISOString().slice(0, 10);

/**
 * stop 을 순서 그대로 Day 에 균등 배분한다.
 * 나머지는 앞 Day 부터 하나씩 — 결정적이고, 코스의 앞부분이 여행 앞날에 온다.
 */
export function adoptCourseDays(
  stops: readonly CourseStopInput[],
  spotsById: ReadonlyMap<number, AdoptSpotFacts>,
  startDate: string,
  endDate: string,
): AdoptedDay[] | null {
  const dayCount = adoptDayCount(startDate, endDate);
  if (dayCount === null) return null;
  const usable = stops.filter((s): s is CourseStopInput & { name: string } => (s.name ?? "").trim().length > 0);
  if (usable.length === 0) return null;

  const base = Math.floor(usable.length / dayCount);
  const extra = usable.length % dayCount;

  const days: AdoptedDay[] = [];
  let cursor = 0;
  for (let d = 0; d < dayCount; d++) {
    const take = base + (d < extra ? 1 : 0);
    const places: AdoptedPlace[] = usable.slice(cursor, cursor + take).map(s => {
      const spot = typeof s.spotId === "number" ? spotsById.get(s.spotId) : undefined;
      const p: AdoptedPlace = {
        name: (spot?.name || s.name).trim(),
        category: spot?.category ?? "",
        location: spot?.district ?? "",
        time: "", duration: "", tips: "", googleMapsUrl: spot?.mapUrl ?? "",
      };
      if (spot) {
        p.source = "city_spot";
        p.place_id = String(spot.id);
        if (typeof spot.lat === "number" && typeof spot.lng === "number") { p.lat = spot.lat; p.lng = spot.lng; }
        if (spot.image) p.image = spot.image;
      }
      return p;
    });
    cursor += take;
    days.push({ date: isoPlus(startDate, d), dayNumber: d + 1, places });
  }
  return days;
}

// 소유자의 비공개 여행을 Story 화면이 아는 모양으로 바꾼다. (TASK-STORY-LIVE-BASELINE-V1)
//
// 공개 어댑터(story-adapter.ts)는 서버가 정제한 공개 응답만 받는다. 이 어댑터는
// 반대로 **소유자 화면에 이미 로드된 것** — 일정(days)과 내 순간(TripMoment) — 을
// 받아 같은 StoryJournal 이 그릴 수 있는 StoryDay[] 를 만든다.
//
// Story 의 뼈대는 일정이다
//   사용자가 사진을 한 장도 남기지 않아도 Story 는 비어 있지 않다. 시간이 지난
//   일정의 장소들이 카탈로그 대표 이미지와 장소명으로 Story 의 기본 항목이 된다.
//   사용자가 남긴 순간이 있으면 그 항목이 개인 기록으로 풍부해진다.
//
// 시간은 보수적으로 센다
//   - 끝난 여행: 모든 일정 장소가 대상이다.
//   - 진행 중: 날짜가 지난 Day 의 장소, 오늘 Day 에서는 예정 시각이 지금 이전인
//     장소만. 오늘인데 시각이 없는 장소는 넣지 않는다 — 갔는지 알 수 없다.
//   - 미래 Day 의 장소는 넣지 않는다.
//   "지났다" 는 Story 의 흐름일 뿐, 방문했다고 단정하는 표시는 만들지 않는다.
//
// 순간 ↔ 장소 결합은 안정된 열쇠로만 한다
//   `moment.city_spot_id` 와 일정 장소의 `place_id`(city_spots id) 가 같은 Day 에서
//   일치할 때만 결합한다. 장소명 문자열로 추측해 붙이지 않는다 — 잘못 붙은 사진은
//   없는 사진보다 나쁘다. 결합되지 않은 순간은 사라지지 않고 그 Day 의 독립
//   항목으로 남는다(공개 Story 와 같은 규칙).
//
// 여기 없는 것은 화면에 가지 않는다
//   좌표·device_id·저장 경로는 출력 타입(StoryMemory)에 자리가 없다. 사진은
//   소유자 화면이 이미 쓰는 로컬 data URL 그대로다. 새 주소를 만들지 않는다.

import type { StoryDay, StoryMemory, StoryPhoto } from "@/components/story/story-types";
import { resolveDisplayImage } from "../place-detail/place-detail-core.ts";

export interface StoryStopInput {
  name:      string;
  /** "HH:MM". 없을 수 있다 */
  time?:     string | null;
  /** city_spots id 문자열 (source === "city_spot" 일 때) */
  place_id?: string | null;
  source?:   string | null;
  /** city_spots.image_url — 카탈로그 대표 이미지. 없을 수 있다 */
  image?:    string | null;
}

export interface StoryDayInput {
  dayNumber: number;
  /** "YYYY-MM-DD" */
  date:      string;
  places:    StoryStopInput[];
}

/** TripMoment 에서 이 어댑터가 읽는 것. 좌표·device_id 는 받지 않는다. */
export interface StoryMomentInput {
  moment_id:         string;
  day_number:        number | null;
  place_name?:       string | null;
  city_spot_id?:     number | null;
  memo:              string;
  photo_data?:       string | null;
  photo_data_extra?: string[] | null;
}

export interface PrivateStoryClock {
  /** "YYYY-MM-DD" — 일정 날짜와 같은 기준으로 만든 오늘 */
  todayISO: string;
  /** "HH:MM" — 오늘 Day 안에서 지난 장소를 가르는 현재 시각 */
  nowHHMM:  string;
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** 종료일이 오늘보다 앞이면 끝난 여행이다. /my-trips 의 archive 판정과 같은 식이다. */
export function isPastTrip(endDate: string | null | undefined, todayISO: string): boolean {
  const ed = s(endDate);
  return ed !== "" && ed < todayISO;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 이 장소에 예정 시각이 지났는가.
 * 날짜가 지난 Day → 참. 미래 Day → 거짓. 오늘 → 시각이 있고 지금 이전일 때만 참.
 */
export function stopReached(
  dayDate: string,
  time:    string | null | undefined,
  clock:   PrivateStoryClock,
): boolean {
  const d = s(dayDate);
  if (d === "") return false;
  if (d < clock.todayISO) return true;
  if (d > clock.todayISO) return false;
  const t = s(time);
  if (!HHMM.test(t) || !HHMM.test(clock.nowHHMM)) return false;
  return t <= clock.nowHHMM;
}

function momentPhotos(m: StoryMomentInput, alt: string | undefined): StoryPhoto[] {
  const list: string[] = [];
  if (s(m.photo_data)) list.push(m.photo_data as string);
  for (const extra of m.photo_data_extra ?? []) if (s(extra)) list.push(extra);
  return list.map(url => ({ url, alt }));
}

function momentItem(m: StoryMomentInput, placeName: string | undefined): StoryMemory {
  return {
    id:        m.moment_id,
    memo:      s(m.memo),
    placeName,
    photos:    momentPhotos(m, placeName),
  };
}

/** 카탈로그 이미지는 죽은 호스트면 쓰지 않는다 — 깨진 사진보다 없는 편이 낫다 */
function baselineItem(dayNumber: number, idx: number, stop: StoryStopInput): StoryMemory {
  const name = s(stop.name) || undefined;
  const img  = resolveDisplayImage(s(stop.image) || null);
  return {
    id:        `stop-${dayNumber}-${idx}`,
    memo:      "",
    placeName: name,
    photos:    img ? [{ url: img, alt: name }] : [],
  };
}

/** 안정된 열쇠가 있을 때만 결합한다. 장소명으로 추측하지 않는다. */
function stableKey(stop: StoryStopInput): string | null {
  if (stop.source !== "city_spot") return null;
  const id = s(stop.place_id);
  return /^\d+$/.test(id) ? id : null;
}

export interface PrivateStoryOptions extends PrivateStoryClock {
  isPast: boolean;
}

/**
 * 일정 + 내 순간 → StoryDay[].
 *
 * Day 순서는 일정 그대로, Day 안에서는 일정 장소 순서 → 결합되지 않은 순간 순서다.
 * 항목이 하나도 없는 Day 는 그리지 않는다(StoryJournal 이 빈 Day 제목만 남기지 않게).
 */
export function buildPrivateStoryDays(
  days:    StoryDayInput[],
  moments: StoryMomentInput[],
  opt:     PrivateStoryOptions,
): StoryDay[] {
  const known = new Set(days.map(d => d.dayNumber));
  const lastDay = days.length > 0 ? days[days.length - 1]!.dayNumber : null;

  // Day 별 순간 — day 가 없거나 일정에 없는 번호는 마지막 Day 로 (공개 어댑터와 같은 규칙)
  const byDay = new Map<number, StoryMomentInput[]>();
  for (const m of moments) {
    const target = m.day_number !== null && known.has(m.day_number) ? m.day_number : lastDay;
    if (target === null) continue;
    const list = byDay.get(target) ?? [];
    list.push(m);
    byDay.set(target, list);
  }

  const out: StoryDay[] = [];
  for (const day of days) {
    const items: StoryMemory[] = [];
    const dayMoments = byDay.get(day.dayNumber) ?? [];
    const used = new Set<string>();

    day.places.forEach((stop, idx) => {
      if (!opt.isPast && !stopReached(day.date, stop.time, opt)) return;
      const key = stableKey(stop);
      const matched = key === null
        ? []
        : dayMoments.filter(m => typeof m.city_spot_id === "number" && String(m.city_spot_id) === key);
      if (matched.length > 0) {
        for (const m of matched) { used.add(m.moment_id); items.push(momentItem(m, s(stop.name) || undefined)); }
      } else {
        items.push(baselineItem(day.dayNumber, idx, stop));
      }
    });

    // 결합되지 않은 순간은 그 Day 의 독립 항목으로 — 사용자가 남긴 것은 사라지지 않는다
    for (const m of dayMoments) {
      if (used.has(m.moment_id)) continue;
      items.push(momentItem(m, s(m.place_name) || undefined));
    }

    if (items.length > 0) out.push({ dayNumber: day.dayNumber, dateLabel: s(day.date), memories: items });
  }
  return out;
}

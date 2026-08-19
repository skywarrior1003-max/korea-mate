// 공개 응답을 Story 화면이 아는 모양으로 바꾼다.
//
// 왜 사이에 한 겹을 두나
//   Story 컴포넌트들은 props 만 받는 순수한 화면이다. API 응답 모양이 그 안까지
//   들어가면, 나중에 응답이 바뀔 때 화면 네 개를 같이 고쳐야 한다. 그리고 더
//   중요한 것 — 이 자리가 "무엇이 화면까지 갈 수 있는가" 의 마지막 문이다.
//   여기서 만들지 않은 값은 화면이 볼 수 없다.
//
// 사진
//   서버는 되돌릴 수 없는 값(`ref`) 하나만 준다. 그걸 공개 이미지 주소로
//   조립하는 것이 전부다. 저장 경로도, moment id 도, photo id 도, 기기 id 도
//   여기 없다 — 애초에 응답에 오지 않는다.
//
// 만들어 내지 않는다
//   메모를 다듬거나 요약하거나 번역하지 않는다. 장소가 없으면 없는 채로 둔다.
//   사진이 없으면 없는 채로 둔다. 시안의 sample 값으로 채우지 않는다.

import type { StoryDay, StoryMemory, StoryPhoto } from "@/components/story/story-types";
import type { StoryCardMoment } from "@/components/TripStoryExport";

/** `/api/shared/{id}/story` 가 주는 Memory 한 개 */
export interface ApiMemory {
  dayNumber: number | null;
  memo:      string | null;
  placeName: string | null;
  placeId:   string | null;
  photos:    { ref: string }[];
}

/** 그 응답에서 이 어댑터가 쓰는 것 */
export interface ApiStory {
  id:          string;
  city:        string;
  start_date:  string;
  end_date:    string;
  trip_title:  string;
  days:        unknown;
  memories?:   ApiMemory[];
}

/**
 * 공개 사진 주소.
 *
 * 공유 링크에 이미 들어 있는 여행 id 와, 서버가 준 되돌릴 수 없는 값 하나로만
 * 만든다. 새로 드러나는 내부 값이 없다. 프록시는 요청마다 공개 여부와 동의를
 * 다시 확인하므로, 이 주소를 들고 있어도 공개가 꺼지면 곧 막힌다.
 */
export function memoryPhotoUrl(itineraryId: string, ref: string): string {
  return `/img/memory/${encodeURIComponent(itineraryId)}/${encodeURIComponent(ref)}`;
}

/** 저장된 days 에서 하루씩 꺼낸다. 모양 두 가지를 다 받는다. */
function scheduledDays(raw: unknown): { dayNumber?: number; date?: string; places?: unknown[] }[] {
  if (Array.isArray(raw)) return raw as { dayNumber?: number; date?: string; places?: unknown[] }[];
  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2 && Array.isArray(v2.scheduled)) {
      return v2.scheduled as { dayNumber?: number; date?: string; places?: unknown[] }[];
    }
  }
  return [];
}

/**
 * Memory 를 Day 로 묶는다.
 *
 * day 번호가 있는 것은 그 Day 로 간다. **없는 것은 버리지 않고 맨 뒤 Day 에
 * 붙인다** — 새 구역을 만들지 않는다(시안에 없는 화면을 지어내지 않기 위해).
 * 붙일 Day 조차 없으면(일정에 Day 가 하나도 없는 경우) 마지막 수단으로 Day 1 을
 * 만들어 담는다. 어느 경우에도 사라지지 않는다.
 *
 * 같은 Day 안의 순서는 서버가 정한 순서 그대로다 — 여기서 다시 정렬하지 않는다.
 */
export function toStoryDays(api: ApiStory): StoryDay[] {
  const memories = api.memories ?? [];
  if (memories.length === 0) return [];

  const sched = scheduledDays(api.days);
  const dayNumbers = sched
    .map((d, i) => (typeof d.dayNumber === "number" ? d.dayNumber : i + 1))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);

  const byDay = new Map<number, StoryMemory[]>();
  const known = new Set(dayNumbers);
  // day 가 없거나 일정에 없는 번호는 마지막 Day 로 모은다
  const lastDay = dayNumbers.length > 0 ? dayNumbers[dayNumbers.length - 1]! : 1;

  memories.forEach((m, idx) => {
    const target = m.dayNumber !== null && known.has(m.dayNumber) ? m.dayNumber : lastDay;
    const photos: StoryPhoto[] = m.photos.map(p => ({
      url: memoryPhotoUrl(api.id, p.ref),
      alt: m.placeName ?? undefined,
    }));
    const list = byDay.get(target) ?? [];
    list.push({
      // 화면 안에서만 쓰는 key. 서버가 준 내부 id 가 아니다(응답에 오지도 않는다).
      id:        `d${target}-${idx}`,
      memo:      m.memo ?? "",
      placeName: m.placeName ?? undefined,
      photos,
    });
    byDay.set(target, list);
  });

  const dateOf = (n: number): string => {
    const hit = sched.find((d, i) => (typeof d.dayNumber === "number" ? d.dayNumber : i + 1) === n);
    return typeof hit?.date === "string" ? hit.date : "";
  };

  const days = dayNumbers.length > 0 ? dayNumbers : [1];
  return days
    .filter(n => (byDay.get(n) ?? []).length > 0)
    .map(n => ({ dayNumber: n, dateLabel: dateOf(n), memories: byDay.get(n) ?? [] }));
}

/** Cover 에 쓸 사진 — 공개된 Memory 중 첫 사진. 없으면 null. */
export function coverPhotoUrl(api: ApiStory): string | null {
  for (const m of api.memories ?? []) {
    const first = m.photos[0];
    if (first) return memoryPhotoUrl(api.id, first.ref);
  }
  return null;
}

/** 예: "OCT 12 – OCT 14 · BUSAN". 날짜는 이미 공개 응답에 있는 값이다. */
export function coverEyebrow(api: ApiStory): string {
  const city = (api.city ?? "").trim();
  const range = [api.start_date, api.end_date].filter(Boolean).join(" – ");
  return [range, city].filter(Boolean).join(" · ");
}

/** Summary 통계 — 공개 일정에서 셀 수 있는 것만. 지어내지 않는다. */
export function storyStats(api: ApiStory): { dayCount: number; placeCount: number } {
  const sched = scheduledDays(api.days);
  let placeCount = 0;
  for (const d of sched) placeCount += Array.isArray(d.places) ? d.places.length : 0;
  return { dayCount: sched.length, placeCount };
}

/** 공개된 Memory 가 하나라도 있는가 — Story 화면을 쓸지 정하는 기준이다. */
export function hasPublicMemories(api: ApiStory): boolean {
  return (api.memories ?? []).length > 0;
}

/**
 * 공개 Story → 9:16 카드가 받는 최소 입력.
 *
 * 카드는 사진을 최대 3장만 쓰지만 그 상한은 렌더러의 사정이다. 여기서는
 * 공개된 사진을 순서대로 펼쳐 주기만 한다 — 무엇을 고를지는 렌더러가 정한다.
 *
 * 왜 소유자 화면의 Memory 를 쓰지 않나
 *   그 목록에는 공개하지 않기로 한 것과 아직 아무도 못 본 로컬 사진이 함께
 *   들어 있다. 서버가 이미 **공개 여부·동의 판본·관리자 차단**을 다 보고
 *   걸러 준 것이 이 payload 다. 카드가 그것만 먹으면 화면 쪽에서 공개 판정을
 *   한 번 더 할 이유가 없고, 두 판정이 어긋날 일도 없다.
 *
 * `category` 는 공개 payload 에 없다. 없는 채로 둔다 — 지어내면 카드가
 * 사용자의 여행을 잘못 설명한다.
 */
export function toStoryCardMoments(api: ApiStory): StoryCardMoment[] {
  const out: StoryCardMoment[] = [];
  for (const m of api.memories ?? []) {
    const memo = typeof m.memo === "string" ? m.memo : "";
    const placeName = typeof m.placeName === "string" && m.placeName.trim() !== "" ? m.placeName : null;
    if (m.photos.length === 0) {
      // 사진 없는 Memory 도 메모는 카드에 인용될 수 있다
      if (memo.trim() !== "") out.push({ photoSrc: null, memo, placeName });
      continue;
    }
    for (const p of m.photos) out.push({ photoSrc: memoryPhotoUrl(api.id, p.ref), memo, placeName });
  }
  return out;
}

/** 이 여행의 공개 Story 주소. 공유되는 링크는 전부 이 값 하나를 쓴다. */
export function publicStoryUrl(origin: string, itineraryId: string): string {
  return `${origin.replace(/\/+$/, "")}/shared/${encodeURIComponent(itineraryId)}`;
}

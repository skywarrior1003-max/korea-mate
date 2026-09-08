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
import { resolveDisplayImage } from "../place-detail/place-detail-core.ts";

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

/** 공개 응답의 장소에서 이 어댑터가 읽는 것 — 전부 공개 serializer 를 통과한 값이다. */
interface ApiPlace {
  name?:     unknown;
  place_id?: unknown;
  /** 카탈로그 대표 이미지 — 공식 장소일 때만 응답에 온다 */
  image?:    unknown;
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

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** 일정 장소 하나 → Story 의 기본 항목. 소유자 어댑터의 baselineItem 과 같은 규칙이다. */
function baselineItem(dayNumber: number, idx: number, place: ApiPlace): StoryMemory {
  const name = str(place.name) || undefined;
  const img  = resolveDisplayImage(str(place.image) || null);
  return {
    id:        `stop-${dayNumber}-${idx}`,
    memo:      "",
    placeName: name,
    photos:    img ? [{ url: img, alt: name }] : [],
  };
}

/** Memory ↔ 일정 장소 결합 — 정본 열쇠(place_id)로만 한다. 장소명으로 추측하지 않는다. */
function memoryBelongsToPlace(m: ApiMemory, place: ApiPlace): boolean {
  if (typeof m.placeId !== "string" || m.placeId === "") return false;
  const pid = place.place_id;
  if (typeof pid !== "string" && typeof pid !== "number") return false;
  return String(pid) === m.placeId;
}

/**
 * 공개 일정 + 공개 Memory → StoryDay[]. (SHARED-STORY-RICH-EXPERIENCE-V1)
 *
 * Story 의 뼈대는 일정이다 — 소유자 Story(private-story-adapter)와 같은 원칙.
 * 공유받은 사람은 사진이 없는 여행에서도 Day 별 장소 흐름(카탈로그 대표 이미지 +
 * 장소명)을 본다. 공개 Memory 가 그 장소에 결합되면 그 항목이 개인 기록으로
 * 풍부해진다. 결합은 정본 열쇠(place_id)로만 하고, day 가 없거나 일정에 없는
 * 번호의 Memory 는 버리지 않고 마지막 Day 에 붙인다(기존 규칙 그대로).
 *
 * 여기 들어오는 값은 전부 공개 serializer 를 통과한 것뿐이다 — 좌표·경로·내부
 * id 는 응답에 오지 않으므로 여기서도 만들 수 없다.
 *
 * 같은 Day 안의 순서는 일정 순서 → 결합되지 않은 Memory 순서다.
 */
export function toStoryDays(api: ApiStory): StoryDay[] {
  const memories = api.memories ?? [];
  const sched = scheduledDays(api.days);

  const dayNumbers = sched
    .map((d, i) => (typeof d.dayNumber === "number" ? d.dayNumber : i + 1))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);
  const known = new Set(dayNumbers);
  const lastDay = dayNumbers.length > 0 ? dayNumbers[dayNumbers.length - 1]! : 1;

  // Day 별 Memory — day 가 없거나 일정에 없는 번호는 마지막 Day 로 모은다
  const byDay = new Map<number, { m: ApiMemory; idx: number }[]>();
  memories.forEach((m, idx) => {
    const target = m.dayNumber !== null && known.has(m.dayNumber) ? m.dayNumber : lastDay;
    const list = byDay.get(target) ?? [];
    list.push({ m, idx });
    byDay.set(target, list);
  });

  const memoryItem = (m: ApiMemory, idx: number, target: number, placeName?: string): StoryMemory => ({
    // 화면 안에서만 쓰는 key. 서버가 준 내부 id 가 아니다(응답에 오지도 않는다).
    id:        `d${target}-${idx}`,
    memo:      m.memo ?? "",
    placeName: m.placeName ?? placeName,
    photos:    m.photos.map(p => ({ url: memoryPhotoUrl(api.id, p.ref), alt: m.placeName ?? placeName })),
  });

  const out: StoryDay[] = [];
  const renderDays = dayNumbers.length > 0 ? dayNumbers : (memories.length > 0 ? [1] : []);

  for (const n of renderDays) {
    const day = sched.find((d, i) => (typeof d.dayNumber === "number" ? d.dayNumber : i + 1) === n);
    const dateLabel = typeof day?.date === "string" ? day.date : "";
    const places = Array.isArray(day?.places) ? (day.places as ApiPlace[]) : [];
    const dayMemories = byDay.get(n) ?? [];
    const used = new Set<number>();
    const items: StoryMemory[] = [];

    places.forEach((place, idx) => {
      const matched = dayMemories.filter(e => !used.has(e.idx) && memoryBelongsToPlace(e.m, place));
      if (matched.length > 0) {
        for (const e of matched) { used.add(e.idx); items.push(memoryItem(e.m, e.idx, n, str(place.name) || undefined)); }
      } else {
        items.push(baselineItem(n, idx, place));
      }
    });

    // 결합되지 않은 Memory 는 그 Day 의 독립 항목으로 — 남긴 것은 사라지지 않는다
    for (const e of dayMemories) {
      if (used.has(e.idx)) continue;
      items.push(memoryItem(e.m, e.idx, n));
    }

    if (items.length > 0) out.push({ dayNumber: n, dateLabel, memories: items });
  }
  return out;
}

/**
 * Cover 대체 이미지 — 개인 사진이 하나도 공개되지 않은 여행의 표지.
 * 일정의 첫 공식 장소 카탈로그 이미지다. 없으면 null(표지는 글자만으로 간다).
 */
export function coverFallbackUrl(api: ApiStory): string | null {
  for (const day of scheduledDays(api.days)) {
    for (const raw of day.places ?? []) {
      const img = resolveDisplayImage(str((raw as ApiPlace).image) || null);
      if (img) return img;
    }
  }
  return null;
}

/**
 * 대표성 있는 카탈로그 cover (TRAVEL-MEMORY-PRODUCTION-V1 §9).
 *
 * "단순 첫 catalog image" 대신, **사용자가 실제로 기록을 남긴 장소**의 카탈로그
 * 이미지를 우선한다 — 공개 Memory 가 가장 많이 결합된 장소가 이 여행을 가장
 * 잘 대표한다는, 지어내지 않은 신호다. 동률이면 일정 순서가 빠른 쪽.
 * 아무 신호가 없으면(공개 Memory 0) 첫 카탈로그 이미지가 남은 유일한 정직한
 * 선택이라 그대로 쓴다.
 */
export function representativeCoverUrl(api: ApiStory): string | null {
  const memories = api.memories ?? [];
  const counts = new Map<string, number>();
  for (const m of memories) {
    if (typeof m.placeId === "string" && m.placeId !== "") {
      counts.set(m.placeId, (counts.get(m.placeId) ?? 0) + 1);
    }
  }
  let best: { img: string; count: number } | null = null;
  for (const day of scheduledDays(api.days)) {
    for (const raw of day.places ?? []) {
      const place = raw as ApiPlace;
      const img = resolveDisplayImage(str(place.image) || null);
      if (!img) continue;
      const pid = place.place_id;
      const count = (typeof pid === "string" || typeof pid === "number") ? (counts.get(String(pid)) ?? 0) : 0;
      if (!best || count > best.count) best = { img, count };
    }
  }
  return best?.img ?? null;
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

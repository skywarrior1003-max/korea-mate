// Story Focus 의 순서 — 여행 전체 사진을 한 줄로 편다. (TASK-STORY-FOCUS-PREMIUM-UX-V1)
//
// 왜 한 줄인가
//   사진을 누른 사람은 "이 여행의 사진을 넘겨 보고 싶다" 는 것이지 "이 장소의 사진
//   3장만 보고 닫았다가 다음 장소를 다시 누르고 싶다" 는 것이 아니다. 세로=장소,
//   가로=사진 같은 2축은 모바일에서 브라우저 뒤로가기 제스처·스크롤과 충돌하고
//   조작법을 배워야 한다. 그래서 Day → 장소 → 사진 순서 그대로 **한 방향**으로만
//   넘긴다. 장소가 바뀌면 캡션(장소명·메모)이 바뀌고, 같은 장소 안에서는 위의
//   구간 progress 가 몇 장째인지 보여 준다.
//
// 이 파일은 순수 계산만 한다 — 화면 컴포넌트가 어디서 열렸든(소유자 Story,
// 공개 Story) 같은 순서를 받는다. 사진이 없는 항목은 Focus 에 들어가지 않는다.

import type { StoryDay, StoryMemory, StoryPhoto } from "@/components/story/story-types";

export interface FocusSlide {
  /** 슬라이드 고유 키 (memory id + 사진 순번) */
  key:        string;
  url:        string;
  alt?:       string;
  memoryId:   string;
  placeName?: string;
  memo:       string;
  dayNumber:  number;
  dateLabel:  string;
  /** 이 장소 안에서 몇 번째 사진인가 (0부터) */
  photoIndex: number;
  /** 이 장소의 사진 수 */
  photoCount: number;
}

/** Day → 장소 → 사진 순서로 평탄화. 사진 없는 항목은 건너뛴다. */
export function buildFocusSequence(days: StoryDay[]): FocusSlide[] {
  const out: FocusSlide[] = [];
  for (const day of days) {
    for (const m of day.memories) {
      const photos: StoryPhoto[] = m.photos.filter(p => typeof p.url === "string" && p.url.trim() !== "");
      photos.forEach((p, idx) => {
        out.push({
          key:        `${m.id}#${idx}`,
          url:        p.url,
          alt:        p.alt,
          memoryId:   m.id,
          placeName:  m.placeName,
          memo:       m.memo,
          dayNumber:  day.dayNumber,
          dateLabel:  day.dateLabel,
          photoIndex: idx,
          photoCount: photos.length,
        });
      });
    }
  }
  return out;
}

/** 누른 사진이 한 줄 안에서 몇 번째인가. 못 찾으면 그 장소의 첫 사진, 그것도 없으면 0. */
export function findSlideIndex(slides: FocusSlide[], memory: Pick<StoryMemory, "id">, photoIndex: number): number {
  const exact = slides.findIndex(s => s.memoryId === memory.id && s.photoIndex === photoIndex);
  if (exact >= 0) return exact;
  const first = slides.findIndex(s => s.memoryId === memory.id);
  return first >= 0 ? first : 0;
}

/** 다음 장소로 넘어가는 경계인가 — 캡션 전환 연출에 쓴다 */
export function crossesMemory(slides: FocusSlide[], from: number, to: number): boolean {
  const a = slides[from], b = slides[to];
  return Boolean(a && b && a.memoryId !== b.memoryId);
}

/** 앞뒤 한 장씩 미리 받아 둘 주소 — 넘길 때 흰 화면이 비치지 않게 */
export function neighborUrls(slides: FocusSlide[], i: number): string[] {
  return [slides[i - 1]?.url, slides[i + 1]?.url].filter((u): u is string => typeof u === "string");
}

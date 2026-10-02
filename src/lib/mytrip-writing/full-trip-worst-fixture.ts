// 전체 여행 글쓰기 — 서버가 허용하는 가장 큰 요청을 만든다(비용 예약 상한 검사용, 2026-10-02).
// 모든 칸을 JSON 이스케이프가 가장 긴 문자로 채운다: 제어 문자 U+0001 은 사실 JSON 에서 "\u0001"(6자),
// 본문 JSON 에서 다시 "\\u0001"(7바이트)이 된다. 공백류는 clip 이 하나로 줄이므로 쓰지 않는다.
// 테스트·측정 스크립트 공용(순수 함수).
import { FULL_TRIP_MAX_MOMENTS, FULL_TRIP_PHOTO_LIMITS, type FullTripFacts, type FullTripImage } from "./full-trip-core.ts";

const fill = (n: number, ch = "\u0001") => ch.repeat(n);

export function worstFullTripFacts(ch = "\u0001", longText = 10_000): FullTripFacts {
  const big = fill(longText, ch); // clip 이 칸마다 상한으로 자른다 — 입력은 상한보다 길게 준다
  return {
    locale: "ko",
    city: big, startDate: big, endDate: big,
    tripTitle: big, storyTitle: big, storyIntro: big,
    days: Array.from({ length: 40 }, (_, d) => ({ day: d + 1, places: Array.from({ length: 50 }, () => big) })),
    moments: Array.from({ length: FULL_TRIP_MAX_MOMENTS }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      day: 1, place: big, title: big, memo: big, hasPhoto: true, photo: "shown" as const, photosTotal: 999, photosShown: 999,
    })),
  };
}

/** 사진 15장 꼬리표(데이터는 비움 — 예약 계산은 데이터를 세지 않는다) */
export function worstFullTripImages(): FullTripImage[] {
  return Array.from({ length: FULL_TRIP_PHOTO_LIMITS.maxPhotos }, (_, i) => ({
    momentId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, mimeType: "image/jpeg", data: "", index: 999, of: 999,
  }));
}

// Explore 링크는 "지금 준비 중인 여행의 도시" 를 가리킨다 (TASK-MY-TRIP-CONNECT-FIX-V1).
//
// Picks/This Trip 의 "장소 더 찾기" 가 `/explore/busan/` 로 고정되어 있어 경주 여행을
// 만들던 사람이 부산 Explore 로 보내졌다. 도시는 TripDraft.city 에서 오는데 표기가
// "Gyeongju" 일 수도 "gyeongju" 일 수도 있다 — 라우트 slug 는 소문자다.
// 모르는 도시·도시 없음은 기존 기본값(부산)으로 둔다. 새 라우트를 만들지 않는다.

import { CITY_SLUGS, type CitySlug } from "../data/cities/index.ts";

export const DEFAULT_EXPLORE_HREF = "/explore/busan/";

/** 도시 표기(대소문자 무관)를 Explore 라우트로. 등록된 도시가 아니면 기본값 */
export function exploreHrefFor(city: string | null | undefined): string {
  const slug = (city ?? "").trim().toLowerCase();
  return (CITY_SLUGS as readonly string[]).includes(slug) ? `/explore/${slug as CitySlug}/` : DEFAULT_EXPLORE_HREF;
}

// 장소 이미지가 없을 때 무엇을 그릴지 — **한 곳에서** 정한다.
//
// 왜 필요한가
//   운영 city_spots 86건은 전부 image_url 이 있지만 그중 79건이 이미 죽은 호스트다.
//   그리고 앞으로 들어올 부산 식당 데이터는 이미지 사용권이 확정되지 않아
//   image_url = NULL 로 들어간다. 즉 "이미지 없음" 이 정상 상태가 된다.
//
// 무엇을 하지 않는가
//   없는 사진을 만들어내지 않는다. 카테고리나 이름으로 외부 스톡 사진을 골라
//   그 가게의 사진인 것처럼 보여주는 것은 가짜 데이터다. 실제로 일정 화면이
//   그렇게 하고 있었고(Unsplash 하드코딩), 이 모듈이 그것을 대체한다.
//
// 기존 화면들이 이미 쓰고 있는 자산을 그대로 쓴다 — SpotCard · EventDetailModal ·
// CartDrawer · ExploreCity 가 모두 아래 placeholder 를 참조한다.

import { resolveDisplayImage } from "./place-detail/place-detail-core.ts";

/** 저장소에 이미 있는 공통 placeholder. 도시·카테고리별로 분기하지 않는다. */
export const PLACEHOLDER_SPOT_IMAGE = "/images/placeholder-spot.svg";

/**
 * `<img src>` 에 넣을 값. 항상 그릴 수 있는 값을 준다.
 * null · undefined · 빈 문자열 · 공백 · 잘못된 URL · 죽은 호스트는 전부 placeholder 로 간다.
 */
export function resolveSpotImageSrc(imageUrl: string | null | undefined): string {
  return resolveDisplayImage(imageUrl ?? null) ?? PLACEHOLDER_SPOT_IMAGE;
}

/** 실제 이미지가 있는가 — 없으면 이미지 영역을 아예 접는 화면에서 쓴다. */
export function hasRealSpotImage(imageUrl: string | null | undefined): boolean {
  return resolveDisplayImage(imageUrl ?? null) !== null;
}

/**
 * 원격 이미지 로드 실패 시 placeholder 로 교체한다.
 * 이미 placeholder 면 다시 시도하지 않는다 — 무한 onError 루프를 막는다.
 */
export function swapToPlaceholderOnError(
  e: { currentTarget: { src: string } },
): void {
  const el = e.currentTarget;
  if (el.src.endsWith(PLACEHOLDER_SPOT_IMAGE)) return;
  el.src = PLACEHOLDER_SPOT_IMAGE;
}

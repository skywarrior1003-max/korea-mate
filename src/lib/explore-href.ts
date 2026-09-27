// Explore 링크는 "지금 준비 중인 여행의 도시" 를 가리킨다 (TASK-MY-TRIP-CONNECT-FIX-V1
// → CITY-ROUTING-RECOVERY-V1 강화).
//
// 원래 소문자 slug 만 인식해서, 도시 값이 라벨(예: "전주"·"제주도")이거나 별칭이면
// 조용히 부산으로 떨어졌다. 도시 해석은 이 레포의 canonical SSOT 인
// resolveCitySlug(라벨·별칭·대소문자 전부 해석) 하나만 쓴다 — 중복 매핑 금지.
//
// 알 수 없는/빈 도시의 안전 fallback 은 기존 제품 계약(부산 Explore 허브)을
// 유지한다 — 존재하지 않는 라우트를 지어내지 않는다. 단, 지원 5도시는 어떤
// 표기로 와도 반드시 자기 도시로 간다(가드 고정).

import { resolveCitySlug } from "../data/cities/resolve.ts";

export const DEFAULT_EXPLORE_HREF = "/explore/busan/";

/** 도시 표기(slug·라벨·별칭)를 Explore 라우트로. 해석 불가면 기본 허브 */
export function exploreHrefFor(city: string | null | undefined): string {
  const slug = resolveCitySlug(city ?? null);
  return slug ? `/explore/${slug}/` : DEFAULT_EXPLORE_HREF;
}

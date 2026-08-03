// Home 의 ?city= 파라미터 해석.
//
// Home 은 곧 AI 플래너다. 그런데 도시 진입 화면(/jeonju/ 등)은 플래너가 아직
// 지원하지 않는 도시에도 존재한다. 그래서 "유효한 도시인가" 와 "플래너가 그
// 도시를 만들 수 있는가" 는 서로 다른 질문이고, 한 값으로 묶으면 안 된다.
//
//   유효성      → CITY_ENTRY_CONTENT 의 키 (도시 진입 화면이 존재하는 도시)
//   플래너 지원 → CITY_ENTRY_CONTENT[slug].plannerReady
//   플래너 도시 → CITY_ARRIVAL_OPTIONS 의 키 (플래너가 실제로 아는 이름)
//
// 셋 다 기존 계약에서 파생한다. HomeClient 안에 도시 목록을 다시 적지 않는다.
// 예전엔 ["Busan","Seoul","Jeju","Gyeongju"] 배열이 HomeClient 에 두 번
// 하드코딩돼 있었고, 목록에 없는 jeonju 는 조용히 Busan 으로 흘렀다.
//
// 마지막 관문을 CITY_ARRIVAL_OPTIONS 로 둔 이유: 플래너 화면은 도착지 목록이
// 없는 도시를 만나면 Busan 목록으로 폴백한다. 그 표에 없는 도시는 여기서
// 플래너로 보내지 않으면 폴백 자체가 일어나지 않는다.
//
// 판정 결과만 돌려주고 라우팅은 하지 않는다 — 그래야 next/navigation 없이
// 테스트할 수 있다.

import { CITY_ENTRY_CONTENT } from "../data/cities/entry-content.ts";
import { CITY_ARRIVAL_OPTIONS } from "../data/city-presets.ts";

export type CityParamResult =
  /** 파라미터가 없다. Home 기본 상태를 그대로 둔다. */
  | { kind: "none" }
  /** 플래너가 지원하는 도시. 그 도시를 선택한 상태로 Home 을 연다. */
  | { kind: "planner"; city: string }
  /** 유효하지만 플래너 미지원. 그 도시의 진입 화면으로 보낸다. */
  | { kind: "redirect"; href: string }
  /** 아는 도시가 아니다. 도시로 인정하지 않고 무시한다. */
  | { kind: "ignore" };

/** "  BuSaN " → "busan". 비교 전용이라 표시에는 쓰지 않는다. */
function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "busan" → "Busan". 플래너 상태가 쓰는 표기이며 CITY_ARRIVAL_OPTIONS 키와 같다. */
function toPlannerName(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * ?city= 값 하나를 해석한다.
 *
 * 잘못된 slug 를 Busan 으로 해석하지 않는다 — 그게 원래 결함이었다.
 * 미지원 도시도 Busan 으로 떨어뜨리지 않고 자기 진입 화면으로 보낸다.
 */
export function resolveCityParam(raw: string | null | undefined): CityParamResult {
  if (!raw) return { kind: "none" };

  const slug = normalizeSlug(raw);
  if (!slug) return { kind: "none" };

  const entry = CITY_ENTRY_CONTENT[slug];
  if (!entry) return { kind: "ignore" };

  if (!entry.plannerReady) return { kind: "redirect", href: `/${slug}/` };

  // plannerReady 인데 플래너가 그 도시를 모르면 계약이 어긋난 것이다.
  // Busan 도착지로 폴백시키느니 무시한다.
  const name = toPlannerName(slug);
  return CITY_ARRIVAL_OPTIONS[name] ? { kind: "planner", city: name } : { kind: "ignore" };
}

/**
 * 현재 URL 에서 city 파라미터만 지운 경로.
 * 잘못된 slug 를 주소창에 남겨두면 새로고침마다 같은 판정을 반복한다.
 */
export function stripCityParam(pathname: string, search: string): string {
  const p = new URLSearchParams(search);
  p.delete("city");
  const rest = p.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

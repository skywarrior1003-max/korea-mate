import type { CityConfig } from "./types.ts";
import busanConfig from "./busan.ts";
import seoulConfig from "./seoul.ts";
import jejuConfig from "./jeju.ts";
import gyeongjuConfig from "./gyeongju.ts";
import jeonjuConfig from "./jeonju.ts";

export const CITY_CONFIGS: Record<string, CityConfig> = {
  busan:    busanConfig,
  seoul:    seoulConfig,
  jeju:     jejuConfig,
  gyeongju: gyeongjuConfig,
  jeonju:   jeonjuConfig,
};

// slug SSOT 는 경량 identity 모듈로 이동(Functions 공유) — 여기서는 재수출만.
export { CITY_SLUGS } from "./identity.ts";
export type { CitySlug } from "./identity.ts";

/**
 * 이 도시 이름을 화면에 찍을 때 쓰는 번역 키. 네임스페이스는 `tripForm` 이다.
 *
 * 이름을 그대로 찍으면 한국어 화면에도 `Gyeongju` 가 나온다. 번역은 이미
 * `city_*` 키에 있으므로 CityConfig 에 nameJa·nameZh 를 계속 늘리지 않고
 * 그 키를 재사용한다 — 키 모양을 아는 곳은 이 함수 하나다.
 */
export function cityLabelKey(city: { name: string }): string {
  return `city_${city.name}`;
}

export type { CityConfig, CitySpot } from "./types.ts";

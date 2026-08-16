import type { CityConfig } from "./types";
import busanConfig from "./busan";
import seoulConfig from "./seoul";
import jejuConfig from "./jeju";
import gyeongjuConfig from "./gyeongju";
import jeonjuConfig from "./jeonju";

export const CITY_CONFIGS: Record<string, CityConfig> = {
  busan:    busanConfig,
  seoul:    seoulConfig,
  jeju:     jejuConfig,
  gyeongju: gyeongjuConfig,
  jeonju:   jeonjuConfig,
};

export const CITY_SLUGS = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;
export type CitySlug = typeof CITY_SLUGS[number];

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

export type { CityConfig, CitySpot } from "./types";

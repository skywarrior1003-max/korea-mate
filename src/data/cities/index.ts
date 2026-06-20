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

export type { CityConfig, CitySpot } from "./types";

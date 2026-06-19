// gokoreamate — 도시별 OG 이미지 설정
// TASK-029: SNS 링크 프리뷰 도시 특화 비주얼 분기

export interface CityOGConfig {
  cityEn:      string;
  subtitle:    string;
  bgGradient:  string;
  accentColor: string;
}

export const CITY_OG_CONFIGS: Record<string, CityOGConfig> = {
  seoul: {
    cityEn:      "SEOUL",
    subtitle:    "Capital City · AI Trip Planner",
    bgGradient:  "linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 55%, #0a1a3a 100%)",
    accentColor: "#4A90D9",
  },
  busan: {
    cityEn:      "BUSAN",
    subtitle:    "Ocean City · AI Trip Planner",
    bgGradient:  "linear-gradient(135deg, #0a1e3a 0%, #0f3460 55%, #0a2040 100%)",
    accentColor: "#00B4D8",
  },
  jeju: {
    cityEn:      "JEJU",
    subtitle:    "Island Paradise · AI Trip Planner",
    bgGradient:  "linear-gradient(135deg, #0a2a1a 0%, #1a3d2a 55%, #0d2418 100%)",
    accentColor: "#2DC653",
  },
  gyeongju: {
    cityEn:      "GYEONGJU",
    subtitle:    "Ancient Capital · AI Trip Planner",
    bgGradient:  "linear-gradient(135deg, #2a1a08 0%, #3d2810 55%, #1a0f05 100%)",
    accentColor: "#D4954A",
  },
};

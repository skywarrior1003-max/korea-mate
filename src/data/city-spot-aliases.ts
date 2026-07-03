// TASK-DB-02-C: ExploreCity 중복 노출 방지
// city_spots에서 확인된 실질 중복 4쌍의 B버전(alias)을 Explore 화면에서 숨깁니다.
//
// 중복 판단 근거 (2026-07-03 SELECT-only 검증):
//   A버전 (012 original, id 3~7): description 풍부, 이름 명확
//   B버전 (batch, id 16~33): description 짧음, affiliate_url은 generic city URL
//   fetchCitySpots()는 .order("id")로 정렬 → A가 항상 먼저 반환됨
//
// 제외: Hwangnyeongsan Night View Trail ↔ Observatory (병존 가능한 다른 경험)
// 제외: matchCitySpot, plan.ts scheduler (별도 설계 필요)

import type { CitySpot } from "@/data/cities/types";

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").replace(/\s+/g, " ").trim();
}

// key: normName(B버전 alias), value: normName(A버전 canonical)
const ALIAS_TO_CANONICAL = new Map<string, string>([
  [normName("Gwangalli Beach"),      normName("Gwangalli Beach & Bridge")],
  [normName("Jagalchi Market"),       normName("Jagalchi Fish Market")],
  [normName("Igidae Coastal Trail"),  normName("Igidae Coastal Walk")],
  [normName("Jangsan Mountain"),      normName("Jangsan Mountain Trail")],
]);

const ALIAS_KEYS = new Set(ALIAS_TO_CANONICAL.keys());

export function dedupeByCanonical(spots: CitySpot[]): CitySpot[] {
  return spots.filter(spot => !ALIAS_KEYS.has(normName(spot.name)));
}

// GoKoreaMate / gokoreamate.com — Near Me Engine (Orchestrator)
// TASK-015: Near Me API Implementation
// Pipeline: getCandidates → rowsToZonedPlaces → expandZones → score → sort → limit

import type { NearMeInput, NearMeResponse, NearMeResult, ZonedPlace } from "./types";
import { ALL_PLACE_CATEGORIES, CATEGORY_MAP } from "./types";
import { getCandidates, isMockNearMeMode } from "./candidate-generator";
import { MOCK_NEAR_ME_PLACES } from "./mock/mock-places";
import { rowsToZonedPlaces, expandZones } from "./zone-classifier";
import { computeTotalScore, buildLikedCategorySet } from "./scorer";
import type { PlaceCategory } from "../scheduler/types";

const DEFAULT_LIMIT = 20;

export async function runNearMe(input: NearMeInput): Promise<NearMeResponse> {
  // ── Step 1: Fetch raw place rows (mock or Supabase) ──────────────────────

  const rows = await getCandidates(input);

  // ── Step 2: Convert to ZonedPlace (Haversine filter + zone assignment) ───

  const zonedPlaces = rowsToZonedPlaces(rows, input.coordinate);

  // ── Step 3: Dynamic Zone expansion ───────────────────────────────────────

  let { candidates, activeZone } = expandZones(zonedPlaces);
  let usedMockFallback = false;

  // ── Step 3b: TASK-020 — Live 모드에서 결과 0개 시 Mock 안전망 주입 ─────────
  // 실 Supabase 쿼리가 사용자 좌표 반경 7km 내 장소를 찾지 못한 경우
  // (도심 외곽, 농촌, 데이터 미세딩 지역 등) 스케줄러 HC-7 위반을 방지.
  if (candidates.length === 0 && !isMockNearMeMode()) {
    const catSet = new Set<string>(input.categories ?? ALL_PLACE_CATEGORIES);
    const fallback: ZonedPlace[] = MOCK_NEAR_ME_PLACES
      .filter(p => {
        const mapped = CATEGORY_MAP[p.category] as PlaceCategory | undefined;
        return mapped !== undefined && catSet.has(mapped);
      })
      .filter(p => p.lat !== null && p.lng !== null)
      .map(p => ({
        place_id:   p.place_id,
        category:   CATEGORY_MAP[p.category] as PlaceCategory,
        coordinate: { lat: p.lat!, lng: p.lng! },
        zone_id:    3 as const,  // 거리 무관 — Zone 3으로 일괄 배정
        distance_m: 5_000,       // synthetic — 스코어링에만 영향
      }));
    if (fallback.length > 0) {
      candidates        = fallback;
      activeZone        = 3;
      usedMockFallback  = true;
    }
  }

  // ── Step 4: Build preference signal from liked_place_ids ─────────────────

  const likedCategories = buildLikedCategorySet(
    input.liked_place_ids ?? [],
    candidates
  );

  // ── Step 5: Score each candidate ─────────────────────────────────────────

  const scored: NearMeResult[] = candidates.map((candidate) => ({
    place_id:   candidate.place_id,
    category:   candidate.category,
    coordinate: candidate.coordinate,
    zone_id:    candidate.zone_id,
    distance_m: candidate.distance_m,
    score:      computeTotalScore(candidate, input, likedCategories),
  }));

  // ── Step 6: Sort by score descending, apply limit ────────────────────────

  const limit = input.limit ?? DEFAULT_LIMIT;
  const results = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    results,
    active_zone: activeZone,
    total_count: results.length,
    mock:        isMockNearMeMode() || usedMockFallback,
  };
}

// Re-export for convenience
export { ALL_PLACE_CATEGORIES };

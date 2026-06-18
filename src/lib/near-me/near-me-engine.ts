// GoKoreaMate / gokoreamate.com — Near Me Engine (Orchestrator)
// TASK-015: Near Me API Implementation
// Pipeline: getCandidates → rowsToZonedPlaces → expandZones → score → sort → limit

import type { NearMeInput, NearMeResponse, NearMeResult } from "./types";
import { ALL_PLACE_CATEGORIES } from "./types";
import { getCandidates, isMockNearMeMode } from "./candidate-generator";
import { rowsToZonedPlaces, expandZones } from "./zone-classifier";
import { computeTotalScore, buildLikedCategorySet } from "./scorer";

const DEFAULT_LIMIT = 20;

export async function runNearMe(input: NearMeInput): Promise<NearMeResponse> {
  // ── Step 1: Fetch raw place rows (mock or Supabase) ──────────────────────

  const rows = await getCandidates(input);

  // ── Step 2: Convert to ZonedPlace (Haversine filter + zone assignment) ───

  const zonedPlaces = rowsToZonedPlaces(rows, input.coordinate);

  // ── Step 3: Dynamic Zone expansion ───────────────────────────────────────

  const { candidates, activeZone } = expandZones(zonedPlaces);

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
    mock:        isMockNearMeMode(),
  };
}

// Re-export for convenience
export { ALL_PLACE_CATEGORIES };

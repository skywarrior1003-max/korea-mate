// GoKoreaMate / gokoreamate.com — Near Me 7-Factor Scorer
// TASK-015: Near Me API Implementation
// F1 distance (100) + F4 category (20) + F5 preference (50) + F6 itinerary (25)
// F2 coordinate_quality: STUB (DB column absent — 0pts, v2 enhancement)
// F3 opening_hours: STUB (DB column absent — 0pts, v2 enhancement)
// F7 event bonus: STUB (events table not joined — 0pts, v2 enhancement)

import type { Coordinate, PlaceCategory } from "../scheduler/types";
import { haversineDistance } from "../scheduler/utils";

// F7 좌표 풀 크기 상한 — O(N×M) 비용 제어 (TASK-016)
const MAX_F7_EVENT_COORDS = 5;
import type { ZonedPlace } from "./types";
import type { NearMeInput } from "./types";

// ─── F1: Distance Score (0–100) ───────────────────────────────────────────────

export function distanceScore(distanceMeters: number): number {
  if (distanceMeters <=   500) return 100;
  if (distanceMeters <=  1000) return  80;
  if (distanceMeters <=  2000) return  60;
  if (distanceMeters <=  3000) return  40;
  if (distanceMeters <=  5000) return  20;
  return 10; // ≤ 7km
}

// ─── F4: Category Weight (0–20) ───────────────────────────────────────────────

const CATEGORY_WEIGHT: Record<PlaceCategory, number> = {
  food:      20,
  cafe:      15,
  attraction:20,
  kpop:      18,
  temple:    16,
  walking:   14,
  nightview: 16,
  shopping:  14,
  rainy_day: 12,
  event:      0, // events are scored via F7 (stub)
};

export function categoryWeight(category: PlaceCategory): number {
  return CATEGORY_WEIGHT[category] ?? 0;
}

// ─── F5: Preference Score (0 or 50) ───────────────────────────────────────────
// +50 if candidate category matches a preferred/picked place category

export function preferenceScore(
  candidate:      ZonedPlace,
  likedCategories: Set<PlaceCategory>
): number {
  return likedCategories.has(candidate.category) ? 50 : 0;
}

// ─── F6: Itinerary Proximity Score (0 or 25) ─────────────────────────────────
// +25 if candidate is within 500m of any existing itinerary item

const ITINERARY_PROXIMITY_RADIUS_M = 500;

export function itineraryProximityScore(
  candidate:       ZonedPlace,
  itineraryCoords: Coordinate[]
): number {
  const withinNeighborhood = itineraryCoords.some(
    (coord) =>
      haversineDistance(coord, candidate.coordinate) <= ITINERARY_PROXIMITY_RADIUS_M
  );
  return withinNeighborhood ? 25 : 0;
}

// ─── F2, F3: Stubs ───────────────────────────────────────────────────────────

const coordinateQualityScore = () => 0;  // F2: coordinate_quality absent in DB
const openingHoursScore      = () => 0;  // F3: opening_hours absent in DB

// ─── F7: Event Bonus (0 / +8 / +15) ─────────────────────────────────────────
// 이벤트 venue 좌표 풀의 상위 MAX_F7_EVENT_COORDS개 기준 최단 거리 계산.
// 행정 절차 없이 공간 데이터(Spatial Data) 규칙으로만 처리 — 영세 업체 행정 부담 제로.

function eventBonusScore(
  candidate:   ZonedPlace,
  eventCoords: Coordinate[],
): number {
  const pool = eventCoords.slice(0, MAX_F7_EVENT_COORDS);
  if (pool.length === 0) return 0;

  const minDist = Math.min(
    ...pool.map((c) => haversineDistance(candidate.coordinate, c)),
  );

  if (minDist <= 1_000) return 15;  // 1km 이내 — 이벤트 관련 수요 높음
  if (minDist <= 3_000) return 8;   // 3km 이내 — 간접 수요
  return 0;
}

// ─── Total Score ──────────────────────────────────────────────────────────────

export function computeTotalScore(
  candidate:       ZonedPlace,
  input:           NearMeInput,
  likedCategories: Set<PlaceCategory>,
): number {
  return (
    distanceScore(candidate.distance_m)                        // F1
    + coordinateQualityScore()                                  // F2 stub
    + openingHoursScore()                                       // F3 stub
    + categoryWeight(candidate.category)                        // F4
    + preferenceScore(candidate, likedCategories)               // F5
    + itineraryProximityScore(candidate, input.itinerary_coords ?? [])  // F6
    + eventBonusScore(candidate, input.event_coords ?? [])      // F7 (TASK-016)
  );
}

// ─── Build liked-category set from liked_place_ids ───────────────────────────
// We don't have a place→category DB lookup here, so we use a pre-built map
// (passed in from the caller who already has the candidates list).

export function buildLikedCategorySet(
  likedPlaceIds:  string[],
  allCandidates:  ZonedPlace[]
): Set<PlaceCategory> {
  const likedSet = new Set(likedPlaceIds);
  const categories = new Set<PlaceCategory>();
  for (const candidate of allCandidates) {
    if (likedSet.has(candidate.place_id)) {
      categories.add(candidate.category);
    }
  }
  return categories;
}

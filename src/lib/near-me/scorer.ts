// GoKoreaMate / gokoreamate.com — Near Me 7-Factor Scorer
// TASK-015: Near Me API Implementation
// F1 distance (100) + F4 category (20) + F5 preference (30) + F6 itinerary (25)
// F2 coordinate_quality: STUB (DB column absent — 0pts, v2 enhancement)
// F3 opening_hours: STUB (DB column absent — 0pts, v2 enhancement)
// F7 event bonus: STUB (events table not joined — 0pts, v2 enhancement)

import type { Coordinate, PlaceCategory } from "../scheduler/types";
import { haversineDistance } from "../scheduler/utils";
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

// ─── F5: Preference Score (0 or 30) ───────────────────────────────────────────
// +30 if the candidate's category matches any liked place's category

export function preferenceScore(
  candidate:      ZonedPlace,
  likedCategories: Set<PlaceCategory>
): number {
  return likedCategories.has(candidate.category) ? 30 : 0;
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

// ─── F2, F3, F7: Stubs ───────────────────────────────────────────────────────

const coordinateQualityScore = () => 0;  // F2: coordinate_quality absent in DB
const openingHoursScore      = () => 0;  // F3: opening_hours absent in DB
const eventBonusScore        = () => 0;  // F7: events table not joined yet

// ─── Total Score ──────────────────────────────────────────────────────────────

export function computeTotalScore(
  candidate:        ZonedPlace,
  input:            NearMeInput,
  likedCategories:  Set<PlaceCategory>
): number {
  return (
    distanceScore(candidate.distance_m)             // F1
    + coordinateQualityScore()                       // F2 stub
    + openingHoursScore()                            // F3 stub
    + categoryWeight(candidate.category)             // F4
    + preferenceScore(candidate, likedCategories)    // F5
    + itineraryProximityScore(
        candidate,
        input.itinerary_coords ?? []
      )                                              // F6
    + eventBonusScore()                              // F7 stub
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

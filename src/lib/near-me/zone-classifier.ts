// GoKoreaMate / gokoreamate.com — Zone Classifier
// TASK-015: Near Me API Implementation
// Bounding box pre-filter → Haversine fine-filter → Zone assignment → dynamic expansion.

import type { Coordinate, ZoneId } from "../scheduler/types";
import { haversineDistance } from "../scheduler/utils";
import type { NearMePlaceRow, ZonedPlace } from "./types";
import { CATEGORY_MAP } from "./types";

// ─── Zone Radius Thresholds (meters) ─────────────────────────────────────────

const ZONE_RADII: Record<ZoneId, number> = {
  1:  1_000,  // CLOSE — walkable
  2:  3_000,  // REACHABLE — 1-2 transit stops
  3:  7_000,  // SPECIAL — notable destination or event
};

// Zone expansion thresholds (per TASK-011 design)
const EXPAND_TO_ZONE2_THRESHOLD = 5;   // < 5 Zone-1 results → expand to Zone 2
const EXPAND_TO_ZONE3_THRESHOLD = 10;  // < 10 Zone-1+2 results → expand to Zone 3

// ─── Bounding Box Delta ───────────────────────────────────────────────────────
// Approximates degree deltas for a given radius (used for Supabase pre-filter).

export interface BoundingBoxDelta {
  deltaLat: number;
  deltaLng: number;
}

export function boundingBoxDelta(
  radiusKm: number,
  userLat:  number
): BoundingBoxDelta {
  const deltaLat = radiusKm / 111.0;
  const deltaLng = radiusKm / (111.0 * Math.cos((userLat * Math.PI) / 180));
  return { deltaLat, deltaLng };
}

// ─── Assign Zone ID by Distance ───────────────────────────────────────────────

export function assignZoneId(distanceMeters: number): ZoneId | null {
  if (distanceMeters <= ZONE_RADII[1]) return 1;
  if (distanceMeters <= ZONE_RADII[2]) return 2;
  if (distanceMeters <= ZONE_RADII[3]) return 3;
  return null; // beyond Zone 3 — excluded
}

// ─── Convert DB rows to ZonedPlaces ──────────────────────────────────────────

export function rowsToZonedPlaces(
  rows:      NearMePlaceRow[],
  userCoord: Coordinate
): ZonedPlace[] {
  const result: ZonedPlace[] = [];

  for (const row of rows) {
    if (row.lat === null || row.lng === null) continue;

    const category = CATEGORY_MAP[row.category];
    if (!category) continue; // unmapped category — skip

    const placeCoord: Coordinate = { lat: row.lat, lng: row.lng };
    const distanceM  = haversineDistance(userCoord, placeCoord);
    const zoneId     = assignZoneId(distanceM);

    if (zoneId === null) continue; // beyond Zone 3

    result.push({
      place_id:   row.place_id,
      category,
      coordinate: placeCoord,
      zone_id:    zoneId,
      distance_m: distanceM,
    });
  }

  return result;
}

// ─── Dynamic Zone Expansion ───────────────────────────────────────────────────

export interface ZoneExpansionResult {
  candidates:  ZonedPlace[];
  activeZone:  ZoneId;
}

export function expandZones(allZonedPlaces: ZonedPlace[]): ZoneExpansionResult {
  const zone1 = allZonedPlaces.filter((p) => p.zone_id === 1);

  if (zone1.length >= EXPAND_TO_ZONE2_THRESHOLD) {
    return { candidates: zone1, activeZone: 1 };
  }

  const zone12 = allZonedPlaces.filter((p) => p.zone_id <= 2);

  if (zone12.length >= EXPAND_TO_ZONE3_THRESHOLD) {
    return { candidates: zone12, activeZone: 2 };
  }

  // All zones — include Zone 3
  return { candidates: allZonedPlaces, activeZone: 3 };
}

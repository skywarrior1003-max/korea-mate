// GoKoreaMate / gokoreamate.com — Zone Classifier
// TASK-015: Near Me API Implementation
// Bounding box pre-filter → Haversine fine-filter → Zone assignment → dynamic expansion.

import type { Coordinate, ZoneId } from "../scheduler/types.ts";
import { haversineDistance } from "../scheduler/utils.ts";
import type { NearMePlaceRow, ZonedPlace } from "./types.ts";
import { CATEGORY_MAP } from "./types.ts";

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

export interface ZoneExpansionOptions {
  /**
   * 이만큼 **고를 수 있는** 후보가 모이면 더 넓히지 않는다.
   * 넘기지 않으면 기존 기준(5 / 10)을 그대로 쓴다 — Near Me 화면의 동작은 그대로다.
   */
  targetSupply?: number;
  /**
   * 이 후보를 오늘 실제로 고를 수 있는가. 기본은 전부 true.
   *
   * 왜 개수만 세면 안 되나 — 어제 간 곳도 zone 안에는 그대로 있다. 그것까지
   * 세면 "가까운 데 여덟 곳 있으니 충분" 이라고 판단하고 멈추는데, 그중 여섯이
   * 이미 다녀온 곳이면 오늘 고를 수 있는 것은 둘뿐이다.
   *
   * 판정에만 쓴다. 반환 목록은 거르지 않는다 — 점수 계산에 들어가는 후보 집합을
   * 여기서 바꾸면 F5(선호 카테고리) 가 흔들린다. 제외는 원래 하던 자리에서 한다.
   */
  isUsable?: (place: ZonedPlace) => boolean;
}

/**
 * 가까운 zone 부터 단계적으로 넓힌다.
 *
 * 넓힌다는 것은 먼 곳을 **고른다** 는 뜻이 아니다. 스케줄러가 평가할 기회를 준다는
 * 뜻이고, 실제 선택은 기존 거리 점수·동선 페널티·사용자 선택이 결정한다.
 */
export function expandZones(
  allZonedPlaces: ZonedPlace[],
  options?: ZoneExpansionOptions,
): ZoneExpansionResult {
  const isUsable  = options?.isUsable ?? (() => true);
  const countUsable = (places: ZonedPlace[]): number => {
    let n = 0;
    for (const p of places) if (isUsable(p)) n++;
    return n;
  };

  // targetSupply 를 주지 않으면 기존 두 기준을 그대로 쓴다.
  const zone1Need  = options?.targetSupply ?? EXPAND_TO_ZONE2_THRESHOLD;
  const zone12Need = options?.targetSupply ?? EXPAND_TO_ZONE3_THRESHOLD;

  const zone1 = allZonedPlaces.filter((p) => p.zone_id === 1);

  if (countUsable(zone1) >= zone1Need) {
    return { candidates: zone1, activeZone: 1 };
  }

  const zone12 = allZonedPlaces.filter((p) => p.zone_id <= 2);

  if (countUsable(zone12) >= zone12Need) {
    return { candidates: zone12, activeZone: 2 };
  }

  // All zones — include Zone 3
  return { candidates: allZonedPlaces, activeZone: 3 };
}

// GoKoreaMate / gokoreamate.com — Near Me Candidate Generator
// TASK-015: Near Me API Implementation
// Mock mode: returns hardcoded mock-places.ts data (no DB).
// Live mode: queries Supabase places with bounding box pre-filter.
// Supabase anon client only — service role key forbidden.

import { supabase } from "../supabase";
import type { Coordinate, PlaceCategory } from "../scheduler/types";
import type { NearMePlaceRow, NearMeInput } from "./types";
import { SUPPORTED_DB_CATEGORIES, ALL_PLACE_CATEGORIES, CATEGORY_MAP } from "./types";
import { boundingBoxDelta } from "./zone-classifier";
import { MOCK_NEAR_ME_PLACES } from "./mock/mock-places";

// ─── Mock / Live Mode ─────────────────────────────────────────────────────────

export function isMockNearMeMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK_NEAR_ME === "true" ||
    process.env.NEXT_PUBLIC_USE_MOCK_NEAR_ME === "1"
  );
}

// ─── DB Category Filter Helper ────────────────────────────────────────────────

function toDbCategories(nearMeCategories: PlaceCategory[]): string[] {
  // Invert CATEGORY_MAP: PlaceCategory → all matching DB category strings
  const dbCats: string[] = [];
  for (const [dbCat, nmCat] of Object.entries(CATEGORY_MAP)) {
    if (nearMeCategories.includes(nmCat as PlaceCategory)) {
      dbCats.push(dbCat);
    }
  }
  return dbCats.length > 0 ? dbCats : SUPPORTED_DB_CATEGORIES;
}

// ─── Supabase Bounding Box Query ──────────────────────────────────────────────
// Zone 3 radius (7km) used for the outer bounding box.
// Haversine fine-filter happens downstream in rowsToZonedPlaces().

const MAX_RADIUS_KM = 7;

export async function queryPlacesByBoundingBox(
  userCoord:  Coordinate,
  categories: PlaceCategory[]
): Promise<NearMePlaceRow[]> {
  const { deltaLat, deltaLng } = boundingBoxDelta(MAX_RADIUS_KM, userCoord.lat);
  const dbCategories           = toDbCategories(categories);

  try {
    const { data, error } = await supabase
      .from("places")
      .select("place_id, category, lat, lng, district, tags")
      .eq("is_active", true)
      .eq("admin_status", "approved")
      .in("category", dbCategories)
      .gte("lat", userCoord.lat - deltaLat)
      .lte("lat", userCoord.lat + deltaLat)
      .gte("lng", userCoord.lng - deltaLng)
      .lte("lng", userCoord.lng + deltaLng);

    if (error) {
      console.error("[near-me] Supabase query error:", error.message);
      return [];
    }

    return (data ?? []) as unknown as NearMePlaceRow[];
  } catch (err) {
    console.error("[near-me] Supabase fetch failed:", (err as Error).message);
    return [];
  }
}

// ─── Main: Get Candidates (mock or live) ─────────────────────────────────────

export async function getCandidates(input: NearMeInput): Promise<NearMePlaceRow[]> {
  const resolvedCategories = input.categories ?? ALL_PLACE_CATEGORIES;

  if (isMockNearMeMode()) {
    // Filter mock places by requested categories
    const catSet = new Set<string>(resolvedCategories);
    return MOCK_NEAR_ME_PLACES.filter((p) => {
      const mapped = CATEGORY_MAP[p.category];
      return mapped !== undefined && catSet.has(mapped);
    });
  }

  return queryPlacesByBoundingBox(input.coordinate, resolvedCategories);
}

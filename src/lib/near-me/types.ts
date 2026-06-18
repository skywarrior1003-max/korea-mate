// GoKoreaMate / gokoreamate.com — Near Me 2.0 Types
// TASK-015: Near Me API Implementation
// Imports shared primitives from scheduler/types (no circular dep yet — see TASK-015 docs).
// Future refactor: extract Coordinate/ZoneId/PlaceCategory to shared lib when
// scheduler/types imports from near-me (adapter migration task).

export type {
  Coordinate,
  ZoneId,
  PlaceCategory,
} from "../scheduler/types";

// ─── Near Me Input ────────────────────────────────────────────────────────────

import type { Coordinate, ZoneId, PlaceCategory } from "../scheduler/types";

export interface NearMeInput {
  coordinate:        Coordinate;         // GPS current location
  timestamp:         string;             // "HH:MM" for time-slot scoring (F3 — stub in v1)
  categories?:       PlaceCategory[];    // filter; undefined = all supported categories
  liked_place_ids?:  string[];           // F5 preference signal (Like history)
  itinerary_coords?: Coordinate[];       // F6 itinerary proximity (Add to Itinerary coords)
  limit?:            number;             // max results returned (default: 20)
}

// ─── Raw DB Row (from Supabase places table) ──────────────────────────────────

export interface NearMePlaceRow {
  place_id: string;
  category: string;      // raw DB string — mapped to PlaceCategory in adaptToZonedPlaces
  lat:      number | null;
  lng:      number | null;
  district: string | null;
  tags:     string[] | null;
}

// ─── Intermediate: Place with Zone and Distance computed ──────────────────────

export interface ZonedPlace {
  place_id:   string;
  category:   PlaceCategory;
  coordinate: Coordinate;
  zone_id:    ZoneId;
  distance_m: number;
}

// ─── Near Me Result (matches NearMeCandidate shape in scheduler/types.ts) ─────

export interface NearMeResult {
  place_id:   string;
  category:   PlaceCategory;
  coordinate: Coordinate;
  zone_id:    ZoneId;
  score:      number;    // total score (F1 + F4 + F5 + F6; F2/F3/F7 stub in v1)
  distance_m: number;
}

// ─── Near Me API Response ─────────────────────────────────────────────────────

export interface NearMeResponse {
  results:     NearMeResult[];
  active_zone: ZoneId;    // the Zone that was actually used after dynamic expansion
  total_count: number;
  mock:        boolean;
}

// ─── DB Category → PlaceCategory Mapping ─────────────────────────────────────
// event is excluded (served from events table, not places — v2)

export const CATEGORY_MAP: Record<string, PlaceCategory | undefined> = {
  restaurant: "food",
  food:       "food",
  cafe:       "cafe",
  attraction: "attraction",
  temple:     "temple",
  kpop:       "kpop",
  shopping:   "shopping",
  nightview:  "nightview",
  walking:    "walking",
  rainy_day:  "rainy_day",
};

// Supported DB category strings for bounding box queries
export const SUPPORTED_DB_CATEGORIES: string[] = Object.keys(CATEGORY_MAP);

// All supported PlaceCategories (excludes "event" — events table, not places)
export const ALL_PLACE_CATEGORIES: PlaceCategory[] = [
  "food", "cafe", "attraction", "temple", "kpop",
  "shopping", "nightview", "walking", "rainy_day",
];

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
  event_coords?:     Coordinate[];       // F7 event bonus — geo event venue 좌표 (TASK-016)
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

// ─── city_spots category → PlaceCategory Mapping ─────────────────────────────
// SSOT: city_spots 테이블의 5개 정규화 카테고리만 사용 (places 테이블 폐기)
// accommodation은 스케줄 방문지가 아니므로 제외

export const CATEGORY_MAP: Record<string, PlaceCategory | undefined> = {
  attraction: "attraction",
  restaurant: "food",
  nature:     "walking",   // 자연/등산 → walking PlaceCategory
  event:      "event",
  // accommodation 제외 — 방문 일정 대상 아님
};

// city_spots에서 실제 쿼리할 카테고리 목록
export const SUPPORTED_DB_CATEGORIES: string[] = Object.keys(CATEGORY_MAP);

// 스케줄러가 다루는 전체 PlaceCategory 목록
export const ALL_PLACE_CATEGORIES: PlaceCategory[] = [
  "food", "attraction", "walking", "event",
];

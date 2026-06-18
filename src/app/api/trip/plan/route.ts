// GoKoreaMate / gokoreamate.com — POST /api/trip/plan
// TASK-017: Trip Plan Combo API (Facade Pattern)
// Single HTTP round-trip: Near Me + Scheduler + (optional) AI Personalization
//
// 200: { data: TripPlanResponse }  — kind: "scheduled" | "personalized" | "fallback"
// 400: { error: string }           — 입력 유효성 위반
// 409: { error, conflict }         — 스케줄러 하드 제약 위반

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runTripPlan } from "@/lib/trip-plan/index";
import type { TripPlanInput, TripPlanResponse } from "@/lib/trip-plan/index";
import { findRouteById } from "@/lib/story-routes";
import { queryAffiliateLinks, buildAffiliateMap } from "@/lib/affiliates";
import type { AffiliateDisplayMap } from "@/lib/affiliates";

// ─── Place Display Types ──────────────────────────────────────────────────────

interface PlaceDisplay {
  name:            string;
  category:        string;
  district:        string;
  tips:            string;
  google_maps_url: string;
}

type PlaceDisplayMap = Record<string, PlaceDisplay>;

// ─── Place Map Helpers ────────────────────────────────────────────────────────

function extractPlaceIds(response: TripPlanResponse): string[] {
  if (response.kind === "conflict") return [];
  return response.plan.items
    .map(item => item.place_id ?? item.event_id)
    .filter((id): id is string => Boolean(id));
}

function mockPlaceDisplay(placeId: string): PlaceDisplay {
  const raw    = placeId.replace("mock-", "");
  const parts  = raw.split("-");
  const cat    = parts[0] ?? "attraction";
  const zone   = (parts[1] ?? "z1").toUpperCase();
  const catCap = cat.charAt(0).toUpperCase() + cat.slice(1);
  return {
    name:            `${catCap} Spot (${zone})`,
    category:        cat,
    district:        "Haeundae",
    tips:            "A recommended local spot.",
    google_maps_url: "https://www.google.com/maps/search/?api=1&query=Haeundae+Busan+Korea",
  };
}

type PlaceRow = {
  place_id:       string;
  name:           string;
  name_en:        string | null;
  category:       string | null;
  subcategory:    string | null;
  description_en: string | null;
  description:    string | null;
  district:       string | null;
  lat:            number | null;
  lng:            number | null;
};

async function buildPlaceMap(placeIds: string[]): Promise<PlaceDisplayMap> {
  if (placeIds.length === 0) return {};

  const mockIds = placeIds.filter(id => id.startsWith("mock-"));
  const realIds = placeIds.filter(id => !id.startsWith("mock-"));
  const map: PlaceDisplayMap = {};

  for (const id of mockIds) {
    map[id] = mockPlaceDisplay(id);
  }

  if (realIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("places")
        .select("place_id, name, name_en, category, subcategory, description_en, description, district, lat, lng")
        .in("place_id", realIds);

      if (!error && Array.isArray(data)) {
        for (const row of data as PlaceRow[]) {
          const googleMapsUrl =
            (row.lat && row.lng)
              ? `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.name_en ?? row.name} Korea`)}`;
          map[row.place_id] = {
            name:            row.name_en || row.name || "Unknown Place",
            category:        row.subcategory || row.category || "attraction",
            district:        row.district   || "Seoul",
            tips:            row.description_en || row.description || "",
            google_maps_url: googleMapsUrl,
          };
        }
      }
    } catch {
      // Supabase failure — real IDs absent from map → client falls back to synthetic display
    }
  }

  return map;
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

const VALID_PACES     = ["relaxed", "normal", "packed"] as const;
const HHMM_PATTERN    = /^\d{2}:\d{2}$/;
const DATE_PATTERN    = /^\d{4}-\d{2}-\d{2}$/;

type ValidPace = typeof VALID_PACES[number];

function isHHMM(s: unknown): s is string {
  return typeof s === "string" && HHMM_PATTERN.test(s);
}

function isDateStr(s: unknown): s is string {
  return typeof s === "string" && DATE_PATTERN.test(s);
}

function isValidPace(s: unknown): s is ValidPace {
  return typeof s === "string" && (VALID_PACES as readonly string[]).includes(s);
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ─── Input Validation ─────────────────────────────────────────────────────────

function validateInput(
  body: unknown,
): { valid: true; input: TripPlanInput; route_id?: string; city?: string; locale?: string } | { valid: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  // ── coordinate (필수) ───────────────────────────────────────────────────
  if (typeof b.coordinate !== "object" || b.coordinate === null) {
    return { valid: false, error: "coordinate is required" };
  }
  const c = b.coordinate as Record<string, unknown>;
  if (typeof c.lat !== "number" || typeof c.lng !== "number") {
    return { valid: false, error: "coordinate.lat and coordinate.lng must be numbers" };
  }
  if (c.lat < -90 || c.lat > 90) {
    return { valid: false, error: "coordinate.lat must be between -90 and 90" };
  }
  if (c.lng < -180 || c.lng > 180) {
    return { valid: false, error: "coordinate.lng must be between -180 and 180" };
  }

  // ── timestamp (필수) ────────────────────────────────────────────────────
  if (!isHHMM(b.timestamp)) {
    return { valid: false, error: "timestamp is required and must be HH:MM format" };
  }

  // ── trip_date (필수) ────────────────────────────────────────────────────
  if (!isDateStr(b.trip_date)) {
    return { valid: false, error: "trip_date is required and must be YYYY-MM-DD format" };
  }

  // ── start_time / end_time (필수 + 범위 검증) ────────────────────────────
  if (!isHHMM(b.start_time)) {
    return { valid: false, error: "start_time is required and must be HH:MM format" };
  }
  if (!isHHMM(b.end_time)) {
    return { valid: false, error: "end_time is required and must be HH:MM format" };
  }
  if (timeToMinutes(b.end_time) <= timeToMinutes(b.start_time)) {
    return { valid: false, error: "end_time must be after start_time" };
  }

  // ── pace (필수 + 열거형 검증) ────────────────────────────────────────────
  if (!isValidPace(b.pace)) {
    return {
      valid: false,
      error: `pace must be one of: ${VALID_PACES.join(", ")}`,
    };
  }

  const input: TripPlanInput = {
    coordinate: { lat: c.lat as number, lng: c.lng as number },
    timestamp:  b.timestamp,
    trip_date:  b.trip_date,
    start_time: b.start_time,
    end_time:   b.end_time,
    pace:       b.pace,

    // 선택 필드 — 타입 불일치 시 undefined로 방어
    categories:       Array.isArray(b.categories)        ? (b.categories as TripPlanInput["categories"])       : undefined,
    liked_place_ids:  Array.isArray(b.liked_place_ids)   ? (b.liked_place_ids as string[])                     : undefined,
    itinerary_coords: Array.isArray(b.itinerary_coords)  ? (b.itinerary_coords as TripPlanInput["itinerary_coords"]) : undefined,
    event_coords:     Array.isArray(b.event_coords)      ? (b.event_coords as TripPlanInput["event_coords"])   : undefined,
    near_me_limit:    typeof b.near_me_limit === "number" ? b.near_me_limit                                    : undefined,
    anchors:          Array.isArray(b.anchors)            ? (b.anchors as TripPlanInput["anchors"])             : undefined,
    fixed_events:     Array.isArray(b.fixed_events)       ? (b.fixed_events as TripPlanInput["fixed_events"])  : undefined,
    preferred_items:  Array.isArray(b.preferred_items)    ? (b.preferred_items as TripPlanInput["preferred_items"]) : undefined,
    route_template_stays: Array.isArray(b.route_template_stays)
      ? (b.route_template_stays as TripPlanInput["route_template_stays"])
      : undefined,
    affiliate_context: typeof b.affiliate_context === "object" && b.affiliate_context !== null
      ? (b.affiliate_context as TripPlanInput["affiliate_context"])
      : undefined,
    with_ai: typeof b.with_ai === "boolean" ? b.with_ai : false,
  };

  const route_id = typeof b.route_id === "string" ? b.route_id : undefined;
  const city     = typeof b.city   === "string" ? b.city.toLowerCase().trim()   : undefined;
  const locale   = typeof b.locale === "string" ? b.locale.split("-")[0].toLowerCase() : "en";

  return { valid: true, input, route_id, city, locale };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateInput(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // route_id → route_template_stays 해석 (직접 배열 제공보다 route_id 우선)
  if (validation.route_id && !validation.input.route_template_stays) {
    const route = findRouteById(validation.route_id);
    if (route) {
      validation.input.route_template_stays = route.stays;
    }
  }

  // TASK-021: affiliate_links 자동 조회 → affiliate_context 주입
  // city / locale 미제공 시: 전국 공통 + "en" 폴백 적용
  const locale         = validation.locale ?? "en";
  const affiliateRows  = await queryAffiliateLinks(validation.city);
  if (affiliateRows.length > 0 && !validation.input.affiliate_context) {
    validation.input.affiliate_context = {
      affiliate_link_ids: affiliateRows.map(r => r.affiliate_link_id),
      max_cards:          2,
    };
  }

  const response = await runTripPlan(validation.input);

  if (response.kind === "conflict") {
    return NextResponse.json(
      { error: "Scheduler hard constraint violation", conflict: response.error },
      { status: 409 },
    );
  }

  const placeIds:    string[]            = extractPlaceIds(response);
  const place_map:   Record<string, unknown> = await buildPlaceMap(placeIds);
  const affiliate_map: AffiliateDisplayMap   = buildAffiliateMap(affiliateRows, locale);

  return NextResponse.json({ data: response, place_map, affiliate_map }, { status: 200 });
}

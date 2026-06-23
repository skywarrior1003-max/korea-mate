// Cloudflare Pages Function: POST /api/trip/plan
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true next build → Next.js API Routes are excluded from the
// build output (out/ dir). This Cloudflare Pages Function restores POST /api/trip/plan so the
// AI Trip scheduler works in production without changing the frontend fetch path.
//
// SAFETY CONTRACT:
// - with_ai is ALWAYS forced to false: personalizer and gemini-client are NEVER imported.
// - All imports avoid the scheduler/ai/ dependency chain entirely.
// - Requires nodejs_compat in wrangler.toml for process.env (NEXT_PUBLIC_SUPABASE_* vars).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";
import { runNearMe } from "../../../src/lib/near-me/near-me-engine";
import { adaptToSchedulerCandidates } from "../../../src/lib/trip-plan/near-me-adapter";
import { runScheduler } from "../../../src/lib/scheduler/engine";
import { haversineDistance } from "../../../src/lib/scheduler/utils";
import { assignZoneId } from "../../../src/lib/near-me/zone-classifier";
import { findRouteById } from "../../../src/lib/story-routes/index";
import { queryAffiliateLinks, buildAffiliateMap } from "../../../src/lib/affiliates/index";

// ── Inline types (avoids importing trip-plan/types which pulls in AI personalization types) ──

interface Coord { lat: number; lng: number; }
type ZoneId = 1 | 2 | 3;
type ValidPace = "relaxed" | "normal" | "packed";

interface CartHint {
  place_id:             string;
  lat:                  number;
  lng:                  number;
  duration_min:         number;
  preferred_time_slot?: "morning" | "afternoon" | "evening";
  name?:                string;
  affiliate_url?:       string | null;
  affiliate_provider?:  string | null;
  booking_url?:         string | null;
}

interface CartHintEntry {
  name?:               string;
  affiliate_url?:      string | null;
  affiliate_provider?: string | null;
  booking_url?:        string | null;
}

interface PlaceDisplay {
  name:            string;
  category:        string;
  district:        string;
  tips:            string;
  google_maps_url: string;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const VALID_PACES   = ["relaxed", "normal", "packed"] as const;
const HHMM_RE       = /^\d{2}:\d{2}$/;
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 12;

const isHHMM   = (s: unknown): s is string => typeof s === "string" && HHMM_RE.test(s);
const isDateStr = (s: unknown): s is string => typeof s === "string" && DATE_RE.test(s);
const isPace   = (s: unknown): s is ValidPace =>
  typeof s === "string" && (VALID_PACES as readonly string[]).includes(s);
const toMin     = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// ── Place display map (mirrors buildPlaceMap in Next.js route) ────────────────

function mockDisplay(placeId: string): PlaceDisplay {
  const raw   = placeId.replace("mock-", "");
  const parts = raw.split("-");
  const cat   = parts[0] ?? "attraction";
  const zone  = (parts[1] ?? "z1").toUpperCase();
  return {
    name:            `${cat.charAt(0).toUpperCase() + cat.slice(1)} Spot (${zone})`,
    category:        cat,
    district:        "Haeundae",
    tips:            "A recommended local spot.",
    google_maps_url: "https://www.google.com/maps/search/?api=1&query=Haeundae+Busan+Korea",
  };
}

async function buildPlaceMap(
  placeIds: string[],
  env: Record<string, string | undefined>,
): Promise<Record<string, PlaceDisplay>> {
  if (placeIds.length === 0) return {};

  const map: Record<string, PlaceDisplay> = {};
  const mockIds = placeIds.filter(id => id.startsWith("mock-"));
  const realIds = placeIds.filter(id => !id.startsWith("mock-"));

  for (const id of mockIds) map[id] = mockDisplay(id);

  if (realIds.length > 0) {
    try {
      const url  = env.NEXT_PUBLIC_SUPABASE_URL  ?? (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL  : undefined) ?? "";
      const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) ?? "";
      if (url && anon) {
        const client = createClient(url, anon);
        const numericIds = realIds.map(Number).filter(n => !isNaN(n));
        const { data, error } = await client
          .from("city_spots")
          .select("id, name, subcategory, category, description, district, lat, lng")
          .in("id", numericIds);

        if (!error && Array.isArray(data)) {
          for (const row of data as any[]) {
            const gmUrl = (row.lat && row.lng)
              ? `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.name} Korea`)}`;
            map[String(row.id)] = {
              name:            row.name,
              category:        row.subcategory || row.category || "attraction",
              district:        row.district || "Seoul",
              tips:            row.description || "",
              google_maps_url: gmUrl,
            };
          }
        }
      }
    } catch {
      // Supabase 실패 → 클라이언트가 syntheticPlaceDisplay로 폴백
    }
  }
  return map;
}

// ── Cloudflare Pages Function handler ─────────────────────────────────────────

interface PagesFunctionCtx {
  request: Request;
  env: Record<string, string | undefined>;
}

export async function onRequestPost(ctx: PagesFunctionCtx): Promise<Response> {
  const jsonResp = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await ctx.request.json() as Record<string, unknown>;
  } catch {
    return jsonResp({ error: "Invalid JSON body" }, 400);
  }

  // 2. Validate required fields
  const coord = body.coordinate as Record<string, unknown> | null | undefined;
  if (!coord || typeof coord !== "object") return jsonResp({ error: "coordinate is required" }, 400);
  if (typeof coord.lat !== "number" || typeof coord.lng !== "number")
    return jsonResp({ error: "coordinate.lat and coordinate.lng must be numbers" }, 400);
  if ((coord.lat as number) < -90 || (coord.lat as number) > 90)
    return jsonResp({ error: "coordinate.lat must be between -90 and 90" }, 400);
  if ((coord.lng as number) < -180 || (coord.lng as number) > 180)
    return jsonResp({ error: "coordinate.lng must be between -180 and 180" }, 400);
  if (!isHHMM(body.timestamp))  return jsonResp({ error: "timestamp must be HH:MM" }, 400);
  if (!isDateStr(body.trip_date)) return jsonResp({ error: "trip_date must be YYYY-MM-DD" }, 400);
  if (!isHHMM(body.start_time))  return jsonResp({ error: "start_time must be HH:MM" }, 400);
  if (!isHHMM(body.end_time))    return jsonResp({ error: "end_time must be HH:MM" }, 400);
  if (toMin(body.end_time as string) <= toMin(body.start_time as string))
    return jsonResp({ error: "end_time must be after start_time" }, 400);
  if (!isPace(body.pace)) return jsonResp({ error: "pace must be one of: relaxed, normal, packed" }, 400);

  // 3. Extract typed fields
  const coordinate: Coord = { lat: coord.lat as number, lng: coord.lng as number };
  const timestamp   = body.timestamp   as string;
  const trip_date   = body.trip_date   as string;
  const start_time  = body.start_time  as string;
  const end_time    = body.end_time    as string;
  const pace        = body.pace        as ValidPace;
  const city        = typeof body.city   === "string" ? body.city.toLowerCase().trim() : undefined;
  const locale      = typeof body.locale === "string" ? body.locale.split("-")[0].toLowerCase() : "en";

  const categories       = Array.isArray(body.categories)       ? body.categories       as any : undefined;
  const liked_place_ids  = Array.isArray(body.liked_place_ids)  ? body.liked_place_ids  as string[] : undefined;
  const itinerary_coords = Array.isArray(body.itinerary_coords) ? body.itinerary_coords as Coord[] : undefined;
  const event_coords     = Array.isArray(body.event_coords)     ? body.event_coords     as Coord[] : undefined;
  const near_me_limit    = typeof body.near_me_limit === "number" ? body.near_me_limit  : DEFAULT_LIMIT;
  const cart_hints: CartHint[] = Array.isArray(body.cart_coord_hints)
    ? body.cart_coord_hints as CartHint[]
    : [];
  const route_id = typeof body.route_id === "string" ? body.route_id : undefined;

  // 4. Route template stays
  let route_template_stays: any = Array.isArray(body.route_template_stays)
    ? body.route_template_stays
    : undefined;
  if (route_id && !route_template_stays) {
    const route = findRouteById(route_id);
    if (route) route_template_stays = route.stays;
  }

  // 5. Affiliate context
  let affiliate_context: any = (typeof body.affiliate_context === "object" && body.affiliate_context !== null)
    ? body.affiliate_context
    : undefined;
  const affiliateRows = await queryAffiliateLinks(city);
  if (affiliateRows.length > 0 && !affiliate_context) {
    affiliate_context = {
      affiliate_link_ids: affiliateRows.map((r: any) => r.affiliate_link_id),
      max_cards: 2,
    };
  }

  // 6. Near Me
  const nearMeResp = await runNearMe({
    coordinate,
    timestamp,
    categories,
    liked_place_ids,
    itinerary_coords,
    event_coords,
    limit: near_me_limit,
  });
  const nearMeCount = nearMeResp.results.length;

  // 7. Adapt Near Me results to scheduler candidates
  const baseCandidates = adaptToSchedulerCandidates(nearMeResp.results);

  // 8. Cart candidates (score=999, always placed first)
  const cartCandidates = cart_hints.map(hint => {
    const hintCoord: Coord = { lat: hint.lat, lng: hint.lng };
    const distM = haversineDistance(coordinate, hintCoord);
    const zoneId: ZoneId = (assignZoneId(distM) as ZoneId | null) ?? 3;
    return {
      place_id:              hint.place_id,
      category:              "event" as const,
      coordinate:            hintCoord,
      zone_id:               zoneId,
      score:                 999,
      stay_minutes_override: hint.duration_min > 0 ? hint.duration_min : undefined,
    };
  });

  const cartPreferred = cart_hints
    .filter(h => h.preferred_time_slot != null)
    .map(h => ({ place_id: h.place_id, preferred_time_slot: h.preferred_time_slot! }));

  const allCandidates = [...cartCandidates, ...baseCandidates];
  const allPreferred  = cartPreferred.length > 0 ? cartPreferred : undefined;

  // 9. Run scheduler — with_ai ALWAYS false, no Gemini calls
  const schedulerResult = runScheduler({
    trip_date,
    start_time,
    end_time,
    base_coordinate: coordinate,
    pace,
    anchors:              Array.isArray(body.anchors)       ? body.anchors as any       : undefined,
    fixed_events:         Array.isArray(body.fixed_events)  ? body.fixed_events as any  : undefined,
    preferred_items:      allPreferred,
    route_template_stays: route_template_stays,
    affiliate_context,
    candidates:           allCandidates,
  });

  if (!schedulerResult.success) {
    return jsonResp(
      { error: "Scheduler hard constraint violation", conflict: schedulerResult.error },
      409,
    );
  }

  // 10. Build place map (Supabase city_spots lookup)
  const placeIds = (schedulerResult.data.items as any[])
    .map((item: any) => item.place_id ?? item.event_id)
    .filter((id: any): id is string => Boolean(id));

  const place_map    = await buildPlaceMap(placeIds, ctx.env);
  const affiliate_map = buildAffiliateMap(affiliateRows, locale);

  const cart_hint_map: Record<string, CartHintEntry> = {};
  for (const hint of cart_hints) {
    cart_hint_map[hint.place_id] = {
      name:               hint.name,
      affiliate_url:      hint.affiliate_url,
      affiliate_provider: hint.affiliate_provider,
      booking_url:        hint.booking_url,
    };
  }

  return jsonResp({
    data: {
      kind:           "scheduled",
      plan:           schedulerResult.data,
      near_me_count:  nearMeCount,
    },
    place_map,
    affiliate_map,
    cart_hint_map,
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

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
// - runNearMe is NOT imported: it depends on the supabase.ts singleton which reads process.env
//   at module init time. In Cloudflare Workers, process.env is empty at init → placeholder URL.
//   Instead, runNearMeDirect() creates a fresh client from ctx.env at request time.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";
import { adaptToSchedulerCandidates } from "../../../src/lib/trip-plan/near-me-adapter";
import { runScheduler } from "../../../src/lib/scheduler/engine";
import { haversineDistance } from "../../../src/lib/scheduler/utils";
import { boundingBoxDelta, assignZoneId } from "../../../src/lib/near-me/zone-classifier";
import { buildNearMeCandidates } from "../../../src/lib/near-me/candidate-supply";
import { isSchedulableCoordinate } from "../../../src/lib/geo";
import type { TripPaceChoice } from "../../../src/lib/trip-pace/pace-core";
import { mergePreferenceIds } from "../../../src/lib/planner/saved-signals";
import { CATEGORY_MAP, ALL_PLACE_CATEGORIES, SUPPORTED_DB_CATEGORIES } from "../../../src/lib/near-me/types";
import { findRouteById } from "../../../src/lib/story-routes/index";
import { queryAffiliateLinks, buildAffiliateMap } from "../../../src/lib/affiliates/index";
import { TRIP_FLOW_COMMERCE_ENABLED } from "../../../src/config/commerce-surfaces";
import { validateProfile } from "../../../src/lib/scheduler/ai/personalization-profile";
import { applyVisibility } from "../../../src/lib/city-spots-visibility";
import { collectAllKeyset } from "../../../src/lib/city-spots-paging";

// ── Inline types ──────────────────────────────────────────────────────────────

interface Coord { lat: number; lng: number; }
type ZoneId = 1 | 2 | 3;
type ValidPace = "relaxed" | "normal" | "packed";

interface NearMePlaceRow {
  place_id: string;
  category: string;
  lat:      number | null;
  lng:      number | null;
  district: string | null;
  tags:     string[] | null;
}

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
  lat?:            number;
  lng?:            number;
  /** city_spots.image_url — 표시용 장소 대표 이미지. 없는 장소가 정상 상태다 */
  image?:          string;
}

// ── Validation helpers ────────────────────────────────────────────────────────

const VALID_PACES   = ["relaxed", "normal", "packed"] as const;
const HHMM_RE       = /^\d{2}:\d{2}$/;
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;
// P1(2026-08-30): 권역 집중 공급(candidate-supply.focusSupply)과 함께 60 으로 — 30 은 주 권역 안의 식당·볼거리를 다 담지 못해
// 식사 창마다 먼 식당으로 되돌아갔다. 실측(부산 10일·해운대 숙소): 30→60 에서 총 이동 790→763분, unjustified backtrack 11→8, 재진입 7→4.
const DEFAULT_LIMIT = 60;
const MAX_RADIUS_KM = 7;

const isHHMM    = (s: unknown): s is string => typeof s === "string" && HHMM_RE.test(s);
const isDateStr = (s: unknown): s is string => typeof s === "string" && DATE_RE.test(s);
const isPace    = (s: unknown): s is ValidPace =>
  typeof s === "string" && (VALID_PACES as readonly string[]).includes(s);
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// BUG-01: Cart hints arrive as "local-N" (e.g. "local-1"), DB candidates as "N" (e.g. "1").
// Normalize both to the bare numeric/string id so duplicates can be detected.
function normalizePlaceIdForDedupe(placeId: unknown): string | null {
  if (placeId === null || placeId === undefined) return null;
  const raw = String(placeId).trim();
  if (!raw) return null;
  if (raw.startsWith("local-")) {
    const withoutPrefix = raw.replace(/^local-/, "").trim();
    return withoutPrefix || raw;
  }
  return raw;
}

// ── NearMe: direct Supabase query via ctx.env (bypasses supabase.ts singleton) ──
//
// WHY: supabase.ts creates createClient() at module init with process.env.
// In Cloudflare Workers, process.env is empty at module init → placeholder URL →
// all queries fail → mock fallback. ctx.env has the real values at request time.

// 단계별 소요시간(ms) — 한 요청당 한 줄만 남긴다. 값은 운영 로그용이며 응답에는 싣지 않는다.
let _tm_candidates: { ms: number; pages: number; rows: number } | null = null;

async function runNearMeDirect(
  input: {
    coordinate:        Coord;
    timestamp:         string;
    categories?:       any[];
    liked_place_ids?:  string[];
    itinerary_coords?: Coord[];
    event_coords?:     Coord[];
    limit:             number;
    /** 이전 날짜에 이미 배치된 place_id. limit 을 적용하기 **전에** 뺀다. */
    exclude_place_ids?: string[];
    /** 사용자가 고른 여행 속도. `active` 만 후보 점수를 바꾼다. */
    trip_pace?:        TripPaceChoice;
  },
  env: Record<string, string | undefined>,
): Promise<{ results: any[]; nearMeCount: number }> {
  const allCategories = (input.categories as any[]) ?? ALL_PLACE_CATEGORIES;

  let rawRows: NearMePlaceRow[] = [];
  const supabaseUrl  = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (supabaseUrl && !supabaseUrl.includes("placeholder") && supabaseAnon) {
    try {
      const client = createClient(supabaseUrl, supabaseAnon);
      const { deltaLat, deltaLng } = boundingBoxDelta(MAX_RADIUS_KM, input.coordinate.lat);

      // PlaceCategory[] → DB category strings
      const dbCats: string[] = [];
      for (const [dbCat, nmCat] of Object.entries(CATEGORY_MAP)) {
        if (allCategories.includes(nmCat)) dbCats.push(dbCat);
      }
      const dbCategories = dbCats.length > 0 ? dbCats : SUPPORTED_DB_CATEGORIES;

      // Gate B (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1): 자동 후보 공급은 discovery 조회 —
      // 게이트가 켜지면 is_published=true 만. 아래 place_map(by id) 은 reference 라 필터하지 않는다.
      // R1 SCALE: bbox(7km)+category 범위 query 는 그대로 두고, 그 결과가 1,000 을 넘어도 잘리지 않도록 keyset 으로 끝까지 읽는다.
      //   (PostgREST 상한을 "의도된 후보 limit" 으로 포장하지 않는다 — 후보 제한은 아래 expandZones/diversify 가 담당)
      let data: unknown[] | null = null;
      let error: { message: string } | null = null;
      try {
        const _tq = Date.now(); let _pages = 0;
        data = await collectAllKeyset<{ id: number }>(async (afterId, pageSize) => { _pages++;
          const res = await applyVisibility(
            client
              .from("city_spots")
              .select("id, category, lat, lng, district, tags")
              .in("category", dbCategories)
              .not("lat", "is", null)
              .not("lng", "is", null)
              .gte("lat", input.coordinate.lat - deltaLat)
              .lte("lat", input.coordinate.lat + deltaLat)
              .gte("lng", input.coordinate.lng - deltaLng)
              .lte("lng", input.coordinate.lng + deltaLng),
            "discovery",
          ).gt("id", afterId).order("id", { ascending: true }).limit(pageSize);
          if (res.error) throw new Error(res.error.message);
          return (res.data ?? []) as { id: number }[];
        });
        _tm_candidates = { ms: Date.now() - _tq, pages: _pages, rows: Array.isArray(data) ? data.length : -1 };
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e) };
      }

      if (!error && Array.isArray(data)) {
        // P0 coordinate gate: 좌표가 "존재" 하는 것과 "쓸 수 있는" 것은 다르다 — 범위 밖·NaN·(0,0) 행은 후보에서 뺀다.
        rawRows = (data as any[]).filter(row => isSchedulableCoordinate(row.lat, row.lng)).map(row => ({
          place_id: String(row.id),
          category: String(row.category),
          lat:      row.lat as number,
          lng:      row.lng as number,
          district: row.district as string | null,
          tags:     row.tags as string[] | null,
        }));
      }
    } catch {
      // fall through to mock
    }
  }

  // 순수 후보 공급(zone → expand → score → exclude → diversify)은 candidate-supply.ts 로 옮겼다 — 오프라인 벤치마크가
  // 격리 dataset 으로 같은 공급을 돌리기 위해서다. 동작은 그대로다.
  const { results, nearMeCount } = buildNearMeCandidates(rawRows as any, {
    coordinate:        input.coordinate,
    timestamp:         input.timestamp,
    categories:        allCategories as any,
    liked_place_ids:   input.liked_place_ids,
    itinerary_coords:  input.itinerary_coords,
    event_coords:      input.event_coords,
    limit:             input.limit,
    exclude_place_ids: input.exclude_place_ids,
    trip_pace:         input.trip_pace,
  });
  return { results, nearMeCount };
}

// ── Place display map ─────────────────────────────────────────────────────────

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
      const url  = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      if (url && !url.includes("placeholder") && anon) {
        const client = createClient(url, anon);
        const numericIds = realIds.map(Number).filter(n => !isNaN(n));
        const { data, error } = await client
          .from("city_spots")
          .select("id, name, subcategory, category, description, district, lat, lng, image_url")
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
              lat:             typeof row.lat === "number" ? row.lat : undefined,
              lng:             typeof row.lng === "number" ? row.lng : undefined,
              // image_url = NULL 이 정상 상태다 — 빈 값이면 필드 자체를 내보내지 않는다
              image:           typeof row.image_url === "string" && row.image_url.trim() !== ""
                                 ? row.image_url
                                 : undefined,
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

// ── Cloudflare Pages Function handler ────────────────────────────────────────

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
  if ((coord.lat as number) < -90  || (coord.lat as number) > 90)
    return jsonResp({ error: "coordinate.lat must be between -90 and 90" }, 400);
  if ((coord.lng as number) < -180 || (coord.lng as number) > 180)
    return jsonResp({ error: "coordinate.lng must be between -180 and 180" }, 400);
  if (!isHHMM(body.timestamp))     return jsonResp({ error: "timestamp must be HH:MM" }, 400);
  if (!isDateStr(body.trip_date))  return jsonResp({ error: "trip_date must be YYYY-MM-DD" }, 400);
  if (!isHHMM(body.start_time))   return jsonResp({ error: "start_time must be HH:MM" }, 400);
  if (!isHHMM(body.end_time))     return jsonResp({ error: "end_time must be HH:MM" }, 400);
  if (toMin(body.end_time as string) <= toMin(body.start_time as string))
    return jsonResp({ error: "end_time must be after start_time" }, 400);
  if (!isPace(body.pace)) return jsonResp({ error: "pace must be one of: relaxed, normal, packed" }, 400);
  // 사용자가 고른 속도. 엔진 pace 와 다른 값이라 따로 읽는다.
  const tripPace = typeof body.trip_pace === "string" ? body.trip_pace : undefined;

  // 3. Extract typed fields
  const coordinate: Coord = { lat: coord.lat as number, lng: coord.lng as number };

  // TASK-057-B2: optional start_coordinate — scheduler Day-start base coordinate.
  // Falls back to coordinate when absent so existing clients remain compatible.
  // Phase 1: itinerary/page.tsx sends identical values; B2-2 will override coordinate to My Pick cluster centroid.
  const rawStartCoord = body.start_coordinate as Record<string, unknown> | null | undefined;
  const schedulerBaseCoordinate: Coord =
    rawStartCoord &&
    typeof rawStartCoord === "object" &&
    typeof rawStartCoord.lat === "number" &&
    typeof rawStartCoord.lng === "number"
      ? { lat: rawStartCoord.lat, lng: rawStartCoord.lng }
      : coordinate;

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
  // TASK-054: place_ids already scheduled in previous days — exclude from candidates
  const exclude_place_ids: string[] = Array.isArray(body.exclude_place_ids)
    ? (body.exclude_place_ids as string[]).map(String)
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
  const _tm0 = Date.now(); const _tm: Record<string, number> = {};
  // 실측(2026-08-30, 10일 부산): 이 한 줄이 하루당 ≈14.1s 였다 — affiliate-loader 가 모듈 초기화 시
  // process.env 로 만든 placeholder Supabase client 로 2회(도시·전국) 조회를 시도해 매번 타임아웃됐고,
  // 그 결과는 어차피 빈 배열이었다(affiliate_links 테이블도 아직 없다). Trip-Flow commerce 가 꺼져 있는 동안은
  // 부르지 않는다 — 결과 동일(빈 map), 하루당 ≈14s → 0. 켜는 날에는 ctx.env 기반 client 로 바꿔야 한다.
  const affiliateRows = TRIP_FLOW_COMMERCE_ENABLED ? await queryAffiliateLinks(city) : [];
  _tm.affiliate = Date.now() - _tm0;
  if (affiliateRows.length > 0 && !affiliate_context) {
    affiliate_context = {
      affiliate_link_ids: affiliateRows.map((r: any) => r.affiliate_link_id),
      max_cards: 2,
    };
  }

  // 6. Near Me — fresh Supabase client from ctx.env (bypasses supabase.ts singleton)
  // cart_hints represent user-selected itinerary picks, so use their place_ids as preference
  // signals when liked_place_ids are absent. local-* ids may not match DB candidates and are
  // safely ignored by the scorer (buildLikedCategorySet skips unmatched ids).
  // Saved(취향) 와 Selected(이번 여행 선택) 를 **함께** 넘긴다.
  // 예전에는 Saved 가 없을 때만 Selected 를 넣었다 — Selected 를 Saved 로 위장하는
  // 모양이었다. 이제 둘 다 신호로 쓰되 라벨을 섞지 않는다.
  // Saved 가 0 개면 결과 집합이 예전과 완전히 같다.
  const cartPreferenceIds = cart_hints
    .map(h => h.place_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const mergedPreferenceIds = mergePreferenceIds(liked_place_ids ?? [], cartPreferenceIds);
  const effective_liked_place_ids: string[] | undefined =
    mergedPreferenceIds.length > 0 ? mergedPreferenceIds : undefined;

  const _tm1 = Date.now();
  const { results: nearMeResults, nearMeCount } = await runNearMeDirect({
    coordinate,
    timestamp,
    categories,
    liked_place_ids: effective_liked_place_ids,
    itinerary_coords,
    event_coords,
    limit: near_me_limit,
    exclude_place_ids,
    trip_pace: tripPace as TripPaceChoice | undefined,
  }, ctx.env);

  _tm.nearMe = Date.now() - _tm1;
  // 7. Adapt Near Me results to scheduler candidates
  const baseCandidates = adaptToSchedulerCandidates(nearMeResults as any);

  // 8. Cart candidates (score=999, always placed first)
  // This Trip hint 도 같은 게이트 — 클라이언트가 이미 걸러 안내하지만(skippedCartNames), 서버는 신뢰하지 않는다.
  const cartCandidates = cart_hints.filter(h => isSchedulableCoordinate(h.lat, h.lng)).map(hint => {
    const hintCoord: Coord = { lat: hint.lat, lng: hint.lng };
    const distM  = haversineDistance(coordinate as any, hintCoord as any);
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

  // BUG-01: Strip DB candidates whose bare id matches a cart hint's "local-N" id.
  // "local-1" normalizes to "1"; DB candidate place_id "1" also normalizes to "1" → dedupe.
  // cartCandidates themselves are never touched — only baseCandidates are filtered.
  const cartHintDedupeIds = new Set(
    cart_hints
      .map(h => normalizePlaceIdForDedupe(h.place_id))
      .filter((id): id is string => id !== null),
  );
  const dedupedBaseCandidates = cartHintDedupeIds.size > 0
    ? baseCandidates.filter(c => {
        const norm = normalizePlaceIdForDedupe((c as any).place_id);
        return norm === null || !cartHintDedupeIds.has(norm);
      })
    : baseCandidates;

  const allCandidates = [...cartCandidates, ...dedupedBaseCandidates];

  // TASK-054: Remove candidates already placed in a previous day
  // Comparison uses String(place_id) to handle both "94" and "local-23" formats
  //
  // NearMe 후보는 이미 runNearMeDirect 안에서 잘리기 전에 걸러졌다. 여기 남은
  // 일은 cartCandidates 다 — This Trip 픽은 그 경로를 지나지 않으므로, 이 줄이
  // 없으면 어제 간 픽이 오늘 다시 배치된다. 중복처럼 보여도 지우지 않는다.
  const excludeSet = new Set(exclude_place_ids);
  const filteredCandidates = excludeSet.size > 0
    ? allCandidates.filter(c => !excludeSet.has(String(c.place_id)))
    : allCandidates;

  const allPreferred  = cartPreferred.length > 0 ? cartPreferred : undefined;

  // 9. Run scheduler — with_ai ALWAYS false, no Gemini calls
  const _tm2 = Date.now();
  const schedulerResult = runScheduler({
    trip_date,
    start_time,
    end_time,
    base_coordinate: schedulerBaseCoordinate as any,
    pace,
    anchors:              Array.isArray(body.anchors)      ? body.anchors as any      : undefined,
    fixed_events:         Array.isArray(body.fixed_events) ? body.fixed_events as any : undefined,
    preferred_items:      allPreferred,
    route_template_stays: route_template_stays,
    affiliate_context,
    candidates:           filteredCandidates as any,
    // whole-trip 프로필. 클라이언트가 보낸 값이라도 그대로 믿지 않고 여기서 다시
    // 검증한다. 허용 id 집합은 이 날짜에 실제로 후보로 올라온 장소들이다.
    personalization_profile: body.personalization_profile
      ? validateProfile(
          body.personalization_profile,
          (filteredCandidates as any[]).map((c: any) => String(c.place_id)),
        )
      : null,
  });

  _tm.scheduler = Date.now() - _tm2;
  if (!schedulerResult.success) {
    return jsonResp(
      { error: "Scheduler hard constraint violation", conflict: schedulerResult.error },
      409,
    );
  }

  // 10. Build place map (Supabase city_spots lookup via ctx.env)
  const placeIds = (schedulerResult.data.items as any[])
    .map((item: any) => item.place_id ?? item.event_id)
    .filter((id: any): id is string => Boolean(id));

  const _tm3 = Date.now();
  const place_map     = await buildPlaceMap(placeIds, ctx.env); _tm.placeMap = Date.now() - _tm3; _tm.total = Date.now() - _tm0;
  const _q = (schedulerResult.data as any).quality;
  console.log(`[plan-timing] ${JSON.stringify({ ..._tm, fetch: _tm_candidates, candidates: nearMeCount, placed: placeIds.length, quality: _q ? { status: _q.status, confidence: _q.scheduleConfidence, reentry: _q.clusterReentries, unjustified: _q.unjustifiedBacktracks, zigzag: _q.localZigzags, repaired: _q.repaired, codes: _q.reasonCodes } : null })}`);
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
      kind:          "scheduled",
      plan:          schedulerResult.data,
      near_me_count: nearMeCount,
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

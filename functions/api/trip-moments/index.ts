// Cloudflare Pages Function: GET/POST /api/trip-moments
//
// GET  ?itinerary_id=  — itinerary 소유자의 text moments 반환 (photo_data 없음)
// POST                 — 새 text moment 저장
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - GET/POST 전 itineraries.id + itineraries.device_id 소유권 확인
// - 비소유자·존재하지 않는 itinerary = 404 (정보 누출 방지)
// - photo_data 수신·저장 금지
// - service_role 사용

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  readBodyWithLimit,
  str,
  optNum,
} from "../../../src/lib/itinerary-validate";

const MAX_MOMENT_BODY_BYTES = 8 * 1024; // 8 KB — text/GPS only, no photo_data

const VALID_CATEGORIES = ["food", "scenery", "people", "culture", "random"] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyItineraryOwner(
  admin: ReturnType<typeof createClient>,
  itineraryId: string,
  deviceId:    string,
): Promise<boolean> {
  const { data } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", itineraryId)
    .eq("device_id", deviceId)
    .maybeSingle();
  return !!data;
}

// ── GET — itinerary 소유자의 text moments ────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const itineraryId = new URL(ctx.request.url).searchParams.get("itinerary_id") ?? "";
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary_id" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const owned = await verifyItineraryOwner(admin, itineraryId, deviceId);
  if (!owned) return json({ error: "Not found" }, 404);

  const { data, error } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, memo, category, lat, lng, location_label, captured_at, day_number")
    .eq("itinerary_id", itineraryId)
    .eq("device_id", deviceId)
    .order("captured_at", { ascending: false });

  if (error) {
    console.error("[trip-moments GET] db error:", error.code);
    return json({ error: "Failed to fetch moments" }, 500);
  }

  return json(data ?? []);
}

// ── POST — 새 text moment 생성 ────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const read = await readBodyWithLimit(ctx.request, MAX_MOMENT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  const momentId    = str(body.moment_id, 36);
  const itineraryId = str(body.itinerary_id, 36);
  if (!UUID_RE.test(momentId))    return json({ error: "Invalid moment_id" }, 400);
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary_id" }, 400);

  const categoryRaw = str(body.category, 50);
  const category: ValidCategory = (VALID_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw as ValidCategory
    : "random";

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 부모 itinerary 소유권 확인 (FK 부재 보완)
  const owned = await verifyItineraryOwner(admin, itineraryId, deviceId);
  if (!owned) return json({ error: "Not found" }, 404);

  const row: Record<string, unknown> = {
    moment_id:      momentId,
    itinerary_id:   itineraryId,
    device_id:      deviceId,
    memo:           str(body.memo, 2000),
    category,
    location_label: str(body.location_label, 200),
    captured_at:    str(body.captured_at, 30) || new Date().toISOString(),
    // photo_data: 수신·저장 금지
  };

  const lat = optNum(body.lat);
  const lng = optNum(body.lng);
  if (lat !== undefined) {
    if (lat < -90  || lat > 90)  return json({ error: "lat out of range" }, 400);
    row.lat = lat;
  }
  if (lng !== undefined) {
    if (lng < -180 || lng > 180) return json({ error: "lng out of range" }, 400);
    row.lng = lng;
  }

  if (body.day_number !== null && body.day_number !== undefined) {
    if (typeof body.day_number !== "number" || !Number.isInteger(body.day_number)) {
      return json({ error: "day_number must be an integer" }, 400);
    }
    row.day_number = body.day_number;
  }

  const { error } = await admin
    .from("trip_moments")
    .upsert(row, { onConflict: "moment_id" });

  if (error) {
    console.error("[trip-moments POST] db error:", error.code);
    return json({ error: "Failed to save moment" }, 500);
  }

  return json({ moment_id: momentId }, 201);
}

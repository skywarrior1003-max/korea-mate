// Cloudflare Pages Function: GET/POST /api/user-spots
//
// GET  — 이 device가 등록한 모든 My Picks 반환 (device_id never in response)
// POST — 새 My Pick 장소 등록
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - device_id는 헤더에서만 취득 (body의 device_id 무시)
// - category는 city_spots CHECK constraint와 동일 5종만 허용
// - service_role key로 user_spots 테이블 직접 접근

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
  str,
  optStr,
} from "../../src/lib/itinerary-validate";

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

const VALID_CATEGORIES = ["attraction", "nature", "restaurant", "event", "accommodation"] as const;

// ── GET — device의 My Picks 목록 ─────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[user-spots GET] db error:", error.code);
    return json({ error: "Failed to fetch spots" }, 500);
  }

  return json(data ?? []);
}

// ── POST — 새 My Pick 등록 ────────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_USER_SPOT_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  // name 필수
  const name = str(body.name, 300);
  if (!name) return json({ error: "name is required" }, 400);

  // category 검증
  const category = str(body.category, 50);
  if (category && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, 400);
  }

  const row: Record<string, unknown> = {
    device_id:  deviceId,
    name,
    updated_at: new Date().toISOString(),
  };

  if (category)                    row.category  = category;
  const city     = optStr(body.city,      100); if (city)     row.city      = city;
  const address  = optStr(body.address,   500); if (address)  row.address   = address;
  const note     = optStr(body.note,     2000); if (note)     row.note      = note;
  const photoUrl = optStr(body.photo_url, 500); if (photoUrl) row.photo_url = photoUrl;

  if (body.lat !== undefined && body.lat !== null) {
    if (typeof body.lat !== "number") return json({ error: "lat must be a finite number" }, 400);
    if (!isFinite(body.lat) || body.lat < -90 || body.lat > 90) return json({ error: "lat must be between -90 and 90" }, 400);
    row.lat = body.lat;
  }
  if (body.lng !== undefined && body.lng !== null) {
    if (typeof body.lng !== "number") return json({ error: "lng must be a finite number" }, 400);
    if (!isFinite(body.lng) || body.lng < -180 || body.lng > 180) return json({ error: "lng must be between -180 and 180" }, 400);
    row.lng = body.lng;
  }

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[user-spots POST] db error:", error.code);
    return json({ error: "Failed to create spot" }, 500);
  }

  return json({ id: data.id }, 201);
}

// Cloudflare Pages Function: GET/PUT/DELETE /api/user-spots/:id
//
// GET    — 소유자만 단건 조회 (device_id never in response)
// PUT    — 소유자만 전체 업데이트 (name 필수)
// DELETE — 소유자만 삭제
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - 모든 쿼리에 WHERE id AND device_id (소유자 확인 단일 원자 쿼리)
// - 비소유자 요청은 404 반환 (정보 누출 방지)
// - device_id는 응답에 포함하지 않음

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
  str,
  nullableStr,
} from "../../../src/lib/itinerary-validate";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string>;
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

// ── GET — 소유자 단건 조회 ────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[user-spots/:id GET] db error:", error.code);
    return json({ error: "Failed to fetch spot" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  return json(data);
}

// ── PUT — 소유자 전체 업데이트 ────────────────────────────────────────────────
export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

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
    name,
    updated_at: new Date().toISOString(),
  };

  if (category)                    row.category  = category;
  const city     = nullableStr(body.city,      100); if (city !== undefined)     row.city      = city;
  const address  = nullableStr(body.address,   500); if (address !== undefined)  row.address   = address;
  const note     = nullableStr(body.note,     2000); if (note !== undefined)     row.note      = note;
  const photoUrl = nullableStr(body.photo_url, 500); if (photoUrl !== undefined) row.photo_url = photoUrl;

  if (body.lat !== undefined) {
    if (body.lat === null) { row.lat = null; }
    else if (typeof body.lat !== "number" || !isFinite(body.lat)) { return json({ error: "lat must be a finite number" }, 400); }
    else if (body.lat < -90 || body.lat > 90) { return json({ error: "lat must be between -90 and 90" }, 400); }
    else { row.lat = body.lat; }
  }
  if (body.lng !== undefined) {
    if (body.lng === null) { row.lng = null; }
    else if (typeof body.lng !== "number" || !isFinite(body.lng)) { return json({ error: "lng must be a finite number" }, 400); }
    else if (body.lng < -180 || body.lng > 180) { return json({ error: "lng must be between -180 and 180" }, 400); }
    else { row.lng = body.lng; }
  }

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[user-spots/:id PUT] db error:", error.code);
    return json({ error: "Failed to update spot" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── DELETE — 소유자 삭제 ──────────────────────────────────────────────────────
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[user-spots/:id DELETE] db error:", error.code);
    return json({ error: "Failed to delete spot" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

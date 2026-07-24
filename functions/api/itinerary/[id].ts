// Cloudflare Pages Function: GET/PUT/PATCH/DELETE /api/itinerary/:id
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/itinerary/[id]/route.ts — security policy identical.
//
// SECURITY CONTRACT:
// - GET: owner-only (WHERE id + device_id). Non-owners receive 404. device_id never in response.
// - PUT: conditional UPDATE (WHERE id + device_id). 0 rows → 404.
// - PATCH: title or is_public UPDATE (WHERE id + device_id). Allowlist enforced.
// - DELETE: WHERE id + device_id.
// - x-device-id header required for all methods; body device_id ignored.

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_BODY_BYTES,
  MAX_SMALL_BODY_BYTES,
  readBodyWithLimit,
  isValidDays,
  optStr,
} from "../../../src/lib/itinerary-validate";
import { collectStoragePaths, removeItineraryStorage } from "../../../src/lib/photo-delete";

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

// ── GET — owner-only ──────────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count, is_public")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[functions/api/itinerary GET] db error:", error.code);
    return json({ error: "Failed to fetch itinerary" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  return json(data);
}

// ── PUT — full save (conditional UPDATE) ─────────────────────────────────────
export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  if (!isValidDays(body.days)) return json({ error: "Invalid days structure" }, 400);

  const row: Record<string, unknown> = {
    days:       body.days,
    updated_at: new Date().toISOString(),
  };
  const city        = optStr(body.city,         100); if (city)        row.city         = city;
  const startDate   = optStr(body.start_date,    20); if (startDate)   row.start_date   = startDate;
  const endDate     = optStr(body.end_date,      20); if (endDate)     row.end_date     = endDate;
  const travelers   = optStr(body.travelers,     50); if (travelers)   row.travelers    = travelers;
  const travelStyle = optStr(body.travel_style, 100); if (travelStyle) row.travel_style = travelStyle;
  const tripTitle   = optStr(body.trip_title,   300); if (tripTitle)   row.trip_title   = tripTitle;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[functions/api/itinerary PUT] db error:", error.code);
    return json({ error: "Failed to update itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── PATCH — title or is_public (allowlist) ───────────────────────────────────
export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as { trip_title?: unknown; is_public?: unknown };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const title = typeof body.trip_title === "string" ? body.trip_title.trim().slice(0, 300) : "";
  if (title) row.trip_title = title;
  if (typeof body.is_public === "boolean") row.is_public = body.is_public;

  if (Object.keys(row).length === 1) return json({ error: "No valid fields to update" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[functions/api/itinerary PATCH] db error:", error.code);
    return json({ error: "Failed to update itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1단계: 소유권 확인 (Storage 삭제 전 SELECT로 검증)
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found or permission denied" }, 404);

  // 2단계: 연결 Storage 파일 경로 수집
  const { data: momentRows } = await admin
    .from("trip_moments")
    .select("storage_path")
    .eq("itinerary_id", id)
    .not("storage_path", "is", null);

  const storagePaths = collectStoragePaths(momentRows ?? []);

  // 3단계: Storage-first 삭제 (Storage 실패 시 DB 미삭제)
  if (storagePaths.length > 0) {
    const storageErr = await removeItineraryStorage(admin.storage, storagePaths);
    if (storageErr) {
      console.error("[itinerary DELETE] storage remove failed:", storageErr, { count: storagePaths.length });
      return json({ error: "Failed to remove photos" }, 500);
    }
  }

  // 4단계: trip_moments 명시적 DELETE (FK/CASCADE 없는 경우 고아 행 방지)
  const { error: momDelErr } = await admin
    .from("trip_moments")
    .delete()
    .eq("itinerary_id", id);

  if (momDelErr) {
    // Storage는 이미 삭제됐으나 trip_moments DB 삭제 실패
    console.error("[itinerary DELETE] CRITICAL: storage deleted but moments db delete failed", {
      itineraryId: id,
      pathCount: storagePaths.length,
      code: momDelErr.code,
    });
    return json({ error: "Failed to delete moments" }, 500);
  }

  // 5단계: itinerary DB 삭제
  const { data, error } = await admin
    .from("itineraries")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    // Storage·trip_moments 삭제 완료 후 itinerary DB 삭제 실패
    console.error("[itinerary DELETE] CRITICAL: moments deleted but itinerary db delete failed", {
      itineraryId: id,
      code: error.code,
    });
    return json({ error: "Failed to delete itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

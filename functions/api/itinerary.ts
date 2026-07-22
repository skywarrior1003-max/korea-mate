// Cloudflare Pages Function: POST /api/itinerary
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true next build → Next.js API Routes are excluded.
// This restores POST /api/itinerary (INSERT-only) for the production Pages deployment.
// Mirrors src/app/api/itinerary/route.ts — security policy identical.
//
// SECURITY CONTRACT:
// - device_id ONLY from x-device-id header; body device_id is ignored
// - service_role key from ctx.env (bypasses RLS — requires field whitelist)
// - no body spread; all fields individually validated and extracted

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_BODY_BYTES,
  readBodyWithLimit,
  isValidUUID,
  isValidDays,
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

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  // device_id from header only
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return json({ error: "Invalid device ID" }, 400);
  }

  // Early exit on content-length, then real byte check via request.text()
  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  const id = str(body.id, 36);
  if (!isValidUUID(id)) return json({ error: "Invalid itinerary ID" }, 400);
  if (!isValidDays(body.days)) return json({ error: "Invalid days structure" }, 400);

  // Whitelist — no body spread
  const row: Record<string, unknown> = {
    id,
    device_id:    deviceId,
    city:         str(body.city,         100),
    start_date:   str(body.start_date,    20),
    end_date:     str(body.end_date,      20),
    travelers:    str(body.travelers,     50) || "1",
    travel_style: str(body.travel_style, 100),
    days:         body.days,
    updated_at:   new Date().toISOString(),
  };
  const tripTitle = optStr(body.trip_title, 300);
  if (tripTitle !== undefined) row.trip_title = tripTitle;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { error } = await admin.from("itineraries").insert(row);

  if (error) {
    if (error.code === "23505") return json({ error: "Itinerary already exists" }, 409);
    console.error("[functions/api/itinerary POST] db error:", error.code);
    return json({ error: "Failed to save itinerary" }, 500);
  }

  return json({ ok: true }, 201);
}

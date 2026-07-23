// Cloudflare Pages Function: GET /api/itineraries
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/itineraries/route.ts — security policy identical.
//
// Returns itinerary list (no days, no device_id) for the requesting device.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../src/lib/itinerary-validate";

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

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const url      = new URL(ctx.request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit    = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, updated_at, trip_title, is_public")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[functions/api/itineraries GET] db error:", error.code);
    return json({ error: "Failed to fetch itineraries" }, 500);
  }

  return json(data ?? []);
}

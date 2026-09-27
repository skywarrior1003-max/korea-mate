// Cloudflare Pages Function: GET /api/itineraries
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/itineraries/route.ts — security policy identical.
//
// Returns itinerary list (no days, no device_id) for the requesting device.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../src/lib/itinerary-validate";
import { resolveOwnership, type OwnershipEnv } from "../_lib/ownership.ts";

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
  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  const url      = new URL(ctx.request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit    = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, updated_at, trip_title, is_public, copy_count, helpful_count")
    .in("device_id", deviceScope)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[functions/api/itineraries GET] db error:", error.code);
    return json({ error: "Failed to fetch itineraries" }, 500);
  }

  return json(data ?? []);
}

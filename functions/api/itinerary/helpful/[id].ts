// Cloudflare Pages Function: PATCH /api/itinerary/helpful/:id
// Increments helpful_count for an itinerary, deduplicated by device_id.
// Uses add_itinerary_helpful_vote RPC (service_role only, atomic INSERT + UPDATE).

import { createClient } from "@supabase/supabase-js";

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
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase not configured");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const itineraryId = (ctx.params.id ?? "").trim();
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary id" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!deviceId) return json({ error: "x-device-id header required" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin.rpc("add_itinerary_helpful_vote", {
    p_itinerary_id: itineraryId,
    p_device_id:    deviceId,
  });

  if (error) {
    console.error("[helpful PATCH] rpc error:", error.code, error.message);
    return json({ error: "Failed to record vote" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return json({
    added:         row?.added         ?? false,
    helpful_count: row?.helpful_count ?? 0,
  });
}

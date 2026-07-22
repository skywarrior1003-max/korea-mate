// Cloudflare Pages Function: GET /api/trips/popular
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/trips/popular/route.ts — security policy identical.
//
// Weighted sort: view_count + helpful_count × 3. No device_id/email in response.

import { createClient } from "@supabase/supabase-js";

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
  const url      = new URL(ctx.request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "6", 10);
  const limit    = Math.min(Math.max(1, isNaN(limitRaw) ? 6 : limitRaw), 50);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travel_style, view_count, helpful_count, trip_title")
    .gte("view_count", 2)
    .order("view_count", { ascending: false })
    .limit(limit * 2);

  if (error) {
    console.error("[functions/api/trips/popular GET] db error:", error.code);
    return json({ error: "Failed to fetch popular trips" }, 500);
  }

  type Row = { view_count: number; helpful_count: number };
  const rows = (data ?? []) as Row[];
  const sorted = rows
    .sort(
      (a, b) =>
        (b.view_count + (b.helpful_count ?? 0) * 3) -
        (a.view_count + (a.helpful_count ?? 0) * 3)
    )
    .slice(0, limit);

  return json(sorted);
}

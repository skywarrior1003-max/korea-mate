// Cloudflare Pages Function: GET /api/trips/popular
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/trips/popular/route.ts — security policy identical.
//
// Weighted sort: view_count + helpful_count × 3 + copy_count × 5. No device_id/email in response.
// Optional filters: ?city=seoul&travel_style=Solo (exact match, case-sensitive as stored in DB)

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

const VALID_CITIES  = new Set(["seoul", "busan", "jeju", "gyeongju"]);
const VALID_STYLES  = new Set(["Solo", "Couple", "Family", "Group"]);

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const url      = new URL(ctx.request.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "6", 10);
  const limit    = Math.min(Math.max(1, isNaN(limitRaw) ? 6 : limitRaw), 50);

  const cityParam  = (url.searchParams.get("city")         ?? "").trim().toLowerCase();
  const styleParam = (url.searchParams.get("travel_style") ?? "").trim();
  const cityFilter  = VALID_CITIES.has(cityParam)  ? cityParam  : null;
  const styleFilter = VALID_STYLES.has(styleParam) ? styleParam : null;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  let query = admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travel_style, view_count, helpful_count, copy_count, trip_title")
    .eq("is_public", true)
    .gte("view_count", 2);

  if (cityFilter)  query = query.eq("city",         cityFilter);
  if (styleFilter) query = query.eq("travel_style", styleFilter);

  const { data, error } = await query
    .order("view_count", { ascending: false })
    .limit(limit * 2);

  if (error) {
    console.error("[functions/api/trips/popular GET] db error:", error.code);
    return json({ error: "Failed to fetch popular trips" }, 500);
  }

  type Row = { view_count: number; helpful_count: number; copy_count: number };
  const rows = (data ?? []) as Row[];
  const sorted = rows
    .sort(
      (a, b) =>
        (b.view_count + (b.helpful_count ?? 0) * 3 + (b.copy_count ?? 0) * 5) -
        (a.view_count + (a.helpful_count ?? 0) * 3 + (a.copy_count ?? 0) * 5)
    )
    .slice(0, limit);

  return json(sorted);
}

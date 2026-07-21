import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// GET /api/trips/popular?limit=6
// Mirrors the fetchPopularTrips logic from supabase.ts, now server-side.
// Weighted score = view_count + helpful_count × 3
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "6", 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 6 : limitParam), 50);

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travel_style, view_count, helpful_count, trip_title")
    .gte("view_count", 2)
    .order("view_count", { ascending: false })
    .limit(limit * 2);

  if (error) {
    console.error("[api/trips/popular GET] db error:", error.code);
    return NextResponse.json({ error: "Failed to fetch popular trips" }, { status: 500 });
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

  return NextResponse.json(sorted);
}

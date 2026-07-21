import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { UUID_RE } from "@/lib/itinerary-validate";

// GET /api/itineraries?limit=N
// Returns itineraries belonging to the device identified by x-device-id header.
export async function GET(request: NextRequest) {
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100);

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, updated_at")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[api/itineraries GET] db error:", error.code);
    return NextResponse.json({ error: "Failed to fetch itineraries" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

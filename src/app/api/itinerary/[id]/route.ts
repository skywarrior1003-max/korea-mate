import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  UUID_RE,
  MAX_BODY_BYTES,
  MAX_SMALL_BODY_BYTES,
  readBodyWithLimit,
  isValidDays,
  optStr,
} from "@/lib/itinerary-validate";

type Ctx = { params: Promise<{ id: string }> };

// ── GET /api/itinerary/[id] ──────────────────────────────────────────────────
// Owner-only: requires x-device-id header; queries WHERE id + device_id.
// Non-owners receive 404 (same as not-found — no information leakage).
// device_id is never included in the response.
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .select(
      "id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count"
    )
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[api/itinerary GET] db error:", error.code);
    return NextResponse.json({ error: "Failed to fetch itinerary" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// ── PUT /api/itinerary/[id] ──────────────────────────────────────────────────
// Full save: UPDATE WHERE id + device_id. Returns 404 if not found or wrong owner.
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  // Early exit on content-length, then real byte check via request.text()
  const cl = request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const read = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body as Record<string, unknown>;

  if (!isValidDays(body.days)) {
    return NextResponse.json({ error: "Invalid days structure" }, { status: 400 });
  }

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
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[api/itinerary PUT] db error:", error.code);
    return NextResponse.json({ error: "Failed to update itinerary" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found or permission denied" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// ── PATCH /api/itinerary/[id] ────────────────────────────────────────────────
// Title-only update: UPDATE WHERE id + device_id.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  const cl = request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const read = await readBodyWithLimit(request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status });
  }
  const body = read.body as { trip_title?: unknown };

  const title = typeof body.trip_title === "string" ? body.trip_title.trim().slice(0, 300) : "";
  if (!title) {
    return NextResponse.json({ error: "trip_title is required" }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .update({ trip_title: title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[api/itinerary PATCH] db error:", error.code);
    return NextResponse.json({ error: "Failed to update title" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found or permission denied" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/itinerary/[id] ───────────────────────────────────────────────
// Delete WHERE id + device_id. Returns 404 if not found or wrong owner.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "Invalid device ID" }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("itineraries")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[api/itinerary DELETE] db error:", error.code);
    return NextResponse.json({ error: "Failed to delete itinerary" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found or permission denied" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

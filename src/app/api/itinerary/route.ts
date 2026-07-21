import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  UUID_RE,
  MAX_BODY_BYTES,
  readBodyWithLimit,
  isValidUUID,
  isValidDays,
  str,
  optStr,
} from "@/lib/itinerary-validate";

export async function POST(request: NextRequest) {
  // device_id from header only — body device_id is ignored
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

  // Itinerary ID
  const id = str(body.id, 36);
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid itinerary ID" }, { status: 400 });
  }

  // days structure
  if (!isValidDays(body.days)) {
    return NextResponse.json({ error: "Invalid days structure" }, { status: 400 });
  }

  // Whitelist fields — no spread of body
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
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
  }

  const { error } = await admin.from("itineraries").insert(row);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Itinerary already exists" }, { status: 409 });
    }
    console.error("[api/itinerary POST] db error:", error.code);
    return NextResponse.json({ error: "Failed to save itinerary" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// GoKoreaMate / gokoreamate.com — POST /api/events
// TASK-016: Explore & Events API
// 200: { data: EventsResponse }
// 400: { error: string } on invalid input

import { NextRequest, NextResponse } from "next/server";
import { runEventsQuery } from "@/lib/events/index";
import type { EventsInput, EventType } from "@/lib/events/index";

// ─── YYYY-MM-DD 형식 검증 (new Date() 미사용 — 문자열 패턴으로만 판단) ─────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(s: string): boolean {
  return DATE_PATTERN.test(s);
}

// ─── Input Validation ─────────────────────────────────────────────────────────

function validateInput(
  body: unknown,
): { valid: true; input: EventsInput } | { valid: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.trip_date !== "string" || !isValidDateString(b.trip_date)) {
    return { valid: false, error: "trip_date is required and must be YYYY-MM-DD format" };
  }

  // coordinate 선택적 검증
  let coordinate: EventsInput["coordinate"];
  if (b.coordinate !== undefined) {
    if (typeof b.coordinate !== "object" || b.coordinate === null) {
      return { valid: false, error: "coordinate must be an object" };
    }
    const c = b.coordinate as Record<string, unknown>;
    if (typeof c.lat !== "number" || typeof c.lng !== "number") {
      return { valid: false, error: "coordinate.lat and coordinate.lng must be numbers" };
    }
    if (c.lat < -90 || c.lat > 90) {
      return { valid: false, error: "coordinate.lat must be between -90 and 90" };
    }
    if (c.lng < -180 || c.lng > 180) {
      return { valid: false, error: "coordinate.lng must be between -180 and 180" };
    }
    coordinate = { lat: c.lat as number, lng: c.lng as number };
  }

  const input: EventsInput = {
    trip_date:        b.trip_date,
    journey_clusters: Array.isArray(b.journey_clusters)
      ? (b.journey_clusters as string[])
      : undefined,
    types: Array.isArray(b.types)
      ? (b.types as EventType[])
      : undefined,
    coordinate,
    radius_km: typeof b.radius_km === "number" ? b.radius_km : undefined,
    limit:     typeof b.limit     === "number" ? b.limit     : undefined,
  };

  return { valid: true, input };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateInput(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const response = runEventsQuery(validation.input);
  return NextResponse.json({ data: response }, { status: 200 });
}

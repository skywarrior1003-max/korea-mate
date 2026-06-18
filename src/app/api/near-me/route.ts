// GoKoreaMate / gokoreamate.com — POST /api/near-me
// TASK-015: Near Me API Implementation
// Returns NearMeResult[] sorted by score (F1–F6).
// 200: { data: NearMeResponse }
// 400: { error: string } on invalid input

import { NextRequest, NextResponse } from "next/server";
import { runNearMe } from "@/lib/near-me/near-me-engine";
import type { NearMeInput } from "@/lib/near-me/types";

// ─── Input Validation ─────────────────────────────────────────────────────────

function validateInput(body: unknown): { valid: true; input: NearMeInput } | { valid: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.coordinate !== "object" || b.coordinate === null) {
    return { valid: false, error: "coordinate is required" };
  }

  const coord = b.coordinate as Record<string, unknown>;
  if (typeof coord.lat !== "number" || typeof coord.lng !== "number") {
    return { valid: false, error: "coordinate.lat and coordinate.lng must be numbers" };
  }

  if (coord.lat < -90 || coord.lat > 90) {
    return { valid: false, error: "coordinate.lat must be between -90 and 90" };
  }

  if (coord.lng < -180 || coord.lng > 180) {
    return { valid: false, error: "coordinate.lng must be between -180 and 180" };
  }

  const timestamp =
    typeof b.timestamp === "string" ? b.timestamp : "12:00";

  const input: NearMeInput = {
    coordinate:        { lat: coord.lat as number, lng: coord.lng as number },
    timestamp,
    categories:        Array.isArray(b.categories)       ? (b.categories as string[]) as NearMeInput["categories"] : undefined,
    liked_place_ids:   Array.isArray(b.liked_place_ids)  ? (b.liked_place_ids as string[])  : undefined,
    itinerary_coords:  Array.isArray(b.itinerary_coords) ? (b.itinerary_coords as NearMeInput["itinerary_coords"]) : undefined,
    limit:             typeof b.limit === "number"        ? b.limit : undefined,
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

  const response = await runNearMe(validation.input);
  return NextResponse.json({ data: response }, { status: 200 });
}

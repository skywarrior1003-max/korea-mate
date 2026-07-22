// Server-side validation helpers for itinerary API routes.
// No external dependencies — plain TypeScript only.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY_BYTES           = 2 * 1024 * 1024; // 2 MB  (itinerary save — days JSONB can be large)
export const MAX_SMALL_BODY_BYTES     = 4 * 1024;         // 4 KB  (title-only patch, save-email, copy)
export const MAX_USER_SPOT_BODY_BYTES = 16 * 1024;        // 16 KB (user_spots — text fields only, no photo data)

// Shape of a place object within days.scheduled[n].places (JSONB, not enforced at DB level).
// source + place_id added in PHASE 1 to support user_spots alongside city_spots.
// All fields except name are optional — existing records without them remain valid.
export interface ItineraryPlace {
  name:          string;
  source?:       "city_spot" | "user_spot";
  place_id?:     string;   // BIGINT string for city_spots, UUID string for user_spots
  title?:        string;   // display label when source is known; mirrors name
  lat?:          number;
  lng?:          number;
  address?:      string;
  note?:         string;   // user-added note (user_spots)
  category?:     string;
  location?:     string;
  time?:         string;
  duration?:     string;
  tips?:         string;
  slot?:         string;
  googleMapsUrl?: string;
}

// Reads body as text, checks actual UTF-8 byte size, then parses JSON.
// Replaces request.json() so chunked / content-length-absent requests cannot bypass size limits.
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<
  | { ok: true;  body: unknown }
  | { ok: false; status: 400 | 413; error: string }
> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Failed to read request body" };
  }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, status: 413, error: "Request too large" };
  }
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}

export function isValidUUID(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

// Accepts v1 Day[] or v2 { __v:2, scheduled: Day[], unscheduled: CartItem[] }
export function isValidDays(days: unknown): boolean {
  if (Array.isArray(days)) return days.length <= 30;
  if (days !== null && typeof days === "object") {
    const d = days as Record<string, unknown>;
    if (
      d.__v === 2 &&
      Array.isArray(d.scheduled) &&
      Array.isArray(d.unscheduled)
    ) {
      return (d.scheduled as unknown[]).length <= 30 &&
             (d.unscheduled as unknown[]).length <= 500;
    }
  }
  return false;
}

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

export function optNum(v: unknown): number | undefined {
  if (typeof v !== "number" || !isFinite(v)) return undefined;
  return v;
}

// Three-state parser for optional nullable PUT fields (unlike optStr which loses null intent).
// undefined → field absent → keep existing DB value
// null      → field explicitly cleared → set DB NULL
// string    → non-empty value → update DB
export function nullableStr(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

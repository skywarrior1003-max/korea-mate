// Server-side validation helpers for itinerary API routes.
// No external dependencies — plain TypeScript only.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY_BYTES       = 2 * 1024 * 1024; // 2 MB  (itinerary save — days JSONB can be large)
export const MAX_SMALL_BODY_BYTES = 4 * 1024;         // 4 KB  (title-only patch, save-email)

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

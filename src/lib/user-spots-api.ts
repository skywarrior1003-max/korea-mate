// Client-side fetch wrappers for the user_spots server API routes.
// All reads/writes go through Cloudflare Pages Functions (service_role), never directly to Supabase.

import { getDeviceId } from "@/lib/deviceId";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserSpot {
  id:                 string;
  name:               string;
  city?:              string;
  address?:           string;
  lat?:               number;
  lng?:               number;
  category?:          string;
  note?:              string;
  photo_url?:         string;
  created_at:         string;
  updated_at:         string;
  submission_status?: "none" | "pending" | "approved" | "rejected";
}

export interface CreateUserSpotInput {
  name:      string;
  category?: string;
  city?:     string;
  address?:  string;
  lat?:      number;
  lng?:      number;
  note?:     string;
}

// PUT 3-state: undefined=keep, null=clear, string=update
export interface UpdateUserSpotInput {
  name:      string;
  category?: string;
  address?:  string | null;
  note?:     string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function deviceHeader(deviceId: string): HeadersInit {
  return { "Content-Type": "application/json", "x-device-id": deviceId };
}

function getHeader(deviceId: string): HeadersInit {
  return { "x-device-id": deviceId };
}

function safeError(res: Response): Error {
  const base = `HTTP ${res.status}`;
  if (res.status === 413) return new Error("Request too large");
  if (res.status === 503) return new Error("Service unavailable");
  if (res.status === 404) return new Error("Not found");
  if (res.status >= 500)  return new Error("Server error");
  return new Error(base);
}

// ── GET /api/user-spots ────────────────────────────────────────────────────────

export async function apiGetUserSpots(): Promise<UserSpot[]> {
  const deviceId = getDeviceId();
  let res: Response | null = null;
  try {
    res = await fetch("/api/user-spots", { headers: getHeader(deviceId) });
  } catch {
    throw new Error("Network error");
  }
  if (!res.ok) throw safeError(res);

  let data: unknown;
  try { data = await res.json(); } catch { throw new Error("Invalid response"); }
  if (!Array.isArray(data)) throw new Error("Invalid response");
  return data as UserSpot[];
}

// ── POST /api/user-spots ───────────────────────────────────────────────────────

export async function apiCreateUserSpot(
  input: CreateUserSpotInput,
): Promise<{ id: string }> {
  const deviceId = getDeviceId();

  // Whitelist body — no spread to prevent field injection
  const body: Record<string, unknown> = { name: input.name };
  if (input.category !== undefined) body.category = input.category;
  if (input.city     !== undefined) body.city      = input.city;
  if (input.address  !== undefined) body.address   = input.address;
  if (input.note     !== undefined) body.note      = input.note;
  if (input.lat      !== undefined) body.lat       = input.lat;
  if (input.lng      !== undefined) body.lng       = input.lng;

  let res: Response | null = null;
  try {
    res = await fetch("/api/user-spots", {
      method:  "POST",
      headers: deviceHeader(deviceId),
      body:    JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error");
  }

  if (!res.ok) throw safeError(res);

  let data: unknown;
  try { data = await res.json(); } catch { throw new Error("Invalid response"); }

  if (
    !data ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof (data as Record<string, unknown>).id !== "string"
  ) {
    throw new Error("Invalid response");
  }
  return { id: (data as { id: string }).id };
}

// ── PUT /api/user-spots/:id ───────────────────────────────────────────────────

export async function apiUpdateUserSpot(
  id:    string,
  input: UpdateUserSpotInput,
): Promise<boolean> {
  const deviceId = getDeviceId();

  // Whitelist body — null values intentionally sent to clear DB fields
  const body: Record<string, unknown> = { name: input.name };
  if (input.category !== undefined) body.category = input.category;
  // address and note: undefined=keep, null=clear, string=update
  if (input.address !== undefined) body.address = input.address;
  if (input.note    !== undefined) body.note    = input.note;

  let res: Response | null = null;
  try {
    res = await fetch(`/api/user-spots/${encodeURIComponent(id)}`, {
      method:  "PUT",
      headers: deviceHeader(deviceId),
      body:    JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error");
  }

  if (res.status === 404) return false;
  if (!res.ok) throw safeError(res);
  return true;
}

// ── PATCH /api/user-spots/submit/:id ─────────────────────────────────────────
// Returns: { ok: true } | { error: string }
// 409 = already pending/approved, 429 = pending limit reached

export async function apiSubmitUserSpot(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const deviceId = getDeviceId();
  let res: Response | null = null;
  try {
    res = await fetch(`/api/user-spots/submit/${encodeURIComponent(id)}`, {
      method:  "PATCH",
      headers: { "x-device-id": deviceId },
    });
  } catch {
    return { ok: false, error: "Network error" };
  }
  if (res.ok) return { ok: true };
  let msg = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch { /* ignore */ }
  return { ok: false, error: msg };
}

// ── DELETE /api/user-spots/:id ────────────────────────────────────────────────

export async function apiDeleteUserSpot(id: string): Promise<boolean> {
  const deviceId = getDeviceId();

  let res: Response | null = null;
  try {
    res = await fetch(`/api/user-spots/${encodeURIComponent(id)}`, {
      method:  "DELETE",
      headers: getHeader(deviceId),
    });
  } catch {
    throw new Error("Network error");
  }

  if (res.status === 404) return false;
  if (!res.ok) throw safeError(res);
  return true;
}

// Client-side fetch wrappers for the user_spots server API routes.
// All reads/writes go through Cloudflare Pages Functions (service_role), never directly to Supabase.

import { getDeviceId } from "@/lib/deviceId";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * 화면에 쓸 이름. 사용자가 이름을 적지 않은 장소도 있어서, 목록이 빈 줄로
 * 보이지 않게 여기서 한 번만 정한다.
 *
 * 이 값은 절대 저장하지 않는다. 저장하면 우리가 지어낸 이름이 그 장소의
 * 진짜 이름인 것처럼 굳는다. 화면에 그릴 때만 쓴다.
 *
 * 순서: 사용자가 적은 이름 → 사용자가 적은 주소 → 중립적인 기본 문구
 */
export function userSpotDisplayName(
  spot: { name?: string | null; address?: string | null },
  fallback: string,
): string {
  const name = (spot.name ?? "").trim();
  if (name) return name;
  const address = (spot.address ?? "").trim();
  if (address) return address;
  return fallback;
}

export interface UserSpot {
  id:                 string;
  /** 사용자가 적지 않았으면 없다. 화면에는 userSpotDisplayName 을 쓴다. */
  name:               string | null;
  city?:              string;
  address?:           string;
  lat?:               number;
  lng?:               number;
  category?:          string;
  note?:              string;
  photo_url?:         string;
  /** 사진이 있는지. 서버가 storage path 대신 이 boolean 만 내보낸다. */
  has_photo?:         boolean;
  /** 사진을 다른 여행자에게 공개해도 된다는 동의. 기본 false. */
  photo_public?:      boolean;
  created_at:         string;
  updated_at:         string;
  submission_status?: "none" | "pending" | "approved" | "rejected";
}

// 최소 식별 계약: name 또는 (lat AND lng). 서버와 DB CHECK 가 같은 규칙을
// 검사하므로 여기서 name 을 optional 로 열어도 빈 행은 만들어지지 않는다.
export interface CreateUserSpotInput {
  name?:     string;
  category?: string;
  city?:     string;
  address?:  string;
  lat?:      number;
  lng?:      number;
  note?:     string;
}

// PUT 3-state: undefined=keep, null=clear, string=update
//
// 좌표도 같은 3-state 로 고칠 수 있어야 한다. 생성 때만 넣을 수 있고 이후에
// 못 고치면, 좌표만 있는 장소는 영원히 그 좌표에 묶인다.
//
// 최소 식별 계약은 payload 만 봐서는 판정할 수 없다. 서버가 기존 행과 합친
// **최종 상태**를 보고 결정한다 — name 을 지우는 요청이 안전한지는 그 행에
// 좌표가 있는지에 달려 있기 때문이다.
export interface UpdateUserSpotInput {
  name?:     string | null;
  category?: string;
  address?:  string | null;
  note?:     string | null;
  lat?:      number | null;
  lng?:      number | null;
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
  // name 은 이제 선택이다. 값이 없으면 아예 보내지 않는다 — 빈 문자열을
  // 이름으로 저장하면 화면에는 이름이 없는데 DB 에는 있는 상태가 된다.
  const body: Record<string, unknown> = {};
  if (input.name     !== undefined) body.name      = input.name;
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
  const body: Record<string, unknown> = {};
  // name·address·note·lat·lng 는 3-state 다: undefined=유지 · null=지움 · 값=교체.
  // 서버가 기존 행과 합쳐 최소 식별 계약을 판정하므로, 지우려는 의도를 그대로
  // 실어 보내야 한다. 여기서 undefined 로 뭉개면 "이름을 지웠다" 가 전달되지 않는다.
  if (input.name     !== undefined) body.name     = input.name;
  if (input.category !== undefined) body.category = input.category;
  if (input.address  !== undefined) body.address  = input.address;
  if (input.note     !== undefined) body.note     = input.note;
  if (input.lat      !== undefined) body.lat      = input.lat;
  if (input.lng      !== undefined) body.lng      = input.lng;

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

// ── 사진 ──────────────────────────────────────────────────────────────────────
//
// 사진 바이트는 multipart 로만 보낸다. base64 로 감싸면 33% 커지고, 그 문자열이
// 상태나 저장소에 남으면 지우기 어려운 사본이 하나 더 생긴다.
//
// storage path 는 서버가 정하고 응답에도 담기지 않는다. 화면이 아는 것은
// "사진이 있다" 와, 필요할 때 받아 오는 만료되는 URL 뿐이다.

function photoBody(blob: Blob): FormData {
  const fd = new FormData();
  fd.append("photo", blob, "photo.jpg");
  return fd;
}

export interface CreateWithPhotoResult {
  ok: boolean;
  spot?: UserSpot;
  error?: string;
}

/**
 * 사진이 유일한 근거일 때 쓴다. 서버가 id 를 만들고, 파일을 올리고, 행을 넣는
 * 것까지 한 요청으로 처리한다. 실패하면 아무것도 남지 않는다.
 */
export async function apiCreateUserSpotWithPhoto(
  input: CreateUserSpotInput,
  photo: Blob,
): Promise<CreateWithPhotoResult> {
  const deviceId = getDeviceId();
  const fd = photoBody(photo);
  if (input.name     !== undefined) fd.append("name",     input.name);
  if (input.category !== undefined) fd.append("category", input.category);
  if (input.city     !== undefined) fd.append("city",     input.city);
  if (input.address  !== undefined) fd.append("address",  input.address);
  if (input.note     !== undefined) fd.append("note",     input.note);
  if (input.lat      !== undefined) fd.append("lat",      String(input.lat));
  if (input.lng      !== undefined) fd.append("lng",      String(input.lng));

  let res: Response;
  try {
    res = await fetch("/api/user-spots/with-photo", {
      method: "POST", headers: getHeader(deviceId), body: fd,
    });
  } catch {
    return { ok: false, error: "Network error" };
  }
  if (res.ok) {
    try { return { ok: true, spot: (await res.json()) as UserSpot }; }
    catch { return { ok: true }; }
  }
  return { ok: false, error: await errorMessage(res) };
}

/** 이미 있는 장소에 사진을 붙이거나 바꾼다. 교체해도 공개 동의는 물려받지 않는다. */
export async function apiUploadUserSpotPhoto(
  id: string,
  photo: Blob,
): Promise<{ ok: boolean; error?: string }> {
  const deviceId = getDeviceId();
  let res: Response;
  try {
    res = await fetch(`/api/user-spots/${encodeURIComponent(id)}/photo`, {
      method: "POST", headers: getHeader(deviceId), body: photoBody(photo),
    });
  } catch {
    return { ok: false, error: "Network error" };
  }
  if (res.ok) return { ok: true };
  return { ok: false, error: await errorMessage(res) };
}

/** 소유자 전용 · 600초 만료. 받은 URL 을 저장하지 않는다. */
export async function apiGetUserSpotPhotoUrl(
  id: string,
): Promise<{ signedUrl: string; expiresAt: string } | null> {
  const deviceId = getDeviceId();
  try {
    const res = await fetch(`/api/user-spots/${encodeURIComponent(id)}/photo-url`, {
      headers: getHeader(deviceId),
    });
    if (!res.ok) return null;
    return (await res.json()) as { signedUrl: string; expiresAt: string };
  } catch {
    return null;
  }
}

/**
 * 사진 자체를 지운다. 공개 동의를 끄는 것과 다르다.
 *
 * 사진이 그 장소의 유일한 근거이면 서버가 409 로 막는다. 그 경우 code 를
 * 그대로 돌려주어 화면이 사용자에게 뜻을 설명할 수 있게 한다.
 */
export async function apiDeleteUserSpotPhoto(
  id: string,
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const deviceId = getDeviceId();
  let res: Response;
  try {
    res = await fetch(`/api/user-spots/${encodeURIComponent(id)}/photo`, {
      method: "DELETE", headers: getHeader(deviceId),
    });
  } catch {
    return { ok: false, error: "Network error" };
  }
  if (res.ok) return { ok: true };
  let code: string | undefined;
  let error = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    code  = body.code;
    error = body.error ?? error;
  } catch { /* ignore */ }
  return { ok: false, code, error };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

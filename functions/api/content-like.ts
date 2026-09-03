// Cloudflare Pages Function — GET·POST /api/content-like
//
// 공개 Trip('itinerary') / 공개 Story('story') 좋아요. Heart = Like.
// GET  ?target_type=itinerary&target_key=<uuid>          → { count, liked }
// POST { target_type, target_key, action: "like"|"unlike" } → { count, liked }
//
// place-like(043 계열)와 같은 계약:
//   · raw device_id 를 저장하지도 로그에 남기지도 않는다 — 대상별 해시만.
//   · 클라이언트가 보내온 숫자를 믿지 않는다 — 최종 값은 서버가 다시 센다.
//   · 비공개 여행에는 어떤 상태도 만들지·보여주지 않는다(404 not_found).
//   · Story like 는 "공개 여행 + 공개 moment ≥1" 일 때만 존재하는 표면이다.
// Helpful 과는 다른 축이다 — helpful_count 를 읽지도 쓰지도 않는다.

import {
  validateContentLikeRequest, actorKey, likeState,
  isValidContentLikeTargetType, isValidContentLikeTargetKey, isValidDeviceId,
  type ContentLikeTargetType,
} from "../../src/lib/social/social-actions-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
type Ctx = { request: Request; env: Env };

const MAX_BODY_BYTES = 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rest(
  env: Env, method: string, pathQ: string, body?: unknown, prefer?: string,
): Promise<{ ok: boolean; status: number; data: unknown; contentRange: string | null }> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const res = await fetch(`${url}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, contentRange: res.headers.get("content-range") };
}

function configured(env: Env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** 대상이 실제로 좋아요를 받을 수 있는 공개 표면인가 */
async function publicTargetExists(
  env: Env, type: ContentLikeTargetType, key: string,
): Promise<boolean> {
  const trip = await rest(env, "GET",
    `itineraries?id=eq.${encodeURIComponent(key)}&is_public=eq.true&select=id&limit=1`);
  const tripOk = trip.ok && Array.isArray(trip.data) && trip.data.length > 0;
  if (!tripOk) return false;
  if (type === "itinerary") return true;
  // story: 공개로 고른 moment 가 하나라도 있어야 Story 표면이 존재한다
  const m = await rest(env, "GET",
    `trip_moments?itinerary_id=eq.${encodeURIComponent(key)}&is_public=eq.true&select=moment_id&limit=1`);
  return m.ok && Array.isArray(m.data) && m.data.length > 0;
}

async function countLikes(env: Env, type: string, key: string): Promise<number> {
  const r = await rest(env, "GET",
    `content_likes?target_type=eq.${type}&target_key=eq.${encodeURIComponent(key)}&select=id`,
    undefined, "count=exact");
  const total = r.contentRange?.split("/")?.[1];
  if (total && /^\d+$/.test(total)) return Number(total);
  return Array.isArray(r.data) ? r.data.length : 0;
}

async function likedByMe(env: Env, lkey: string): Promise<boolean> {
  const r = await rest(env, "GET", `content_likes?liker_key=eq.${lkey}&select=id&limit=1`);
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!configured(env)) return json({ error: "server_error" }, 500);
  const url = new URL(request.url);
  const type = url.searchParams.get("target_type");
  const key  = (url.searchParams.get("target_key") ?? "").trim().toLowerCase();
  if (!isValidContentLikeTargetType(type) || !isValidContentLikeTargetKey(key))
    return json({ error: "invalid_target" }, 400);
  if (!(await publicTargetExists(env, type, key))) return json({ error: "not_found" }, 404);

  const count = await countLikes(env, type, key);
  let liked = false;
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (isValidDeviceId(deviceId)) {
    liked = await likedByMe(env, await actorKey("like", deviceId, type, key));
  }
  return json(likeState(count, liked));
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!configured(env)) return json({ error: "server_error" }, 500);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "invalid_target" }, 400);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_target" }, 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateContentLikeRequest(body, deviceId);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.error === "invalid_device" ? 401 : 400);
  const r = parsed.value;

  if (!(await publicTargetExists(env, r.target_type, r.target_key)))
    return json({ error: "not_found" }, 404);

  const lkey = await actorKey("like", r.device_id, r.target_type, r.target_key);
  if (r.action === "like") {
    const ins = await rest(env, "POST", "content_likes",
      [{ target_type: r.target_type, target_key: r.target_key, liker_key: lkey }], "return=minimal");
    // 409 = 이미 눌렀음(UNIQUE) — 멱등 처리
    if (!ins.ok && ins.status !== 409) return json({ error: "server_error" }, 500);
  } else {
    const del = await rest(env, "DELETE",
      `content_likes?liker_key=eq.${lkey}&target_type=eq.${r.target_type}&target_key=eq.${encodeURIComponent(r.target_key)}`,
      undefined, "return=minimal");
    if (!del.ok) return json({ error: "server_error" }, 500);
  }

  const count = await countLikes(env, r.target_type, r.target_key);
  const liked = r.action === "like";
  return json(likeState(count, liked));
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}

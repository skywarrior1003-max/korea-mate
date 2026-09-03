// Cloudflare Pages Function — POST /api/share-event
//
// Share 행동 기록(비공개 raw signal). 브라우저는 상대방에게 실제 전달됐는지까지
// 알 수 없으므로 의미를 과장하지 않는다 — "공유 UI 에서 share/copy 행동이
// 일어났다" 는 사실만 남긴다. count 는 어떤 공개 API 로도 제공하지 않는다.
//
//   POST { target_type: "itinerary"|"story"|"city_spot", target_key,
//          method: "web_share"|"copy_link" } → 204
//
// dedup: 같은 사람(가명 키)·같은 대상·같은 방법 = 하루 1회(UNIQUE + created_day).
// 중복은 204 로 조용히 멱등 처리 — 클라이언트는 fire-and-forget 이다.

import {
  validateShareEventRequest, actorKey, type ShareTargetType,
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
): Promise<{ ok: boolean; status: number; data: unknown }> {
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
  return { ok: res.ok, status: res.status, data };
}

/** 공개 표면만 기록한다 — 비공개 여행/Story·미존재 장소는 404 */
async function shareTargetOk(env: Env, type: ShareTargetType, key: string): Promise<boolean> {
  if (type === "city_spot") {
    const r = await rest(env, "GET", `city_spots?id=eq.${encodeURIComponent(key)}&select=id&limit=1`);
    return r.ok && Array.isArray(r.data) && r.data.length > 0;
  }
  const trip = await rest(env, "GET",
    `itineraries?id=eq.${encodeURIComponent(key)}&is_public=eq.true&select=id&limit=1`);
  const tripOk = trip.ok && Array.isArray(trip.data) && trip.data.length > 0;
  if (!tripOk) return false;
  if (type === "itinerary") return true;
  const m = await rest(env, "GET",
    `trip_moments?itinerary_id=eq.${encodeURIComponent(key)}&is_public=eq.true&select=moment_id&limit=1`);
  return m.ok && Array.isArray(m.data) && m.data.length > 0;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return json({ error: "server_error" }, 500);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "invalid_target" }, 400);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_target" }, 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateShareEventRequest(body, deviceId);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.error === "invalid_device" ? 401 : 400);
  const r = parsed.value;

  if (!(await shareTargetOk(env, r.target_type, r.target_key)))
    return json({ error: "not_found" }, 404);

  const akey = await actorKey("share", r.device_id, r.target_type, r.target_key);
  const ins = await rest(env, "POST", "share_events",
    [{ target_type: r.target_type, target_key: r.target_key, actor_key: akey, method: r.method }],
    "return=minimal");
  // 409 = 오늘 이미 기록됨 — 멱등
  if (!ins.ok && ins.status !== 409) return json({ error: "server_error" }, 500);
  return new Response(null, { status: 204 });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

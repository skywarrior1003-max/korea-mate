// Cloudflare Pages Function — POST /api/place-usage
// (COMMUNITY-…-V2 §2 — "내 여행에 추가"의 고유 활용 신호)
//
//   POST { target_type: "city_spot", target_key } → 204
//
// 계약
//  · 활용 = 저장 또는 여행 추가 — 이 API 는 추가 축의 원인 이벤트를 기록한다.
//    저장 축은 place-save 가 같은 place_usage 에 기록한다(usage_key 동일 파생
//    → actor×장소당 1 행, 어떤 조합도 +3 한 번).
//  · 이벤트-누적형: 제거 동작이 없다(GET/DELETE 없음). count 도 공개하지 않는다.
//  · raw device_id 저장·로그 금지 — 대상별 해시만. best-effort 클라이언트
//    (fire-and-forget)라 실패해도 사용자 기능에는 영향이 없다.

import { actorKey } from "../../src/lib/social/social-actions-core";

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512;
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1; return true;
}

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ok: res.ok, status: res.status };
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "server_error" }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "invalid_target" }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return json({ error: "invalid_target" }, 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "invalid_device" }, 401);
  const key = typeof body.target_key === "string" ? body.target_key.trim() : String(body.target_key ?? "");
  if (body.target_type !== "city_spot" || !/^\d{1,10}$/.test(key)) return json({ error: "invalid_target" }, 400);
  if (!underRateLimit(deviceId.toLowerCase())) return json({ error: "rate_limited" }, 429);

  // 존재하는 공개 카탈로그 장소만 — user_spot 은 추천 순위 대상이 아니다(§2-1)
  const spotRes = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/city_spots?id=eq.${key}&select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  const spotRows = spotRes.ok ? await spotRes.json().catch(() => []) : null;
  if (!Array.isArray(spotRows)) return json({ error: "server_error" }, 500);
  if (spotRows.length === 0) return json({ error: "not_found" }, 404);

  const ukey = await actorKey("usage", deviceId.toLowerCase(), "city_spot", key);
  const ins = await rest(env, "POST", "place_usage",
    [{ target_type: "city_spot", target_key: key, usage_key: ukey, first_cause: "trip_add" }],
    "return=minimal");
  // 409(이미 활용) = 성공과 같다 — 멱등
  if (!ins.ok && ins.status !== 409) return json({ error: "server_error" }, 500);
  return new Response(null, { status: 204 });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

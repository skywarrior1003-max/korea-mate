// Cloudflare Pages Function — POST /api/place-suggestion
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §5-1)
//
// 사용자 장소 제안 V1 — 텍스트만 받는다. 외부 이미지 URL·사진 업로드 없음:
// 검증된 이미지는 승인 과정에서 카탈로그 파이프라인이 연결한다.
// 제안은 어떤 공개 화면에도 렌더되지 않는다(관리자 검토 전용).

import { validateSuggestion } from "../../src/lib/community/community-core";
import { actorKey } from "../../src/lib/social/social-actions-core";

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60_000; // 제안은 드문 행동이다 — 10분 5건이면 충분

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (error: string, status: number) => json({ success: false, error }, status);

const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1; return true;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_request", 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return fail("invalid_device", 401);
  if (!underRateLimit(deviceId.toLowerCase())) return fail("rate_limited", 429);

  const parsed = validateSuggestion(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  const v = parsed.value;

  // raw device_id 는 저장하지 않는다 — 도시 축 해시만(같은 사람의 도배 식별용).
  const suggesterKey = await actorKey("share", deviceId.toLowerCase(), "place_suggestion", v.city);

  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/place_suggestions`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify([{
      city: v.city, name: v.name, category: v.category, address: v.address,
      reason: v.reason, official_link: v.official_link, suggester_key: suggesterKey,
    }]),
  });
  if (!res.ok) {
    console.log(JSON.stringify({ action: "place-suggestion", status: "insert_failed", httpStatus: res.status }));
    return fail("server_error", 500);
  }
  return json({ success: true, status: "received" }, 201);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

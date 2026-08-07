// Cloudflare Pages Function — GET·POST /api/place-like
//
// GET  ?target_type=city_spot&target_key=99  →  { count, liked }
// POST { target_type, target_key, action: "like" | "unlike" }  →  { count, liked }
//
// SECURITY CONTRACT
// - service_role 키는 서버에서만 쓴다. 브라우저로 나가지 않는다.
// - 브라우저가 place_likes 에 직접 접근할 수 없다(043 이 권한을 닫는다).
// - raw device_id 를 저장하지도 로그에 남기지도 않는다. 대상별 해시만 쓴다.
// - 응답은 숫자와 "내 상태" 뿐이다. 누가 좋아했는지는 절대 나가지 않는다.
// - 좋아요는 Saved 를 바꾸지 않고, 신고 수와 합산되지 않는다.

import { reserveLikeMilestones } from "../_lib/admin-notify";
import { likeNotificationCandidates } from "../../src/lib/notifications/admin-notification-core";
import {
  validateLikeRequest, likerKey, likeState,
  isValidLikeTargetType, isValidLikeTargetKey, isValidDeviceId,
  MAX_BODY_BYTES, LIKE_RATE_MAX, LIKE_RATE_WINDOW_MS,
  type LikeErrorCode, type LikeTargetType,
} from "../../src/lib/likes/place-like-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface Ctx {
  request: Request;
  env: Env;
  /** Cloudflare 가 넘겨준다. 알림은 이 안에서 돌려 사용자 응답을 붙잡지 않는다. */
  waitUntil?: (p: Promise<unknown>) => void;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (error: LikeErrorCode, status: number) => json({ success: false, error }, status);

/** 로그에 개인 식별값을 넣지 않는다. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "place-like", ...fields }));
}

const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + LIKE_RATE_WINDOW_MS }); return true; }
  if (hit.count >= LIKE_RATE_MAX) return false;
  hit.count += 1;
  return true;
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

/** 서버가 직접 센다. 클라이언트가 보내온 숫자를 믿지 않는다. */
async function countLikes(env: Env, type: LikeTargetType, key: string): Promise<number> {
  const r = await rest(env, "GET",
    `place_likes?target_type=eq.${type}&target_key=eq.${encodeURIComponent(key)}&select=id`,
    undefined, "count=exact");
  const total = r.contentRange?.split("/")?.[1];
  if (total && /^\d+$/.test(total)) return Number(total);
  return Array.isArray(r.data) ? r.data.length : 0;
}

async function likedByMe(env: Env, lkey: string): Promise<boolean> {
  const r = await rest(env, "GET", `place_likes?liker_key=eq.${lkey}&select=id&limit=1`);
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

/** 대상이 실제로 존재하는 공개 장소인가 */
async function targetExists(env: Env, key: string): Promise<boolean> {
  const r = await rest(env, "GET", `city_spots?id=eq.${encodeURIComponent(key)}&select=id&limit=1`);
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

function configured(env: Env): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!configured(env)) return fail("server_error", 503);

  const u = new URL(request.url);
  const type = u.searchParams.get("target_type");
  const key  = (u.searchParams.get("target_key") ?? "").trim();
  if (!isValidLikeTargetType(type) || !isValidLikeTargetKey(type, key)) {
    return fail("invalid_target", 400);
  }

  const count = await countLikes(env, type, key);

  // device 헤더가 유효할 때만 "내가 눌렀는가" 를 계산한다. 없으면 그냥 false.
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  let liked = false;
  if (isValidDeviceId(deviceId)) {
    liked = await likedByMe(env, await likerKey(deviceId, type, key));
  }
  return json(likeState(count, liked));
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!configured(env)) return fail("server_error", 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_target", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_target", 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateLikeRequest(body, deviceId);
  if (!parsed.ok) {
    return fail(parsed.error, parsed.error === "invalid_device" ? 401 : 400);
  }
  const r = parsed.value;

  if (!underRateLimit(deviceId)) return fail("rate_limited", 429);

  if (!(await targetExists(env, r.target_key))) {
    log({ status: "invalid_target", target_type: r.target_type });
    return fail("invalid_target", 404);
  }

  const lkey = await likerKey(r.device_id, r.target_type, r.target_key);

  if (r.action === "like") {
    // 유니크 위반(23505)은 "이미 눌러져 있다" 는 뜻이지 오류가 아니다.
    const ins = await rest(env, "POST", "place_likes",
      [{ target_type: r.target_type, target_key: r.target_key, liker_key: lkey }], "return=minimal");
    const dup = ins.status === 409 || (ins.data as { code?: string } | null)?.code === "23505";
    if (!ins.ok && !dup) {
      log({ status: "insert_failed", httpStatus: ins.status, target_type: r.target_type });
      return fail("server_error", 500);
    }
  } else {
    const del = await rest(env, "DELETE", `place_likes?liker_key=eq.${lkey}`, undefined, "return=minimal");
    if (!del.ok) {
      log({ status: "delete_failed", httpStatus: del.status, target_type: r.target_type });
      return fail("server_error", 500);
    }
  }

  // 최종 상태는 언제나 서버가 다시 센 값이다. 연타해도 ±2 가 되지 않는다.
  const count = await countLikes(env, r.target_type, r.target_key);

  // ── 운영 알림 후보 ────────────────────────────────────────────────────────
  // 좋아요는 급한 신호가 아니다. **메일을 보내지 않고** 단계 기록만 남긴다.
  // 취소는 아무것도 만들지 않는다 — 내려갔다 올라와도 같은 단계는 한 번뿐이다.
  if (r.action === "like") {
    const notify = (async () => {
      try {
        await reserveLikeMilestones(ctx.env, likeNotificationCandidates(r.target_key, count));
      } catch {
        log({ status: "notify_failed", target_type: r.target_type });
      }
    })();
    if (ctx.waitUntil) ctx.waitUntil(notify); else void notify;
  }

  log({ status: "ok", op: r.action, target_type: r.target_type });
  return json(likeState(count, r.action === "like"));
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}

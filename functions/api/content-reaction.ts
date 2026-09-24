// Cloudflare Pages Function — GET·POST /api/content-reaction
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1)
//
// 추천 장소(city_spot)·공개 Story(story)의 좋아요/싫어요 단일 진입점.
//   GET  ?target_type=&target_key=            → { likeCount, myReaction }
//   POST { target_type, target_key, action: "like"|"dislike"|"clear" } → 동일
//
// 계약
//  · 좋아요 SSOT 는 기존 테이블 그대로다 — city_spot → place_likes,
//    story → content_likes. 이 API 는 새 좋아요 저장소를 만들지 않는다.
//  · 싫어요는 content_dislikes(068). 숫자는 어떤 응답에도 넣지 않는다.
//  · 상호 배타: 반응을 넣기 전에 반대편 행을 지운다. 두 쓰기가 한 트랜잭션은
//    아니지만 각 행이 actor 해시 unique 라 연타·경합에도 개수가 부풀지 않고,
//    최종 응답은 항상 서버가 다시 센 값이다.
//  · raw device_id 저장·로그 금지 — 대상별 해시만.

import {
  validateReactionRequest, reactionState, type MyReaction, type ReactionTargetType,
} from "../../src/lib/community/community-core";
import { actorKey } from "../../src/lib/social/social-actions-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
type Ctx = { request: Request; env: Env };

const MAX_BODY_BYTES = 1024;
const RATE_MAX = 30;
const RATE_WINDOW_MS = 60_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (error: string, status: number) => json({ success: false, error }, status);
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "content-reaction", ...fields }));
}

const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1;
  return true;
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
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, contentRange: res.headers.get("content-range") };
}

/** 좋아요가 사는 곳 — 기존 계약 그대로 */
const LIKE_TABLE: Record<ReactionTargetType, { table: string; keyCol: string }> = {
  city_spot: { table: "place_likes",  keyCol: "liker_key" },
  story:     { table: "content_likes", keyCol: "liker_key" },
};

async function countLikes(env: Env, type: ReactionTargetType, key: string): Promise<number> {
  const t = LIKE_TABLE[type];
  const r = await rest(env, "GET",
    `${t.table}?target_type=eq.${type}&target_key=eq.${encodeURIComponent(key)}&select=id`,
    undefined, "count=exact");
  const total = r.contentRange?.split("/")?.[1];
  return total && /^\d+$/.test(total) ? Number(total) : (Array.isArray(r.data) ? r.data.length : 0);
}

async function myReaction(env: Env, likeKey: string, dislikeKey: string): Promise<MyReaction> {
  const [likes, dislikes] = await Promise.all([
    rest(env, "GET", `place_likes?liker_key=eq.${likeKey}&select=id&limit=1`),
    rest(env, "GET", `content_dislikes?disliker_key=eq.${dislikeKey}&select=id&limit=1`),
  ]);
  // place_likes 에 없으면 content_likes 도 본다(두 테이블은 대상 축이 달라 한쪽만 맞는다)
  const likedPlace = likes.ok && Array.isArray(likes.data) && likes.data.length > 0;
  if (likedPlace) return "like";
  const likedStory = await rest(env, "GET", `content_likes?liker_key=eq.${likeKey}&select=id&limit=1`);
  if (likedStory.ok && Array.isArray(likedStory.data) && likedStory.data.length > 0) return "like";
  if (dislikes.ok && Array.isArray(dislikes.data) && dislikes.data.length > 0) return "dislike";
  return null;
}

/** 대상 실존 검증 — 삭제된 장소·비공개 Story 에는 어떤 반응도 못 남긴다 */
async function targetExists(env: Env, type: ReactionTargetType, key: string): Promise<boolean> {
  if (type === "city_spot") {
    const r = await rest(env, "GET", `city_spots?id=eq.${encodeURIComponent(key)}&select=id&limit=1`);
    return r.ok && Array.isArray(r.data) && r.data.length > 0;
  }
  const r = await rest(env, "GET",
    `itineraries?id=eq.${encodeURIComponent(key)}&is_public=eq.true&select=id,moderation_hidden_at&limit=1`);
  const row = Array.isArray(r.data) ? r.data[0] as { moderation_hidden_at: string | null } | undefined : undefined;
  return !!row && row.moderation_hidden_at === null;
}

async function state(env: Env, type: ReactionTargetType, key: string, deviceId: string | null) {
  const count = await countLikes(env, type, key);
  if (!deviceId) return reactionState(count, null);
  const [lk, dk] = await Promise.all([
    actorKey("like", deviceId, type, key),
    actorKey("dislike", deviceId, type, key),
  ]);
  return reactionState(count, await myReaction(env, lk, dk));
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);
  const u = new URL(request.url);
  const probe = validateReactionRequest(
    { target_type: u.searchParams.get("target_type"), target_key: u.searchParams.get("target_key"), action: "clear" },
    (request.headers.get("x-device-id") ?? "").trim() || "00000000-0000-4000-8000-000000000000",
  );
  if (!probe.ok) return fail(probe.error, 400);
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  return json(await state(env, probe.value.target_type, probe.value.target_key,
    /^[0-9a-f-]{36}$/i.test(deviceId) ? deviceId.toLowerCase() : null));
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_target", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_target", 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateReactionRequest(body, deviceId);
  if (!parsed.ok) return fail(parsed.error, parsed.error === "invalid_device" ? 401 : 400);
  const r = parsed.value;

  if (!underRateLimit(r.device_id)) return fail("rate_limited", 429);
  if (!(await targetExists(env, r.target_type, r.target_key))) {
    log({ status: "invalid_target", target_type: r.target_type });
    return fail("invalid_target", 404);
  }

  const likeT = LIKE_TABLE[r.target_type];
  const [likeKey, dislikeKey] = await Promise.all([
    actorKey("like", r.device_id, r.target_type, r.target_key),
    actorKey("dislike", r.device_id, r.target_type, r.target_key),
  ]);

  const delLike = () => rest(env, "DELETE", `${likeT.table}?${likeT.keyCol}=eq.${likeKey}`, undefined, "return=minimal");
  const delDislike = () => rest(env, "DELETE", `content_dislikes?disliker_key=eq.${dislikeKey}`, undefined, "return=minimal");

  if (r.action === "like") {
    await delDislike();
    const ins = await rest(env, "POST", likeT.table,
      [{ target_type: r.target_type, target_key: r.target_key, [likeT.keyCol]: likeKey }], "return=minimal");
    const dup = ins.status === 409 || (ins.data as { code?: string } | null)?.code === "23505";
    if (!ins.ok && !dup) { log({ status: "like_insert_failed", httpStatus: ins.status }); return fail("server_error", 500); }
  } else if (r.action === "dislike") {
    await delLike();
    const ins = await rest(env, "POST", "content_dislikes",
      [{ target_type: r.target_type, target_key: r.target_key, disliker_key: dislikeKey }], "return=minimal");
    const dup = ins.status === 409 || (ins.data as { code?: string } | null)?.code === "23505";
    if (!ins.ok && !dup) { log({ status: "dislike_insert_failed", httpStatus: ins.status }); return fail("server_error", 500); }
  } else {
    const [a, b] = await Promise.all([delLike(), delDislike()]);
    if (!a.ok || !b.ok) { log({ status: "clear_failed" }); return fail("server_error", 500); }
  }

  log({ status: "ok", op: r.action, target_type: r.target_type });
  return json(await state(env, r.target_type, r.target_key, r.device_id));
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}

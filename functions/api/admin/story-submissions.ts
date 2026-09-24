// Cloudflare Pages Function — GET·POST /api/admin/story-submissions
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §5-3 사람 최종승인)
//
// Auth: 기존 관리자 계약 그대로 — x-admin-key 헤더를 ADMIN_KEY(서버 전용)로
// 검증(fail-closed). 공개 admin endpoint 를 새로 만들지 않는다.
//
//   GET  ?status=pending&city=busan → { items: [...] } (검토 큐)
//   POST { id, action: "approve"|"reject", note? } → { success, status }
//
// 승인만이 추천 노출의 유일한 경로다 — recommendations API 는 approved 만 읽는다.

import { json, checkAdminAuth } from "../../_lib/admin-auth";
import { SUBMISSION_STATUSES } from "../../../src/lib/community/community-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ADMIN_KEY?: string;
}
type Ctx = { request: Request; env: Env };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const authErr = checkAdminAuth(ctx.request, ctx.env.ADMIN_KEY);
  if (authErr) return authErr;
  if (!ctx.env.NEXT_PUBLIC_SUPABASE_URL || !ctx.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server configuration error" }, 503);
  }
  const u = new URL(ctx.request.url);
  const status = u.searchParams.get("status") ?? "pending";
  if (!(SUBMISSION_STATUSES as readonly string[]).includes(status)) {
    return json({ error: "invalid_status" }, 400);
  }
  const city = (u.searchParams.get("city") ?? "").trim();
  const cityQ = /^[a-z]{2,32}$/.test(city) ? `&city=eq.${city}` : "";
  const r = await rest(ctx.env, "GET",
    `story_submissions?status=eq.${status}${cityQ}` +
    `&select=id,itinerary_id,city,status,submitted_at,decided_at,decided_note` +
    `&order=submitted_at.asc&limit=100`);
  if (!r.ok) return json({ error: "query_failed" }, 500);
  // 검토는 공개 Story 화면(/shared/?id=)에서 한다 — 개인 데이터는 내보내지 않는다.
  return json({ items: Array.isArray(r.data) ? r.data : [] });
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const authErr = checkAdminAuth(ctx.request, ctx.env.ADMIN_KEY);
  if (authErr) return authErr;
  if (!ctx.env.NEXT_PUBLIC_SUPABASE_URL || !ctx.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server configuration error" }, 503);
  }
  let body: Record<string, unknown>;
  try { body = await ctx.request.json() as Record<string, unknown>; }
  catch { return json({ error: "invalid_body" }, 400); }

  const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
  if (!UUID_RE.test(id)) return json({ error: "invalid_id" }, 400);
  const action = body.action;
  if (action !== "approve" && action !== "reject") return json({ error: "invalid_action" }, 400);
  const noteRaw = body.note;
  if (noteRaw !== undefined && noteRaw !== null && typeof noteRaw !== "string") {
    return json({ error: "invalid_note" }, 400);
  }
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 500) : null;

  // 승인 시점에도 공개·비가림을 다시 확인한다 — 제출 후 상태가 바뀐 Story 를
  // 승인으로 노출하지 않는다.
  if (action === "approve") {
    const cur = await rest(ctx.env, "GET",
      `story_submissions?id=eq.${id}&select=itinerary_id&limit=1`);
    const sub = Array.isArray(cur.data) ? cur.data[0] as { itinerary_id: string } | undefined : undefined;
    if (!sub) return json({ error: "not_found" }, 404);
    const trip = await rest(ctx.env, "GET",
      `itineraries?id=eq.${sub.itinerary_id}&is_public=eq.true&select=id,moderation_hidden_at&limit=1`);
    const row = Array.isArray(trip.data) ? trip.data[0] as { moderation_hidden_at: string | null } | undefined : undefined;
    if (!row || row.moderation_hidden_at !== null) return json({ error: "story_not_public" }, 409);
  }

  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  // V2 §4-3 — 결정은 pending 에서만 유효하다. approved 재승인·withdrawn 승인 같은
  // 전이는 조용히 덮지 않고 409 로 거절한다(철회한 제출을 관리자가 되살릴 수 없다).
  const up = await rest(ctx.env, "PATCH", `story_submissions?id=eq.${id}&status=eq.pending`,
    { status, decided_at: now, decided_note: note, updated_at: now }, "return=representation");
  if (!up.ok) return json({ error: "update_failed" }, 500);
  if (!Array.isArray(up.data) || up.data.length === 0) {
    const cur = await rest(ctx.env, "GET", `story_submissions?id=eq.${id}&select=status&limit=1`);
    const row = Array.isArray(cur.data) ? cur.data[0] as { status?: string } | undefined : undefined;
    if (!row) return json({ error: "not_found" }, 404);
    return json({ error: "already_decided", status: row.status }, 409);
  }
  return json({ success: true, status });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}

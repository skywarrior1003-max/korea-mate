// Cloudflare Pages Function — GET·POST /api/admin/place-suggestions
// Auth: x-admin-key + ADMIN_KEY (fail-closed) — 기존 관리자 계약 그대로.
//   GET  ?status=pending&city=busan → { items }
//   POST { id, action: "accept"|"decline" } → { success, status }

import { json, checkAdminAuth } from "../../_lib/admin-auth";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ADMIN_KEY?: string;
}
type Ctx = { request: Request; env: Env };

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
  if (!["pending", "accepted", "declined"].includes(status)) return json({ error: "invalid_status" }, 400);
  const city = (u.searchParams.get("city") ?? "").trim();
  const cityQ = /^[a-z]{2,32}$/.test(city) ? `&city=eq.${city}` : "";
  const r = await rest(ctx.env, "GET",
    `place_suggestions?status=eq.${status}${cityQ}` +
    `&select=id,city,name,category,address,reason,official_link,status,created_at` +
    `&order=created_at.asc&limit=200`);
  if (!r.ok) return json({ error: "query_failed" }, 500);
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
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: "invalid_id" }, 400);
  const action = body.action;
  if (action !== "accept" && action !== "decline") return json({ error: "invalid_action" }, 400);
  const status = action === "accept" ? "accepted" : "declined";
  // V2 §4-3 — pending 에서만 전이(중복 결정 409). accepted 는 city_spots SSOT 에
  // 아무것도 만들지 않는다 — 반영은 기존 카탈로그 파이프라인의 별도 절차다.
  const up = await rest(ctx.env, "PATCH", `place_suggestions?id=eq.${id}&status=eq.pending`,
    { status }, "return=representation");
  if (!up.ok) return json({ error: "update_failed" }, 500);
  if (!Array.isArray(up.data) || up.data.length === 0) {
    const cur = await rest(ctx.env, "GET", `place_suggestions?id=eq.${id}&select=status&limit=1`);
    const row = Array.isArray(cur.data) ? cur.data[0] as { status?: string } | undefined : undefined;
    if (!row) return json({ error: "not_found" }, 404);
    return json({ error: "already_decided", status: row.status }, 409);
  }
  return json({ success: true, status });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
}

// /api/trip-draft — This Trip 계정/게스트 draft 조회 (DURABILITY-V1 개편)
//
// 저장은 더 이상 스냅숏 PUT 이 아니다 — 모든 변경은 /api/trip-draft/ops 의
// 작업 단위 mutation(서버 원자 RPC)으로만 흐른다(§4.2). 이 파일은 GET 만
// 남긴다: { items, context, revision, updated_at }. revision 은 서버만
// 증가시키는 변경 세대다(PII 아님). raw owner id 는 응답에 없다.
//
// 소유권은 공통 판정기 하나(resolveOwnership) — guest=자기 device 행,
// active account=user 행, linked device 무세션/타계정/미동의는 거부.

import { resolveOwnership, type OwnershipEnv, type Ownership } from "../_lib/ownership.ts";

interface Env extends OwnershipEnv { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export function ownerOf(own: Extract<Ownership, { ok: true }>): { owner_type: "device" | "user"; owner_id: string } {
  return own.mode === "account"
    ? { owner_type: "user", owner_id: own.userId }
    : { owner_type: "device", owner_id: own.currentDevice };
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;
  const o = ownerOf(own);
  const res = await fetch(
    `${ctx.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trip_drafts` +
    `?owner_type=eq.${o.owner_type}&owner_id=eq.${o.owner_id}&select=items,context,revision,updated_at&limit=1`,
    { headers: { apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!res.ok) return json({ error: "server_error" }, 500);
  const rows = (await res.json().catch(() => [])) as Array<{ items?: unknown; context?: unknown; revision?: number; updated_at?: string }>;
  const row = rows[0];
  return json({
    items: Array.isArray(row?.items) ? row.items : [],
    context: row?.context ?? null,
    revision: typeof row?.revision === "number" ? row.revision : null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
}

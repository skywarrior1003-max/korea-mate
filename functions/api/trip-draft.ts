// /api/trip-draft — This Trip(생성 전 바구니) 계정/게스트 스냅숏 (THIS-TRIP-SYNC-V1)
//
// 소유권은 공통 판정기 하나: guest = 자기 device 행, active account = user 행.
// linked device 의 무세션/타계정/미동의 요청은 판정기가 거부한다(§3.2).
// 클라이언트는 device 목록을 받지 않고(서버가 owner 축을 정한다), body 의
// user/device 값은 신원이 아니다. 응답은 items·updated_at 뿐 — raw id 없음.
//
//  GET    → { items, updated_at } (행 없으면 items: [])
//  PUT    → body { items: CartItem[] } 전체 스냅숏 upsert(≤120개·≤256KB)
//  DELETE → 행 제거(clearCart)
//
// 같은 계정 두 기기의 동시 편집은 마지막 스냅숏이 이긴다(§7 — 새로고침 반영
// 계약). 서로 다른 여행의 폐기가 아니다: 병합·보존은 activate 의 1회 병합과
// 카트의 다도시 배열 모델이 담당한다.

import { resolveOwnership, type OwnershipEnv, type Ownership } from "../_lib/ownership.ts";

interface Env extends OwnershipEnv { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const MAX_ITEMS = 120;
const MAX_BODY_BYTES = 256 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function ownerOf(own: Extract<Ownership, { ok: true }>): { owner_type: "device" | "user"; owner_id: string } {
  return own.mode === "account"
    ? { owner_type: "user", owner_id: own.userId }
    : { owner_type: "device", owner_id: own.currentDevice };
}

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;
  const o = ownerOf(own);
  const r = await rest(ctx.env, "GET",
    `trip_drafts?owner_type=eq.${o.owner_type}&owner_id=eq.${o.owner_id}&select=items,updated_at&limit=1`);
  if (!r.ok) return json({ error: "server_error" }, 500);
  const row = Array.isArray(r.data) ? (r.data[0] as { items?: unknown; updated_at?: string } | undefined) : undefined;
  return json({ items: Array.isArray(row?.items) ? row.items : [], updated_at: row?.updated_at ?? null });
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;
  const raw = await ctx.request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  let body: unknown = null; try { body = JSON.parse(raw); } catch { return json({ error: "invalid_body" }, 400); }
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return json({ error: "invalid_items" }, 400);
  const o = ownerOf(own);
  const r = await rest(ctx.env, "POST", "trip_drafts?on_conflict=owner_type,owner_id",
    [{ ...o, items, updated_at: new Date().toISOString() }],
    "resolution=merge-duplicates,return=minimal");
  if (!r.ok) return json({ error: "server_error" }, 500);
  return new Response(null, { status: 204 });
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;
  const o = ownerOf(own);
  const r = await rest(ctx.env, "DELETE",
    `trip_drafts?owner_type=eq.${o.owner_type}&owner_id=eq.${o.owner_id}`, undefined, "return=minimal");
  if (!r.ok) return json({ error: "server_error" }, 500);
  return new Response(null, { status: 204 });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, PUT, DELETE, OPTIONS" } });
}

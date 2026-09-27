// POST /api/trip-draft/ops — This Trip 작업 단위 mutation (DURABILITY-V1 §4)
//
// body: { op_id, type, payload } 하나.
//  · op_id — 클라이언트 재시도용 고유 id(UUID 형태·PII 아님). 같은 op_id 는
//    서버가 한 번만 적용한다(revision 중복 증가 0·항목 중복 0).
//  · type ∈ add_item | update_item | remove_item | reorder_items |
//    clear_items | set_trip_context — payload 는 타입별 allowlist 로만 통과.
//  · owner 는 body 가 아니라 resolveOwnership 결과다(§9 — 주입 불신).
//  · 적용은 DB 원자 RPC(trip_draft_apply, row FOR UPDATE)에서만 일어난다 —
//    Functions 인스턴스 몇 개가 동시에 와도 안전하고, 조건 없는 UPDATE 가 없다.
// 응답: { revision, applied, items, context } — raw id·hash 없음.

import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership.ts";
import { ownerOf } from "../trip-draft.ts";

interface Env extends OwnershipEnv { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const MAX_BODY = 32 * 1024;
const OP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OP_TYPES = ["add_item", "update_item", "remove_item", "reorder_items", "clear_items", "set_trip_context"] as const;
const KEY_RE = /^[\w.:|-]{1,200}$/; // 복합 identity(tripCity|sourceKey)의 구분자 | 포함
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** prototype-pollution 계열 키 거부 + 항목 크기 상한 */
function safeItem(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const it = v as Record<string, unknown>;
  for (const bad of ["__proto__", "constructor", "prototype"]) {
    if (Object.prototype.hasOwnProperty.call(it, bad)) return null; // own key 만 — 상속 constructor 는 정상
  }
  const key = String(it.sourceKey ?? it.id ?? "");
  if (!KEY_RE.test(key)) return null;
  if (JSON.stringify(it).length > 8 * 1024) return null;
  return it;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;

  const raw = await ctx.request.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
  let body: { op_id?: unknown; type?: unknown; payload?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_body" }, 400); }

  const opId = String(body.op_id ?? "");
  if (!OP_ID_RE.test(opId)) return json({ error: "invalid_op_id" }, 400);
  const type = String(body.type ?? "");
  if (!(OP_TYPES as readonly string[]).includes(type)) return json({ error: "invalid_op_type" }, 400);
  const p = (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload))
    ? body.payload as Record<string, unknown> : {};

  // 타입별 payload allowlist — 임의 JSON 저장 금지(§9)
  let payload: Record<string, unknown>;
  if (type === "add_item") {
    const item = safeItem(p.item);
    if (!item) return json({ error: "invalid_item" }, 400);
    payload = { item };
  } else if (type === "update_item") {
    const item = safeItem(p.item);
    const key = String(p.key ?? "");
    if (!item || !KEY_RE.test(key)) return json({ error: "invalid_item" }, 400);
    payload = { key, item };
  } else if (type === "remove_item") {
    const key = String(p.key ?? "");
    if (!KEY_RE.test(key)) return json({ error: "invalid_key" }, 400);
    payload = { key };
  } else if (type === "reorder_items") {
    const keys = Array.isArray(p.keys) ? p.keys.map(String) : null;
    if (!keys || keys.length > 120 || keys.some(k => !KEY_RE.test(k))) return json({ error: "invalid_keys" }, 400);
    payload = { keys };
  } else if (type === "set_trip_context") {
    const c = (p.context && typeof p.context === "object") ? p.context as Record<string, unknown> : {};
    const city = String(c.city ?? ""); const s = String(c.startDate ?? ""); const e = String(c.endDate ?? "");
    if (city.length < 1 || city.length > 64 || !DATE_RE.test(s) || !DATE_RE.test(e)) return json({ error: "invalid_context" }, 400);
    payload = { context: { city, startDate: s, endDate: e } };
  } else {
    payload = {}; // clear_items
  }

  const o = ownerOf(own);
  const res = await fetch(`${ctx.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/trip_draft_apply`, {
    method: "POST",
    headers: {
      apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_owner_type: o.owner_type, p_owner_id: o.owner_id, p_op_id: opId, p_op_type: type, p_payload: payload }),
  });
  if (!res.ok) return json({ error: "server_error" }, 500);
  const rows = (await res.json().catch(() => [])) as Array<{ revision: number; applied: boolean; items: unknown; context: unknown }>;
  const r = rows[0];
  if (!r) return json({ error: "server_error" }, 500);
  return json({ revision: r.revision, applied: r.applied, items: r.items ?? [], context: r.context ?? null });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

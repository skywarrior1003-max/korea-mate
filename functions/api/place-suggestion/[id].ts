// Cloudflare Pages Function — DELETE /api/place-suggestion/:id
// (UGC-DELETE-PROPAGATION-V1 §D — pending 제보 철회)
//
// 계약
//  · 소유 판정: 저장된 suggester_key(도시 축 해시)와, 요청 기기의 x-device-id 로
//    같은 방식(actorKey "share")으로 재계산한 값의 일치. raw device 는 저장돼
//    있지 않으므로 이 재계산이 유일한 소유 증명이다.
//  · pending 만 삭제한다. 이미 결정된 제보(accepted/declined)는 409 —
//    admin decide 의 already_decided 계약(pending 전용)과 같은 톤이다.
//    accepted 라도 canonical city_spots 는 admin 이 별도 생성한 독립 row 라
//    여기서는 어떤 경우에도 city_spots 를 건드리지 않는다.
//  · 남의 제보·없는 제보 = 404(구분 없이 — 존재 여부를 알려주지 않는다).
//    반복 철회는 행이 이미 없으므로 404 — 안전하다.
//  · 응답에 suggester_key·해시·내부 값은 싣지 않는다.

import { actorKey } from "../../../src/lib/social/social-actions-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?:  string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
type Ctx = { request: Request; env: Env; params: { id: string } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// place_suggestions.id 는 BIGINT IDENTITY(068:63) — UUID 가 아니다.
const SUGGESTION_ID_RE = /^[0-9]{1,12}$/;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const fail = (error: string, status: number) => json({ success: false, error }, status);

function headers(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);

  const id = String(ctx.params.id ?? "");
  if (!SUGGESTION_ID_RE.test(id)) return fail("not_found", 404);
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return fail("invalid_device", 401);

  // 소유 판정 재료(city)는 행에서 읽는다 — suggester_key 는 도시 축 해시라
  // city 없이는 재계산할 수 없다.
  const readRes = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/place_suggestions` +
    `?id=eq.${encodeURIComponent(id)}&select=id,city,status,suggester_key&limit=1`,
    { headers: headers(env) });
  if (!readRes.ok) return fail("server_error", 500);
  const rows = (await readRes.json().catch(() => [])) as
    { id: string; city: string; status: string; suggester_key: string }[];
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return fail("not_found", 404);

  const mine = await actorKey("share", deviceId.toLowerCase(), "place_suggestion", row.city);
  if (mine !== row.suggester_key) return fail("not_found", 404); // 타인 것 — 존재를 알리지 않는다

  if (row.status !== "pending") return fail("already_decided", 409);

  // pending + 본인 조건을 DELETE 의 WHERE 에도 다시 건다 — 읽기와 삭제 사이의
  // 경합(그 사이 admin 이 결정)에서 결정된 행을 지우지 않기 위해서다.
  const delRes = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/place_suggestions` +
    `?id=eq.${encodeURIComponent(id)}&status=eq.pending&suggester_key=eq.${row.suggester_key}`,
    { method: "DELETE", headers: { ...headers(env), Prefer: "return=representation" } });
  if (!delRes.ok) {
    console.log(JSON.stringify({ action: "place-suggestion-withdraw", status: "delete_failed", httpStatus: delRes.status }));
    return fail("server_error", 500);
  }
  const deleted = (await delRes.json().catch(() => [])) as unknown[];
  if (!Array.isArray(deleted) || deleted.length === 0) {
    // 읽기 이후 상태가 바뀌었다(경합) — 이미 결정된 것으로 안내
    return fail("already_decided", 409);
  }

  console.log(JSON.stringify({ action: "place-suggestion-withdraw", status: "withdrawn" }));
  return json({ success: true, status: "withdrawn" });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "DELETE, OPTIONS" } });
}

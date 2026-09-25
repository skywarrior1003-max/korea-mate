// Cloudflare Pages Function — POST /api/admin/place-suggestion-publications
// (PAGINATION-AND-NEW-DISCOVERY-V1 §6)
//
// accepted 제안 ↔ 실제 게시된 city_spots 의 admin 전용 1:1 연결.
//   POST { suggestion_id, city_spot_id } → 201 { success, first_published_at }
//
// 계약
//  · accepted 는 여전히 city_spots 를 자동 생성하지 않는다 — 이 연결은 별도
//    카탈로그 검증을 마친 **이미 게시된** 장소만 가리킨다.
//  · 검증: 제안 accepted · 장소 is_published · 도시 일치. 아니면 409/404.
//  · 중복: 같은 제안 409 duplicate_suggestion · 같은 장소 409 duplicate_spot
//    (DB UNIQUE 가 최종 방어 — 23505 를 사유로 번역).
//  · first_published_at 은 서버 now() 1회 — 이후 UPDATE 는 DB 트리거가 거부.
//  · 사용자 메모·사진·raw device 정보는 이 표에 자리 자체가 없다.
//  · Auth: x-admin-key + ADMIN_KEY (fail-closed) — 기존 관리자 계약 그대로.

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
  return { ok: res.ok, status: res.status, data, raw: text };
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
  const suggestionId = Number(body.suggestion_id);
  const citySpotId = Number(body.city_spot_id);
  if (!Number.isInteger(suggestionId) || suggestionId < 1) return json({ error: "invalid_suggestion_id" }, 400);
  if (!Number.isInteger(citySpotId) || citySpotId < 1) return json({ error: "invalid_city_spot_id" }, 400);

  // ① 제안: 존재 + accepted 만 연결 가능
  const sug = await rest(ctx.env, "GET",
    `place_suggestions?id=eq.${suggestionId}&select=id,city,status&limit=1`);
  const sugRow = Array.isArray(sug.data) && sug.data.length > 0
    ? sug.data[0] as { city: string; status: string } : null;
  if (!sugRow) return json({ error: "suggestion_not_found" }, 404);
  if (sugRow.status !== "accepted") return json({ error: "suggestion_not_accepted" }, 409);

  // ② 장소: 존재 + 게시 상태만
  const spot = await rest(ctx.env, "GET",
    `city_spots?id=eq.${citySpotId}&select=id,city,is_published&limit=1`);
  const spotRow = Array.isArray(spot.data) && spot.data.length > 0
    ? spot.data[0] as { city: string; is_published: boolean } : null;
  if (!spotRow) return json({ error: "city_spot_not_found" }, 404);
  if (spotRow.is_published !== true) return json({ error: "city_spot_not_published" }, 409);

  // ③ 도시 일치 — 무관한 임의 장소 연결 방지
  if (String(sugRow.city).toLowerCase() !== String(spotRow.city).toLowerCase()) {
    return json({ error: "city_mismatch" }, 409);
  }

  // ④ 삽입 — UNIQUE 위반은 사유별 409 로 번역(중복 연결 방지의 최종 방어는 DB)
  const ins = await rest(ctx.env, "POST", "place_suggestion_publications",
    [{ suggestion_id: suggestionId, city_spot_id: citySpotId, city: String(sugRow.city).toLowerCase(), linked_by: "admin-key" }],
    "return=representation");
  if (!ins.ok) {
    if (ins.status === 409 || ins.raw.includes("23505")) {
      const dupSpot = ins.raw.includes("city_spot_id");
      return json({ error: dupSpot ? "duplicate_spot" : "duplicate_suggestion" }, 409);
    }
    console.log(JSON.stringify({ action: "psp-link", status: "insert_failed", httpStatus: ins.status }));
    return json({ error: "insert_failed" }, 500);
  }
  const row = Array.isArray(ins.data) ? ins.data[0] as { first_published_at?: string } : null;
  return json({ success: true, first_published_at: row?.first_published_at ?? null }, 201);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

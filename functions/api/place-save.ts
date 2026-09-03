// Cloudflare Pages Function — POST /api/place-save
//
// Save(북마크)의 서버측 ranking raw signal. 사용자 기능의 SSOT 는 여전히 기기
// localStorage(favorites)다 — 이 API 는 best-effort 미러일 뿐이고 실패해도
// 사용자 Save 경험에는 아무 영향이 없다(클라이언트는 fire-and-forget).
//
//   POST { target_type: "city_spot", target_key, action: "save"|"unsave" } → 204
//
// 계약:
//   · count 를 어떤 공개 API 로도 제공하지 않는다 (GET 없음).
//   · raw device_id 저장 금지 — 대상별 saver_key 해시만.
//   · unsave = 행 삭제 → 반복 토글로 숫자가 부풀지 않는다(현재 관계만 남는다).

import {
  validateSaveSignalRequest, actorKey,
} from "../../src/lib/social/social-actions-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
type Ctx = { request: Request; env: Env };

const MAX_BODY_BYTES = 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function rest(
  env: Env, method: string, pathQ: string, body?: unknown, prefer?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
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
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return json({ error: "server_error" }, 500);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "invalid_target" }, 400);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid_target" }, 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateSaveSignalRequest(body, deviceId);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.error === "invalid_device" ? 401 : 400);
  const r = parsed.value;

  // 존재하는 장소만 — 스키마를 노출하지 않고 404 로만 답한다
  const spot = await rest(env, "GET",
    `city_spots?id=eq.${encodeURIComponent(r.target_key)}&select=id&limit=1`);
  if (!(spot.ok && Array.isArray(spot.data) && spot.data.length > 0))
    return json({ error: "not_found" }, 404);

  const skey = await actorKey("save", r.device_id, r.target_type, r.target_key);
  if (r.action === "save") {
    const ins = await rest(env, "POST", "place_saves",
      [{ target_type: r.target_type, target_key: r.target_key, saver_key: skey }], "return=minimal");
    if (!ins.ok && ins.status !== 409) return json({ error: "server_error" }, 500);
  } else {
    const del = await rest(env, "DELETE",
      `place_saves?saver_key=eq.${skey}&target_type=eq.${r.target_type}&target_key=eq.${encodeURIComponent(r.target_key)}`,
      undefined, "return=minimal");
    if (!del.ok) return json({ error: "server_error" }, 500);
  }
  return new Response(null, { status: 204 });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

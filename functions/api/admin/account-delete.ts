// POST /api/admin/account-delete — 운영자 계정 삭제 (AUTH-L2-OPERATOR-DELETE-V1)
//
// 용도: 만 14세 미만이 만든 계정임을 알게 된 경우처럼 본인 재인증 없이 운영자가 계정을
// 지워야 할 때. 본인 삭제(POST /api/account/delete)는 최근 로그인 세션을 요구하므로
// 운영자가 대신 실행할 수 없다 — 이 경로는 관리자 키로만 열리고, 삭제 자체는 본인 삭제와
// 같은 공용 cascade(functions/_lib/account-purge.ts)를 부른다(순서·멱등·보존 계약 동일).
//
// 입력: { userId: UUID, reason: "under_14" | "legal_request" | "other", confirm: "DELETE <userId>" }
// - 확인 문구가 userId 와 정확히 같아야 실행한다(오타·복사 실수로 다른 계정을 지우지 않게).
// - 계정이 없으면 404(이미 지워졌으면 운영 기록에 '이미 삭제'로 남긴다).
// - 응답·로그에 이메일·이름 등 개인정보를 싣지 않는다. 판단 근거·요청자 연락은 운영 기록 문서에 남긴다.

import { checkAdminAuth, json } from "../../_lib/admin-auth";
import { purgeAccount, type AccountPurgeEnv } from "../../_lib/account-purge";

interface Env extends AccountPurgeEnv { ADMIN_KEY?: string }
type Ctx = { request: Request; env: Env };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["under_14", "legal_request", "other"]);

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const denied = checkAdminAuth(ctx.request, ctx.env.ADMIN_KEY);
  if (denied) return denied;

  let body: { userId?: unknown; reason?: unknown; confirm?: unknown };
  try { body = await ctx.request.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const userId = String(body.userId ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "");
  if (!UUID.test(userId)) return json({ error: "invalid_user_id" }, 400);
  if (!REASONS.has(reason)) return json({ error: "invalid_reason" }, 400);
  if (String(body.confirm ?? "") !== `DELETE ${userId}`) return json({ error: "confirm_mismatch" }, 400);

  const env = ctx.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "server_error" }, 500);
  const u = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (u.status === 404) return json({ error: "not_found" }, 404);
  if (!u.ok) return json({ error: "lookup_failed" }, 503);

  console.info("[admin account-delete] start", { reason });
  return purgeAccount(env, userId);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

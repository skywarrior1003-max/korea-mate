// Cloudflare Pages Function: GET/PATCH /api/admin/user-spots
//
// GET  — pending 신청 목록 (관리자 전용)
// PATCH — approved / rejected 전환 (관리자 전용)
//
// SECURITY CONTRACT:
// - x-admin-key 헤더 필수 (서버 ADMIN_KEY 검증)
// - PATCH는 pending 상태인 spot만 업데이트 (이미 결정된 spot 재검토 방지)
// - city_spots 자동 INSERT 없음 (별도 관리자 작업)
// - device_id 응답 미포함

import { checkAdminAuth, getServiceRoleHeaders, json } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY:                 string;
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Ctx = { request: Request; env: Env };

const REVIEW_STATUSES = new Set(["approved", "rejected"]);

// ── GET — pending 목록 ────────────────────────────────────────────────────────
export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) return json({ error: "Admin DB not configured" }, 503);

  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_spots` +
    `?submission_status=eq.pending` +
    `&order=submitted_at.desc` +
    `&limit=200` +
    `&select=id,name,city,address,category,note,submitted_at`,
    { headers: dbHeaders },
  );

  if (!res.ok) {
    console.error("[admin/user-spots GET] db error:", await res.text());
    return json({ error: "Database error" }, 500);
  }

  return json(await res.json());
};

// ── PATCH — approved / rejected 전환 ─────────────────────────────────────────
export const onRequestPatch = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) return json({ error: "Admin DB not configured" }, 503);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const id     = String(body.id     ?? "").trim();
  const status = String(body.status ?? "").trim();

  if (!id)                          return json({ error: "id is required" }, 400);
  if (!REVIEW_STATUSES.has(status)) return json({ error: "status must be 'approved' or 'rejected'" }, 400);

  // pending인 spot만 업데이트 (이미 결정된 spot 보호)
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_spots` +
    `?id=eq.${encodeURIComponent(id)}&submission_status=eq.pending`,
    {
      method:  "PATCH",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body:    JSON.stringify({
        submission_status: status,
        updated_at:        new Date().toISOString(),
      }),
    },
  );

  if (!res.ok) {
    console.error("[admin/user-spots PATCH] db error:", await res.text());
    return json({ error: "Update failed" }, 500);
  }

  return json({ ok: true });
};

// ── Other methods → 405 ──────────────────────────────────────────────────────
export const onRequest = async (): Promise<Response> =>
  json({ error: "Method not allowed" }, 405);

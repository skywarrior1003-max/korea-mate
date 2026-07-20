// Cloudflare Pages Function — POST /api/admin/delete-spot
// 신고된 spot과 관련 reactions를 운영 DB에서 삭제.
// Auth: x-admin-key 헤더를 ADMIN_KEY env var(서버 전용)로 검증.
// DB: Supabase REST API + SUPABASE_SERVICE_ROLE_KEY (RLS 우회, SQL 인터폴레이션 없음).
// Runtime: Cloudflare Workers (edge). No Node.js APIs.

import { checkAdminAuth, getServiceRoleHeaders, json } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const onRequestPost: (context: { request: Request; env: Env }) => Promise<Response> =
  async ({ request, env }) => {
    const authErr = checkAdminAuth(request, env.ADMIN_KEY);
    if (authErr) return authErr;

    const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!dbHeaders) {
      return json({ error: "Admin DB client not configured (SUPABASE_SERVICE_ROLE_KEY missing)" }, 503);
    }

    let body: Record<string, string>;
    try {
      body = (await request.json()) as Record<string, string>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const place_id = String(body.place_id ?? "").trim();
    if (!place_id || !/^[a-zA-Z0-9\-_]+$/.test(place_id)) {
      return json({ error: "Invalid place_id" }, 400);
    }

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    // encodeURIComponent를 사용 — SQL 문자열 인터폴레이션 없음
    const encodedId = encodeURIComponent(place_id);

    // 1. spot_reactions 먼저 삭제 (FK 의존성 순서)
    const reactRes = await fetch(
      `${supabaseUrl}/rest/v1/spot_reactions?place_id=eq.${encodedId}`,
      { method: "DELETE", headers: dbHeaders }
    );
    if (!reactRes.ok) {
      const errText = await reactRes.text().catch(() => `HTTP ${reactRes.status}`);
      return json({ error: `reactions 삭제 실패: ${errText}` }, 500);
    }

    // 2. spots 삭제
    const spotRes = await fetch(
      `${supabaseUrl}/rest/v1/spots?place_id=eq.${encodedId}`,
      { method: "DELETE", headers: dbHeaders }
    );
    if (!spotRes.ok) {
      const errText = await spotRes.text().catch(() => `HTTP ${spotRes.status}`);
      return json({ error: `spot 삭제 실패: ${errText}` }, 500);
    }

    return json({ success: true });
  };

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> =
  async () => json({ error: "Method not allowed." }, 405);

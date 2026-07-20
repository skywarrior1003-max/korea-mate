// Cloudflare Pages Functions — 관리자 인증 공통 유틸
//
// TODO(long-term): x-admin-key는 긴급 임시 조치입니다.
// 장기적으로 Cloudflare Access 또는 Supabase Auth JWT 기반 인증으로 전환해야 합니다.
// 현재 방식은 ADMIN_KEY 유출 시 즉시 교체가 필요합니다.

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Returns a Response (error) if auth fails, null if auth passes.
// ADMIN_KEY 미설정 시 503 fail-closed — 절대 통과시키지 않음.
export function checkAdminAuth(
  request: Request,
  adminKey: string | undefined
): Response | null {
  if (!adminKey) {
    console.error("[admin-auth] ADMIN_KEY not set — all admin endpoints disabled (fail-closed)");
    return json({ error: "Admin endpoint not configured on server" }, 503);
  }
  const provided = request.headers.get("x-admin-key");
  if (!provided || provided !== adminKey) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// Returns service role HTTP headers for Supabase REST API.
// SUPABASE_SERVICE_ROLE_KEY 미설정 시 null — anon key로 절대 폴백하지 않음.
// 호출자는 null 반환 시 503으로 응답해야 합니다.
export function getServiceRoleHeaders(
  supabaseServiceRoleKey: string | undefined
): Record<string, string> | null {
  if (!supabaseServiceRoleKey) {
    console.error("[admin-auth] SUPABASE_SERVICE_ROLE_KEY not set — cannot perform admin DB operations");
    return null;
  }
  return {
    "Content-Type": "application/json",
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
  };
}

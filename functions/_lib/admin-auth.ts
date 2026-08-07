// Cloudflare Pages Functions — 관리자 인증 공통 유틸
//
// TODO(long-term): x-admin-key는 긴급 임시 조치입니다.
// 장기적으로 Cloudflare Access 또는 Supabase Auth JWT 기반 인증으로 전환해야 합니다.
// 현재 방식은 ADMIN_KEY 유출 시 즉시 교체가 필요합니다.

import { createHash, timingSafeEqual } from "node:crypto";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 두 키를 같은 길이로 만든 뒤 고정 시간으로 비교한다.
 *
 * 왜 그냥 `a !== b` 를 쓰지 않나
 *   JS 문자열 비교는 **첫 번째 다른 바이트에서 멈춘다.** 그래서 응답 시간이
 *   "앞에서 몇 글자나 맞았는가" 를 알려 준다. 공격자는 한 글자씩 맞춰 가며
 *   키 전체를 복원할 수 있다. 실제로 성공시키기는 까다롭지만, 막는 비용이
 *   거의 0 이라 막지 않을 이유가 없다.
 *
 * 왜 먼저 해시하나
 *   timingSafeEqual 은 길이가 다르면 TypeError 를 던진다(이 저장소의 Pages
 *   Functions 런타임에서 직접 확인했다). 길이를 그대로 넘기면 "길이가 맞는가"
 *   자체가 예외 발생 여부로 새어 나간다. sha256 은 입력이 무엇이든 32바이트라
 *   그 문제가 사라지고 비교는 항상 같은 길이에서 이뤄진다.
 *
 * 남는 한계 (숨기지 않는다)
 *   createHash().update() 자체는 입력 **길이**에 비례해 시간이 걸린다. 즉
 *   "제시된 키가 몇 글자인가" 는 여전히 미세하게 샐 수 있다. 막아 낸 것은
 *   바이트 단위로 키를 복원하는 쪽이고, 길이 추정은 남는다. JS/JIT 환경에서
 *   엄밀한 constant-time 을 보장한다고 주장하지 않는다.
 */
function keysMatch(provided: string, adminKey: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(adminKey, "utf8").digest();
  return timingSafeEqual(a, b);
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
  // 헤더가 아예 없는 것은 비밀이 아니다. 여기서 일찍 끝내도 새는 정보가 없다.
  if (!provided) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!keysMatch(provided, adminKey)) {
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

// 서버 사용자 인증 helper (V2-MINIMAL-GOOGLE-AUTH-V1 §8)
//
// 클라이언트가 보낸 어떤 값도 신원으로 신뢰하지 않는다. Authorization Bearer
// 의 access token 을 **이 환경의 Supabase Auth 서버**(/auth/v1/user)에 넘겨
// 검증된 사용자만 받는다. 로컬 decode 만으로 통과시키지 않는다.
//
// 환경 불일치 = 자동 차단: Staging token 을 Production functions 에 보내면
// Production 의 SUPABASE_URL 이 검증하므로 서명 불일치로 거부된다(반대도 동일).
//
// 응답 계약(§8): token·email·Google subject·환경 ref·secret 을 싣지 않는다.
//  · Authorization 부재            → 401 { error: "authentication_required" }
//  · malformed·만료·타 환경 token  → 401 { error: "invalid_session" }
//  · 내부 검증 장애                → 503 { error: "auth_unavailable" }

export interface UserAuthEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  /** actor hash 용 서버 secret — writing 의 owner hash 와 같은 변수를 쓴다 */
  MYTRIP_HASH_SECRET?: string;
}

export type UserAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export function authenticationRequired(): Response { return jsonError("authentication_required", 401); }
export function invalidSession(): Response { return jsonError("invalid_session", 401); }

/** Authorization: Bearer <token> 파싱 — token 값은 어떤 로그에도 남기지 않는다 */
export function bearerToken(request: Request): string | null {
  const h = (request.headers.get("authorization") ?? "").trim();
  if (!/^bearer\s+/i.test(h)) return null;
  const t = h.replace(/^bearer\s+/i, "").trim();
  return t.length > 0 ? t : null;
}

/**
 * 요청의 사용자를 Supabase 에서 검증한다.
 * fetchFn 주입은 테스트 전용 — 운영 경로는 런타임 기본 fetch 다.
 */
export async function requireUser(
  env: UserAuthEnv, request: Request, fetchFn: typeof fetch = fetch,
): Promise<UserAuthResult> {
  const token = bearerToken(request);
  if (!token) return { ok: false, response: authenticationRequired() };
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon) return { ok: false, response: jsonError("auth_unavailable", 503) };

  let res: Response;
  try {
    res = await fetchFn(`${base}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, response: jsonError("auth_unavailable", 503) };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, response: invalidSession() };
  if (!res.ok) return { ok: false, response: jsonError("auth_unavailable", 503) };

  let userId: unknown;
  try { userId = ((await res.json()) as { id?: unknown }).id; } catch { userId = null; }
  if (typeof userId !== "string" || userId.length < 10) return { ok: false, response: invalidSession() };
  return { ok: true, userId };
}

/**
 * 원장 actor — raw user UUID 를 노출하지 않는다(§9).
 * 같은 사용자는 어느 기기에서든 같은 actor 다(입력이 user id 뿐이므로).
 * namespace 를 device HMAC("gkm-owner-v2|…")와 분리해 충돌·혼동을 막는다.
 */
export async function userActorHash(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`gkm-user-v1|${userId}`)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 사용자 entitlement 자리 (§9-4) — V2-FREE-ENTITLEMENT-AND-PAID-CREDIT-LEDGER-V1
 * 에서 구현한다. 이번 TASK 는 차감·잔여 판정을 하지 않는다(항상 통과).
 * 호출 위치만 게이트 순서(인증 뒤·예산 reserve 앞)에 고정해 둔다.
 */
export function checkUserEntitlementPlaceholder(_userId: string): { ok: true } {
  return { ok: true };
}

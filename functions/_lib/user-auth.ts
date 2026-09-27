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

import { CURRENT_CONSENT_VERSIONS } from "../../src/lib/auth/consent-contract.ts";

export interface UserAuthEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  /** actor hash 용 서버 secret — writing 의 owner hash 와 같은 변수를 쓴다 */
  MYTRIP_HASH_SECRET?: string;
  /** user_consents 조회·기록 — service_role 전용(077 이 직접 접근을 전면 차단) */
  SUPABASE_SERVICE_ROLE_KEY?: string;
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

// ── 계정 활성(동의) 판정 (CONSENT-AND-AUTH-ACTIVATION-V1 §F·§H) ────────────
//
// "활성 계정" = 현재 3개 문서 버전(user_consents)의 동의 행이 있는 사용자.
// 판정은 user id 기준이며 이메일은 쓰지 않는다. user id 는 로그에 출력하지
// 않고, 조회·기록은 service_role 로만 한다(077 이 anon/authenticated 직접
// 접근을 전면 차단하므로 다른 경로가 없다).

export function consentRequired(): Response { return jsonError("consent_required", 403); }

/** 현재 버전 동의 행 존재 여부 — service_role 조회. 장애는 null(판정 불가). */
export async function hasCurrentConsent(
  env: UserAuthEnv, userId: string, fetchFn: typeof fetch = fetch,
): Promise<boolean | null> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const q = new URLSearchParams({
    select: "id",
    user_id: `eq.${userId}`,
    age_gate_version: `eq.${CURRENT_CONSENT_VERSIONS.age_gate_version}`,
    terms_version: `eq.${CURRENT_CONSENT_VERSIONS.terms_version}`,
    privacy_version: `eq.${CURRENT_CONSENT_VERSIONS.privacy_version}`,
    limit: "1",
  });
  try {
    const res = await fetchFn(`${base}/rest/v1/user_consents?${q}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch { return null; }
}

/**
 * requireUser + 현재 버전 동의까지 검증한다.
 * 동의 없음 → 403 consent_required. 판정 장애 → 503 (성공으로 폴백하지 않음).
 * 결과의 userId 는 서버 내부 전용 — 응답·로그에 싣지 않는다.
 */
export async function requireActiveUser(
  env: UserAuthEnv, request: Request, fetchFn: typeof fetch = fetch,
): Promise<UserAuthResult> {
  const auth = await requireUser(env, request, fetchFn);
  if (!auth.ok) return auth;
  const consent = await hasCurrentConsent(env, auth.userId, fetchFn);
  if (consent === null) return { ok: false, response: jsonError("auth_unavailable", 503) };
  if (!consent) return { ok: false, response: consentRequired() };
  return auth;
}

// POST /api/account/delete-intent — 계정 삭제 1단계: 최근 재인증 확인 + 일회성 의사 토큰
// (ACCOUNT-DELETE-V1 §2)
//
// 왜 두 단계인가
//   영구 삭제는 "지금 이 사람" 확인이 필요하다. 클라이언트가 보내는 시각·user id
//   는 믿지 않는다 — ①세션 JWT 를 서버(GoTrue /user)로 검증하고 ②그 계정의
//   last_sign_in_at(GoTrue 가 기록하는 서버 값)이 최근인지 본다. 오래됐으면
//   401 reauth_required — 클라이언트는 기존 PKCE OAuth 로 다시 로그인하고
//   돌아온다(새 로그인이 last_sign_in_at 을 갱신한다). 통과하면 짧은 TTL 의
//   HMAC 의사 토큰을 발급한다. 2단계(delete)는 같은 세션 + 이 토큰이 모두
//   맞아야 실행된다 — 탈취된 오래된 세션만으로는 삭제 버튼이 열리지 않는다.
//
// 토큰: base64url(JSON{u,iat}) + "." + HMAC-SHA256(secret, "gkm-account-delete-v1|"+payload)
//   · 도메인 문자열이 consent intent("gkm-consent-intent-v1")·device 해시와 분리돼
//     서로 재사용될 수 없다. 상태 저장 없음(짧은 TTL·서명 검증만).

import { requireUser } from "../../_lib/user-auth";
import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership";

export const DELETE_INTENT_DOMAIN = "gkm-account-delete-v1";
export const DELETE_INTENT_TTL_MS = 10 * 60 * 1000;      // 토큰 유효 10분
export const REAUTH_MAX_AGE_MS   = 5 * 60 * 1000;        // 로그인 후 5분 안에만 발급

interface Env extends OwnershipEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MYTRIP_HASH_SECRET?: string;
}
type Ctx = { request: Request; env: Env };

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const b64url = (u8: Uint8Array) =>
  btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function signDeleteIntent(secret: string, userId: string, iat: number): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: userId, iat })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`${DELETE_INTENT_DOMAIN}|${payload}`)));
  return `${payload}.${b64url(sig)}`;
}

/** 검증 — 서명·TTL·계정 일치. 실패 사유는 구분하지 않는다(토큰 탐색 방지). */
export async function verifyDeleteIntent(
  secret: string, token: string, userId: string, nowMs: number = Date.now(),
): Promise<boolean> {
  const m = /^([A-Za-z0-9_-]{10,500})\.([A-Za-z0-9_-]{40,50})$/.exec(token ?? "");
  if (!m) return false;
  let claims: { u?: unknown; iat?: unknown };
  try {
    const pad = m[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pad), c => c.charCodeAt(0))));
  } catch { return false; }
  if (claims.u !== userId || typeof claims.iat !== "number") return false;
  if (nowMs - claims.iat > DELETE_INTENT_TTL_MS || claims.iat - nowMs > 60_000) return false;
  const good = await signDeleteIntent(secret, userId, claims.iat);
  // constant-time 비교
  const a = new TextEncoder().encode(good), b = new TextEncoder().encode(`${m[1]}.${m[2]}`);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const env = ctx.env;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MYTRIP_HASH_SECRET)
    return json({ error: "server_error" }, 500);

  // 계정 기능이다 — linked device + 유효 세션 + 동의까지 공통 판정기로.
  const own = await resolveOwnership(env, ctx.request);
  if (!own.ok) return own.response;
  if (own.mode !== "account" || !own.userId) return json({ error: "account_required" }, 403);

  // 최근 재인증(서버 기록) — GoTrue admin 의 last_sign_in_at 만 믿는다.
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${own.userId}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) return json({ error: "server_error" }, 503);
  const u = (await r.json().catch(() => null)) as { last_sign_in_at?: string } | null;
  const last = u?.last_sign_in_at ? Date.parse(u.last_sign_in_at) : NaN;
  if (!Number.isFinite(last) || Date.now() - last > REAUTH_MAX_AGE_MS) {
    return json({ error: "reauth_required" }, 401);
  }

  const token = await signDeleteIntent(env.MYTRIP_HASH_SECRET, own.userId, Date.now());
  return json({ intent: token, expires_in: Math.floor(DELETE_INTENT_TTL_MS / 1000) });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

// requireUser 는 delete.ts 가 같은 계약으로 재사용한다 — 여기서 re-export 해
// 두 파일이 다른 검증기를 쓰는 사고를 막는다.
export { requireUser };

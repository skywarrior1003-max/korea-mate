// 동의 intent cookie — 서명·검증·Set-Cookie (CONSENT-AND-AUTH-ACTIVATION-V1 §C-2)
//
// 계약:
//  · payload 에는 nonce·동의 플래그·3개 문서 버전·locale·발급/만료 시각만 —
//    user id·email·device id·IP·user agent 절대 금지.
//  · 서명은 기존 서버 전용 MYTRIP_HASH_SECRET 을 재사용하되, 반드시
//    CONSENT_INTENT_DOMAIN("gkm-consent-intent-v1") 으로 domain separation 한다.
//    기존 actor 해시 입력(gkm-owner-v2|device, gkm-user-v1|user)과 형식이 겹치지
//    않는다 — HMAC(secret, "gkm-consent-intent-v1|" + payloadB64).
//  · 검증 비교는 constant-time. cookie 원문·서명·secret 은 어떤 로그에도 남기지
//    않는다(이 파일에 console 호출 자체가 없다 — 가드 감시).
//  · 만료·변조·버전 불일치 전부 거부. 새 secret 을 추가하지 않는다.

import {
  CONSENT_INTENT_COOKIE, CONSENT_INTENT_DOMAIN, CONSENT_INTENT_MAX_AGE_S,
  CURRENT_CONSENT_VERSIONS, isConsentLocale, type ConsentLocale,
} from "../../src/lib/auth/consent-contract.ts";

export interface ConsentIntentEnv { MYTRIP_HASH_SECRET?: string }

interface IntentPayload {
  n: string;            // random nonce (hex)
  a: true;              // age_over_14 confirmed
  t: true;              // terms agreed
  p: true;              // privacy acknowledged
  av: string;           // age gate version
  tv: string;           // terms version
  pv: string;           // privacy version
  loc: ConsentLocale;
  iat: number;          // issued_at (epoch s)
  exp: number;          // expires_at (epoch s)
}

const te = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(message)));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** constant-time 비교 — 길이가 달라도 조기 반환하지 않는다 */
export function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** intent cookie 값 생성 — "v1.<payload b64url>.<hmac hex>" */
export async function createIntentCookieValue(
  env: ConsentIntentEnv, locale: ConsentLocale, nowMs: number = Date.now(),
): Promise<string | null> {
  const secret = env.MYTRIP_HASH_SECRET;
  if (!secret) return null;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const iat = Math.floor(nowMs / 1000);
  const payload: IntentPayload = {
    n: nonce, a: true, t: true, p: true,
    av: CURRENT_CONSENT_VERSIONS.age_gate_version,
    tv: CURRENT_CONSENT_VERSIONS.terms_version,
    pv: CURRENT_CONSENT_VERSIONS.privacy_version,
    loc: locale, iat, exp: iat + CONSENT_INTENT_MAX_AGE_S,
  };
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = await hmacHex(secret, `${CONSENT_INTENT_DOMAIN}|${body}`);
  return `v1.${body}.${sig}`;
}

export type IntentVerify =
  | { ok: true; locale: ConsentLocale }
  | { ok: false; reason: "missing" | "malformed" | "bad_signature" | "expired" | "version_mismatch" | "unavailable" };

/** 요청의 intent cookie 를 검증한다 — 실패 사유는 열거형뿐, 원문 미보존 */
export async function verifyIntentCookie(
  env: ConsentIntentEnv, request: Request, nowMs: number = Date.now(),
): Promise<IntentVerify> {
  const secret = env.MYTRIP_HASH_SECRET;
  if (!secret) return { ok: false, reason: "unavailable" };
  const cookieHeader = request.headers.get("cookie") ?? "";
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CONSENT_INTENT_COOKIE}=([^;]+)`));
  if (!m) return { ok: false, reason: "missing" };
  const parts = m[1].split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, body, sig] = parts;
  const expected = await hmacHex(secret, `${CONSENT_INTENT_DOMAIN}|${body}`);
  if (!constantTimeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };
  const raw = b64urlDecode(body);
  if (!raw) return { ok: false, reason: "malformed" };
  let payload: IntentPayload;
  try { payload = JSON.parse(new TextDecoder().decode(raw)) as IntentPayload; }
  catch { return { ok: false, reason: "malformed" }; }
  if (payload.a !== true || payload.t !== true || payload.p !== true) return { ok: false, reason: "malformed" };
  if (!isConsentLocale(payload.loc)) return { ok: false, reason: "malformed" };
  if (typeof payload.exp !== "number" || Math.floor(nowMs / 1000) >= payload.exp) {
    return { ok: false, reason: "expired" };
  }
  if (
    payload.av !== CURRENT_CONSENT_VERSIONS.age_gate_version ||
    payload.tv !== CURRENT_CONSENT_VERSIONS.terms_version ||
    payload.pv !== CURRENT_CONSENT_VERSIONS.privacy_version
  ) return { ok: false, reason: "version_mismatch" };
  return { ok: true, locale: payload.loc };
}

/** Set-Cookie 헤더 값 — HTTPS 요청에만 Secure(로컬 http 개발 분리, §C-2) */
export function intentSetCookie(request: Request, value: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${CONSENT_INTENT_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${CONSENT_INTENT_MAX_AGE_S}${secure}`;
}

/** 사용 완료된 intent cookie 즉시 삭제 */
export function intentClearCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${CONSENT_INTENT_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

/** same-origin POST 방어 — Origin 헤더가 요청 origin 과 정확히 일치해야 한다 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

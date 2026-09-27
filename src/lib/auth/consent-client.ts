"use client";

// 동의·활성화 클라이언트 (CONSENT-AND-AUTH-ACTIVATION-V1 §C·§G)
//
// 흐름: 동의 sheet 3항목 확인 → postConsentIntent(HttpOnly cookie 발급) →
// 그 성공 후에만 OAuth 시작 → callback 의 code 교환 성공 후 activateAccount →
// 실패하면 세션을 즉시 signOut 한다. session 존재 ≠ active — 활성 여부는
// 반드시 서버(/api/auth/status)가 판정한다.
//
// cookie 는 HttpOnly 라 이 코드가 읽을 수 없고(의도), credentials 포함
// same-origin 요청으로만 오간다. token·cookie·PII 를 로그에 남기지 않는다.

import { getAccessTokenForApi } from "./auth-client";
import type { ConsentLocale } from "./consent-contract";

export type AuthActivation =
  | { state: "active" }
  | { state: "inactive"; reason: "consent_required" | "consent_expired" | "reconsent_required" }
  | { state: "error" };

/** 동의 intent 발급 — 성공(204)일 때만 OAuth 를 시작한다 */
export async function postConsentIntent(locale: ConsentLocale): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/consent-intent", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        age_over_14: true, terms_agreed: true, privacy_acknowledged: true, locale,
      }),
    });
    return res.status === 204;
  } catch { return false; }
}

/** 계정 활성화 — session 필수. 멱등(이미 동의면 cookie 없이도 성공). */
export async function activateAccount(): Promise<AuthActivation> {
  const token = await getAccessTokenForApi();
  if (!token) return { state: "error" };
  try {
    const res = await fetch("/api/auth/activate", {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return { state: "active" };
    if (res.status === 409) return { state: "inactive", reason: "reconsent_required" };
    if (res.status === 403) {
      let code = "";
      try { code = String(((await res.json()) as { error?: string }).error ?? ""); } catch { /* 사유 없으면 기본 */ }
      return { state: "inactive", reason: code === "consent_expired" ? "consent_expired" : "consent_required" };
    }
    return { state: "error" };
  } catch { return { state: "error" }; }
}

/** 내 활성 여부 — session 없으면 error 로 수렴(호출부가 로그인 흐름으로 유도) */
export async function fetchAuthStatus(): Promise<AuthActivation> {
  const token = await getAccessTokenForApi();
  if (!token) return { state: "error" };
  try {
    const res = await fetch("/api/auth/status", {
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { state: "error" };
    const body = (await res.json()) as { active?: boolean };
    return body.active === true
      ? { state: "active" }
      : { state: "inactive", reason: "consent_required" };
  } catch { return { state: "error" }; }
}

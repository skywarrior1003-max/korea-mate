// POST /api/auth/activate — 동의 기록 + 계정 활성화 (CONSENT-AND-AUTH-ACTIVATION-V1 §F-1)
//
// 순서(LINKING-V1 §6.1 확장): session 검증 → 동의 확인/기록(기존 계약 그대로)
// → **현재 device 자동 연결**(원자 RPC — 같은 계정 멱등·타 계정 409) →
// { active, linked } 반환. 연결이 실패하면 active 를 반환하지 않는다 —
// callback 은 이 응답으로만 계정 화면 진입을 결정한다.
//
// body 의 user_id·email 은 사용하지 않는다 — 신원은 session 의 auth.users.id
// 뿐이다. 응답·로그에 이름·이메일·token·cookie·user id 원문을 싣지 않는다.

import { requireUser, hasCurrentConsent, type UserAuthEnv } from "../../_lib/user-auth.ts";
import { verifyIntentCookie, intentClearCookie } from "../../_lib/consent-intent.ts";
import { CURRENT_CONSENT_VERSIONS } from "../../../src/lib/auth/consent-contract.ts";
import { linkCurrentDevice, OWNERSHIP_UUID_RE, type OwnershipEnv } from "../../_lib/ownership.ts";

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

type Ctx = { request: Request; env: UserAuthEnv & OwnershipEnv };

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;

  const auth = await requireUser(env, request);
  if (!auth.ok) return auth.response;

  // LINKING-V1 — 활성화는 이제 device 연결까지 포함한다. 연결 대상은 검증된
  // x-device-id 헤더 하나뿐(§3.1 — body/query 의 device·user 주입 불신).
  const deviceId = (request.headers.get("x-device-id") ?? "").trim().toLowerCase();
  if (!OWNERSHIP_UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const activeOk = async (): Promise<Response> => {
    // 동의 확보 후 자동 연결(§2.2) — 재로그인도 반드시 이 단계를 거친다(§6.1)
    const link = await linkCurrentDevice(env, auth.userId, deviceId);
    if (!link.ok) {
      if (link.status === 409) {
        return json({ error: "device_already_linked" }, 409, { "set-cookie": intentClearCookie(request) });
      }
      return json({ error: "ownership_unavailable" }, 503);
    }
    return json({ active: true, linked: true, versions: CURRENT_CONSENT_VERSIONS }, 200, {
      "set-cookie": intentClearCookie(request),
    });
  };

  // ① 이미 현재 버전 동의가 있으면 cookie 없이도 멱등 성공(§G-7: 재로그인)
  const existing = await hasCurrentConsent(env, auth.userId);
  if (existing === null) return json({ error: "auth_unavailable" }, 503);
  if (existing) return activeOk();

  // ② intent cookie 검증 — 없음/변조/만료 403, 버전 불일치는 재동의 요구
  const intent = await verifyIntentCookie(env, request);
  if (!intent.ok) {
    if (intent.reason === "unavailable") return json({ error: "consent_unavailable" }, 503);
    if (intent.reason === "version_mismatch") {
      return json({ error: "reconsent_required", versions: CURRENT_CONSENT_VERSIONS }, 409, {
        "set-cookie": intentClearCookie(request),
      });
    }
    if (intent.reason === "expired") return json({ error: "consent_expired" }, 403);
    return json({ error: "consent_required" }, 403);
  }

  // ③ service_role INSERT — UNIQUE(user, 3버전) 충돌은 동일 동의 = 멱등 성공
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json({ error: "consent_unavailable" }, 503);
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/user_consents`, {
      method: "POST",
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        "content-type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: auth.userId,
        ...CURRENT_CONSENT_VERSIONS,
        locale: intent.locale,
        age_over_14_confirmed: true,
        terms_agreed: true,
        privacy_acknowledged: true,
      }),
    });
  } catch {
    return json({ error: "consent_write_failed" }, 500);
  }
  // 409/23505 = 동시 요청이 먼저 기록 — 동일 동의이므로 성공으로 수렴
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => "");
    if (!/23505|duplicate/i.test(text)) return json({ error: "consent_write_failed" }, 500);
  }

  return activeOk();
}

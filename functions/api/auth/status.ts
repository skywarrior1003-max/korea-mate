// GET /api/auth/status — 내 계정 활성 여부 (CONSENT-AND-AUTH-ACTIVATION-V1 §F-2)
//
// 유효한 session 의 사용자가 자기 자신의 활성 여부만 확인한다. 타 사용자
// 조회 경로가 없고(신원은 session 에서만), PII 는 반환하지 않는다.

import { requireUser, hasCurrentConsent, type UserAuthEnv } from "../../_lib/user-auth.ts";
import { CURRENT_CONSENT_VERSIONS } from "../../../src/lib/auth/consent-contract.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

type Ctx = { request: Request; env: UserAuthEnv };

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const auth = await requireUser(ctx.env, ctx.request);
  if (!auth.ok) return auth.response;
  const consent = await hasCurrentConsent(ctx.env, auth.userId);
  if (consent === null) return json({ error: "auth_unavailable" }, 503);
  if (!consent) return json({ active: false, reason: "consent_required", versions: CURRENT_CONSENT_VERSIONS }, 200);
  return json({ active: true, versions: CURRENT_CONSENT_VERSIONS }, 200);
}

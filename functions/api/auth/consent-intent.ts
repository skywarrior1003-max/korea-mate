// POST /api/auth/consent-intent — 동의 intent 발급 (CONSENT-AND-AUTH-ACTIVATION-V1 §C-2)
//
// 로그인 전 동의 sheet 의 세 항목이 전부 참일 때만 짧은 수명의 서명된
// HttpOnly cookie 를 발급한다. OAuth 는 이 발급이 성공한 뒤에만 시작된다.
//
// 서버가 문서 버전의 최종 권한을 가진다 — body 의 version·user_id·email·
// accepted_at 주입값은 전부 무시한다(§C-2). cookie 원문·secret 은 로그 금지.

import {
  createIntentCookieValue, intentSetCookie, isSameOrigin, type ConsentIntentEnv,
} from "../../_lib/consent-intent.ts";
import { isConsentLocale } from "../../../src/lib/auth/consent-contract.ts";

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

type Ctx = { request: Request; env: ConsentIntentEnv };

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;

  // same-origin POST 방어 — 브라우저 fetch 는 Origin 을 반드시 싣는다
  if (!isSameOrigin(request)) return json({ error: "forbidden_origin" }, 403);

  const ct = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) return json({ error: "unsupported_content_type" }, 415);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: "invalid_body" }, 400); }

  // 세 항목 전부 명시적 true 여야 한다 — 기본값·문자열 "true" 불인정
  if (body.age_over_14 !== true) return json({ error: "age_confirmation_required" }, 400);
  if (body.terms_agreed !== true) return json({ error: "terms_agreement_required" }, 400);
  if (body.privacy_acknowledged !== true) return json({ error: "privacy_acknowledgement_required" }, 400);

  const locale = body.locale;
  if (!isConsentLocale(locale)) return json({ error: "invalid_locale" }, 400);

  // body 의 version/user_id/email/accepted_at 등 그 외 필드는 전부 무시 —
  // cookie payload 는 서버 상수 버전으로만 만든다.
  const value = await createIntentCookieValue(env, locale);
  if (!value) return json({ error: "consent_unavailable" }, 503);

  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": intentSetCookie(request, value),
    },
  });
}

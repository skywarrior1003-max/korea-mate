// Cloudflare Pages Function — POST /api/admin/ai-personalization-canary
//
// 무엇인가
//   전역 AI 가 꺼져 있는 상태에서, 운영자만 개인화 provider 경로가 실제로
//   끝까지 닿는지 한 번 확인해 보는 배관 점검이다.
//
// 무엇이 아닌가
//   AI 를 켜는 스위치가 아니다. 이 endpoint 를 호출해도 일반 사용자의
//   /api/trip/personalize 는 그대로 off 를 본다. 전역 설정을 바꾸지 않는다.
//
// SECURITY CONTRACT
// - 기존 x-admin-key(checkAdminAuth)를 그대로 쓴다. 새 인증도 새 secret 도 없다.
// - 인증 실패는 provider·DB·Gemini 관련 코드에 닿기 전에 끝난다.
// - 인증만으로는 부족하다. 운영 스위치(AI_PRODUCTION_CANARY_ENABLED=true)와
//   정확한 confirm 문구가 모두 있어야 provider 로 간다. 기본값은 꺼짐이다.
// - 요청 본문에서 쓰는 것은 confirm 하나뿐이다. 나머지는 읽지도 않는다 —
//   관리자가 실제 사용자 일정을 붙여 넣어도 provider 로 나가지 않는다.
// - DB 를 읽지도 쓰지도 않는다. Supabase 를 아예 import 하지 않는다.
// - 응답에 API key·ADMIN_KEY·provider 원문·prompt 원문을 넣지 않는다.
//
// provider 호출 코드를 복사하지 않았다
//   기존 /api/trip/personalize 핸들러를 그대로 불러 쓴다. 복사하면 두 경로가
//   조금씩 달라지고, 그러면 canary 가 통과해도 실제 사용자 경로가 안전한지
//   아무 말도 못 하게 된다. 같은 코드여야 의미가 있다.
//
// 전역 1회 보장은 하지 않는다 (정직하게)
//   DB·KV 같은 영속 상태를 새로 만들지 않았으므로 "이 endpoint 는 영원히 딱
//   한 번만 실행된다" 고 말할 수 없다. 보장하는 것은 **요청 1건당 provider
//   최대 1회 · 재시도 0** 이다. 스위치가 켜진 동안 관리자가 두 번 누르면 두
//   번 호출된다. 그래서 운영 절차로 "한 번 실행하고 즉시 스위치를 끈다" 를
//   둔다. 이것을 막자고 새 DB 쓰기나 새 secret 을 만들지 않는다.

import { json, checkAdminAuth } from "../../_lib/admin-auth";
import { onRequestPost as personalizeHandler } from "../trip/personalize";
import {
  canaryEnabled, confirmMatches, buildCanaryBody, allowedIdViolations,
  CANARY_CONFIRM_PHRASE, CANARY_ENABLE_ENV, CANARY_PROVIDER_MODE,
  MAX_PROVIDER_CALLS, PROVIDER_HOST, CANARY_ALLOWED_PLACE_IDS,
} from "../../../src/lib/scheduler/ai/canary-fixture";

interface Env {
  ADMIN_KEY?:                    string;
  GEMINI_API_KEY?:               string;
  AI_PERSONALIZATION_MODE?:      string;
  AI_PRODUCTION_CANARY_ENABLED?: string;
}
interface Ctx { request: Request; env: Env }

const MAX_BODY_BYTES = 2 * 1024;
const NR = "provider_not_returned";

/** 로그에 secret·개인 데이터를 넣지 않는다. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "ai-canary", ...fields }));
}

interface Captured {
  httpStatus: number;
  latencyMs:  number;
  body:       unknown;
  bodyChars:  number;
}

export const onRequestPost: (ctx: Ctx) => Promise<Response> = async ({ request, env }) => {
  // ── 1. 인증. 아래 어떤 줄도 provider 를 부르지 않는다. ──────────────────
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  // ── 2. 운영 스위치. 기본은 꺼짐. ────────────────────────────────────────
  if (!canaryEnabled(env.AI_PRODUCTION_CANARY_ENABLED)) {
    log({ status: "disabled", providerCalled: false });
    return json({
      success: false, canary_status: "canary_disabled", providerCalled: false,
      hint: `${CANARY_ENABLE_ENV} is not "true"`,
    }, 403);
  }

  // ── 3. 확인 문구. 본문에서 읽는 것은 이것 하나뿐이다. ───────────────────
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    log({ status: "body_too_large", providerCalled: false });
    return json({ success: false, canary_status: "invalid_body", providerCalled: false }, 400);
  }
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : null; } catch {
    log({ status: "invalid_body", providerCalled: false });
    return json({ success: false, canary_status: "invalid_body", providerCalled: false }, 400);
  }
  if (!confirmMatches(body)) {
    log({ status: "confirm_required", providerCalled: false });
    return json({
      success: false, canary_status: "confirm_required", providerCalled: false,
      hint: `send { "confirm": "${CANARY_CONFIRM_PHRASE}" }`,
    }, 400);
  }

  // ── 4. 요청 범위 모드. 전역 env 객체는 그대로 둔다. ─────────────────────
  // 새 객체를 만들어 얹는다. env 자체에 대입하면 같은 isolate 의 다른 요청이
  // 그 값을 보게 된다 — 그건 전역을 켜는 것과 같다.
  const canaryEnv: Env = { ...env, AI_PERSONALIZATION_MODE: CANARY_PROVIDER_MODE };

  // ── 5. 서버가 만든 합성 요청. 관리자 본문은 여기로 흘러들지 않는다. ────
  const syntheticRequest = new Request("https://canary.internal/api/trip/personalize", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(buildCanaryBody()),
  });

  // ── 6. provider 경계 가드 ───────────────────────────────────────────────
  // provider 로 나가는 요청만 세고, 상한을 넘으면 나가기 전에 막는다.
  // 이건 주장이 아니라 실제 차단이다. 진단값도 여기서 받아 둔다.
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  let captured: Captured | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input
              : input instanceof URL ? input.href
              : (input as Request).url;
    if (!url.includes(PROVIDER_HOST)) return realFetch(input as RequestInfo, init);

    providerCalls += 1;
    if (providerCalls > MAX_PROVIDER_CALLS) {
      // 재시도 루프가 생기거나 코드가 두 번 부르게 바뀌면 여기서 막힌다.
      throw new Error("canary_provider_cap_exceeded");
    }
    const t0 = Date.now();
    const res = await realFetch(input as RequestInfo, init);
    const latencyMs = Date.now() - t0;
    let parsed: unknown = null;
    let chars = 0;
    try {
      const text = await res.clone().text();
      chars = text.length;
      parsed = JSON.parse(text);
    } catch { /* 진단이 없어도 호출 자체는 그대로 흘려보낸다 */ }
    captured = { httpStatus: res.status, latencyMs, body: parsed, bodyChars: chars };
    return res;
  }) as typeof fetch;

  let handlerBody: { profile: unknown; ai_status: string } | null = null;
  let handlerError: string | null = null;
  const started = Date.now();
  try {
    const res = await personalizeHandler({ request: syntheticRequest, env: canaryEnv });
    handlerBody = await res.json() as { profile: unknown; ai_status: string };
  } catch (e) {
    handlerError = (e as Error).message;
  } finally {
    globalThis.fetch = realFetch;   // 반드시 되돌린다
  }
  const totalMs = Date.now() - started;

  // ── 7. 안전한 진단만 조립한다 ───────────────────────────────────────────
  const cap = captured as Captured | null;
  const rawBody = cap?.body as {
    candidates?: { content?: { parts?: { text?: string }[] };
                   finishReason?: string; finishMessage?: string }[];
    usageMetadata?: {
      promptTokenCount?: number; candidatesTokenCount?: number;
      thoughtsTokenCount?: number; totalTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  } | null | undefined;

  const u = rawBody?.usageMetadata;
  const orNR = (v: number | undefined) => (v === undefined ? NR : v);
  const cand = rawBody?.candidates?.[0];
  const candidateChars = cand?.content?.parts?.[0]?.text?.length;

  const profile = handlerBody?.profile as {
    category_weights?: Record<string, number>;
    preferred_place_ids?: string[];
    preference_summary?: string;
    profile_version?: number;
  } | null | undefined;

  const violations = allowedIdViolations(profile?.preferred_place_ids);

  const diagnostics = {
    providerCalled:   providerCalls > 0,
    providerCalls,
    maxProviderCalls: MAX_PROVIDER_CALLS,
    attempts:         providerCalls,
    retries:          0,
    requestedModel:   "gemini-2.5-flash",
    httpStatus:       cap?.httpStatus ?? NR,
    latencyMs:        cap?.latencyMs ?? NR,
    totalMs,
    finishReason:     cand?.finishReason  ?? NR,
    finishMessage:    cand?.finishMessage ?? NR,
    candidateChars:   candidateChars ?? NR,
    responseChars:    cap?.bodyChars ?? NR,
    inputTokens:      orNR(u?.promptTokenCount),
    outputTokens:     orNR(u?.candidatesTokenCount),
    thoughtsTokens:   orNR(u?.thoughtsTokenCount),
    totalTokens:      orNR(u?.totalTokenCount),
    cachedTokens:     orNR(u?.cachedContentTokenCount),
    jsonParsed:       cap ? cap.body !== null : false,
    validatorPassed:  profile != null,
    aiStatus:         handlerBody?.ai_status ?? (handlerError ? "handler_threw" : NR),
    handlerError,
  };

  // profile 요약은 관리자가 판단할 최소한만. 원문 응답·prompt 는 넣지 않는다.
  const profileSummary = profile == null ? null : {
    profile_version:     profile.profile_version,
    category_weights:    profile.category_weights,
    preferred_place_ids: profile.preferred_place_ids,
    preference_summary:  profile.preference_summary,
  };

  log({
    status: "done", providerCalls, httpStatus: diagnostics.httpStatus,
    aiStatus: diagnostics.aiStatus, validatorPassed: diagnostics.validatorPassed,
    allowedIdViolations: violations.length, totalMs,
  });

  return json({
    success: providerCalls === 1 && diagnostics.validatorPassed && violations.length === 0,
    canary_status: "executed",
    fixture: { name: "neutral-v1", allowed_place_ids: CANARY_ALLOWED_PLACE_IDS },
    diagnostics,
    profile: profileSummary,
    allowed_id_violations: violations,
  });
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

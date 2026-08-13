// Cloudflare Pages Function: POST /api/trip/personalize
//
// 여행 전체를 보고 개인화 프로필을 **한 번만** 만든다.
//
// 왜 여기인가
//   /api/trip/plan 은 하루 단위라 14일 여행이면 14번 호출된다. 거기에 AI 를
//   넣으면 provider 호출도 14번이 된다 — 과거 비용 사고가 정확히 그 모양이었다.
//   그래서 AI 는 이 엔드포인트에서 여행당 최대 1회만 부르고, 결과 프로필을
//   클라이언트가 각 날짜의 /api/trip/plan 에 얹어 보낸다.
//
// 이 엔드포인트는 일정을 만들지 않는다. 가중치만 만든다.
//
// 안전 계약
//   · 기본 모드 off. 모르는 값·미설정도 off. 켜는 방향으로 실수할 수 없다.
//   · 재시도 0. 400·401·403·404·408·429·5xx·network·timeout 전부 즉시 fallback.
//   · timeout 8초. 늦게 끝난 응답은 버린다.
//   · secret 은 ctx.env 에서 요청 시점에만 읽는다.
//   · 어떤 실패도 200 + null profile 로 돌려준다 — 일정 생성이 멈추면 안 된다.

import {
  resolveAiMode, modeAllowsProviderCall, validateProfile, buildMockProfile,
  PROFILE_VERSION, PROFILE_CATEGORIES, TIME_PREFERENCES,
  MAX_PROFILE_PLACES, MAX_PLACE_NAME_CHARS,
  type PersonalizationProfile, type AiStatus,
} from "../../../src/lib/scheduler/ai/personalization-profile";
import {
  buildPrompt, extractJson, RESPONSE_SCHEMA,
  MODEL, TIMEOUT_MS, MAX_OUTPUT_TOKENS,
  type PlaceHint, type Body,
} from "../../../src/lib/scheduler/ai/profile-personalization-core";
import { callProfileProvider } from "../../../src/lib/scheduler/ai/profile-gemini-provider";

interface Env {
  GEMINI_API_KEY?:           string;
  AI_PERSONALIZATION_MODE?:  string;
}




const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const reply = (profile: PersonalizationProfile | null, ai_status: AiStatus) =>
  json({ profile, ai_status });

/** 로그에는 개인정보를 넣지 않는다. 식별은 짧은 해시로만 한다. */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "trip-personalize", ...fields }));
}




export async function onRequestPost(
  ctx: {
    request: Request;
    env: Env;
    /**
     * provider 호출에 쓸 fetch. **일반 요청은 이 값을 주지 않는다.**
     *
     * Cloudflare 가 만들어 넘기는 ctx 에는 이 필드가 없으므로 실제 사용자
     * 경로는 언제나 런타임 기본 fetch 를 쓴다. 관리자 canary 만 자기 요청
     * 안에서 만든 fetch 를 넘겨 호출 횟수를 센다.
     *
     * 이렇게 주입하는 이유는 예전에 canary 가 globalThis.fetch 를 잠깐
     * 바꿔치기했기 때문이다. 같은 isolate 에서 동시에 처리되는 다른 요청이
     * 그 교체된 fetch 를 보게 되므로 안전하지 않았다. 전역을 건드리지 않고
     * 요청 안에서만 끝나도록 경계를 여기로 옮겼다.
     */
    fetchFn?: typeof fetch;
  },
): Promise<Response> {
  const mode = resolveAiMode(ctx.env.AI_PERSONALIZATION_MODE);

  let body: Body;
  try { body = (await ctx.request.json()) as Body; }
  catch { return reply(null, "fallback_invalid_response"); }

  const selected = Array.isArray(body.selected_place_ids) ? body.selected_place_ids.map(String) : [];
  const liked    = Array.isArray(body.liked_place_ids)    ? body.liked_place_ids.map(String)    : [];
  // 프로필이 가리킬 수 있는 장소는 사용자가 이미 고른 것뿐이다.
  const allowedIds = [...new Set([...selected, ...liked])].slice(0, MAX_PROFILE_PLACES);

  const requestId = body.request_id
    ? shortHash(String(body.request_id))
    : shortHash([body.city, body.start_date, body.end_date, ...selected].join("|"));

  // ── off: provider 를 부르지 않는다 ──
  if (mode === "off") {
    log({ requestId, mode, providerCalled: false, status: "disabled" });
    return reply(null, "disabled");
  }

  // ── mock: 실제 요청 0. 결정론적 fixture ──
  if (mode === "mock") {
    log({ requestId, mode, providerCalled: false, status: "mock" });
    return reply(buildMockProfile(allowedIds), "mock");
  }

  // ── live: key 가 없으면 부르지 않는다 ──
  const apiKey = ctx.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    log({ requestId, mode, providerCalled: false, status: "fallback_missing_key" });
    return reply(null, "fallback_missing_key");
  }
  if (!modeAllowsProviderCall(mode)) {
    log({ requestId, mode, providerCalled: false, status: "fallback_guard" });
    return reply(null, "fallback_guard");
  }

  const places: PlaceHint[] = Array.isArray(body.selected_places)
    ? body.selected_places.slice(0, MAX_PROFILE_PLACES)
    : allowedIds.map(id => ({ place_id: id }));

  const likedHints: PlaceHint[] = Array.isArray(body.liked_places)
    ? body.liked_places.slice(0, MAX_PROFILE_PLACES)
    : [];
  const prompt = buildPrompt(body, places, likedHints);
  const started = Date.now();

  // ── 실제 호출: 정확히 1회. 재시도 루프가 없다. ──
  // 호출 코드는 공용 provider 한 벌뿐이다. 로컬 harness 도 같은 것을 쓴다 —
  // 검증한 것과 실제로 나가는 것이 달라지면 검증이 아니다.
  const call = await callProfileProvider({ prompt, apiKey, fetchFn: ctx.fetchFn });

  if (!call.ok) {
    if (call.kind === "http") {
      // 400·401·403·404·408·429·5xx 전부 여기로 온다. 재호출하지 않는다.
      log({ requestId, mode, providerCalled: true, attempts: 1, httpStatus: call.httpStatus,
            latency: call.latencyMs, status: "fallback_provider_error" });
      return reply(null, "fallback_provider_error");
    }
    const isAbort = call.kind === "timeout";
    // timeout·network 모두 재호출하지 않는다. 늦게 오는 응답도 버린다.
    log({ requestId, mode, providerCalled: true, attempts: 1,
          latency: call.latencyMs, timedOut: isAbort,
          status: isAbort ? "fallback_timeout" : "fallback_provider_error" });
    return reply(null, isAbort ? "fallback_timeout" : "fallback_provider_error");
  }

  {
    const raw     = call.raw;
    const latency = call.latencyMs;
    const cand    = raw.candidates?.[0];
    const parts   = cand?.content?.parts ?? [];
    const text    = call.text;
    const parsed  = extractJson(text);
    const profile = validateProfile(parsed, allowedIds);

    // 왜 실패했는지 알 수 있어야 한다. 응답 원문은 남기지 않고 구조적 특징만 남긴다.
    // provider 가 안 준 값은 0 으로 추측하지 않고 provider_not_returned 로 구분한다.
    const u = raw.usageMetadata;
    const orNR = (v: number | undefined) => (v === undefined ? "provider_not_returned" : v);
    log({ requestId, mode, model: MODEL, providerCalled: true, attempts: 1,
          httpStatus: 200, latency,
          finishReason:   cand?.finishReason  ?? "provider_not_returned",
          finishMessage:  cand?.finishMessage ?? "provider_not_returned",
          candidatesCount: raw.candidates?.length ?? 0,
          partsCount:      parts.length,
          candidateChars:  text.length,
          candidateHead:   text.slice(0, 1),
          candidateTail:   text.slice(-1),
          inputTokens:    orNR(u?.promptTokenCount),
          outputTokens:   orNR(u?.candidatesTokenCount),
          thoughtsTokens: orNR(u?.thoughtsTokenCount),
          totalTokens:    orNR(u?.totalTokenCount),
          cachedTokens:   orNR(u?.cachedContentTokenCount),
          jsonParsed:     parsed !== null,
          validatorPassed: profile !== null,
          status: profile ? "applied" : "fallback_invalid_response" });

    return profile ? reply(profile, "applied") : reply(null, "fallback_invalid_response");
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

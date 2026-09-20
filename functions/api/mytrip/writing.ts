// Cloudflare Pages Function: POST /api/mytrip/writing
//
// My Trip 제목/메모 AI 글쓰기 3방향. 사용자가 버튼을 눌렀을 때만 호출된다(자동 0).
//
// 안전 계약(trip/personalize 와 같은 원칙):
//  · secret 은 ctx.env 에서 요청 시점에만 읽는다. client 노출 0.
//  · 재시도 0 — 어떤 실패에서도 두 번째 provider 요청을 만들지 않는다.
//  · timeout 8초(Worker/직결 공통). 늦게 온 응답은 버린다.
//  · 어떤 실패도 200 + {suggestion:null} — My Trip 저장/기존 기록은 절대 다치지 않는다.
//  · MYTRIP_AI_WRITING_MODE=off 면 provider 를 부르지 않는다(kill switch).
//  · 입력은 필드별 길이 상한으로 자른다(비용/프롬프트 주입 방어). 로그에 원문 없음.
//
// 전송 경로 (GEMINI-SEOUL-WORKER-CANARY-V1)
//  Production 은 Service Binding(AI_WRITING) → gokoreamate-ai-writing Worker 를 쓴다.
//  Worker 는 서울 리전(gcp:asia-northeast3) targeted placement 로 실행되므로, 한국
//  사용자의 ingress colo 가 HKG 여도 Gemini egress 지역 차단(400)이 발생하지 않는다
//  (canary 실측: ingress HKG/NRT/KIX 무관 실행 colo=ICN·live 12/12·location 오류 0).
//  binding 이 없는 환경(로컬 wrangler pages dev 단독·테스트)에서는 기존 직결 경로로
//  동작한다 — 계약은 두 경로가 동일하다(Worker 도 writing-core 를 그대로 쓴다).

import {
  isWritingRequest, buildWritingPrompt, buildProviderBody, extractSuggestion,
  groundedSuggestionGuard, extractMomentSuggestion, groundedMomentGuard,
  extractMoment3, groundedMoment3Guard, extractHeroSuggestion, validateHeroRefs,
  MODEL, TIMEOUT_MS, type WritingRequest, type MomentSuggestion, type MomentSuggestionSet3,
} from "../../../src/lib/mytrip-writing/writing-core";

interface Env {
  GEMINI_API_KEY?: string;
  MYTRIP_AI_WRITING_MODE?: string;
  /** 서울 placement Worker (Service Binding). Production 에서 항상 존재한다. */
  AI_WRITING?: { fetch: typeof fetch };
  /** Worker 의 x-internal-auth 이중 잠금 키 — binding 경로에서만 쓴다. */
  INTERNAL_KEY?: string;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// moment(제목+본문 쌍)는 moment 필드, moment3(3방향 세트)는 set 필드로 나간다 —
// 기존 suggestion/moment 소비자는 영향 없다.
const reply = (suggestion: string | null, ai_status: string, moment: MomentSuggestion | null = null, set: MomentSuggestionSet3 | null = null) =>
  json({ suggestion, moment, set, ai_status });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "mytrip-writing", ...fields }));
}

/** binding 경유 — Worker 가 검증·prompt·provider·추출까지 수행하고 같은 계약으로 답한다. */
async function viaWorker(
  binding: { fetch: typeof fetch }, internalKey: string, body: unknown,
): Promise<Response> {
  const controller = new AbortController();
  // Worker 내부 provider timeout(8s)보다 넉넉히 — 정상 경로에서 이중 중단을 피한다.
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 3_000);
  const started = Date.now();
  try {
    const res = await binding.fetch("https://ai-writing.internal/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-auth": internalKey },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);
    if (!res.ok) {
      log({ ok: false, kind: "worker_http", status: res.status, latencyMs: Date.now() - started });
      return reply(null, `fallback_worker_${res.status}`);
    }
    const out = (await res.json()) as { suggestion?: unknown; moment?: unknown; set?: unknown; ai_status?: unknown };
    const suggestion = typeof out.suggestion === "string" ? out.suggestion : null;
    const m = out.moment as { title?: unknown; memo?: unknown } | null | undefined;
    const moment = m && typeof m.title === "string" && typeof m.memo === "string"
      ? { title: m.title, memo: m.memo } : null;
    // moment3 세트 — Worker 가 방향별 검증까지 마친 값이라 shape 만 확인해 통과시킨다
    const rawSet = out.set as Record<string, { title?: unknown; memo?: unknown }> | null | undefined;
    let set: MomentSuggestionSet3 | null = null;
    if (rawSet && typeof rawSet === "object") {
      const s: MomentSuggestionSet3 = {};
      for (const d of ["calm", "witty", "warm"] as const) {
        const e = rawSet[d];
        if (e && typeof e.title === "string" && typeof e.memo === "string") s[d] = { title: e.title, memo: e.memo };
      }
      if (Object.keys(s).length > 0) set = s;
    }
    const ai_status = typeof out.ai_status === "string" ? out.ai_status : "fallback_worker_shape";
    log({ ok: suggestion !== null || moment !== null || set !== null, via: "worker", ai_status, latencyMs: Date.now() - started });
    return reply(suggestion, ai_status, moment, set);
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    log({ ok: false, kind: isAbort ? "worker_timeout" : "worker_error", latencyMs: Date.now() - started });
    return reply(null, isAbort ? "fallback_timeout" : "fallback_error");
  }
}

/** 직결 경로 — binding 이 없는 로컬/테스트 환경 전용. 기존 동작 그대로. */
async function viaDirect(
  providerFetch: typeof fetch, apiKey: string, body: WritingRequest,
): Promise<Response> {
  const prompt = buildWritingPrompt(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(buildProviderBody(prompt, body.direction, body.target)),
      },
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      // provider 오류 종류 진단용 — 원문은 짧게, secret/사용자 텍스트 없음
      let errSnippet = "";
      try { errSnippet = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch { /* ignore */ }
      log({ ok: false, kind: "http", status: res.status, latencyMs, err: errSnippet, target: body.target, dir: body.direction, locale: body.locale });
      return reply(null, `fallback_http_${res.status}`);
    }
    const raw = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // 비용 감사용 usage — 토큰 수만 로그한다(사용자 텍스트·secret 없음)
    const usage = raw.usageMetadata
      ? { inTok: raw.usageMetadata.promptTokenCount ?? null, outTok: raw.usageMetadata.candidatesTokenCount ?? null, thinkTok: raw.usageMetadata.thoughtsTokenCount ?? null }
      : {};
    if (body.target === "moment3") {
      const extracted = extractMoment3(text);
      const set = groundedMoment3Guard(body, extracted);
      const n = set ? Object.keys(set).length : 0;
      log({ ok: n > 0, via: "direct", latencyMs, target: body.target, locale: body.locale, styles: n, ...usage });
      return reply(null, n === 3 ? "live" : n > 0 ? "live_partial" : extracted !== null ? "fallback_guard" : "fallback_empty", null, set);
    }
    if (body.target === "storyHero") {
      // 사실 접지(§A-3): source_refs 가 제공한 키 밖이면 거부. 추가 AI 검수 없음.
      const hero = extractHeroSuggestion(text);
      const grounded = validateHeroRefs(body, hero);
      const moment = groundedMomentGuard(body, grounded);
      const refsRejected = hero !== null && grounded === null;
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale,
            refs: hero?.sourceRefs.length ?? 0, refsRejected, guarded: grounded !== null && moment === null, ...usage });
      // source_refs 는 저장·노출하지 않는다 — 검증에만 쓰고 버린다.
      return reply(null, moment !== null ? "live" : refsRejected ? "fallback_refs" : hero !== null ? "fallback_guard" : "fallback_empty", moment);
    }
    if (body.target === "moment") {
      const extracted = extractMomentSuggestion(text);
      const moment = groundedMomentGuard(body, extracted);
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: (moment?.title.length ?? 0) + (moment?.memo.length ?? 0), guarded: extracted !== null && moment === null, ...usage });
      return reply(null, moment !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty", moment);
    }
    const extracted = extractSuggestion(text, body.target);
    // 좁은 결정적 guard(§11) — 한글 오염/사진행동 발명만. 걸리면 honest fallback.
    const suggestion = groundedSuggestionGuard(body, extracted);
    log({ ok: suggestion !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: suggestion?.length ?? 0, guarded: extracted !== null && suggestion === null, ...usage });
    return reply(suggestion, suggestion !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty");
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    log({ ok: false, kind: isAbort ? "timeout" : "error", latencyMs: Date.now() - started });
    return reply(null, isAbort ? "fallback_timeout" : "fallback_error");
  }
}

export async function onRequestPost(
  ctx: { request: Request; env: Env; fetchFn?: typeof fetch },
): Promise<Response> {
  if ((ctx.env.MYTRIP_AI_WRITING_MODE ?? "").toLowerCase() === "off") {
    return reply(null, "off");
  }

  let body: unknown;
  try { body = await ctx.request.json(); }
  catch { return reply(null, "invalid_request"); }
  if (!isWritingRequest(body)) return reply(null, "invalid_request");

  const binding = ctx.env.AI_WRITING;
  const internalKey = ctx.env.INTERNAL_KEY;
  if (binding && typeof binding.fetch === "function" && internalKey) {
    return viaWorker(binding, internalKey, body);
  }

  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return reply(null, "no_key");
  return viaDirect(ctx.fetchFn ?? fetch, apiKey, body);
}

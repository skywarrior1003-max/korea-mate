// gokoreamate-ai-writing — Gemini 호출 전용 Worker (Seoul targeted placement)
//
// 존재 이유
//   Pages Functions 는 region placement 를 지원하지 않는다(실측: 빌드 validator·
//   설정 파이프라인·REST API 모두 region 탈락). 한국 사용자의 ingress colo 가
//   HKG 로 잡히면 Gemini 가 egress 지역 차단(400 FAILED_PRECONDITION)된다.
//   이 Worker 는 Gemini 호출만 담당하고, 서울 리전 인접 위치에 배치된다.
//
// 계약 (functions/api/mytrip/writing.ts 와 동일 — writing-core 를 그대로 import)
//   · 재시도 0 · timeout 8초 · 어떤 실패도 200 + {suggestion:null}
//   · secret 은 env 에서 요청 시점에만 · 로그에 사용자 원문/secret/이미지 데이터 0
//   · moment3 는 멀티모달 허용(클라 전처리 JPEG inlineData, §B) — 그 외 target 은
//     텍스트뿐 · locale 은 요청값 그대로(언어 질문 없음)
//
// 접근 제어
//   원칙은 Service Binding 전용이다. canary 기간 workers.dev 노출이 필요하므로
//   모든 요청에 x-internal-auth 헤더(secret INTERNAL_KEY, sha256 상수시간 비교)를
//   요구한다. binding 연결 후에도 이중 잠금으로 유지한다.
//
// 경로
//   POST /generate  — WritingRequest(JSON) → {suggestion, ai_status}
//   POST /canary    — 서버 고정 합성 요청 1회 + 실행 위치 증거. 사용자 데이터 0.
//   POST /health    — 연결 진단(환경 표식·스위치·키 유무·colo). provider 호출 0.

import {
  isWritingRequest, buildWritingPrompt, buildProviderBody, extractSuggestion,
  groundedSuggestionGuard, extractMomentSuggestion, groundedMomentGuard,
  extractMoment3, groundedMoment3Guard, extractHeroSuggestion, validateHeroRefs,
  extractRequestImage, buildMoment3MultimodalPrompt, extractMoment3Creative,
  MODEL, TIMEOUT_MS, MOMENT3_MULTIMODAL_TIMEOUT_MS, type MomentSuggestion, type MomentSuggestionSet3, type HeroSuggestion,
  type WritingImage, type WritingRequest, type Moment3CreativeMeta, type TrendPromptEntry,
  // eslint 없음 — 계약: functions 와 동일 배선
} from "../../../src/lib/mytrip-writing/writing-core";
import { buildProviderRequestBody } from "../../../src/lib/scheduler/ai/profile-gemini-provider";
import { providerBodyBound, PRICED_MODELS, RESERVED_HEADER } from "../../../src/lib/ai-cost/provider-bound";

export interface Env {
  GEMINI_API_KEY?: string;
  INTERNAL_KEY?: string;
  AI_WRITING_WORKER_MODE?: string;
  /** 진단용 표식 — Preview 전용 Worker 는 "preview"(없으면 production 으로 본다) */
  WORKER_ENV?: string;
  /** 환경별 모델(없으면 writing-core MODEL). Preview 전용 Worker 에서만 설정한다 — Production 은 설정하지 않는다 */
  GEMINI_MODEL?: string;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** 모델에 요청을 보내기 전의 거절 — 호출측이 회사 원장 예약을 되돌릴 수 있게 표시한다(x-gkm-provider-called: 0) */
const refused = (b: unknown, status: number) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "x-gkm-provider-called": "0" },
  });
/** /provider 기본 본문 상한(텍스트 요청) · 사진을 싣는 요청이 x-provider-max-bytes 로 늘릴 수 있는 최대치 */
const PROVIDER_BODY_DEFAULT = 64_000;
/** /model-check 로 확인할 수 있는 모델 — 지금 쓰는 것(2.5)과 전환 대상(3.5 Flash-Lite)만 */
export const MODEL_CHECK_ALLOW = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];
const PROVIDER_BODY_MAX = 12_000_000;
/** 이 Worker 가 부르는 모델 — 환경 변수가 있으면 그것(Preview 전용), 없으면 공용 MODEL */
/**
 * 모델 세대에 맞게 요청 설정을 고친다 — 3.x 는 thinkingBudget:0 을 받지 않는다(400 INVALID_ARGUMENT, 2026-09-30 실측).
 * 호출측은 2.5 기준 본문을 그대로 보내고, 여기서 3.x 일 때만 thinkingLevel "low" 로 바꾼다(2.5 본문은 그대로).
 */
export function adaptProviderBody(raw: string, model: string): string {
  if (model.startsWith("gemini-2.")) return raw;
  try {
    const b = JSON.parse(raw) as { generationConfig?: { thinkingConfig?: Record<string, unknown> } };
    const tc = b.generationConfig?.thinkingConfig;
    if (!tc || !("thinkingBudget" in tc)) return raw;
    b.generationConfig!.thinkingConfig = { thinkingLevel: "low" }; // minimal 은 3.8 Flash 에서 400(2026-09-30 실측) — 공통으로 low
    return JSON.stringify(b);
  } catch { return raw; }
}

const modelOf = (env: Env): string => {
  const m = (env.GEMINI_MODEL ?? "").trim();
  return /^[a-z0-9.\-]{3,60}$/.test(m) ? m : MODEL;
};

const reply = (suggestion: string | null, ai_status: string, moment: MomentSuggestion | null = null, set: MomentSuggestionSet3 | null = null) =>
  json({ suggestion, moment, set, ai_status });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "ai-writing-worker", ...fields }));
}

/** sha256 후 상수시간 비교 — 길이 차이도 예외 없이 흡수한다(admin-auth 와 같은 이유). */
async function keysMatch(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i]! ^ bv[i]!;
  return diff === 0;
}

interface ProviderOutcome {
  suggestion: string | null;
  moment: MomentSuggestion | null;
  hero: HeroSuggestion | null;
  set: MomentSuggestionSet3 | null;
  creativeMeta: Moment3CreativeMeta | null;
  ai_status: string;
  httpStatus: number | null;
  latencyMs: number;
  errSnippet: string;
}

/** provider 1회 호출. 재시도 0, timeout 8s, 실패는 전부 무해 상태 문자열로. */
async function callProvider(
  apiKey: string, prompt: string, target: "title" | "memo" | "moment" | "moment3" | "storyHero",
  direction?: "calm" | "witty" | "warm", image?: WritingImage | null, trendEntries: readonly TrendPromptEntry[] = [],
  locale: "ko" | "en" | "ja" | "zh" = "ko",
): Promise<ProviderOutcome> {
  const controller = new AbortController();
  const started = Date.now();
  const isMultimodal = target === "moment3" && !!image;
  // 멀티모달은 12s(QA 실측 ja 8.0s 초과) — 재시도 0 계약은 그대로다.
  const timer = setTimeout(() => controller.abort(), isMultimodal ? MOMENT3_MULTIMODAL_TIMEOUT_MS : TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(buildProviderBody(prompt, direction, target, isMultimodal ? image : null)),
      },
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      let errSnippet = "";
      try { errSnippet = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch { /* ignore */ }
      return { suggestion: null, moment: null, hero: null, set: null, creativeMeta: null, ai_status: `fallback_http_${res.status}`, httpStatus: res.status, latencyMs, errSnippet };
    }
    const raw = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (target === "moment3") {
      // 사진 경로는 창작 검증 파서 — 이미지 데이터는 이 함수 밖으로 나가지 않는다.
      // V5-1 §B — Functions 와 동일 계약: phrase+variants 서버 문자열 판정
      const creative = isMultimodal
        ? extractMoment3Creative(text, new Map<string, readonly string[]>(trendEntries.map(e => [e.id, [e.phrase, ...(e.variants ?? [])]])), locale)
        : null;
      const set = isMultimodal ? (creative?.set ?? null) : extractMoment3(text);
      return {
        suggestion: null, moment: null, hero: null, set, creativeMeta: creative?.meta ?? null,
        ai_status: set !== null ? "live" : "fallback_empty",
        httpStatus: res.status, latencyMs, errSnippet: "",
      };
    }
    if (target === "storyHero") {
      const hero = extractHeroSuggestion(text);
      return { suggestion: null, moment: null, hero, set: null, creativeMeta: null, ai_status: hero !== null ? "live" : "fallback_empty", httpStatus: res.status, latencyMs, errSnippet: "" };
    }
    if (target === "moment") {
      const moment = extractMomentSuggestion(text);
      return {
        suggestion: null, moment, hero: null, set: null, creativeMeta: null,
        ai_status: moment !== null ? "live" : "fallback_empty",
        httpStatus: res.status, latencyMs, errSnippet: "",
      };
    }
    const suggestion = extractSuggestion(text, target);
    return {
      suggestion, moment: null, hero: null, set: null, creativeMeta: null,
      ai_status: suggestion !== null ? "live" : "fallback_empty",
      httpStatus: res.status, latencyMs, errSnippet: "",
    };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      suggestion: null, moment: null, hero: null, set: null, creativeMeta: null,
      ai_status: isAbort ? "fallback_timeout" : "fallback_error",
      httpStatus: null, latencyMs: Date.now() - started, errSnippet: "",
    };
  }
}

/** 실행 위치 증거 — Cloudflare trace 의 colo 만 뽑는다(비민감). */
async function executionColo(): Promise<string> {
  try {
    const t = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
    return /colo=([A-Z]{3})/.exec(t)?.[1] ?? "unknown";
  } catch { return "trace_failed"; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return refused({ error: "method_not_allowed" }, 405);

    const provided = request.headers.get("x-internal-auth") ?? "";
    if (!env.INTERNAL_KEY || !provided || !(await keysMatch(provided, env.INTERNAL_KEY))) {
      return refused({ error: "unauthorized" }, 401);
    }
    // 연결 진단 — provider 를 부르지 않는다(비용 0). 키는 있는지만(값·형식 없음).
    if (new URL(request.url).pathname === "/health") {
      return json({
        worker_env: (env.WORKER_ENV ?? "production").trim() || "production",
        mode: (env.AI_WRITING_WORKER_MODE ?? "").trim().toLowerCase() === "live" ? "live" : "off",
        has_key: !!env.GEMINI_API_KEY, colo: await executionColo(),
      });
    }
    // V2-HARDCAP §8 — Worker 자체 kill switch(누락·오타=차단). Pages 게이트와
    // 독립으로, binding·직접 호출 어느 경로든 이 스위치가 꺼져 있으면 provider 0.
    if ((env.AI_WRITING_WORKER_MODE ?? "").trim().toLowerCase() !== "live") {
      return refused({ error: "worker_disabled" }, 503);
    }
    const apiKey = env.GEMINI_API_KEY;
    const path = new URL(request.url).pathname;
    // /provider 호출측은 HTTP 상태로 분기한다 — 키 누락을 200 빈 응답이 아니라 503 코드로 알린다
    if (!apiKey) return path === "/provider" ? refused({ error: "no_key" }, 503) : reply(null, "no_key");

    if (path === "/models") {
      // 이 키로 쓸 수 있는 모델 이름만(생성 호출 아님 · 비용 0). 키 값은 응답에 싣지 않는다.
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`);
        const j = (await r.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
        const names = (j.models ?? []).filter(m => (m.supportedGenerationMethods ?? []).includes("generateContent")).map(m => String(m.name).replace(/^models\//, ""));
        return json({ http: r.status, current: modelOf(env), models: names });
      } catch { return json({ error: "list_failed" }, 502); }
    }

    if (path === "/model-check") {
      // 운영자 확인(2026-10-02) — 이 Worker 의 키로 대상 모델이 **실제로 생성되는지**. 모델 목록에 이름이 있어도
      // 생성은 거절될 수 있다(실측: 2.5 Flash 가 목록엔 있고 생성은 404 "no longer available to new users").
      // 아주 작은 요청 1회(수 토큰) · 재시도 0 · 사용자 입력 없음. 응답에는 상태만 — 생성 문장·키 값을 싣지 않는다.
      let target = modelOf(env);
      try {
        const pb = (await request.json()) as { model?: unknown };
        if (typeof pb.model === "string" && MODEL_CHECK_ALLOW.includes(pb.model)) target = pb.model;
      } catch { /* 지금 모델 */ }
      const started = Date.now();
      try {
        const body = adaptProviderBody(JSON.stringify({
          contents: [{ parts: [{ text: "Reply with the word ok." }] }],
          generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
        }), target);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${target}:generateContent?key=${apiKey}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(15_000),
        });
        let errorStatus: string | null = null, inTok: number | null = null, outTok: number | null = null;
        try {
          const j = (await r.json()) as { error?: { status?: string }; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
          errorStatus = j.error?.status ?? null;
          inTok = j.usageMetadata?.promptTokenCount ?? null; outTok = j.usageMetadata?.candidatesTokenCount ?? null;
        } catch { /* 본문 없음 */ }
        const res = { model: target, current: modelOf(env), http: r.status, ok: r.ok, error_status: errorStatus, ms: Date.now() - started, in_tok: inTok, out_tok: outTok };
        log({ kind: "model_check", ...res });
        return json(res);
      } catch (e) {
        const res = { model: target, current: modelOf(env), ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "timeout" : "error", ms: Date.now() - started };
        log({ kind: "model_check", ...res });
        return json(res);
      }
    }

    if (path === "/probe" && (env.WORKER_ENV ?? "").trim() === "preview") {
      // Preview 전용 원인 진단 — 아주 작은 요청 하나(수 토큰). 상태·오류 앞부분만(키 값·본문 원문 없음)
      let variant = "plain", probeModel = modelOf(env);
      try {
        const pb = (await request.json()) as { variant?: unknown; model?: unknown };
        variant = String(pb.variant ?? "plain");
        if (typeof pb.model === "string" && ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"].includes(pb.model)) probeModel = pb.model;
      } catch { /* 기본 */ }
      const gc: Record<string, unknown> = { maxOutputTokens: 32 };
      if (variant === "thinking0" || variant === "all") gc.thinkingConfig = { thinkingBudget: 0 };
      if (variant.startsWith("level_")) { gc.thinkingConfig = { thinkingLevel: variant.slice(6) }; gc.responseMimeType = "application/json"; gc.responseSchema = { type: "object", properties: { a: { type: "string", nullable: true } } }; }
      if (variant === "json" || variant === "all") { gc.responseMimeType = "application/json"; gc.responseSchema = { type: "object", properties: { a: { type: "string", nullable: true } } }; }
      const started = Date.now();
      try {
        // variant "profile": AI 스케줄러와 같은 요청 본문(스키마·설정)에 짧은 프롬프트 — 3.x 호환성 진단
        // variant "profile_<low|minimal|medium|none>": 같은 개인화 본문을 사고 수준만 바꿔 토큰 내역 비교(10-02 비용 대조)
        const profileBody = () => JSON.parse(JSON.stringify(buildProviderRequestBody("Return a travel preference profile for a relaxed 2-day Busan trip. Places: 39, 966, 1460."))) as { generationConfig?: Record<string, unknown> };
        let body: string;
        if (variant === "profile") body = adaptProviderBody(JSON.stringify(buildProviderRequestBody("Return a travel preference profile for a relaxed 2-day Busan trip. Places: 39, 966, 1460.")), probeModel);
        else if (variant.startsWith("profile_")) {
          const pbody = profileBody(); const lv = variant.slice(8);
          pbody.generationConfig = { ...(pbody.generationConfig ?? {}), thinkingConfig: lv === "none" ? undefined : { thinkingLevel: lv } };
          body = JSON.stringify(pbody);
        } else body = JSON.stringify({ contents: [{ parts: [{ text: "Reply with the word ok." }] }], generationConfig: gc });
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${probeModel}:generateContent?key=${apiKey}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(20_000),
        });
        const t = await r.text();
        const colo = await executionColo();
        return json({ variant, model: probeModel, http: r.status, ms: Date.now() - started, colo, cfRay: r.headers.get("cf-ray"), server: r.headers.get("server"),
          body: t.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]").slice(0, 240),
          usage: (() => { try { return (JSON.parse(t) as { usageMetadata?: unknown }).usageMetadata ?? null; } catch { return null; } })() });
      } catch (e) { return json({ variant, error: e instanceof Error ? e.name : "error", ms: Date.now() - started, colo: await executionColo() }); }
    }

    if (path === "/canary") {
      // 본문은 읽지 않는다 — provider 로 나가는 입력은 서버 고정값뿐이다.
      const fixed = {
        target: "memo" as const, direction: "calm" as const, locale: "en" as const,
        context: { city: "Busan", placeName: "Haeundae Beach", hasPhoto: false },
      };
      const prompt = buildWritingPrompt(fixed);
      const [outcome, colo] = await Promise.all([
        callProvider(apiKey, prompt, fixed.target, fixed.direction),
        executionColo(),
      ]);
      log({ kind: "canary", ai_status: outcome.ai_status, httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo, err: outcome.errSnippet });
      return json({
        canary: true, colo, model: MODEL,
        ai_status: outcome.ai_status, httpStatus: outcome.httpStatus,
        latencyMs: outcome.latencyMs, err: outcome.errSnippet,
        suggestionPreview: outcome.suggestion?.slice(0, 80) ?? null,
      });
    }

    if (path === "/provider") {
      // 자사 Pages Functions 전용 provider 프록시(트립 personalize 등).
      // 모델·키·URL 은 이 Worker 가 고정하고, 호출측은 자기 계약의 요청 본문
      // (contents + generationConfig)만 보낸다. 접근은 binding + x-internal-auth 뿐.
      let raw = "";
      try { raw = await request.text(); } catch { return refused({ error: "invalid_body" }, 400); }
      // 사진을 싣는 요청(전체 여행 글쓰기)만 x-provider-max-bytes 로 상한을 올린다 — 12MB 를 넘지 않는다
      const askedMax = Number(request.headers.get("x-provider-max-bytes") ?? "");
      const bodyMax = Number.isFinite(askedMax) && askedMax > PROVIDER_BODY_DEFAULT ? Math.min(PROVIDER_BODY_MAX, Math.floor(askedMax)) : PROVIDER_BODY_DEFAULT;
      // 바이트로 잰다(2026-10-02) — 글자 수로 재면 한글·이모지 본문은 상한의 몇 배가 들어온다
      if (new TextEncoder().encode(raw).length > bodyMax) return refused({ error: "body_too_large" }, 413);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return refused({ error: "invalid_body" }, 400); }
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { contents?: unknown }).contents)) {
        return refused({ error: "invalid_body" }, 400);
      }
      // 비용 상한 확인(2026-10-02) — 단가를 아는 모델로만 부르고, 이 본문의 최대 비용(provider-bound)이 호출측이
      // 회사 원장에 예약한 금액보다 크면 보내지 않는다. 도구·출력 상한 없음·사고 무제한 본문도 보내지 않는다.
      // 모두 보내기 전 거절이라 provider-called: 0 → 호출측은 예약을 released 로 정산한다.
      if (!PRICED_MODELS[modelOf(env)]) return refused({ error: "model_not_priced" }, 503);
      const bound = providerBodyBound(parsed);
      if (!bound.ok) return refused({ error: bound.reason }, 400);
      const declared = Number(request.headers.get(RESERVED_HEADER) ?? "");
      if (!Number.isFinite(declared) || declared < bound.usdMicro) {
        log({ kind: "provider", refused: "reservation_below_bound", declared: Number.isFinite(declared) ? declared : null, bound: bound.usdMicro });
        return refused({ error: "reservation_below_bound" }, 409);
      }
      const controller = new AbortController();
      // 호출측이 긴 작업(가져오기 분석·전체 여행 글쓰기)이면 x-provider-timeout-ms 로 늘린다 — 8~45초로 제한
      const wanted = Number(request.headers.get("x-provider-timeout-ms") ?? "");
      const timeoutMs = Number.isFinite(wanted) && wanted > 0 ? Math.min(45_000, Math.max(TIMEOUT_MS, Math.floor(wanted))) : TIMEOUT_MS;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelOf(env)}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: adaptProviderBody(raw, modelOf(env)),
          },
        );
        clearTimeout(timer);
        const [text, colo] = await Promise.all([res.text(), executionColo()]);
        // 실패 응답은 원인 문장 앞부분만 로그에(키·본문 원문 없음) — 지역 차단·인자 오류·과부하 구분용
        const errHead = res.ok ? undefined : text.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]").replace(/\s+/g, " ").slice(0, 160);
        log({ kind: "provider", httpStatus: res.status, latencyMs: Date.now() - started, colo, bytes: text.length, inBytes: raw.length, model: modelOf(env), ...(errHead ? { errHead } : {}) });
        // 상태·본문을 그대로 넘긴다 — 호출측의 기존 오류 분기(!res.ok)가 그대로 동작한다.
        return new Response(text, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "x-gkm-provider-called": "1", "x-gkm-model": modelOf(env) } });
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === "AbortError";
        log({ kind: "provider", ok: false, err: isAbort ? "timeout" : "error", latencyMs: Date.now() - started });
        // 요청을 보낸 뒤의 시간 초과·연결 실패 — 결과를 알 수 없다(과금 불확실)
        return new Response(JSON.stringify({ error: isAbort ? "timeout" : "unreachable" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "x-gkm-provider-called": "1" } });
      }
    }

    if (path !== "/generate") return json({ error: "not_found" }, 404);

    let body: unknown;
    try { body = await request.json(); }
    catch { return reply(null, "invalid_request"); }
    if (!isWritingRequest(body)) return reply(null, "invalid_request");

    // 사진 입력(§B) — moment3 전용. 위반 이미지는 provider 호출 없이 정직한 실패.
    let image: WritingImage | null = null;
    const rawImage = (body as WritingRequest).image;
    if (rawImage !== undefined && rawImage !== null) {
      if (body.target !== "moment3") return reply(null, "invalid_image");
      const img = extractRequestImage(rawImage);
      if (img === "invalid") {
        log({ ok: false, target: body.target, locale: body.locale, kind: "invalid_image" });
        return reply(null, "invalid_image");
      }
      image = img;
    }
    const isMultimodal = body.target === "moment3" && image !== null;
    // Trend(V2 §9) — DB SSOT 는 함수 계층이 읽고, 이 Worker 에는 내부 인증을 거친
    // 함수가 고른 목록만 body.trendEntries 로 들어온다(외부 직접 호출은 401).
    const rawTrend = (body as { trendEntries?: unknown }).trendEntries;
    const trendEntries: TrendPromptEntry[] = Array.isArray(rawTrend)
      ? rawTrend.filter((e): e is TrendPromptEntry => !!e && typeof (e as TrendPromptEntry).id === "string" && typeof (e as TrendPromptEntry).phrase === "string").slice(0, 5)
        // V5-1 §B — variants 는 문자열만 통과(판정 입력 방어)
        .map(e => ({ ...e, variants: Array.isArray(e.variants) ? e.variants.filter((v): v is string => typeof v === "string") : [] }))
      : [];
    const prompt = isMultimodal ? buildMoment3MultimodalPrompt(body, trendEntries) : buildWritingPrompt(body);

    // colo 는 placement 상시 관측용 — provider 호출과 병렬이라 지연을 더하지 않는다.
    const [outcome, colo] = await Promise.all([
      callProvider(apiKey, prompt, body.target, body.direction, image, trendEntries, body.locale),
      executionColo(),
    ]);
    // 좁은 결정적 guard(LOCALE-FACT-GROUNDING-V1 §11) — 한글 오염/사진행동 발명만.
    // 걸리면 기존 honest fallback(200 + null). 재시도 없음.
    if (body.target === "moment3") {
      const set = groundedMoment3Guard(body, outcome.set);
      const guarded = outcome.set !== null && set === null;
      const n = set ? Object.keys(set).length : 0;
      const ai_status = guarded ? "fallback_guard" : n > 0 && n < 3 ? "live_partial" : outcome.ai_status;
      log({
        ok: n > 0, ai_status, httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo,
        target: body.target, locale: body.locale, styles: n, err: outcome.errSnippet, guarded,
        multimodal: isMultimodal,
        ...(isMultimodal ? { imgB64Len: image!.data.length, kinds: outcome.creativeMeta?.kinds ?? null, dropped: outcome.creativeMeta?.dropped ?? null } : {}),
      });
      return reply(null, ai_status, null, set);
    }
    if (body.target === "storyHero") {
      // 표지는 AI 가 직접 쓴다(§J) — basis_refs 확인 + creative_kind whitelist 검증.
      const grounded = validateHeroRefs(body, outcome.hero);
      const moment = groundedMomentGuard(body, grounded);
      const refsRejected = outcome.hero !== null && grounded === null;
      const ai_status = moment !== null ? "live" : refsRejected ? "fallback_refs" : outcome.hero !== null ? "fallback_guard" : outcome.ai_status;
      log({ ok: moment !== null, ai_status, httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo,
            target: body.target, dir: body.direction, locale: body.locale, refs: outcome.hero?.sourceRefs.length ?? 0, kind: outcome.hero?.creativeKind ?? null, refsRejected });
      return reply(null, ai_status, moment);
    }
    if (body.target === "moment") {
      const moment = groundedMomentGuard(body, outcome.moment);
      const guarded = outcome.moment !== null && moment === null;
      const ai_status = guarded ? "fallback_guard" : outcome.ai_status;
      log({
        ok: moment !== null, ai_status,
        httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo,
        target: body.target, dir: body.direction, locale: body.locale,
        outLen: (moment?.title.length ?? 0) + (moment?.memo.length ?? 0), err: outcome.errSnippet, guarded,
      });
      return reply(null, ai_status, moment);
    }
    const suggestion = groundedSuggestionGuard(body, outcome.suggestion);
    const guarded = outcome.suggestion !== null && suggestion === null;
    const ai_status = guarded ? "fallback_guard" : outcome.ai_status;
    log({
      ok: suggestion !== null, ai_status,
      httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo,
      target: body.target, dir: body.direction, locale: body.locale,
      outLen: suggestion?.length ?? 0, err: outcome.errSnippet, guarded,
    });
    return reply(suggestion, ai_status);
  },
};

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

import {
  isWritingRequest, buildWritingPrompt, buildProviderBody, extractSuggestion,
  groundedSuggestionGuard, extractMomentSuggestion, groundedMomentGuard,
  extractMoment3, groundedMoment3Guard, extractHeroSuggestion, validateHeroRefs,
  extractRequestImage, buildMoment3MultimodalPrompt, extractMoment3Creative,
  MODEL, TIMEOUT_MS, MOMENT3_MULTIMODAL_TIMEOUT_MS, type MomentSuggestion, type MomentSuggestionSet3, type HeroSuggestion,
  type WritingImage, type WritingRequest, type Moment3CreativeMeta, type TrendPromptEntry,
  // eslint 없음 — 계약: functions 와 동일 배선
} from "../../../src/lib/mytrip-writing/writing-core";

export interface Env {
  GEMINI_API_KEY?: string;
  INTERNAL_KEY?: string;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

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
      const creative = isMultimodal ? extractMoment3Creative(text, new Map(trendEntries.map(e => [e.id, e.phrase]))) : null;
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
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const provided = request.headers.get("x-internal-auth") ?? "";
    if (!env.INTERNAL_KEY || !provided || !(await keysMatch(provided, env.INTERNAL_KEY))) {
      return json({ error: "unauthorized" }, 401);
    }
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return reply(null, "no_key");

    const path = new URL(request.url).pathname;

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
      try { raw = await request.text(); } catch { return json({ error: "invalid_body" }, 400); }
      if (raw.length > 64_000) return json({ error: "body_too_large" }, 413);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return json({ error: "invalid_body" }, 400); }
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { contents?: unknown }).contents)) {
        return json({ error: "invalid_body" }, 400);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const started = Date.now();
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: raw,
          },
        );
        clearTimeout(timer);
        const [text, colo] = await Promise.all([res.text(), executionColo()]);
        log({ kind: "provider", httpStatus: res.status, latencyMs: Date.now() - started, colo, bytes: text.length });
        // 상태·본문을 그대로 넘긴다 — 호출측의 기존 오류 분기(!res.ok)가 그대로 동작한다.
        return new Response(text, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === "AbortError";
        log({ kind: "provider", ok: false, err: isAbort ? "timeout" : "error", latencyMs: Date.now() - started });
        return json({ error: isAbort ? "timeout" : "unreachable" }, 502);
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
      : [];
    const prompt = isMultimodal ? buildMoment3MultimodalPrompt(body, trendEntries) : buildWritingPrompt(body);

    // colo 는 placement 상시 관측용 — provider 호출과 병렬이라 지연을 더하지 않는다.
    const [outcome, colo] = await Promise.all([
      callProvider(apiKey, prompt, body.target, body.direction, image, trendEntries),
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

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
//   · secret 은 env 에서 요청 시점에만 · 로그에 사용자 원문/secret 0
//   · 사진 픽셀 없음(hasPhoto boolean 뿐) · locale 은 요청값 그대로(언어 질문 없음)
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
  MODEL, TIMEOUT_MS,
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

const reply = (suggestion: string | null, ai_status: string) => json({ suggestion, ai_status });

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
  ai_status: string;
  httpStatus: number | null;
  latencyMs: number;
  errSnippet: string;
}

/** provider 1회 호출. 재시도 0, timeout 8s, 실패는 전부 무해 상태 문자열로. */
async function callProvider(
  apiKey: string, prompt: string, target: "title" | "memo",
): Promise<ProviderOutcome> {
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
        body: JSON.stringify(buildProviderBody(prompt)),
      },
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      let errSnippet = "";
      try { errSnippet = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch { /* ignore */ }
      return { suggestion: null, ai_status: `fallback_http_${res.status}`, httpStatus: res.status, latencyMs, errSnippet };
    }
    const raw = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const suggestion = extractSuggestion(text, target);
    return {
      suggestion,
      ai_status: suggestion !== null ? "live" : "fallback_empty",
      httpStatus: res.status, latencyMs, errSnippet: "",
    };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      suggestion: null,
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
        callProvider(apiKey, prompt, fixed.target),
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

    if (path !== "/generate") return json({ error: "not_found" }, 404);

    let body: unknown;
    try { body = await request.json(); }
    catch { return reply(null, "invalid_request"); }
    if (!isWritingRequest(body)) return reply(null, "invalid_request");

    // colo 는 placement 상시 관측용 — provider 호출과 병렬이라 지연을 더하지 않는다.
    const [outcome, colo] = await Promise.all([
      callProvider(apiKey, buildWritingPrompt(body), body.target),
      executionColo(),
    ]);
    log({
      ok: outcome.suggestion !== null, ai_status: outcome.ai_status,
      httpStatus: outcome.httpStatus, latencyMs: outcome.latencyMs, colo,
      target: body.target, dir: body.direction, locale: body.locale,
      outLen: outcome.suggestion?.length ?? 0, err: outcome.errSnippet,
    });
    return reply(outcome.suggestion, outcome.ai_status);
  },
};

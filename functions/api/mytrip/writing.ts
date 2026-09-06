// Cloudflare Pages Function: POST /api/mytrip/writing
//
// My Trip 제목/메모 AI 글쓰기 3방향. 사용자가 버튼을 눌렀을 때만 호출된다(자동 0).
//
// 안전 계약(trip/personalize 와 같은 원칙):
//  · secret 은 ctx.env 에서 요청 시점에만 읽는다. client 노출 0.
//  · 재시도 0 — 어떤 실패에서도 두 번째 provider 요청을 만들지 않는다.
//  · timeout 8초. 늦게 온 응답은 버린다.
//  · 어떤 실패도 200 + {suggestion:null} — My Trip 저장/기존 기록은 절대 다치지 않는다.
//  · MYTRIP_AI_WRITING_MODE=off 면 provider 를 부르지 않는다(kill switch).
//  · 입력은 필드별 길이 상한으로 자른다(비용/프롬프트 주입 방어). 로그에 원문 없음.

import {
  isWritingRequest, buildWritingPrompt, buildProviderBody, extractSuggestion,
  MODEL, TIMEOUT_MS,
} from "../../../src/lib/mytrip-writing/writing-core";

interface Env {
  GEMINI_API_KEY?: string;
  MYTRIP_AI_WRITING_MODE?: string;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const reply = (suggestion: string | null, ai_status: string) => json({ suggestion, ai_status });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "mytrip-writing", ...fields }));
}

export async function onRequestPost(
  ctx: { request: Request; env: Env; fetchFn?: typeof fetch },
): Promise<Response> {
  if ((ctx.env.MYTRIP_AI_WRITING_MODE ?? "").toLowerCase() === "off") {
    return reply(null, "off");
  }
  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) return reply(null, "no_key");

  let body: unknown;
  try { body = await ctx.request.json(); }
  catch { return reply(null, "invalid_request"); }
  if (!isWritingRequest(body)) return reply(null, "invalid_request");

  const prompt = buildWritingPrompt(body);
  const providerFetch = ctx.fetchFn ?? fetch;
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
        body: JSON.stringify(buildProviderBody(prompt)),
      },
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      log({ ok: false, kind: "http", status: res.status, latencyMs, target: body.target, dir: body.direction, locale: body.locale });
      return reply(null, `fallback_http_${res.status}`);
    }
    const raw = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const suggestion = extractSuggestion(text, body.target);
    log({ ok: suggestion !== null, latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: suggestion?.length ?? 0 });
    return reply(suggestion, suggestion !== null ? "live" : "fallback_empty");
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    log({ ok: false, kind: isAbort ? "timeout" : "error", latencyMs: Date.now() - started });
    return reply(null, isAbort ? "fallback_timeout" : "fallback_error");
  }
}

// Cloudflare Pages Function: POST /api/import/analyze
// (TASK-GOKOREAMATE-EXTERNAL-URL-IMPORT-ENGINE-V1)
//
// 사용자가 붙여넣은 외부 URL 을 안전하게 읽어 여행 구조(사실만)를 추출한다.
// 저장은 하지 않는다 — 결과는 클라이언트 Preview 재료일 뿐이고, 저장은 사용자가
// Preview 에서 확인한 뒤 기존 계약(My Trip/Saved/This Trip)으로만 일어난다.
//
// 안전 계약
//  · http/https 만, private/internal 호스트 차단(import-core.validateImportUrl)
//  · redirect 수동 처리 ≤3회 — 매 hop 재검증
//  · timeout 12s · 응답 1.5MB 상한 · text/html·xhtml·plain 만
//  · 쿠키/자격증명 전달 0 · 로그인/유료벽 우회 없음 · JS 렌더 필요 페이지는 정직하게 실패
//  · raw HTML 저장 0(무상태) · 로그에는 host 와 상태만 — URL 전체/본문/추출문 남기지 않음
//  · gokoreamate 자체 URL 은 fetch/AI 분석하지 않는다(§7) — 클라이언트가 기존
//    shared 흐름으로 처리하고, 서버는 이중 가드로 거절만 한다.
//
// AI 는 승인된 내부 통로(서울 placement Worker /provider — provider-neutral 내부
// 계약)를 재사용한다. binding 이 없는 로컬 dev 는 직결 fallback(writing/personalize 와
// 동일 패턴). 어떤 실패도 200 + {ok:false, error} — 클라이언트가 정직하게 보여 준다.

import {
  validateImportUrl, isOwnHost, extractReadableText, buildAnalyzePrompt, parseAnalyzed,
  ANALYZE_SCHEMA, MAX_REDIRECTS, FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES, ALLOWED_CONTENT_TYPES,
  type AnalyzedContent,
} from "../../../src/lib/url-import/import-core";
import { MODEL } from "../../../src/lib/mytrip-writing/writing-core";

interface Env {
  GEMINI_API_KEY?: string;
  AI_WRITING?: { fetch: typeof fetch };
  INTERNAL_KEY?: string;
  URL_IMPORT_MODE?: string; // "off" → kill switch
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fail = (error: string) => json({ ok: false, error });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "url-import", ...fields }));
}

// ── 안전 fetch — redirect 수동, 매 hop 재검증, 크기 상한 스트리밍 확인 ───────
async function safeFetchPage(startUrl: URL): Promise<
  | { ok: true; html: string; finalHost: string }
  | { ok: false; error: string }
> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isOwnHost(current.hostname)) return { ok: false, error: "internal_url" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GoKoreaMateImport/1.0; +https://gokoreamate.com)",
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Language": "en,ko;q=0.9,ja;q=0.8,zh;q=0.8",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return { ok: false, error: isAbort ? "timeout" : "fetch_failed" };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, error: `http_${res.status}` };
      let next: URL;
      try { next = new URL(loc, current); } catch { return { ok: false, error: "fetch_failed" }; }
      const check = validateImportUrl(next.toString());
      if (!check.ok) return { ok: false, error: "blocked_redirect" };
      current = check.url;
      continue;
    }
    if (!res.ok) return { ok: false, error: `http_${res.status}` };

    const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(ct)) return { ok: false, error: "unsupported_content_type" };

    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_RESPONSE_BYTES) return { ok: false, error: "too_large" };

    // 스트리밍으로 상한 강제 — content-length 를 속여도 여기서 끊는다
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "fetch_failed" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return { ok: true, html: new TextDecoder("utf-8", { fatal: false }).decode(buf), finalHost: current.hostname };
  }
  return { ok: false, error: "too_many_redirects" };
}

// ── provider (서울 Worker 경유 우선 — personalize 와 동일 패턴) ──────────────
function bindingProviderFetch(env: Env): typeof fetch | undefined {
  const binding = env.AI_WRITING;
  const key = env.INTERNAL_KEY;
  if (!binding || typeof binding.fetch !== "function" || !key) return undefined;
  return ((_url: RequestInfo | URL, init?: RequestInit) =>
    binding.fetch("https://ai-writing.internal/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-auth": key },
      body: init?.body ?? null,
      signal: init?.signal ?? undefined,
    })) as typeof fetch;
}

async function analyzeWithAi(env: Env, prompt: string): Promise<
  | { ok: true; analysis: AnalyzedContent }
  | { ok: false; error: string }
> {
  const apiKey = env.GEMINI_API_KEY ?? "";
  const providerFetch = bindingProviderFetch(env) ?? (apiKey ? fetch : null);
  if (!providerFetch) return { ok: false, error: "analyze_unavailable" };

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: ANALYZE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body },
    );
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: "analyze_failed" };
    const raw = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const analysis = parseAnalyzed(text);
    if (!analysis) return { ok: false, error: "analyze_failed" };
    return { ok: true, analysis };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: isAbort ? "analyze_timeout" : "analyze_failed" };
  }
}

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  if ((ctx.env.URL_IMPORT_MODE ?? "").toLowerCase() === "off") return fail("off");

  let body: { url?: unknown };
  try { body = (await ctx.request.json()) as { url?: unknown }; }
  catch { return fail("invalid_request"); }
  if (typeof body.url !== "string") return fail("invalid_request");

  const check = validateImportUrl(body.url);
  if (!check.ok) {
    log({ ok: false, error: check.reason });
    return fail(check.reason === "blocked_host" ? "blocked_host" : "invalid_url");
  }
  // 내부 URL 은 여기 오면 안 된다(클라이언트가 shared 흐름으로 처리) — 이중 가드
  if (isOwnHost(check.url.hostname)) return fail("internal_url");

  const started = Date.now();
  const fetched = await safeFetchPage(check.url);
  if (!fetched.ok) {
    log({ ok: false, host: check.url.hostname, error: fetched.error, ms: Date.now() - started });
    return fail(fetched.error);
  }

  const page = extractReadableText(fetched.html);
  if (page.text.length < 80) {
    // JS 렌더 전용/빈 페이지 — 억지 우회하지 않는다
    log({ ok: false, host: fetched.finalHost, error: "no_readable_text", ms: Date.now() - started });
    return fail("no_readable_text");
  }

  const ai = await analyzeWithAi(ctx.env, buildAnalyzePrompt(page, check.url.toString()));
  if (!ai.ok) {
    log({ ok: false, host: fetched.finalHost, error: ai.error, ms: Date.now() - started });
    return fail(ai.error);
  }

  log({ ok: true, host: fetched.finalHost, kind: ai.analysis.kind, days: ai.analysis.days.length, places: ai.analysis.places.length, ms: Date.now() - started });
  return json({ ok: true, url: check.url.toString(), pageTitle: page.title, analysis: ai.analysis });
}

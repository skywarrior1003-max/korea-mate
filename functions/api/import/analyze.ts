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
//
// EXTERNAL-TRIP-IMPORT-V2 (2026-09-30)
//  · 입력 두 가지: { url } 공개 링크 또는 { text } 붙여넣은 일정 글. 대화창 개인 주소
//    (gemini.google.com/app, chatgpt.com/c 등)는 서버가 읽을 수 없으므로 fetch 하지 않는다.
//  · 로그인은 **어떤 외부 fetch 보다 먼저** — 비로그인 요청으로 서버가 임의 페이지를 읽지 않게.
//  · 사용자 횟수(ai-user-quota) → 회사 스위치·비용(ai-ops-guard) → provider 순서.
//    완성 결과(장소 1곳 이상)일 때만 사용자 차감을 확정하고, 실패·무효·중복은 해제한다.
//    같은 사용자의 같은 입력(같은 날)은 추가 차감 없이 이전 결과를 돌려준다(새로고침·중복 클릭).
//  · AI 는 추출만 한다 — 순서·시간·내용을 바꾸거나 동선을 최적화하지 않는다(프롬프트·파서 계약).

import { aiAllowed, aiUnavailableResponse } from "../../_lib/app-env";
import { aiOpsReserve, aiOpsSettle, usdMicroFromUsage } from "../../_lib/ai-ops-guard";
import { requireActiveUser, userActorHash } from "../../_lib/user-auth";
import { quotaIdemKey, quotaReserve, quotaSettle, quotaBalance } from "../../_lib/ai-user-quota";
import {
  validateImportUrl, isOwnHost, extractReadableText, buildAnalyzePrompt, parseAnalyzed,
  classifyAiChatUrl, preparePastedText, providerFailClass,
  ANALYZE_SCHEMA, MAX_REDIRECTS, FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES, ALLOWED_CONTENT_TYPES,
  type AnalyzedContent, type ExtractedPage,
} from "../../../src/lib/url-import/import-core";
import { MODEL } from "../../../src/lib/mytrip-writing/writing-core";

interface Env {
  GEMINI_API_KEY?: string;
  AI_WRITING?: { fetch: typeof fetch };
  INTERNAL_KEY?: string;
  URL_IMPORT_MODE?: string; // "off" → kill switch
  APP_ENV?: string;
  /**
   * IMPORT-V2 — Production 이 아닌 환경 전용 검증 경로. "direct" 면 서울 Worker 를 거치지 않고
   * 이 환경의 GEMINI_API_KEY 로 직접 부른다. 공용 Worker 의 비상정지(AI_WRITING_WORKER_MODE)는
   * Production 과 공유라 Preview 검증을 위해 켜지 않는다. Production 에서는 무시한다.
   */
  AI_PROVIDER_ROUTE?: string;
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
  const isProd = (env.APP_ENV ?? "").trim().toLowerCase() === "production";
  if (!isProd && (env.AI_PROVIDER_ROUTE ?? "").trim().toLowerCase() === "direct") return undefined;
  const binding = env.AI_WRITING;
  const key = env.INTERNAL_KEY;
  if (!binding || typeof binding.fetch !== "function" || !key) return undefined;
  return ((_url: RequestInfo | URL, init?: RequestInit) =>
    binding.fetch("https://ai-writing.internal/provider", {
      method: "POST",
      // 긴 블로그·일정 글은 8초를 넘는다(실측 8.6~13초) — Worker 에 이 요청의 상한(20초)을 알린다
      headers: { "Content-Type": "application/json", "x-internal-auth": key, "x-provider-timeout-ms": "20000" },
      body: init?.body ?? null,
      signal: init?.signal ?? undefined,
    })) as typeof fetch;
}

interface AiUsage { inTok: number | null; outTok: number | null; model?: string | null }

async function analyzeWithAi(env: Env, prompt: string): Promise<
  | { ok: true; analysis: AnalyzedContent; usage: AiUsage }
  | { ok: false; error: string; sent: boolean; providerStatus?: string; ms?: number }
> {
  const apiKey = env.GEMINI_API_KEY ?? "";
  const providerFetch = bindingProviderFetch(env) ?? (apiKey ? fetch : null);
  if (!providerFetch) return { ok: false, error: "analyze_unavailable", sent: false };

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
  const t0 = Date.now();
  try {
    const res = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body },
    );
    clearTimeout(timer);
    if (!res.ok) {
      // 비밀·본문 없이 상태만 — 운영 진단용(비 Production 응답에만 싣는다)
      let st = `http_${res.status}`;
      try {
        const e = (await res.json()) as { error?: string | { status?: string; message?: string } };
        // 서울 Worker 의 거절은 문자열 코드(unauthorized·worker_disabled 등) — 그대로 싣는다
        if (typeof e.error === "string") st += `:worker_${e.error.replace(/[^a-z_]/g, "").slice(0, 40)}`;
        else if (e.error?.status) st += `:${e.error.status}`;
        // 오류 문장 앞부분만 — 키처럼 보이는 문자열은 가린다(키 값을 응답·로그에 싣지 않는다)
        if (typeof e.error === "object" && e.error?.message) st += `:${e.error.message.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]").replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 140)}`;
      } catch { /* ignore */ }
      // 서울 Worker 가 모델에 보내기 전에 거절했다(x-gkm-provider-called: 0) — 과금 없음 확정
      return { ok: false, error: "analyze_failed", sent: res.headers.get("x-gkm-provider-called") !== "0", providerStatus: st };
    }
    const raw = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const u = raw.usageMetadata;
    const analysis = parseAnalyzed(text);
    if (!analysis) return { ok: false, error: "analyze_failed", sent: true, providerStatus: `parse_failed:${raw.candidates?.[0]?.finishReason ?? "none"}:${text.length}`, ms: Date.now() - t0 };
    const usage: AiUsage = {
      inTok: typeof u?.promptTokenCount === "number" ? u.promptTokenCount : null,
      outTok: typeof u?.candidatesTokenCount === "number" || typeof u?.thoughtsTokenCount === "number"
        ? (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) : null,
      model: res.headers.get("x-gkm-model"), // 서울 Worker 가 실제로 부른 모델(단가 계산용)
    };
    return { ok: true, analysis, usage };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: isAbort ? "analyze_timeout" : "analyze_failed", sent: true, providerStatus: isAbort ? "timeout" : "fetch_error", ms: Date.now() - t0 };
  }
}


/** 링크를 읽지 못한 이유를 사용자가 알아들을 말로 — 모든 실패를 "로그인/스크립트"라 부르지 않는다 */
function fetchErrorCode(raw: string, aiShare: boolean): string {
  if (raw === "http_401" || raw === "http_403") return aiShare ? "share_not_readable" : "login_required_page";
  if (raw === "http_404" || raw === "http_410") return "not_found";
  if (aiShare && (raw === "no_readable_text" || raw === "unsupported_content_type" || raw === "timeout" || raw === "fetch_failed" || /^http_/.test(raw))) return "share_not_readable";
  return raw;
}

// GET /api/import/analyze — 로그인 사용자의 남은 무료 가져오기 횟수(화면 안내용)
export async function onRequestGet(ctx: { request: Request; env: Env }): Promise<Response> {
  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const balance = await quotaBalance(ctx.env as Parameters<typeof quotaBalance>[0], auth.userId);
  if (!balance) return fail("quota_unavailable");
  // 비 Production 전용 연결 진단 — ?diag=route. Worker /health 는 provider 를 부르지 않는다(비용 0).
  // 키 값·형식은 싣지 않는다(있는지만).
  const isProd = (ctx.env.APP_ENV ?? "").trim().toLowerCase() === "production";
  // 비 Production 전용 — ?diag=probe&v=plain|thinking0|json|all: Preview Worker 의 아주 작은 요청으로 오류 원인 진단
  if (!isProd && new URL(ctx.request.url).searchParams.get("diag") === "probe" && ctx.env.AI_WRITING && typeof ctx.env.AI_WRITING.fetch === "function") {
    const variant = new URL(ctx.request.url).searchParams.get("v") ?? "plain";
    const r = await ctx.env.AI_WRITING.fetch("https://ai-writing.internal/probe", { method: "POST", headers: { "x-internal-auth": ctx.env.INTERNAL_KEY ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ variant, model: new URL(ctx.request.url).searchParams.get("m") ?? undefined }) });
    return json({ ok: true, probe: await r.json().catch(() => ({ http: r.status })) });
  }
  // 비 Production 전용 — ?diag=models: 이 환경 Worker 키로 쓸 수 있는 모델 이름(생성 호출 아님 · 비용 0)
  if (!isProd && new URL(ctx.request.url).searchParams.get("diag") === "models" && ctx.env.AI_WRITING && typeof ctx.env.AI_WRITING.fetch === "function") {
    try {
      const r = await ctx.env.AI_WRITING.fetch("https://ai-writing.internal/models", { method: "POST", headers: { "x-internal-auth": ctx.env.INTERNAL_KEY ?? "" } });
      return json({ ok: true, models: await r.json().catch(() => null) });
    } catch { return json({ ok: false, error: "unreachable" }); }
  }
  if (!isProd && new URL(ctx.request.url).searchParams.get("diag") === "route") {
    const direct = (ctx.env.AI_PROVIDER_ROUTE ?? "").trim().toLowerCase() === "direct";
    const binding = ctx.env.AI_WRITING;
    let worker: unknown = "no_binding";
    if (binding && typeof binding.fetch === "function") {
      try {
        const r = await binding.fetch("https://ai-writing.internal/health", {
          method: "POST", headers: { "x-internal-auth": ctx.env.INTERNAL_KEY ?? "" },
        });
        worker = { http: r.status, ...(await r.json().catch(() => ({}))) as Record<string, unknown> };
      } catch { worker = "unreachable"; }
    }
    return json({ ok: true, balance, route: { via: direct ? "direct" : binding ? "worker" : "direct", internal_key: !!ctx.env.INTERNAL_KEY, worker } });
  }
  return json({ ok: true, balance });
}

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  // V2-ENV-ISOLATION §10 — 환경별 AI 게이트(provider 호출 이전 차단)
  if (!aiAllowed(ctx.env as Parameters<typeof aiAllowed>[0])) return aiUnavailableResponse();
  if ((ctx.env.URL_IMPORT_MODE ?? "").toLowerCase() === "off") return fail("off");

  let body: { url?: unknown; text?: unknown };
  try { body = (await ctx.request.json()) as { url?: unknown; text?: unknown }; }
  catch { return fail("invalid_request"); }

  // ── 입력 검증(네트워크·AI 없이) ───────────────────────────────────────────
  let mode: "url" | "text";
  let pageUrl: URL | null = null;
  let pasted: ExtractedPage | null = null;
  let aiShare = false;
  if (typeof body.text === "string") {
    mode = "text";
    const prepared = preparePastedText(body.text);
    if (!prepared.ok) return fail("text_too_short");
    pasted = prepared.page;
  } else if (typeof body.url === "string") {
    mode = "url";
    const check = validateImportUrl(body.url);
    if (!check.ok) {
      log({ ok: false, error: check.reason });
      return fail(check.reason === "blocked_host" ? "blocked_host" : "invalid_url");
    }
    // 내부 URL 은 여기 오면 안 된다(클라이언트가 shared 흐름으로 처리) — 이중 가드
    if (isOwnHost(check.url.hostname)) return fail("internal_url");
    const chat = classifyAiChatUrl(check.url);
    // 대화창 개인 주소 — 본인 계정으로만 열린다. 읽으러 가지 않는다(우회 없음).
    if (chat.link === "private") return fail("private_chat_url");
    aiShare = chat.link === "share";
    pageUrl = check.url;
  } else {
    return fail("invalid_request");
  }

  // V2-AUTH §9 — provider 로 가는 사용자 경로는 검증된 로그인 필수.
  // IMPORT-V2 — 외부 fetch 보다 먼저 확인한다(비로그인 요청이 서버로 임의 페이지를 읽게 하지 않는다).
  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const qEnv = ctx.env as Parameters<typeof quotaReserve>[0];

  // ── 사용자 무료 횟수 예약 — 같은 입력은 같은 키(새로고침·중복 클릭이 두 번 차감되지 않는다) ──
  const inputKey = mode === "text" ? `text:${pasted!.text}` : `url:${pageUrl!.toString()}`;
  const idem = await quotaIdemKey(userId, "import", inputKey);
  const q = await quotaReserve(qEnv, userId, "import", idem);
  if (q.status === "unavailable") return fail("quota_unavailable"); // 셀 수 없으면 부르지 않는다(fail-closed)
  if (q.status === "in_progress") return fail("in_progress");
  if (q.status === "exhausted") return json({ ok: false, error: "quota_exhausted", pool: q.pool, resets_at: q.resetsAt });
  if (q.status === "replay") {
    const prev = q.result as { analysis?: AnalyzedContent; pageTitle?: string; url?: string | null } | null;
    if (prev?.analysis) {
      log({ ok: true, mode, replay: true });
      return json({ ok: true, url: prev.url ?? null, pageTitle: prev.pageTitle ?? "", analysis: prev.analysis, charged: false, replay: true, pool: q.pool });
    }
    return fail("in_progress");
  }
  const quotaId = q.id;
  const release = () => quotaSettle(qEnv, quotaId, userId, "released");

  // ── 읽기 ─────────────────────────────────────────────────────────────────
  const started = Date.now();
  let page: ExtractedPage;
  let host = "text";
  if (mode === "url") {
    const fetched = await safeFetchPage(pageUrl!);
    if (!fetched.ok) {
      await release();
      log({ ok: false, host: pageUrl!.hostname, error: fetched.error, ms: Date.now() - started });
      return fail(fetchErrorCode(fetched.error, aiShare));
    }
    page = extractReadableText(fetched.html);
    host = fetched.finalHost;
    if (page.text.length < 80) {
      // JS 렌더 전용/빈 페이지 — 억지 우회하지 않는다
      await release();
      log({ ok: false, host, error: "no_readable_text", ms: Date.now() - started });
      return fail(aiShare ? "share_not_readable" : "no_readable_text");
    }
  } else {
    page = pasted!;
  }

  // ── 회사 스위치·비용 원자 예약(provider 이전) — V2-HARDCAP §7·§8 ─────────
  const actorSecret = (ctx.env as { MYTRIP_HASH_SECRET?: string }).MYTRIP_HASH_SECRET ?? "";
  const actor = actorSecret ? await userActorHash(userId, actorSecret) : null;
  const gate = await aiOpsReserve(ctx.env as Parameters<typeof aiOpsReserve>[0], {
    feature: "import_analyze", model: "gemini-2.5-flash",
    worstUsdMicro: 12_100, // cost-model analyze 가정 상한 ≈$0.0121(입력 18,000자·출력 4,096 토큰 기준 — 절대 최악 아님)
    idempotencyKey: `import:${quotaId}:${crypto.randomUUID().slice(0, 8)}`,
    actorHash: actor,
    // TEMP 2026-09-30 Owner 승인(Staging 오늘 한정 +100) — Preview 검증 후 100 으로 되돌린다. Production 반영 금지
    featureDailyCalls: 200, featureDailyUsdMicro: 1_500_000, // $1.5/day
  });
  if (!gate.ok) {
    await release();
    return fail("ai_paused");
  }

  const ai = await analyzeWithAi(ctx.env, buildAnalyzePrompt(page, mode === "url" ? pageUrl!.toString() : null));
  if (!ai.ok) {
    // 정산(CORRECTION-V1 §2): 요청을 만들기 전 실패(sent=false)만 회사 원장 released.
    // 그 외(analyze_failed/timeout/parse)는 요청 전송 후의 실패라 무과금을 증명할 수 없다 — 예약 보존.
    // 사용자 횟수는 어느 쪽이든 차감하지 않는다(완성 작업이 아니다).
    await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, ai.sent ? "unknown_billed" : "released");
    await release();
    // fail_class: 재발 시 520·시간 초과·출력 상한 등을 가르는 짧은 분류값만 — 본문·키·사용자 입력은 싣지 않는다
    log({ ok: false, mode, host, error: ai.error, fail_class: providerFailClass(ai.providerStatus), provider_ms: ai.ms ?? null, ms: Date.now() - started });
    const nonProd = (ctx.env.APP_ENV ?? "").trim().toLowerCase() !== "production";
    // 비 Production 진단 — 키 값은 싣지 않고 형식 사실(있음·Google API 키 형식·앞뒤 공백)만
    const k = ctx.env.GEMINI_API_KEY ?? "";
    const keyShape = { present: k.length > 0, google_api_key_format: /^AIza[0-9A-Za-z_-]{35}$/.test(k), has_outer_whitespace: k !== k.trim(), via: bindingProviderFetch(ctx.env) ? "worker" : "direct" };
    return nonProd && ai.providerStatus ? json({ ok: false, error: ai.error, provider_status: ai.providerStatus, key_shape: keyShape }) : fail(ai.error);
  }
  // 회사 원장 — 실제 토큰으로 정산(usage 가 없으면 예약액 보수 commit)
  const usd = ai.usage.inTok !== null || ai.usage.outTok !== null ? usdMicroFromUsage(ai.usage.inTok, ai.usage.outTok, ai.usage.model) : 12_100;
  await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "committed",
    { inTok: ai.usage.inTok, outTok: ai.usage.outTok, usdMicro: usd });

  const a = ai.analysis;
  const useful = a.kind !== "unsupported" && (a.days.some(d => d.stops.length > 0) || a.places.length > 0);
  if (!useful) {
    // 무효 결과 — 사용자에게 완성 작업을 주지 못했다. 사용자 차감 0.
    await release();
    log({ ok: false, mode, host, error: "unsupported", ms: Date.now() - started, usd_micro: usd });
    return fail("unsupported");
  }
  const url = mode === "url" ? pageUrl!.toString() : null;
  const pageTitle = page.title;
  await quotaSettle(qEnv, quotaId, userId, "committed", { analysis: a, pageTitle, url });
  const balance = await quotaBalance(qEnv, userId);

  log({ ok: true, mode, host, kind: a.kind, days: a.days.length, places: a.places.length, ms: Date.now() - started,
        in_tok: ai.usage.inTok, out_tok: ai.usage.outTok, usd_micro: usd, pool: q.pool });
  return json({ ok: true, url, pageTitle, analysis: a, charged: true, pool: q.pool, balance });
}

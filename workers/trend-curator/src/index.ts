// gokoreamate-trend-curator-staging — 주간 Trend 후보 자동 수집 (V3 §6 → V4 §B·§D·§I)
//
// V4 계약
//  · discovery(첫 발견)는 무조건 candidate — 같은 실행 안에서 experimental/active
//    승격은 구조적으로 불가능하다(decideCorroboration 이 firstVerifiedAt < runDate 요구).
//  · corroboration(후속 실행): 다른 시점 + 독립 원본 도메인 2개 이상(동일 도메인
//    복제 1개 계산·해석 실패 출처 미계산) + 발행일 확인 + 의미 일관 + review 기한 내.
//  · grounding redirect 는 안전 규칙 하에 원본 URL 로 해석해 SourceRecord 로 저장.
//    해석 실패 시 candidate 유지(활성 금지).
//  · key 분리(§I): TREND_GEMINI_API_KEY 우선. CURATOR_REQUIRE_DEDICATED_KEY=1 이면
//    공용 GEMINI_API_KEY fallback 금지(fail-closed → audit_only). Staging 은 현재
//    공용 key 사용(보고 대상) — Production 연결 전 전용 key 필수.
//  · 사용자 생성 원장과 분리·row 삭제 0·SQL 조립 0·검색 결과는 데이터.
//  · 테스트 훅(§E): 수동 trigger body 의 testDate/mock 은 trigger secret +
//    env CURATOR_ALLOW_MOCK=1 에서만 동작한다(운영 cron 경로에는 없음).

import {
  decideCorroboration, independentResolvedDomains, normalizeDomain, nextReviewDate,
  type SourceRecord, type TrendStatus,
} from "../../../src/lib/mytrip-writing/trend-curation";

export interface Env {
  GEMINI_API_KEY?: string;
  TREND_GEMINI_API_KEY?: string;
  CURATOR_REQUIRE_DEDICATED_KEY?: string;
  CURATOR_ALLOW_MOCK?: string;
  TREND_SUPABASE_URL?: string;
  TREND_SUPABASE_SERVICE_KEY?: string;
  CURATOR_TRIGGER_SECRET?: string;
}

const LOCALES = ["ko-KR", "ja-JP", "en", "zh-CN"] as const;
const REGION: Record<string, string> = { "ko-KR": "KR", "ja-JP": "JP", en: "global-safe", "zh-CN": "CN-neutral" };
const MAX_GROUNDED_PER_RUN = 4;
const MAX_CANDIDATES_PER_LOCALE = 5;
const MAX_MUTATIONS_PER_RUN = 20;
const LEDGER_RETENTION_DAYS = 90;
const CLEANUP_MAX_ROWS = 500;
const REDIRECT_PREFIX = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";
const MAX_REDIRECT_HOPS = 3;
const FETCH_TIMEOUT_MS = 6_000;
const BODY_CAP_BYTES = 65_536;

let lastGroundedFail: string | null = null;
const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.trim().slice(0, n) : "");
const today = (d?: string) => d ?? new Date().toISOString().slice(0, 10);

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

async function rest(env: Env, method: string, path: string, body?: unknown, prefer?: string): Promise<unknown> {
  const r = await fetch(`${env.TREND_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.TREND_SUPABASE_SERVICE_KEY!, authorization: `Bearer ${env.TREND_SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`rest_${method}_${r.status}`);
  return text.trim() ? JSON.parse(text) : null;
}

function sluggish(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** §D SSRF 차단 — https·비내부 hostname 만 */
function hostBlocked(u: URL): boolean {
  if (u.protocol !== "https:") return true;
  const h = u.hostname.toLowerCase();
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;           // 리터럴 IP 전면 차단
  if (/(^|\.)(internal|local|localdomain)$/.test(h)) return true;
  if (h.includes("metadata")) return true;
  return false;
}

async function timedFetch(url: string, redirect: "manual" | "follow"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 인증 헤더·쿠키 없음 — 순수 GET
    return await fetch(url, { method: "GET", redirect, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

/**
 * §D — grounding redirect 를 원본 URL 로 해석한다.
 * redirect 는 REDIRECT_PREFIX 로 시작하는 것만, hop ≤3, 각 hop https·비내부.
 * 실패는 resolved:false 로 보존(활성 금지 근거). HTML 은 데이터로만 취급.
 */
async function resolveRedirect(redirectUrl: string, verifiedAt: string): Promise<SourceRecord> {
  const rec: SourceRecord = { redirect: redirectUrl, final_url: null, domain: null, title: null, published: null, evidence: null, verified_at: verifiedAt, resolved: false };
  try {
    if (!redirectUrl.startsWith(REDIRECT_PREFIX)) return rec;
    let current = redirectUrl;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const u = new URL(current);
      if (hop > 0 && hostBlocked(u)) return rec; // 첫 hop 은 vertex 고정
      const res = await timedFetch(current, "manual");
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return rec;
        const next = new URL(loc, current);
        if (hostBlocked(next)) return rec;
        current = next.toString();
        continue;
      }
      if (!res.ok) return rec;
      // 최종 문서 — 크기 상한으로 앞부분만 읽는다(데이터로만)
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        let bytes = 0;
        const dec = new TextDecoder();
        while (bytes < BODY_CAP_BYTES) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          bytes += value.byteLength;
          html += dec.decode(value, { stream: true });
        }
        try { await reader.cancel(); } catch { /* ignore */ }
      }
      const finalU = new URL(res.url || current);
      if (hostBlocked(finalU)) return rec;
      rec.final_url = finalU.toString().slice(0, 500);
      rec.domain = normalizeDomain(finalU.hostname);
      rec.title = clip(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1], 200) || null;
      rec.published =
        clip(/property=["']article:published_time["'][^>]*content=["']([^"']{4,40})/i.exec(html)?.[1], 40) ||
        clip(/content=["']([^"']{4,40})["'][^>]*property=["']article:published_time["']/i.exec(html)?.[1], 40) ||
        clip(/"datePublished"\s*:\s*"([^"]{4,40})"/.exec(html)?.[1], 40) || null;
      rec.resolved = true;
      return rec;
    }
    return rec;
  } catch { return rec; }
}

interface RawCandidate {
  phrase?: unknown; meaning?: unknown; usage_example?: unknown; avoid_context?: unknown;
  artist_or_fandom?: unknown; sensitive?: unknown; brand_ad_like?: unknown; regional_conflict?: unknown;
}

const RESEARCH_PROMPT: Record<string, string> = {
  "ko-KR": "2026년 9월 현재 한국 SNS·커뮤니티에서 실제로 쓰이는 가벼운 유행 표현",
  "ja-JP": "2026年9月現在、日本のSNSで実際に使われているカジュアルな流行表現",
  en: "casual English social-media expressions actually in use in September 2026 (globally understood, not region-locked)",
  "zh-CN": "2026年9月中国大陆社交平台上实际使用的轻松网络流行语（简体，中立表达）",
};

async function groundedResearch(env: Env, geminiKey: string, locale: string): Promise<{
  candidates: RawCandidate[]; redirects: string[]; searchQueries: number;
  usage: { inTok: number; outTok: number; thinkTok: number };
} | null> {
  const prompt = [
    `${RESEARCH_PROMPT[locale]} 을(를) 웹에서 조사해 최대 ${MAX_CANDIDATES_PER_LOCALE}개를 고른다.`,
    `여행 사진 캡션에 자연스럽게 쓸 수 있는 표현만. 정치·혐오·성적·차별·외모 비하 표현 제외.`,
    `JSON 배열로만 답하라(설명문 금지):`,
    `[{"phrase":"...","meaning":"...","usage_example":"여행 사진 캡션 예","avoid_context":"...",`,
    `"artist_or_fandom":bool,"sensitive":bool,"brand_ad_like":bool,"regional_conflict":bool}]`,
  ].join("\n");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8000 },
    }),
  });
  if (!r.ok) { lastGroundedFail = "gemini_" + r.status; return null; }
  const j = await r.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: {
      webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string } }[];
    } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const cand = j.candidates?.[0];
  if (!cand) { lastGroundedFail = "no_candidate"; return null; }
  const text = (cand.content?.parts ?? []).map(p => p.text ?? "").join("");
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown = null;
  for (const c2 of [fenced, text, text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)]) {
    if (!c2) continue;
    try { parsed = JSON.parse(c2); break; } catch { /* 다음 */ }
  }
  if (parsed === null) { lastGroundedFail = "parse_fail_len" + text.length; return null; }
  if (!Array.isArray(parsed)) { lastGroundedFail = "not_array"; return null; }
  return {
    candidates: parsed.slice(0, MAX_CANDIDATES_PER_LOCALE) as RawCandidate[],
    redirects: (cand.groundingMetadata?.groundingChunks ?? []).map(c => clip(c.web?.uri, 500)).filter(u => u.startsWith(REDIRECT_PREFIX)),
    searchQueries: (cand.groundingMetadata?.webSearchQueries ?? []).length,
    usage: {
      inTok: j.usageMetadata?.promptTokenCount ?? 0,
      outTok: j.usageMetadata?.candidatesTokenCount ?? 0,
      thinkTok: j.usageMetadata?.thoughtsTokenCount ?? 0,
    },
  };
}

interface MockResearch { candidates: RawCandidate[]; sources: SourceRecord[] }
interface RunOpts { testDate?: string; mock?: Record<string, MockResearch> }

async function run(env: Env, trigger: "cron" | "manual", locales: readonly string[], opts: RunOpts = {}): Promise<Record<string, unknown>> {
  const runId = crypto.randomUUID();
  // §I key 분리 — 전용 key 우선, 요구 플래그가 켜지면 공용 fallback 금지(fail-closed)
  const geminiKey = env.TREND_GEMINI_API_KEY ??
    (env.CURATOR_REQUIRE_DEDICATED_KEY === "1" ? undefined : env.GEMINI_API_KEY);
  const sharedKeyUsed = !env.TREND_GEMINI_API_KEY && !!geminiKey;
  const allowMock = env.CURATOR_ALLOW_MOCK === "1" && trigger === "manual";
  const runDate = allowMock ? today(opts.testDate) : today();
  const auditOnly = !geminiKey && !(allowMock && opts.mock);
  await rest(env, "POST", "mytrip_curator_runs", [{ id: runId, trigger, locales, status: "running" }], "return=minimal");
  const tally = { grounded: 0, queries: 0, found: 0, upserted: 0, promoted: 0, mutations: 1, inTok: 0, outTok: 0, thinkTok: 0, cleanupAgg: 0, cleanupDel: 0 };
  let status = auditOnly ? "audit_only" : "succeeded";
  let errorCode: string | null = null;
  lastGroundedFail = null;
  try {
    if (!auditOnly) {
      for (const locale of locales) {
        if (!LOCALES.includes(locale as typeof LOCALES[number])) continue;
        if (tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
        let res: { candidates: RawCandidate[]; sources: SourceRecord[]; searchQueries?: number; usage?: { inTok: number; outTok: number; thinkTok: number } } | null = null;
        const mock = allowMock ? opts.mock?.[locale] : undefined;
        if (mock) {
          res = { candidates: mock.candidates, sources: mock.sources };
        } else {
          if (tally.grounded >= MAX_GROUNDED_PER_RUN) break;
          tally.grounded += 1; // 시도 자체를 상한에 센다 — 재시도 0
          const g = await groundedResearch(env, geminiKey!, locale);
          if (!g) continue;
          tally.queries += g.searchQueries;
          tally.inTok += g.usage.inTok; tally.outTok += g.usage.outTok; tally.thinkTok += g.usage.thinkTok;
          // §D — redirect 를 원본으로 해석(최대 5개)
          const sources: SourceRecord[] = [];
          for (const rd of g.redirects.slice(0, 5)) sources.push(await resolveRedirect(rd, runDate));
          res = { candidates: g.candidates, sources };
        }
        tally.found += res.candidates.length;
        for (const raw of res.candidates) {
          if (tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
          const phrase = clip(raw.phrase, 40);
          if (!phrase || raw.sensitive === true) continue; // 민감 후보는 저장 생략(§B)
          const canonical = phrase.replace(/\s+/g, "");
          const id = `${locale}-auto-${sluggish(canonical)}`;
          const artist = raw.artist_or_fandom === true;
          const lifecycle = artist ? "artist_fandom" : "fast_sns";
          const meaning = clip(raw.meaning, 300);
          const usage = clip(raw.usage_example, 200);
          // 기존 row 조회 — discovery 인지 corroboration 대상인지 판별
          const existing = await rest(env, "GET", `mytrip_trend_packs?id=eq.${encodeURIComponent(id)}&select=id,status,first_verified_at,next_review_at,source_urls,brand_or_artist_related`) as
            { id: string; status: TrendStatus; first_verified_at: string; next_review_at: string; source_urls: unknown; brand_or_artist_related: boolean }[] | null;
          const prior = existing?.[0] ?? null;

          if (!prior) {
            // ── 1단계 discovery(§B): 무조건 candidate — 같은 실행 승격 불가 ──
            const row = {
              id, locale, region_scope: REGION[locale] ?? "global-safe",
              phrase, canonical_form: canonical,
              meaning: meaning || "(자동 수집 — 검수 필요)",
              usage_context: usage || "(검수 필요)", safe_example: usage || "(검수 필요)",
              avoid_context: clip(raw.avoid_context, 200) || "검수 전 사용 주의",
              source_urls: res.sources, source_types: res.sources.map(() => "grounded_search"),
              first_verified_at: runDate, last_verified_at: runDate,
              next_review_at: nextReviewDate(lifecycle, new Date(runDate)),
              lifecycle_type: lifecycle,
              status: "candidate" as const,
              confidence_score: 0.4, risk_score: artist ? 0.45 : 0.35,
              brand_or_artist_related: artist || raw.brand_ad_like === true,
              activation_reason: "auto-weekly:discovery-candidate(v4)",
              decision_actor: "auto-curator-worker-v2",
              pack_version: `tpdb-auto-${runDate}`,
              updated_at: new Date().toISOString(),
            };
            await rest(env, "POST", "mytrip_trend_packs?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
            tally.upserted += 1; tally.mutations += 1;
          } else if (prior.status === "candidate") {
            // ── 2단계 corroboration(§B): 다른 시점 + 독립 원본 출처 ──
            const priorSources: SourceRecord[] = Array.isArray(prior.source_urls)
              ? (prior.source_urls as unknown[]).map(s => typeof s === "string"
                  ? { redirect: s, final_url: null, domain: null, verified_at: prior.first_verified_at, resolved: false } as SourceRecord
                  : s as SourceRecord)
              : [];
            const merged: SourceRecord[] = [...priorSources];
            for (const s of res.sources) {
              const d = normalizeDomain(s.domain);
              if (!d || !merged.some(m => normalizeDomain(m.domain) === d)) merged.push(s);
            }
            const decision = decideCorroboration({
              firstVerifiedAt: prior.first_verified_at, runDate,
              sources: merged,
              hasPublishedDate: merged.some(s => s.resolved && !!s.published),
              meaningConsistent: !!meaning, travelFit: !!usage,
              sensitive: false,
              brandRiskControlled: !(raw.brand_ad_like === true && !prior.brand_or_artist_related),
              regionalConflict: raw.regional_conflict === true,
              ambiguous: !meaning,
              reviewNotPassed: prior.next_review_at >= runDate,
            });
            const patch: Record<string, unknown> = {
              source_urls: merged.slice(0, 10), last_verified_at: runDate, updated_at: new Date().toISOString(),
            };
            if (decision !== "candidate") { // prior 는 이 분기에서 항상 candidate
              patch.status = decision;
              patch.activation_reason = `auto-weekly:corroborated:${decision}(domains=${independentResolvedDomains(merged)})`;
              patch.next_review_at = nextReviewDate(lifecycle, new Date(runDate));
              if (decision === "experimental_active") tally.promoted += 1;
            }
            await rest(env, "PATCH", `mytrip_trend_packs?id=eq.${encodeURIComponent(id)}`, patch, "return=minimal");
            tally.mutations += 1;
          }
          // 그 외 상태(experimental/active/cooling/...)는 재발견해도 손대지 않는다
        }
      }
    }
    // §7 — attempt 원장 90일 정리(변경 없음)
    const cutoff = new Date(Date.now() - LEDGER_RETENTION_DAYS * 86_400_000).toISOString();
    const old = await rest(env, "GET", `mytrip_ai_generations?created_at=lt.${encodeURIComponent(cutoff)}&select=feature,status,created_at,in_tok,out_tok,think_tok&limit=${CLEANUP_MAX_ROWS}`) as
      { feature: string; status: string; created_at: string; in_tok: number | null; out_tok: number | null; think_tok: number | null }[] | null;
    if (old && old.length > 0) {
      const agg = new Map<string, { day: string; feature: string; status: string; n: number; in_tok_sum: number; out_tok_sum: number; think_tok_sum: number }>();
      for (const r of old) {
        const day = r.created_at.slice(0, 10);
        const k = `${day}|${r.feature}|${r.status}`;
        const a = agg.get(k) ?? { day, feature: r.feature, status: r.status, n: 0, in_tok_sum: 0, out_tok_sum: 0, think_tok_sum: 0 };
        a.n += 1; a.in_tok_sum += r.in_tok ?? 0; a.out_tok_sum += r.out_tok ?? 0; a.think_tok_sum += r.think_tok ?? 0;
        agg.set(k, a);
      }
      for (const a of agg.values()) {
        await rest(env, "POST", "mytrip_ai_daily_stats?on_conflict=day,feature,status", [a], "resolution=merge-duplicates,return=minimal");
      }
      await rest(env, "DELETE", `mytrip_ai_generations?created_at=lt.${encodeURIComponent(cutoff)}`, undefined, "return=minimal");
      tally.cleanupAgg = agg.size; tally.cleanupDel = old.length;
    }
  } catch (err) {
    status = "failed";
    errorCode = err instanceof Error ? err.message.slice(0, 60) : "unknown";
  }
  await rest(env, "PATCH", `mytrip_curator_runs?id=eq.${runId}`, {
    finished_at: new Date().toISOString(), status, error_code: errorCode ?? lastGroundedFail,
    grounded_requests: tally.grounded, search_queries: tally.queries,
    candidates_found: tally.found, candidates_upserted: tally.upserted, db_mutations: tally.mutations,
    cleanup_aggregated: tally.cleanupAgg, cleanup_deleted: tally.cleanupDel,
    in_tok: tally.inTok, out_tok: tally.outTok, think_tok: tally.thinkTok,
  }, "return=minimal");
  return { runId, status, runDate, sharedKeyUsed, ...tally };
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ctx.waitUntil(run(env, "cron", LOCALES));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
    const provided = request.headers.get("x-curator-auth") ?? "";
    if (!env.CURATOR_TRIGGER_SECRET || !provided || !(await keysMatch(provided, env.CURATOR_TRIGGER_SECRET))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    let locales: readonly string[] = LOCALES;
    let opts: RunOpts = {};
    try {
      const body = await request.json() as { locales?: unknown; testDate?: unknown; mock?: unknown };
      if (Array.isArray(body.locales) && body.locales.length > 0) {
        locales = body.locales.filter((l): l is string => typeof l === "string");
      }
      if (typeof body.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate)) opts.testDate = body.testDate;
      if (body.mock && typeof body.mock === "object") opts.mock = body.mock as Record<string, MockResearch>;
    } catch { /* 기본 */ }
    const out = await run(env, "manual", locales, opts);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  },
};

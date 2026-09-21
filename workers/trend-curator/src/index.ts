// gokoreamate-trend-curator-staging — 주간 Trend 후보 자동 수집 (V3 §6)
//
// 계약
//  · 사용자 생성 경로와 완전 분리 — 이 Worker 는 mytrip_ai_generations 원장에
//    어떤 row 도 만들지 않고, 자체 원장(mytrip_curator_runs)에만 기록한다.
//  · 주간 상한: locale 당 grounded request 1회·전체 4회, locale 당 후보 5개,
//    실행당 DB mutation 20개. 자동 재시도 0. 상한 도달 시 그 자리에서 멈춘다.
//  · 검색 결과는 데이터다 — 명령으로 실행하지 않고, 필드를 길이 제한으로 자르고,
//    JSON 파싱 실패는 그 locale 을 건너뛴다(prompt injection 은 후보 텍스트일 뿐).
//  · SQL 문자열 조립 0 — PostgREST REST(JSON body)만 쓴다.
//  · 기존 trend row 삭제 0 — 수집은 언제나 추가(upsert)다. 오류가 나도 active
//    rows 는 건드리지 않는다.
//  · 자동 수집 후보는 lowSample=true 로 decideAutoStatus 를 통과시킨다 —
//    한 번의 자동 실행으로 바로 active 가 되는 일은 없다(최고 experimental_active).
//  · raw search response 는 저장하지 않는다 — 후보 필드와 출처 URL·제목만.
//
// 트리거
//  · cron: 주 1회(UTC 월 19:00 = KST 화 04:00)
//  · 수동: POST / + x-curator-auth(CURATOR_TRIGGER_SECRET, 상수시간 비교),
//    body {"locales":["ko-KR"]} 로 부분 실행 가능. 공개 trigger 없음.

import { decideAutoStatus, nextReviewDate } from "../../../src/lib/mytrip-writing/trend-curation";

export interface Env {
  GEMINI_API_KEY?: string;
  TREND_SUPABASE_URL?: string;
  TREND_SUPABASE_SERVICE_KEY?: string;
  CURATOR_TRIGGER_SECRET?: string;
}

const LOCALES = ["ko-KR", "ja-JP", "en", "zh-CN"] as const;
const REGION: Record<string, string> = { "ko-KR": "KR", "ja-JP": "JP", en: "global-safe", "zh-CN": "CN-neutral" };
const MAX_GROUNDED_PER_RUN = 4;
const MAX_CANDIDATES_PER_LOCALE = 5;
const MAX_MUTATIONS_PER_RUN = 20;
const PACK_VERSION = () => `tpdb-auto-${new Date().toISOString().slice(0, 10)}`;
const LEDGER_RETENTION_DAYS = 90;
const CLEANUP_MAX_ROWS = 500;

let lastGroundedFail: string | null = null;
const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.trim().slice(0, n) : "");

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

async function groundedResearch(env: Env, locale: string): Promise<{
  candidates: RawCandidate[]; sources: { uri: string; title: string }[];
  searchQueries: number; usage: { inTok: number; outTok: number; thinkTok: number };
} | null> {
  const prompt = [
    `${RESEARCH_PROMPT[locale]} 을(를) 웹에서 조사해 최대 ${MAX_CANDIDATES_PER_LOCALE}개를 고른다.`,
    `여행 사진 캡션에 자연스럽게 쓸 수 있는 표현만. 정치·혐오·성적·차별·외모 비하 표현 제외.`,
    `JSON 배열로만 답하라(설명문 금지):`,
    `[{"phrase":"...","meaning":"...","usage_example":"여행 사진 캡션 예","avoid_context":"...",`,
    `"artist_or_fandom":bool,"sensitive":bool,"brand_ad_like":bool,"regional_conflict":bool}]`,
  ].join("\n");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8000 }, // grounded thinking 포함 상한 — 3000 절단 실측(len849)
    }),
  });
  if (!r.ok) { lastGroundedFail = "gemini_" + r.status; return null; }
  const j = await r.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: {
      webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string; title?: string } }[];
    } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map(p => p.text ?? "").join("");
  if (!cand) { lastGroundedFail = "no_candidate"; return null; }
  // 견고 추출: fence 제거 → 실패 시 첫 '['~마지막 ']' 범위만(인용 주석·서두 프로즈 방어)
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown = null;
  for (const cand2 of [fenced, text, text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)]) {
    if (!cand2) continue;
    try { parsed = JSON.parse(cand2); break; } catch { /* 다음 후보 */ }
  }
  if (parsed === null) { lastGroundedFail = "parse_fail_len" + text.length; return null; }
  if (!Array.isArray(parsed)) { lastGroundedFail = "not_array"; return null; }
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map(c => ({ uri: clip(c.web?.uri, 500), title: clip(c.web?.title, 200) }))
    .filter(s => s.uri);
  return {
    candidates: parsed.slice(0, MAX_CANDIDATES_PER_LOCALE) as RawCandidate[],
    sources,
    searchQueries: (cand?.groundingMetadata?.webSearchQueries ?? []).length,
    usage: {
      inTok: j.usageMetadata?.promptTokenCount ?? 0,
      outTok: j.usageMetadata?.candidatesTokenCount ?? 0,
      thinkTok: j.usageMetadata?.thoughtsTokenCount ?? 0,
    },
  };
}

async function run(env: Env, trigger: "cron" | "manual", locales: readonly string[]): Promise<Record<string, unknown>> {
  const runId = crypto.randomUUID();
  const auditOnly = !env.GEMINI_API_KEY;
  await rest(env, "POST", "mytrip_curator_runs", [{ id: runId, trigger, locales, status: "running" }], "return=minimal");
  const tally = { grounded: 0, queries: 0, found: 0, upserted: 0, mutations: 1, inTok: 0, outTok: 0, thinkTok: 0, cleanupAgg: 0, cleanupDel: 0 };
  let status = auditOnly ? "audit_only" : "succeeded";
  let errorCode: string | null = null;
  lastGroundedFail = null;
  try {
    if (!auditOnly) {
      for (const locale of locales) {
        if (!LOCALES.includes(locale as typeof LOCALES[number])) continue;
        if (tally.grounded >= MAX_GROUNDED_PER_RUN || tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
        tally.grounded += 1; // 시도 자체를 상한에 센다(§6 — 재시도 0)
        const res = await groundedResearch(env, locale);
        if (!res) continue;
        tally.queries += res.searchQueries;
        tally.inTok += res.usage.inTok; tally.outTok += res.usage.outTok; tally.thinkTok += res.usage.thinkTok;
        tally.found += res.candidates.length;
        for (const raw of res.candidates) {
          if (tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
          const phrase = clip(raw.phrase, 40);
          if (!phrase || raw.sensitive === true) continue; // 민감 후보는 저장 자체를 안 한다
          const evidence = {
            recentUseConfirmed: true,
            independentSources: new Set(res.sources.map(s => s.uri)).size,
            originPlusSpread: res.sources.length >= 2,
            meaningConfirmed: !!clip(raw.meaning, 300),
            travelFit: !!clip(raw.usage_example, 200),
            sensitive: false,
            looksLikeBrandAd: raw.brand_ad_like === true,
            regionalConflict: raw.regional_conflict === true,
            forcedUseRateOk: true,
            sourcesRecorded: res.sources.length > 0,
            artistOrFandomOrigin: raw.artist_or_fandom === true,
            lowSample: true, // 자동 수집분은 항상 표본 부족으로 취급 — active 직행 금지
            ambiguous: !clip(raw.meaning, 300) || res.sources.length === 0,
          };
          const st = decideAutoStatus(evidence);
          const lifecycle = evidence.artistOrFandomOrigin ? "artist_fandom" : "fast_sns";
          const canonical = phrase.replace(/\s+/g, "");
          const row = {
            id: `${locale}-auto-${sluggish(canonical)}`,
            locale, region_scope: REGION[locale] ?? "global-safe",
            phrase, canonical_form: canonical,
            meaning: clip(raw.meaning, 300) || "(자동 수집 — 검수 필요)",
            usage_context: clip(raw.usage_example, 200) || "(검수 필요)",
            safe_example: clip(raw.usage_example, 200) || "(검수 필요)",
            avoid_context: clip(raw.avoid_context, 200) || "검수 전 사용 주의",
            source_urls: res.sources.slice(0, 5).map(s => s.uri),
            source_types: res.sources.slice(0, 5).map(() => "grounded_search"),
            first_verified_at: new Date().toISOString().slice(0, 10),
            last_verified_at: new Date().toISOString().slice(0, 10),
            next_review_at: nextReviewDate(lifecycle),
            lifecycle_type: lifecycle, status: st,
            confidence_score: 0.5, risk_score: evidence.artistOrFandomOrigin ? 0.45 : 0.35,
            brand_or_artist_related: evidence.artistOrFandomOrigin || raw.brand_ad_like === true,
            activation_reason: `auto-weekly:${st}`,
            decision_actor: "auto-curator-worker-v1",
            pack_version: PACK_VERSION(),
            updated_at: new Date().toISOString(),
          };
          // 집계 카운터는 보내지 않는다 — merge upsert 로 기존 값 보존(멱등)
          await rest(env, "POST", "mytrip_trend_packs?on_conflict=id", [row], "resolution=merge-duplicates,return=minimal");
          tally.upserted += 1; tally.mutations += 1;
        }
      }
    }
    // §7 — attempt 원장 90일 정리(집계 후 삭제·상한 500·조건 검증)
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
  return { runId, status, ...tally };
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
    try {
      const body = await request.json() as { locales?: unknown };
      if (Array.isArray(body.locales) && body.locales.length > 0) {
        locales = body.locales.filter((l): l is string => typeof l === "string");
      }
    } catch { /* 기본 전체 locale */ }
    const out = await run(env, "manual", locales);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  },
};

// gokoreamate-trend-curator-staging — 주간 Trend 후보 자동 수집 (V4-1)
//
// V4-1 계약
//  · Search Grounding 비용의 유일한 원장 = mytrip_curator_search_slots(067).
//    KST 주(월 00:00~일 23:59) 기준 locale 당 1 slot·전체 ≤4 —
//    unique(week_kst, locale) INSERT 가 원자적 예약이다(SELECT count 방식 금지).
//    Cron·manual·중복 요청·다중 인스턴스 전부 같은 테이블을 지난다.
//  · provider 시작 이후의 실패(HTTP·timeout·파싱·후보 0건)도 slot 을 반환하지
//    않는다. provider 시작 전 거절(인증·env 게이트·slot 실패·DB 장애)만 미소비.
//  · DB 장애 = fail-closed(provider 0). 메모리 카운터 없음.
//  · §H env 게이트: CURATOR_SEARCH_ENABLED=1 명시 없으면 provider 0.
//    CURATOR_ALLOWED_MODEL·CURATOR_BILLING_UNIT 이 코드 계약(MODEL,
//    "grounded_prompt")과 다르면 provider 0(가격 모델 변경 방어 — audit-only).
//    weekly cap env 는 4보다 커질 수 없다.
//  · §C 배포 Worker 는 mock/test clock 을 받지 않는다 — body 에 testDate/mock 이
//    있으면 400 거부. 가상시간·spy 는 unit/iso 테스트의 deps 주입으로만 쓰며
//    fetch/scheduled 경로는 deps 를 전달하지 않는다(항상 서버 실시간·실 provider).
//  · §D 엔티티 분리: 모델 신고 + 서버 판정(judgeEntityType). phrase 만
//    candidate 저장·corroboration 진입. person/artist/group/brand/product/
//    work_title/event 는 manual_review 보존(맨 고유명사는 저장 생략), unknown 은
//    저장 생략. 자동 활성 경로 진입 불가.
//  · 사용자 AI 생성 경로에는 Search 를 절대 연결하지 않는다(이 Worker 전용).
//  · trend row 삭제 0·기존 active 비강등·SQL 조립 0·검색 결과는 데이터.
//
// 가격 계약 snapshot(2026-09-21, ai.google.dev/gemini-api/docs/pricing):
//   gemini-2.5-flash Grounding = "grounded prompts" 단위, 무료 1,500 RPD,
//   초과 $35/1k. 비용 방어는 무료 한도에 의존하지 않는다(DB 하드캡이 담당).

import {
  decideCorroboration, independentResolvedDomains, normalizeDomain, nextReviewDate,
  judgeEntityType, entityEligibleForTrend, kstWeekKey,
  type SourceRecord, type TrendStatus, type EntityType,
} from "../../../src/lib/mytrip-writing/trend-curation";

export interface Env {
  GEMINI_API_KEY?: string;
  TREND_GEMINI_API_KEY?: string;
  CURATOR_REQUIRE_DEDICATED_KEY?: string;
  CURATOR_SEARCH_ENABLED?: string;
  CURATOR_WEEKLY_GROUNDED_PROMPT_CAP?: string;
  CURATOR_ALLOWED_MODEL?: string;
  CURATOR_BILLING_UNIT?: string;
  TREND_SUPABASE_URL?: string;
  TREND_SUPABASE_SERVICE_KEY?: string;
  CURATOR_TRIGGER_SECRET?: string;
}

export const CURATOR_MODEL = "gemini-2.5-flash";
export const CURATOR_BILLING_UNIT_CONTRACT = "grounded_prompt";
const LOCALES = ["ko-KR", "ja-JP", "en", "zh-CN"] as const;
const REGION: Record<string, string> = { "ko-KR": "KR", "ja-JP": "JP", en: "global-safe", "zh-CN": "CN-neutral" };
const HARD_WEEKLY_CAP = 4;                 // env 로도 이 값을 넘을 수 없다(§H)
const MAX_CANDIDATES_PER_LOCALE = 5;
const MAX_MUTATIONS_PER_RUN = 20;
const LEDGER_RETENTION_DAYS = 90;
const CLEANUP_MAX_ROWS = 500;
const REDIRECT_PREFIX = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";
const MAX_REDIRECT_HOPS = 3;
const FETCH_TIMEOUT_MS = 6_000;
const BODY_CAP_BYTES = 65_536;

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

type RestFn = (env: Env, method: string, path: string, body?: unknown, prefer?: string) => Promise<unknown>;
const restReal: RestFn = async (env, method, path, body, prefer) => {
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
};

function sluggish(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function hostBlocked(u: URL): boolean {
  if (u.protocol !== "https:") return true;
  const h = u.hostname.toLowerCase();
  if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/(^|\.)(internal|local|localdomain)$/.test(h)) return true;
  if (h.includes("metadata")) return true;
  return false;
}

async function timedFetch(url: string, redirect: "manual" | "follow"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { method: "GET", redirect, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function resolveRedirect(redirectUrl: string, verifiedAt: string): Promise<SourceRecord> {
  const rec: SourceRecord = { redirect: redirectUrl, final_url: null, domain: null, title: null, published: null, evidence: null, verified_at: verifiedAt, resolved: false };
  try {
    if (!redirectUrl.startsWith(REDIRECT_PREFIX)) return rec;
    let current = redirectUrl;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const u = new URL(current);
      if (hop > 0 && hostBlocked(u)) return rec;
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
        clip(/"datePublished"\s*:\s*"([^"]{4,40})"/.exec(html)?.[1], 40) || null;
      rec.resolved = true;
      return rec;
    }
    return rec;
  } catch { return rec; }
}

export interface RawCandidate {
  phrase?: unknown; meaning?: unknown; usage_example?: unknown; avoid_context?: unknown;
  entity_type?: unknown;
  artist_or_fandom?: unknown; sensitive?: unknown; brand_ad_like?: unknown; regional_conflict?: unknown;
}
export interface ResearchOutcome {
  ok: boolean;                     // provider 가 유효 응답을 반환했는가(파싱 성공)
  failCode: string | null;
  candidates: RawCandidate[];
  redirects: string[];
  searchQueries: number;
  usage: { inTok: number; outTok: number; thinkTok: number };
}
type ResearchFn = (env: Env, geminiKey: string, locale: string) => Promise<ResearchOutcome>;

const RESEARCH_PROMPT: Record<string, string> = {
  "ko-KR": "2026년 9월 현재 한국 SNS·커뮤니티에서 실제로 쓰이는 가벼운 유행 표현",
  "ja-JP": "2026年9月現在、日本のSNSで実際に使われているカジュアルな流行表現",
  en: "casual English social-media expressions actually in use in September 2026 (globally understood, not region-locked)",
  "zh-CN": "2026年9月中国大陆社交平台上实际使用的轻松网络流行语（简体，中立表达）",
};

const researchReal: ResearchFn = async (_env, geminiKey, locale) => {
  const fail = (code: string): ResearchOutcome => ({ ok: false, failCode: code, candidates: [], redirects: [], searchQueries: 0, usage: { inTok: 0, outTok: 0, thinkTok: 0 } });
  const prompt = [
    `${RESEARCH_PROMPT[locale]} 을(를) 웹에서 조사해 최대 ${MAX_CANDIDATES_PER_LOCALE}개를 고른다.`,
    `여행 사진 캡션에 쓸 "표현"만 — 인물명·그룹명·브랜드·상품·작품 제목 자체는 표현이 아니다.`,
    `정치·혐오·성적·차별·외모 비하 제외. JSON 배열로만 답하라:`,
    `[{"phrase":"...","meaning":"...","usage_example":"여행 캡션 예","avoid_context":"...",`,
    `"entity_type":"phrase|person|artist|group|brand|product|work_title|event|unknown",`,
    `"artist_or_fandom":bool,"sensitive":bool,"brand_ad_like":bool,"regional_conflict":bool}]`,
  ].join("\n");
  let r: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CURATOR_MODEL}:generateContent?key=${geminiKey}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 8000 },
        }),
      });
    } finally { clearTimeout(timer); }
  } catch (e) {
    return fail(e instanceof Error && e.name === "AbortError" ? "timeout" : "network");
  }
  if (!r.ok) return fail("gemini_" + r.status);
  const j = await r.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: {
      webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string } }[];
    } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const cand = j.candidates?.[0];
  if (!cand) return fail("no_candidate");
  const usage = {
    inTok: j.usageMetadata?.promptTokenCount ?? 0,
    outTok: j.usageMetadata?.candidatesTokenCount ?? 0,
    thinkTok: j.usageMetadata?.thoughtsTokenCount ?? 0,
  };
  if (!cand.groundingMetadata) return { ok: false, failCode: "no_grounding_metadata", candidates: [], redirects: [], searchQueries: 0, usage };
  const text = (cand.content?.parts ?? []).map(p => p.text ?? "").join("");
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown = null;
  for (const c2 of [fenced, text, text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)]) {
    if (!c2) continue;
    try { parsed = JSON.parse(c2); break; } catch { /* 다음 */ }
  }
  if (parsed === null || !Array.isArray(parsed)) return { ok: false, failCode: "parse_fail", candidates: [], redirects: [], searchQueries: (cand.groundingMetadata?.webSearchQueries ?? []).length, usage };
  return {
    ok: true, failCode: null,
    candidates: parsed.slice(0, MAX_CANDIDATES_PER_LOCALE) as RawCandidate[],
    redirects: (cand.groundingMetadata?.groundingChunks ?? []).map(c => clip(c.web?.uri, 500)).filter(u => u.startsWith(REDIRECT_PREFIX)),
    searchQueries: (cand.groundingMetadata?.webSearchQueries ?? []).length,
    usage,
  };
};

export interface RunDeps {
  now?: () => Date;          // 테스트 전용 — 배포 경로는 절대 전달하지 않는다
  research?: ResearchFn;     // 테스트 spy — 배포 경로는 실 provider
  rest?: RestFn;
}

/** §F — 원자적 slot 예약. 성공 시 slot id, 실패(cap·중복·DB 장애) 시 null. */
async function reserveSlot(env: Env, rest: RestFn, weekKst: string, locale: string, runId: string, cap: number): Promise<string | null> {
  try {
    // 전체 cap 축소(env<4)용 사전 확인 — unique(week,locale)가 4 상한을 이미
    // 구조적으로 보장하므로, 이 count 는 상한을 넘길 수 없는 보조 축소일 뿐이다.
    if (cap < HARD_WEEKLY_CAP) {
      const rows = await rest(env, "GET", `mytrip_curator_search_slots?week_kst=eq.${weekKst}&select=id`) as unknown[] | null;
      if ((rows?.length ?? 0) >= cap) return null;
    }
    const id = crypto.randomUUID();
    await rest(env, "POST", "mytrip_curator_search_slots", [{ id, week_kst: weekKst, locale, run_id: runId }], "return=minimal");
    return id;
  } catch { return null; } // 충돌(unique)·DB 장애 = fail-closed
}

export async function run(env: Env, trigger: "cron" | "manual", locales: readonly string[], deps: RunDeps = {}): Promise<Record<string, unknown>> {
  const rest = deps.rest ?? restReal;
  const research = deps.research ?? researchReal;
  const nowFn = deps.now ?? (() => new Date());
  const runId = crypto.randomUUID();

  // §H env 게이트(전부 provider 시작 전 — slot 미소비)
  const geminiKey = env.TREND_GEMINI_API_KEY ??
    (env.CURATOR_REQUIRE_DEDICATED_KEY === "1" ? undefined : env.GEMINI_API_KEY);
  const sharedKeyUsed = !env.TREND_GEMINI_API_KEY && !!geminiKey;
  const searchEnabled = env.CURATOR_SEARCH_ENABLED === "1";
  const modelOk = (env.CURATOR_ALLOWED_MODEL ?? "") === CURATOR_MODEL;
  const billingOk = (env.CURATOR_BILLING_UNIT ?? "") === CURATOR_BILLING_UNIT_CONTRACT;
  const capEnv = Number(env.CURATOR_WEEKLY_GROUNDED_PROMPT_CAP);
  const cap = Math.min(HARD_WEEKLY_CAP, Number.isFinite(capEnv) && capEnv >= 0 ? Math.floor(capEnv) : HARD_WEEKLY_CAP);
  const auditOnly = !geminiKey || !searchEnabled || !modelOk || !billingOk;
  const auditReason = !geminiKey ? "no_dedicated_key" : !searchEnabled ? "search_disabled" : !modelOk ? "model_mismatch" : !billingOk ? "billing_unit_mismatch" : null;

  try {
    await rest(env, "POST", "mytrip_curator_runs", [{ id: runId, trigger, locales, status: "running" }], "return=minimal");
  } catch { return { runId, status: "db_unavailable", provider: 0 }; } // DB 장애 = provider 0

  const tally = { grounded: 0, queries: 0, found: 0, upserted: 0, promoted: 0, entityBlocked: 0, mutations: 1, inTok: 0, outTok: 0, thinkTok: 0, cleanupAgg: 0, cleanupDel: 0, slotDenied: 0 };
  let status = auditOnly ? "audit_only" : "succeeded";
  let errorCode: string | null = auditReason;
  try {
    if (!auditOnly) {
      const runDate = nowFn().toISOString().slice(0, 10);
      const weekKst = kstWeekKey(nowFn());
      for (const locale of locales) {
        if (!LOCALES.includes(locale as typeof LOCALES[number])) continue;
        if (tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
        // ── §F 원자적 slot 예약(주간·locale 유일) — 실패 시 provider 0 ──
        const slotId = await reserveSlot(env, rest, weekKst, locale, runId, cap);
        if (!slotId) { tally.slotDenied += 1; continue; }
        await rest(env, "PATCH", `mytrip_curator_search_slots?id=eq.${slotId}`, {
          status: "provider_started", provider_started_at: new Date().toISOString(),
          model: CURATOR_MODEL, billing_unit: CURATOR_BILLING_UNIT_CONTRACT, grounded_prompts: 1,
        }, "return=minimal");
        tally.grounded += 1;
        const res = await research(env, geminiKey!, locale);
        // provider 시작 이후는 성공·실패 무관 slot 소비 유지(§F)
        await rest(env, "PATCH", `mytrip_curator_search_slots?id=eq.${slotId}`, {
          status: res.ok ? "succeeded" : "failed", finished_at: new Date().toISOString(),
          fail_code: res.failCode, search_queries: res.searchQueries,
          in_tok: res.usage.inTok, out_tok: res.usage.outTok, think_tok: res.usage.thinkTok,
        }, "return=minimal");
        tally.queries += res.searchQueries;
        tally.inTok += res.usage.inTok; tally.outTok += res.usage.outTok; tally.thinkTok += res.usage.thinkTok;
        if (!res.ok) continue;
        tally.found += res.candidates.length;
        const sources: SourceRecord[] = [];
        for (const rd of res.redirects.slice(0, 5)) sources.push(await resolveRedirect(rd, runDate));
        const sourceTitles = sources.map(s2 => s2.title ?? "").filter(Boolean);

        for (const raw of res.candidates) {
          if (tally.mutations >= MAX_MUTATIONS_PER_RUN) break;
          const phrase = clip(raw.phrase, 40);
          if (!phrase || raw.sensitive === true) continue;
          const canonical = phrase.replace(/\s+/g, "");
          const meaning = clip(raw.meaning, 300);
          const usage = clip(raw.usage_example, 200);
          const artist = raw.artist_or_fandom === true;
          // ── §D 엔티티 판정(모델 신고 + 서버 검증) ──
          const entity: EntityType = judgeEntityType({
            claimed: typeof raw.entity_type === "string" ? raw.entity_type : undefined,
            canonical, meaning, usageExample: usage, sourceTitles, artistOrFandomOrigin: artist,
          });
          const id = `${locale}-auto-${sluggish(canonical)}`;
          if (!entityEligibleForTrend(entity)) {
            tally.entityBlocked += 1;
            if (entity === "unknown" || (!meaning && !usage)) continue; // 맨 고유명사·불명 → 저장 생략
            // 감사 가능하게 manual_review 로만 보존(자동 활성 경로 진입 불가)
            await rest(env, "POST", "mytrip_trend_packs?on_conflict=id", [{
              id, locale, region_scope: REGION[locale] ?? "global-safe",
              phrase, canonical_form: canonical, entity_type: entity,
              meaning: meaning || "(entity — 검수 필요)", usage_context: "(entity — trend 아님)",
              safe_example: "(사용 불가)", avoid_context: "entity — 자동 활성 금지",
              source_urls: sources, source_types: sources.map(() => "grounded_search"),
              first_verified_at: runDate, last_verified_at: runDate,
              next_review_at: nextReviewDate("fast_sns", new Date(runDate)),
              lifecycle_type: artist ? "artist_fandom" : "fast_sns",
              status: "manual_review", confidence_score: 0.2, risk_score: 0.7,
              brand_or_artist_related: true,
              activation_reason: `auto-weekly:entity-blocked(${entity})`,
              decision_actor: "auto-curator-worker-v3", pack_version: `tpdb-auto-${runDate}`,
              updated_at: new Date().toISOString(),
            }], "resolution=merge-duplicates,return=minimal");
            tally.mutations += 1;
            continue;
          }
          const lifecycle = artist ? "artist_fandom" : "fast_sns";
          const existing = await rest(env, "GET", `mytrip_trend_packs?id=eq.${encodeURIComponent(id)}&select=id,status,entity_type,first_verified_at,next_review_at,source_urls,brand_or_artist_related`) as
            { id: string; status: TrendStatus; entity_type: string; first_verified_at: string; next_review_at: string; source_urls: unknown; brand_or_artist_related: boolean }[] | null;
          const prior = existing?.[0] ?? null;
          if (!prior) {
            await rest(env, "POST", "mytrip_trend_packs?on_conflict=id", [{
              id, locale, region_scope: REGION[locale] ?? "global-safe",
              phrase, canonical_form: canonical, entity_type: "phrase",
              meaning: meaning || "(자동 수집 — 검수 필요)",
              usage_context: usage || "(검수 필요)", safe_example: usage || "(검수 필요)",
              avoid_context: clip(raw.avoid_context, 200) || "검수 전 사용 주의",
              source_urls: sources, source_types: sources.map(() => "grounded_search"),
              first_verified_at: runDate, last_verified_at: runDate,
              next_review_at: nextReviewDate(lifecycle, new Date(runDate)),
              lifecycle_type: lifecycle, status: "candidate",
              confidence_score: 0.4, risk_score: artist ? 0.45 : 0.35,
              brand_or_artist_related: artist || raw.brand_ad_like === true,
              activation_reason: "auto-weekly:discovery-candidate(v4)",
              decision_actor: "auto-curator-worker-v3", pack_version: `tpdb-auto-${runDate}`,
              updated_at: new Date().toISOString(),
            }], "resolution=merge-duplicates,return=minimal");
            tally.upserted += 1; tally.mutations += 1;
          } else if (prior.status === "candidate" && prior.entity_type === "phrase") {
            const priorSources: SourceRecord[] = Array.isArray(prior.source_urls)
              ? (prior.source_urls as unknown[]).map(s2 => typeof s2 === "string"
                  ? { redirect: s2, final_url: null, domain: null, verified_at: prior.first_verified_at, resolved: false } as SourceRecord
                  : s2 as SourceRecord)
              : [];
            const merged: SourceRecord[] = [...priorSources];
            for (const s2 of sources) {
              const d = normalizeDomain(s2.domain);
              if (!d || !merged.some(m => normalizeDomain(m.domain) === d)) merged.push(s2);
            }
            const decision = decideCorroboration({
              firstVerifiedAt: prior.first_verified_at, runDate,
              sources: merged,
              hasPublishedDate: merged.some(s2 => s2.resolved && !!s2.published),
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
            if (decision !== "candidate") {
              patch.status = decision;
              patch.activation_reason = `auto-weekly:corroborated:${decision}(domains=${independentResolvedDomains(merged)})`;
              patch.next_review_at = nextReviewDate(lifecycle, new Date(runDate));
              if (decision === "experimental_active") tally.promoted += 1;
            }
            await rest(env, "PATCH", `mytrip_trend_packs?id=eq.${encodeURIComponent(id)}`, patch, "return=minimal");
            tally.mutations += 1;
          }
        }
      }
    }
    // §7 원장 90일 정리(기존 그대로)
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
      for (const a of agg.values()) await rest(env, "POST", "mytrip_ai_daily_stats?on_conflict=day,feature,status", [a], "resolution=merge-duplicates,return=minimal");
      await rest(env, "DELETE", `mytrip_ai_generations?created_at=lt.${encodeURIComponent(cutoff)}`, undefined, "return=minimal");
      tally.cleanupAgg = agg.size; tally.cleanupDel = old.length;
    }
  } catch (err) {
    status = "failed";
    errorCode = err instanceof Error ? err.message.slice(0, 60) : "unknown";
  }
  try {
    await rest(env, "PATCH", `mytrip_curator_runs?id=eq.${runId}`, {
      finished_at: new Date().toISOString(), status, error_code: errorCode,
      grounded_requests: tally.grounded, search_queries: tally.queries,
      candidates_found: tally.found, candidates_upserted: tally.upserted, db_mutations: tally.mutations,
      cleanup_aggregated: tally.cleanupAgg, cleanup_deleted: tally.cleanupDel,
      in_tok: tally.inTok, out_tok: tally.outTok, think_tok: tally.thinkTok,
    }, "return=minimal");
  } catch { /* run row 마감 실패는 결과에 영향 없음 */ }
  return { runId, status, sharedKeyUsed, ...tally };
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<void> {
    ctx.waitUntil(run(env, "cron", LOCALES)); // deps 없음 — 항상 실시간·실 provider
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
    const provided = request.headers.get("x-curator-auth") ?? "";
    if (!env.CURATOR_TRIGGER_SECRET || !provided || !(await keysMatch(provided, env.CURATOR_TRIGGER_SECRET))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    let locales: readonly string[] = LOCALES;
    try {
      const body = await request.json() as Record<string, unknown>;
      // §C — 배포 Worker 는 test clock/mock 을 받지 않는다: 명시적 400 거부
      if ("testDate" in body || "mock" in body || "test_clock" in body || "now" in body) {
        return new Response(JSON.stringify({ error: "test_inputs_rejected" }), { status: 400 });
      }
      if (Array.isArray(body.locales) && body.locales.length > 0) {
        locales = body.locales.filter((l): l is string => typeof l === "string");
      }
    } catch { /* 기본 전체 locale */ }
    const out = await run(env, "manual", locales); // deps 없음
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  },
};

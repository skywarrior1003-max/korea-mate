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

import { createClient } from "@supabase/supabase-js";
import {
  isWritingRequest, buildWritingPrompt, buildProviderBody, extractSuggestion,
  groundedSuggestionGuard, extractMomentSuggestion, groundedMomentGuard,
  extractMoment3, groundedMoment3Guard, extractHeroSuggestion, validateHeroRefs,
  extractRequestImage, buildMoment3MultimodalPrompt, extractMoment3Creative,
  MODEL, TIMEOUT_MS, MOMENT3_MULTIMODAL_TIMEOUT_MS,
  MOMENT3_PROMPT_VERSION, STORY_HERO_PROMPT_VERSION, STOCK_WARM_RE, seasonViolation,
  suggestionGuardReason, emptyValidation,
  selectHeroAnchor, buildAnchorHeroFacts, stripMultiMomentFacts, heroPlacesOf,
  type WritingRequest, type MomentSuggestion, type MomentSuggestionSet3,
  type WritingImage, type Moment3CreativeMeta, type TrendPromptEntry,
  type Moment3Validation, type DropReason,
} from "../../../src/lib/mytrip-writing/writing-core";
import {
  AI_CACHE_TTL_DAYS, resolveLimits, sha256Hex, ownerHashHmac, normalizedContextString,
  computeCacheKey, rateLimitedBody, trendBucket, resolveTrendBucketCfg,
} from "../../../src/lib/mytrip-writing/generation-cache";
import {
  selectTrendForRequest, trendVersionOf, UI_TO_DB_LOCALE, type TrendRow,
} from "../../../src/lib/mytrip-writing/trend-curation";

interface Env {
  GEMINI_API_KEY?: string;
  MYTRIP_AI_WRITING_MODE?: string;
  /** 서울 placement Worker (Service Binding). Production 에서 항상 존재한다. */
  AI_WRITING?: { fetch: typeof fetch };
  /** Worker 의 x-internal-auth 이중 잠금 키 — binding 경로에서만 쓴다. */
  INTERNAL_KEY?: string;
  /** 영구 캐시·rate limit 원장(063 mytrip_ai_generations) — 미설정이면 캐시 없이 동작 */
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** owner hash HMAC 비밀키(§11) — 미설정이면 레거시 sha(보고 대상) */
  MYTRIP_HASH_SECRET?: string;
  MYTRIP_AI_REGEN_COOLDOWN_SEC?: string;
  MYTRIP_AI_ENTITY_REGEN_PER_HOUR?: string;
  MYTRIP_AI_DEVICE_CALLS_PER_DAY?: string;
  MYTRIP_AI_GLOBAL_CALLS_PER_DAY?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEN_TABLE = "mytrip_ai_generations";
const TREND_TABLE = "mytrip_trend_packs";

/** §10 익명 집계 +1 — 사용자 원문 없음, 실패해도 본 흐름에 영향 0 */
async function bumpTrendCounter(
  admin: NonNullable<ReturnType<typeof adminClient>>, trendId: string,
  col: "shown_count" | "selected_count" | "saved_count" | "heavily_edited_count" | "regenerated_after_count",
): Promise<void> {
  try {
    const { data } = await admin.from(TREND_TABLE).select(col).eq("id", trendId).maybeSingle();
    const cown = (data as Record<string, number> | null)?.[col];
    if (typeof cown === "number") await admin.from(TREND_TABLE).update({ [col]: cown + 1, updated_at: new Date().toISOString() }).eq("id", trendId);
  } catch { /* best-effort */ }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// moment(제목+본문 쌍)는 moment 필드, moment3(3방향 세트)는 set 필드로 나간다 —
// 기존 suggestion/moment 소비자는 영향 없다.
const reply = (
  suggestion: string | null, ai_status: string,
  moment: MomentSuggestion | null = null, set: MomentSuggestionSet3 | null = null,
  extras: Record<string, unknown> = {},
) => json({ suggestion, moment, set, ai_status, ...extras });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "mytrip-writing", ...fields }));
}

/** binding 경유 — Worker 가 검증·prompt·provider·추출까지 수행하고 같은 계약으로 답한다. */
async function viaWorker(
  binding: { fetch: typeof fetch }, internalKey: string, body: unknown,
): Promise<Response> {
  const controller = new AbortController();
  // Worker 내부 provider timeout(멀티모달 12s/기본 8s)보다 넉넉히 — 이중 중단 방지.
  const timer = setTimeout(() => controller.abort(), MOMENT3_MULTIMODAL_TIMEOUT_MS + 3_000);
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

/** provider 1회 직결 실행 결과 — 캐시 저장·reply 구성이 함께 쓴다 */
interface DirectOutcome {
  ai_status: string;
  suggestion: string | null;
  moment: MomentSuggestion | null;
  set: MomentSuggestionSet3 | null;
  meta: Moment3CreativeMeta | null;
  /** V5-3 §B — 방향별 판정 진단(reason code 만). 원장 result._validation 저장 전용, 공개 응답 0. */
  validation: Moment3Validation | { hero: { status: string; reasons: DropReason[] } } | null;
  usage: { inTok: number | null; outTok: number | null; thinkTok: number | null } | Record<string, never>;
  latencyMs: number;
}

const outcomeReply = (o: DirectOutcome, extras: Record<string, unknown> = {}) =>
  reply(o.suggestion, o.ai_status, o.moment, o.set, extras);

/** 직결 경로 — binding 이 없는 로컬/테스트 환경 전용. 기존 동작 그대로. */
async function runDirect(
  providerFetch: typeof fetch, apiKey: string, body: WritingRequest, image: WritingImage | null,
  trendEntries: readonly TrendPromptEntry[] = [],
): Promise<DirectOutcome> {
  // 멀티모달(§A-1)은 moment3 + 사진일 때만 — 그 외엔 기존 텍스트 프롬프트다.
  const isMultimodal = body.target === "moment3" && image !== null;
  const prompt = isMultimodal ? buildMoment3MultimodalPrompt(body, trendEntries) : buildWritingPrompt(body);
  const fail = (ai_status: string, latencyMs: number): DirectOutcome =>
    ({ ai_status, suggestion: null, moment: null, set: null, meta: null, validation: null, usage: {}, latencyMs });
  const controller = new AbortController();
  // 멀티모달은 12s(QA 실측 ja 8.0s 초과) — 재시도 0 계약은 그대로다.
  const timer = setTimeout(() => controller.abort(), isMultimodal ? MOMENT3_MULTIMODAL_TIMEOUT_MS : TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(buildProviderBody(prompt, body.direction, body.target, isMultimodal ? image : null)),
      },
    );
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      // provider 오류 종류 진단용 — 원문은 짧게, secret/사용자 텍스트 없음
      let errSnippet = "";
      try { errSnippet = (await res.text()).slice(0, 160).replace(/\s+/g, " "); } catch { /* ignore */ }
      log({ ok: false, kind: "http", status: res.status, latencyMs, err: errSnippet, target: body.target, dir: body.direction, locale: body.locale });
      return fail(`fallback_http_${res.status}`, latencyMs);
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
    const usageOut = { inTok: (usage as { inTok?: number | null }).inTok ?? null, outTok: (usage as { outTok?: number | null }).outTok ?? null, thinkTok: (usage as { thinkTok?: number | null }).thinkTok ?? null };
    if (body.target === "moment3") {
      // 사진 경로는 창작 검증 파서(creative_kind·visual_basis whitelist + trend §G) —
      // 위반 방향만 빠진다. 이미지 데이터는 여기서 끝(로그·저장 0, 즉시 폐기).
      // V5-1 §B — 판정 대상은 이번 요청에 전달한 entries 뿐. phrase + DB 기록
      // variant(canonical_form)로 실제 문자열을 검사한다(AI 신고는 참고값).
      const trendMap = new Map<string, readonly string[]>(
        trendEntries.map(t => [t.id, [t.phrase, ...(t.variants ?? [])]]));
      const creative = isMultimodal ? extractMoment3Creative(text, trendMap, body.locale) : null;
      // V5-3 §B — 방향별 판정(reason code 만): 파서가 채우고 guard 가 이어 쓴다.
      // 멀티모달인데 파서가 null 이면 JSON 자체가 깨진 것이다.
      const validation: Moment3Validation = creative?.meta.validation
        ?? (isMultimodal
          ? { calm: { status: "dropped", reasons: ["json_parse_invalid"] }, witty: { status: "dropped", reasons: ["json_parse_invalid"] }, warm: { status: "dropped", reasons: ["json_parse_invalid"] } }
          : emptyValidation());
      const extracted = isMultimodal ? (creative?.set ?? null) : extractMoment3(text);
      const set = groundedMoment3Guard(body, extracted, validation);
      const n = set ? Object.keys(set).length : 0;
      const warmStock = !!extracted?.warm && !set?.warm && STOCK_WARM_RE.test(extracted.warm.title + extracted.warm.memo);
      // V4 §F — 계절 위반으로 폐기된 방향(구조화 사유만, 원문 로그 0)
      const seasonDrop = (["calm", "witty", "warm"] as const).filter(d => !!extracted?.[d] && !set?.[d] && seasonViolation(body.context, extracted[d]!.title + " " + extracted[d]!.memo));
      log({ ok: n > 0, via: "direct", latencyMs, target: body.target, locale: body.locale, styles: n, warmStock,
            ...(seasonDrop.length ? { seasonDrop } : {}),
            multimodal: isMultimodal, ...(isMultimodal ? { imgB64Len: image!.data.length, kinds: creative?.meta.kinds ?? null, dropped: creative?.meta.dropped ?? null, trend: creative?.meta.trendUsedId ?? null,
              validation: Object.fromEntries((["calm", "witty", "warm"] as const).map(d => [d, validation[d]])) } : {}), ...usage });
      return { ai_status: n === 3 ? "live" : n > 0 ? "live_partial" : extracted !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment: null, set, meta: creative?.meta ?? null, validation: isMultimodal ? validation : null, usage: usageOut, latencyMs };
    }
    if (body.target === "storyHero") {
      // 표지는 AI 가 최종 문장을 직접 쓴다(§J). basis_refs 는 확인 용도 —
      // 제공 키 밖이면 거부. witty/warm 은 creative_kind whitelist 필수.
      const hero = extractHeroSuggestion(text);
      // V5-3 §B — hero 폐기 사유 코드 수집(원문 0)
      const heroReasons: DropReason[] = hero === null ? ["json_parse_invalid"] : [];
      const grounded = validateHeroRefs(body, hero, heroReasons);
      const moment = groundedMomentGuard(body, grounded);
      if (grounded !== null && moment === null) {
        const r = suggestionGuardReason(body, grounded.title) ?? suggestionGuardReason(body, grounded.memo);
        if (r) heroReasons.push(r);
      }
      const refsRejected = hero !== null && grounded === null;
      const heroValidation = { hero: { status: moment !== null ? "accepted" : "dropped", reasons: heroReasons } };
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale,
            refs: hero?.sourceRefs.length ?? 0, kind: hero?.creativeKind ?? null, refsRejected, guarded: grounded !== null && moment === null,
            reasons: heroReasons, ...usage });
      // basis_refs·creative_kind 는 저장·노출하지 않는다 — 검증에만 쓰고 버린다.
      return { ai_status: moment !== null ? "live" : refsRejected ? "fallback_refs" : hero !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment, set: null, meta: null, validation: heroValidation, usage: usageOut, latencyMs };
    }
    if (body.target === "moment") {
      const extracted = extractMomentSuggestion(text);
      const moment = groundedMomentGuard(body, extracted);
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: (moment?.title.length ?? 0) + (moment?.memo.length ?? 0), guarded: extracted !== null && moment === null, ...usage });
      return { ai_status: moment !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment, set: null, meta: null, validation: null, usage: usageOut, latencyMs };
    }
    const extracted = extractSuggestion(text, body.target);
    // 좁은 결정적 guard(§11) — 한글 오염/사진행동 발명만. 걸리면 honest fallback.
    const suggestion = groundedSuggestionGuard(body, extracted);
    log({ ok: suggestion !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: suggestion?.length ?? 0, guarded: extracted !== null && suggestion === null, ...usage });
    return { ai_status: suggestion !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty",
             suggestion, moment: null, set: null, meta: null, validation: null, usage: usageOut, latencyMs };
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    log({ ok: false, kind: isAbort ? "timeout" : "error", latencyMs: Date.now() - started });
    return fail(isAbort ? "fallback_timeout" : "fallback_error", Date.now() - started);
  }
}

// ── 영구 캐시·rate limit (TREND-PACK V1 §C·§D·§I) ────────────────────────────
// 원장 = mytrip_ai_generations rows(provider 호출만 row 생성 — cache hit 는
// hit_count 갱신뿐이라 한도에서 자연히 제외된다). 인메모리 상태 없음.

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface GenRow {
  id: string; status: string; result: unknown; expires_at: string; hit_count: number; created_at: string;
}
const GEN_COLS = "id, status, result, expires_at, hit_count, created_at";

function rowToReplyParts(feature: "moment3" | "storyHero", result: unknown): { moment: MomentSuggestion | null; set: MomentSuggestionSet3 | null } {
  if (feature === "storyHero") {
    const m = (result as { hero?: { title?: unknown; memo?: unknown } })?.hero;
    return { set: null, moment: m && typeof m.title === "string" && typeof m.memo === "string" ? { title: m.title, memo: m.memo } : null };
  }
  const raw = result as Record<string, { title?: unknown; memo?: unknown }> | null;
  const set: MomentSuggestionSet3 = {};
  for (const d of ["calm", "witty", "warm"] as const) {
    const e = raw?.[d];
    if (e && typeof e.title === "string" && typeof e.memo === "string") set[d] = { title: e.title, memo: e.memo };
  }
  return { moment: null, set: Object.keys(set).length > 0 ? set : null };
}

/**
 * pending row 를 잠시 관찰 — 다른 요청의 in-flight 생성이 끝나면 그 결과를 쓴다
 * (§O single-flight). 대기 상한은 멀티모달 provider timeout(12s)+여유 — QA 실측
 * 8s 대기로는 8.9s 생성을 놓쳐 fallback_busy 가 났다.
 */
async function pollReady(admin: NonNullable<ReturnType<typeof adminClient>>, cacheKey: string, tries = 14): Promise<GenRow | null> {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { data } = await admin.from(GEN_TABLE).select(GEN_COLS).eq("cache_key", cacheKey).eq("superseded", false).maybeSingle();
    const row = data as GenRow | null;
    if (row?.status === "succeeded") return row;
    // failed = in-flight 시도가 실패했다(원장 보존) — 대기자도 자동 재호출 없이 실패(§11)
    if (!row || row.status === "failed") return null;
  }
  return null;
}

export async function onRequestPost(
  ctx: { request: Request; env: Env; fetchFn?: typeof fetch },
): Promise<Response> {
  if ((ctx.env.MYTRIP_AI_WRITING_MODE ?? "").toLowerCase() === "off") {
    return reply(null, "off");
  }
  // V3 §5 fail-closed — HMAC 비밀키가 없으면 약한 hash 로 대체하지 않는다:
  // provider 호출 0·row 0. 직접 작성·수정·저장은 이 API 와 무관하게 정상이다.
  if (!ctx.env.MYTRIP_HASH_SECRET) {
    log({ ok: false, kind: "hash_secret_missing" });
    return reply(null, "ai_unavailable");
  }
  const hashSecret = ctx.env.MYTRIP_HASH_SECRET;

  let body: unknown;
  try { body = await ctx.request.json(); }
  catch { return reply(null, "invalid_request"); }
  if (!isWritingRequest(body)) return reply(null, "invalid_request");

  // 사진 입력(§B) — moment3 전용. 계약 위반 이미지는 provider 호출 없이 정직한
  // 실패다(사진을 본 척하는 경로 금지). URL 은 어떤 형태로도 받지 않는다(SSRF 0).
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

  const binding = ctx.env.AI_WRITING;
  const internalKey = ctx.env.INTERNAL_KEY;
  const useWorker = !!(binding && typeof binding.fetch === "function" && internalKey);
  const apiKey = ctx.env.GEMINI_API_KEY;

  // ── 영구 캐시 경로 자격 — entity(itinerary)+device 소유 검증이 가능한 요청만 ──
  const req = body as WritingRequest & { itineraryId?: unknown; forceFresh?: unknown; trendEntries?: unknown };
  // 보안: trendEntries 는 함수→Worker 내부 전달 전용이다. 공개 API 로 들어온
  // 값은 무조건 버린다(클라이언트가 임의 표현을 주입할 수 없다).
  delete req.trendEntries;
  const itineraryId = typeof req.itineraryId === "string" && UUID_RE.test(req.itineraryId) ? req.itineraryId : null;
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  const forceFresh = req.forceFresh === true;
  const admin = adminClient(ctx.env);
  const cacheable = (body.target === "moment3" || body.target === "storyHero") &&
    itineraryId !== null && UUID_RE.test(deviceId) && admin !== null;

  // 캐시 불가 요청(레거시 target·id 미제공·저장소 미설정)은 기존 경로 그대로 —
  // Trend 는 DB SSOT 라 admin 없는 경로에서는 항상 빈 목록이다.
  if (!cacheable) {
    // SINGLE-ANCHOR V1 — admin 이 없어 anchor 를 고를 수 없는 경로에서도 다중
    // moment 문구·장소 나열은 AI 로 나가지 않는다(중립 메타만).
    if (body.target === "storyHero") {
      body.context = { ...body.context, tripFacts: stripMultiMomentFacts(body.context.tripFacts ?? []) };
    }
    if (useWorker) return viaWorker(binding!, internalKey!, body);
    if (!apiKey) return reply(null, "no_key");
    return outcomeReply(await runDirect(ctx.fetchFn ?? fetch, apiKey, body, image, []));
  }

  // 소유 검증(§D) — entity 소유자가 아니면 후보를 읽을 수도, 만들 수도 없다
  const { data: owned } = await admin!.from("itineraries").select("id").eq("id", itineraryId!).eq("device_id", deviceId).maybeSingle();
  if (!owned) return json({ error: "Not found" }, 404);

  const feature = body.target as "moment3" | "storyHero";
  const promptVersion = feature === "moment3" ? MOMENT3_PROMPT_VERSION : STORY_HERO_PROMPT_VERSION;

  // ── SINGLE-ANCHOR V1 §2 — hero 는 서버가 공개 moment 한 건을 결정적으로 골라
  // 그 anchor 의 장소·제목·메모만 AI 에 전달한다(다른 moment 문구·장소명 0).
  // anchor 가 없으면 provider 호출·원장 row 없이 정직하게 fallback(§3).
  // contextHash 는 재구성 후 계산 — anchor 가 바뀌면 캐시 키도 갈린다.
  let heroOtherPlaces: string[] = [];
  if (feature === "storyHero") {
    const { data: mrows } = await admin!.from("trip_moments")
      .select("moment_id, title, memo, place_name, storage_path, day_number, captured_at")
      .eq("itinerary_id", itineraryId!).eq("is_public", true);
    const anchor = selectHeroAnchor((mrows ?? []).map(r => {
      const row = r as Record<string, unknown>;
      return {
        moment_id: String(row.moment_id),
        title: typeof row.title === "string" ? row.title : null,
        memo: typeof row.memo === "string" ? row.memo : null,
        place_name: typeof row.place_name === "string" ? row.place_name : null,
        has_photo: row.storage_path !== null && row.storage_path !== undefined,
        day_number: typeof row.day_number === "number" ? row.day_number : null,
        captured_at: String(row.captured_at ?? ""),
      };
    }));
    if (!anchor) {
      // 공개 moment(문구 보유)가 없다 — 표지는 기존 사실 기반 기본값으로 간다.
      log({ action: "hero-anchor", ok: false, kind: "no_anchor" });
      return reply(null, "fallback_no_anchor");
    }
    // 사후 가드용 — 클라가 보낸 전체 장소 목록에서 anchor 외 장소(§5).
    heroOtherPlaces = heroPlacesOf(body.context).filter(p => p && p !== (anchor.place_name ?? "").trim());
    body.context = { ...body.context, tripFacts: buildAnchorHeroFacts(body.context.tripFacts ?? [], anchor) };
    log({ action: "hero-anchor", ok: true, day: anchor.day_number, hasPhoto: anchor.has_photo, otherPlaces: heroOtherPlaces.length });
  }

  const contextHash = await sha256Hex(normalizedContextString(body.context));
  const imageSha = image ? await sha256Hex(image.data) : null;

  // Trend Pack(§3 V3·V5 §D) — 결정적 bucket 이 먼저 전달 여부·대상 상태를 정한다:
  // 0~14 experimental(15%) · 15~59 active(45%) · 60~99 미전달(40%). 전달은 강제
  // 사용이 아니다(프롬프트가 자연 결합을 우선 검토하고 안 맞으면 버린다).
  // 같은 입력은 항상 같은 결정을 받는다(HMAC — pack_version 은 bucket 입력에 없다).
  // 해당 상태에 맞는 row 가 없거나 사진에 안 맞으면 다른 상태로 fallback 하지
  // 않고 trend 없이 생성한다. DB 가 SSOT — 재배포 없이 상태 변경이 반영된다.
  let trendRows: TrendRow[] = [];
  let bucketKind: "experimental" | "active" | "none" = "none";
  if (body.target === "moment3" && image !== null) {
    const { kind } = await trendBucket(hashSecret, { feature, locale: body.locale, contextHash, imageSha }, resolveTrendBucketCfg(ctx.env as Record<string, string | undefined>));
    bucketKind = kind;
    const dbLocale = UI_TO_DB_LOCALE[body.locale] ?? null;
    if (dbLocale && kind !== "none") {
      const wantStatus = kind === "experimental" ? "experimental_active" : "active";
      const { data: tr } = await admin!.from(TREND_TABLE)
        .select("id, locale, region_scope, phrase, canonical_form, meaning, safe_example, avoid_context, status, lifecycle_type, next_review_at, confidence_score, risk_score, brand_or_artist_related, pack_version")
        .eq("locale", dbLocale).eq("status", wantStatus);
      trendRows = selectTrendForRequest(
        (tr ?? []).map(r => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id), phrase: String(row.phrase), meaning: String(row.meaning),
            usageExample: String(row.safe_example), avoidWhen: String(row.avoid_context),
            // V5-1 §B — DB 에 기록된 공식 surface form 만 판정 variant 로 쓴다
            variants: typeof row.canonical_form === "string" && row.canonical_form.trim() !== "" && row.canonical_form !== row.phrase
              ? [row.canonical_form.trim()] : [],
            locale: String(row.locale), region_scope: String(row.region_scope),
            status: row.status as TrendRow["status"], lifecycle_type: row.lifecycle_type as TrendRow["lifecycle_type"],
            next_review_at: String(row.next_review_at), confidence_score: Number(row.confidence_score),
            risk_score: Number(row.risk_score), brand_or_artist_related: row.brand_or_artist_related === true,
            pack_version: String(row.pack_version),
          };
        }), body.locale);
    }
  }
  const trendEntries: TrendPromptEntry[] = trendRows.map(r => ({ id: r.id, phrase: r.phrase, meaning: r.meaning, usageExample: r.usageExample, avoidWhen: r.avoidWhen, variants: r.variants ?? [] }));
  // §3 cache key — 미사용 bucket 은 항상 null("none"): pack 이 갱신돼도 미사용
  // 캐시는 무효화되지 않는다. 사용 bucket 만 보낸 row 집합의 버전을 쓴다.
  const trendVer = trendRows.length > 0 ? trendVersionOf(trendRows) : null;

  const cacheKey = await computeCacheKey({ feature, direction: feature === "storyHero" ? body.direction : null, itineraryId: itineraryId!, locale: body.locale, contextHash, imageSha, promptVersion, trendPackVersion: trendVer });
  const oHash = await ownerHashHmac(deviceId, hashSecret);
  const limits = resolveLimits(ctx.env as Record<string, string | undefined>);
  const notExpired = (r: GenRow) => new Date(r.expires_at).getTime() > Date.now();

  // 1) 캐시 조회(§C) — forceFresh(다시 제안받기)만 지나친다. 실패 row 는 캐시가
  //    아니다(§11 — 실패 응답을 정상 cache 결과로 쓰지 않는다).
  const { data: current } = await admin!.from(GEN_TABLE).select(GEN_COLS).eq("cache_key", cacheKey).eq("superseded", false).maybeSingle();
  const cur = current as GenRow | null;
  if (!forceFresh && cur) {
    if (cur.status === "succeeded" && notExpired(cur)) {
      await admin!.from(GEN_TABLE).update({ hit_count: cur.hit_count + 1 }).eq("id", cur.id);
      const parts = rowToReplyParts(feature, cur.result);
      log({ ok: true, target: feature, locale: body.locale, cache: "server_hit", genId: cur.id, hits: cur.hit_count + 1 });
      return reply(null, "cache_server", parts.moment, parts.set, { generation_id: cur.id, cache: "server" });
    }
    if (cur.status === "reserved" || cur.status === "provider_started") {
      const ready = await pollReady(admin!, cacheKey);
      if (ready) {
        const parts = rowToReplyParts(feature, ready.result);
        return reply(null, "cache_server", parts.moment, parts.set, { generation_id: ready.id, cache: "server" });
      }
      // in-flight 가 안 끝났거나 실패했다 — 자동 재호출 없이 정직한 대기 실패
      return reply(null, "fallback_busy");
    }
    // status === 'failed' → 아래에서 supersede 후 새 시도(새 시도도 원장·한도에 계산)
  }

  // 2) rate limit(§I·§11) — provider 를 시작한 attempt(성공·실패 포함)만 센다.
  //    cache hit·invalid image·429 는 row 를 만들지 않아 자연 제외된다.
  const BILLABLE = ["provider_started", "succeeded", "failed"];
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const cnt = async (q: { owner?: boolean; entity?: boolean; regenOnly?: boolean; since: string }): Promise<number> => {
    let sel = admin!.from(GEN_TABLE).select("id", { count: "exact", head: true })
      .gte("created_at", q.since).in("status", BILLABLE);
    if (q.owner) sel = sel.eq("owner_hash", oHash);
    if (q.entity) sel = sel.eq("itinerary_id", itineraryId!);
    if (q.regenOnly) sel = sel.not("regenerated_from", "is", null); // 재생성 한도는 재생성만 센다(§I)
    const { count } = await sel;
    return count ?? 0;
  };
  if (await cnt({ since: dayStart.toISOString() }) >= limits.globalCallsPerDay) {
    log({ ok: false, kind: "rate_limited", limit: "global_day", target: feature });
    return json(rateLimitedBody("global_day", 3600), 429);
  }
  if (await cnt({ owner: true, since: dayStart.toISOString() }) >= limits.deviceCallsPerDay) {
    log({ ok: false, kind: "rate_limited", limit: "device_day", target: feature });
    return json(rateLimitedBody("device_day", (dayStart.getTime() + 86_400_000 - Date.now()) / 1000), 429);
  }
  if (forceFresh) {
    const { data: last } = await admin!.from(GEN_TABLE).select("created_at").eq("itinerary_id", itineraryId!).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last) {
      const ageSec = (Date.now() - new Date((last as { created_at: string }).created_at).getTime()) / 1000;
      if (ageSec < limits.regenCooldownSec) {
        log({ ok: false, kind: "rate_limited", limit: "cooldown", target: feature });
        return json(rateLimitedBody("cooldown", limits.regenCooldownSec - ageSec), 429);
      }
    }
    if (await cnt({ entity: true, regenOnly: true, since: hourAgo }) >= limits.entityRegenPerHour) {
      log({ ok: false, kind: "rate_limited", limit: "entity_hour", target: feature });
      return json(rateLimitedBody("entity_hour", 3600), 429);
    }
  }

  // 3) single-flight 예약(§O) — 부분 유니크(cache_key, superseded=false)가 잠금이다
  if (cur && (forceFresh || cur.status === "failed" || !notExpired(cur))) {
    await admin!.from(GEN_TABLE).update({ superseded: true }).eq("id", cur.id);
    // §10 — trend 를 쓴 제안 직후의 명시적 재생성은 그 표현의 품질 신호다
    if (forceFresh && cur.status === "succeeded") {
      const { data: prevTrend } = await admin!.from(GEN_TABLE).select("trend_used_id").eq("id", cur.id).maybeSingle();
      const tId = (prevTrend as { trend_used_id?: string | null } | null)?.trend_used_id;
      if (tId) await bumpTrendCounter(admin!, tId, "regenerated_after_count");
    }
  }
  const genId = crypto.randomUUID();
  const { error: insErr } = await admin!.from(GEN_TABLE).insert({
    id: genId, cache_key: cacheKey, feature, itinerary_id: itineraryId, owner_hash: oHash,
    locale: body.locale, context_hash: contextHash, image_sha: imageSha,
    prompt_version: promptVersion, model: MODEL, trend_pack_version: trendVer,
    status: "reserved", regenerated_from: forceFresh ? cur?.id ?? null : null,
    expires_at: new Date(Date.now() + AI_CACHE_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (insErr) {
    // 동시 요청이 먼저 예약했다 — 그 결과를 기다린다(provider 2회 호출 방지)
    const ready = await pollReady(admin!, cacheKey);
    if (ready) {
      const parts = rowToReplyParts(feature, ready.result);
      return reply(null, "cache_server", parts.moment, parts.set, { generation_id: ready.id, cache: "server" });
    }
    return reply(null, "fallback_busy");
  }

  // 4) provider 정확 1회(§11 원장) — 시작 시점을 기록하고, 실패 row 는 삭제하지
  //    않는다(과금 가능 호출이 한도에서 빠지는 V1 결함 수정). no_key 는 provider
  //    시작 전 종료라 reserved row 를 지운다(rejected_before_provider — 과금 제외).
  let outcome: DirectOutcome;
  if (!useWorker && !apiKey) {
    await admin!.from(GEN_TABLE).delete().eq("id", genId);
    return reply(null, "no_key");
  }
  await admin!.from(GEN_TABLE).update({ status: "provider_started" }).eq("id", genId);
  if (useWorker) {
    // Worker 는 DB 를 읽지 않는다 — 함수가 고른 trend 를 내부 전달한다(§9)
    const res = await viaWorker(binding!, internalKey!, { ...(body as object), trendEntries });
    const out = (await res.clone().json()) as { moment?: MomentSuggestion | null; set?: MomentSuggestionSet3 | null; ai_status?: string };
    // V5-3 한계: Worker 경로는 방향별 validation 을 아직 돌려주지 않는다(null).
    outcome = { ai_status: out.ai_status ?? "fallback_worker_shape", suggestion: null, moment: out.moment ?? null, set: out.set ?? null, meta: null, validation: null, usage: {}, latencyMs: 0 };
  } else {
    outcome = await runDirect(ctx.fetchFn ?? fetch, apiKey!, body, image, trendEntries);
  }

  // SINGLE-ANCHOR V1 §5 — hero 가 anchor 외 다른 장소명을 만들어내면 폐기
  // (재호출 0 — 기존 가드 계약 그대로, 사유 코드만 남긴다).
  if (feature === "storyHero" && outcome.moment !== null && heroOtherPlaces.length > 0) {
    const joined = outcome.moment.title + "\n" + outcome.moment.memo;
    if (heroOtherPlaces.some(p => joined.includes(p))) {
      outcome = { ...outcome, moment: null, ai_status: "fallback_guard",
        validation: { hero: { status: "dropped", reasons: ["hero_scene_list_violation"] } } };
    }
  }

  const ok = feature === "moment3" ? outcome.set !== null : outcome.moment !== null;
  if (!ok) {
    // 실패도 원장이다 — row 유지·사유 코드만 기록(민감정보 0). 캐시로는 안 쓴다.
    await admin!.from(GEN_TABLE).update({
      status: "failed", fail_code: outcome.ai_status,
      // V5-3 §B — 전멸 실패도 방향별 사유는 남긴다(원문 0·캐시로 안 쓰는 row)
      ...(outcome.validation ? { result: { _validation: outcome.validation } } : {}),
      latency_ms: outcome.latencyMs,
    }).eq("id", genId);
    log({ ok: false, kind: "ledger_failed", target: feature, locale: body.locale, fail: outcome.ai_status });
    return outcomeReply(outcome);
  }
  const u = outcome.usage as { inTok?: number | null; outTok?: number | null; thinkTok?: number | null };
  await admin!.from(GEN_TABLE).update({
    status: "succeeded",
    // V5-3 §B — _validation 은 service-role 원장 진단 전용. rowToReplyParts 가
    // 방향 키(title/memo)만 추출하므로 공개 응답·캐시 hit 에 노출되지 않는다.
    result: feature === "moment3"
      ? { ...outcome.set, ...(outcome.validation ? { _validation: outcome.validation } : {}) }
      : { hero: outcome.moment, ...(outcome.validation ? { _validation: outcome.validation } : {}) },
    trend_used_id: outcome.meta?.trendUsedId ?? null,
    in_tok: u.inTok ?? null, out_tok: u.outTok ?? null, think_tok: u.thinkTok ?? null,
    latency_ms: outcome.latencyMs,
  }).eq("id", genId);
  // §10 — 이 표현이 실린 제안이 사용자에게 표시된다
  if (outcome.meta?.trendUsedId) await bumpTrendCounter(admin!, outcome.meta.trendUsedId, "shown_count");
  return outcomeReply(outcome, { generation_id: genId, cache: "miss" });
}

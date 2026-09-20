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
  MOMENT3_PROMPT_VERSION, STORY_HERO_PROMPT_VERSION,
  type WritingRequest, type MomentSuggestion, type MomentSuggestionSet3,
  type WritingImage, type Moment3CreativeMeta, type TrendPromptEntry,
} from "../../../src/lib/mytrip-writing/writing-core";
import {
  AI_CACHE_TTL_DAYS, resolveLimits, sha256Hex, ownerHash, normalizedContextString,
  computeCacheKey, rateLimitedBody,
} from "../../../src/lib/mytrip-writing/generation-cache";
import { activeTrendEntries, trendPackVersionFor } from "../../../src/lib/mytrip-writing/trend-packs";

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
  /** QA 전용 — Owner 승인 대기 trend 항목까지 활성(배포 기본 미설정) */
  MYTRIP_TREND_QA?: string;
  MYTRIP_AI_REGEN_COOLDOWN_SEC?: string;
  MYTRIP_AI_ENTITY_REGEN_PER_HOUR?: string;
  MYTRIP_AI_DEVICE_CALLS_PER_DAY?: string;
  MYTRIP_AI_GLOBAL_CALLS_PER_DAY?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEN_TABLE = "mytrip_ai_generations";

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
    ({ ai_status, suggestion: null, moment: null, set: null, meta: null, usage: {}, latencyMs });
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
      const trendMap = new Map(trendEntries.map(t => [t.id, t.phrase]));
      const creative = isMultimodal ? extractMoment3Creative(text, trendMap) : null;
      const extracted = isMultimodal ? (creative?.set ?? null) : extractMoment3(text);
      const set = groundedMoment3Guard(body, extracted);
      const n = set ? Object.keys(set).length : 0;
      log({ ok: n > 0, via: "direct", latencyMs, target: body.target, locale: body.locale, styles: n,
            multimodal: isMultimodal, ...(isMultimodal ? { imgB64Len: image!.data.length, kinds: creative?.meta.kinds ?? null, dropped: creative?.meta.dropped ?? null, trend: creative?.meta.trendUsedId ?? null } : {}), ...usage });
      return { ai_status: n === 3 ? "live" : n > 0 ? "live_partial" : extracted !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment: null, set, meta: creative?.meta ?? null, usage: usageOut, latencyMs };
    }
    if (body.target === "storyHero") {
      // 표지는 AI 가 최종 문장을 직접 쓴다(§J). basis_refs 는 확인 용도 —
      // 제공 키 밖이면 거부. witty/warm 은 creative_kind whitelist 필수.
      const hero = extractHeroSuggestion(text);
      const grounded = validateHeroRefs(body, hero);
      const moment = groundedMomentGuard(body, grounded);
      const refsRejected = hero !== null && grounded === null;
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale,
            refs: hero?.sourceRefs.length ?? 0, kind: hero?.creativeKind ?? null, refsRejected, guarded: grounded !== null && moment === null, ...usage });
      // basis_refs·creative_kind 는 저장·노출하지 않는다 — 검증에만 쓰고 버린다.
      return { ai_status: moment !== null ? "live" : refsRejected ? "fallback_refs" : hero !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment, set: null, meta: null, usage: usageOut, latencyMs };
    }
    if (body.target === "moment") {
      const extracted = extractMomentSuggestion(text);
      const moment = groundedMomentGuard(body, extracted);
      log({ ok: moment !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: (moment?.title.length ?? 0) + (moment?.memo.length ?? 0), guarded: extracted !== null && moment === null, ...usage });
      return { ai_status: moment !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty",
               suggestion: null, moment, set: null, meta: null, usage: usageOut, latencyMs };
    }
    const extracted = extractSuggestion(text, body.target);
    // 좁은 결정적 guard(§11) — 한글 오염/사진행동 발명만. 걸리면 honest fallback.
    const suggestion = groundedSuggestionGuard(body, extracted);
    log({ ok: suggestion !== null, via: "direct", latencyMs, target: body.target, dir: body.direction, locale: body.locale, outLen: suggestion?.length ?? 0, guarded: extracted !== null && suggestion === null, ...usage });
    return { ai_status: suggestion !== null ? "live" : extracted !== null ? "fallback_guard" : "fallback_empty",
             suggestion, moment: null, set: null, meta: null, usage: usageOut, latencyMs };
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
    if (data && (data as GenRow).status === "ready") return data as GenRow;
    if (!data) return null; // 생성 실패로 row 가 지워졌다 — 이번 요청도 정직한 실패
  }
  return null;
}

export async function onRequestPost(
  ctx: { request: Request; env: Env; fetchFn?: typeof fetch },
): Promise<Response> {
  if ((ctx.env.MYTRIP_AI_WRITING_MODE ?? "").toLowerCase() === "off") {
    return reply(null, "off");
  }

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

  // Trend Pack(§F·§G) — 사전 검수 목록만, 요청당 최대 5개, 런타임 검색 0.
  // 배포 기본은 Owner 승인 항목만이다(MYTRIP_TREND_QA 는 QA 전용 허용 플래그).
  const allowPendingOwner = (ctx.env.MYTRIP_TREND_QA ?? "") === "1";
  const trendEntries = body.target === "moment3" && image !== null
    ? activeTrendEntries(body.locale, { allowPendingOwner })
    : [];
  const trendVer = trendEntries.length > 0 ? trendPackVersionFor(body.locale, { allowPendingOwner }) : null;

  // ── 영구 캐시 경로 자격 — entity(itinerary)+device 소유 검증이 가능한 요청만 ──
  const req = body as WritingRequest & { itineraryId?: unknown; forceFresh?: unknown };
  const itineraryId = typeof req.itineraryId === "string" && UUID_RE.test(req.itineraryId) ? req.itineraryId : null;
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  const forceFresh = req.forceFresh === true;
  const admin = adminClient(ctx.env);
  const cacheable = (body.target === "moment3" || body.target === "storyHero") &&
    itineraryId !== null && UUID_RE.test(deviceId) && admin !== null;

  // 캐시 불가 요청(레거시 target·id 미제공·저장소 미설정)은 기존 경로 그대로
  if (!cacheable) {
    if (useWorker) return viaWorker(binding!, internalKey!, body);
    if (!apiKey) return reply(null, "no_key");
    return outcomeReply(await runDirect(ctx.fetchFn ?? fetch, apiKey, body, image, trendEntries));
  }

  // 소유 검증(§D) — entity 소유자가 아니면 후보를 읽을 수도, 만들 수도 없다
  const { data: owned } = await admin!.from("itineraries").select("id").eq("id", itineraryId!).eq("device_id", deviceId).maybeSingle();
  if (!owned) return json({ error: "Not found" }, 404);

  const feature = body.target as "moment3" | "storyHero";
  const promptVersion = feature === "moment3" ? MOMENT3_PROMPT_VERSION : STORY_HERO_PROMPT_VERSION;
  const contextHash = await sha256Hex(normalizedContextString(body.context));
  const imageSha = image ? await sha256Hex(image.data) : null;
  const cacheKey = await computeCacheKey({ feature, direction: feature === "storyHero" ? body.direction : null, itineraryId: itineraryId!, locale: body.locale, contextHash, imageSha, promptVersion, trendPackVersion: trendVer });
  const oHash = await ownerHash(deviceId);
  const limits = resolveLimits(ctx.env as Record<string, string | undefined>);
  const notExpired = (r: GenRow) => new Date(r.expires_at).getTime() > Date.now();

  // 1) 캐시 조회(§C) — forceFresh(다시 제안받기)만 지나친다
  const { data: current } = await admin!.from(GEN_TABLE).select(GEN_COLS).eq("cache_key", cacheKey).eq("superseded", false).maybeSingle();
  const cur = current as GenRow | null;
  if (!forceFresh && cur) {
    if (cur.status === "ready" && notExpired(cur)) {
      await admin!.from(GEN_TABLE).update({ hit_count: cur.hit_count + 1 }).eq("id", cur.id);
      const parts = rowToReplyParts(feature, cur.result);
      log({ ok: true, target: feature, locale: body.locale, cache: "server_hit", genId: cur.id, hits: cur.hit_count + 1 });
      return reply(null, "cache_server", parts.moment, parts.set, { generation_id: cur.id, cache: "server" });
    }
    if (cur.status === "pending") {
      const ready = await pollReady(admin!, cacheKey);
      if (ready) {
        const parts = rowToReplyParts(feature, ready.result);
        return reply(null, "cache_server", parts.moment, parts.set, { generation_id: ready.id, cache: "server" });
      }
      // in-flight 가 안 끝났다 — provider 를 추가로 부르지 않는 정직한 대기 실패
      return reply(null, "fallback_busy");
    }
  }

  // 2) rate limit(§I) — provider 호출이 임박했을 때만 검사한다(cache hit 는 위에서 끝)
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const cnt = async (q: { owner?: boolean; entity?: boolean; regenOnly?: boolean; since: string }): Promise<number> => {
    let sel = admin!.from(GEN_TABLE).select("id", { count: "exact", head: true }).gte("created_at", q.since);
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
  if (cur && (forceFresh || !notExpired(cur))) {
    await admin!.from(GEN_TABLE).update({ superseded: true }).eq("id", cur.id);
  }
  const genId = crypto.randomUUID();
  const { error: insErr } = await admin!.from(GEN_TABLE).insert({
    id: genId, cache_key: cacheKey, feature, itinerary_id: itineraryId, owner_hash: oHash,
    locale: body.locale, context_hash: contextHash, image_sha: imageSha,
    prompt_version: promptVersion, model: MODEL, trend_pack_version: trendVer,
    status: "pending", regenerated_from: forceFresh ? cur?.id ?? null : null,
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

  // 4) provider 정확 1회 — 실패 시 pending row 를 지운다(깨진 캐시 미저장, §O)
  let outcome: DirectOutcome;
  if (useWorker) {
    const res = await viaWorker(binding!, internalKey!, body);
    const out = (await res.clone().json()) as { moment?: MomentSuggestion | null; set?: MomentSuggestionSet3 | null; ai_status?: string };
    outcome = { ai_status: out.ai_status ?? "fallback_worker_shape", suggestion: null, moment: out.moment ?? null, set: out.set ?? null, meta: null, usage: {}, latencyMs: 0 };
  } else if (!apiKey) {
    await admin!.from(GEN_TABLE).delete().eq("id", genId);
    return reply(null, "no_key");
  } else {
    outcome = await runDirect(ctx.fetchFn ?? fetch, apiKey, body, image, trendEntries);
  }

  const ok = feature === "moment3" ? outcome.set !== null : outcome.moment !== null;
  if (!ok) {
    await admin!.from(GEN_TABLE).delete().eq("id", genId);
    return outcomeReply(outcome);
  }
  const u = outcome.usage as { inTok?: number | null; outTok?: number | null; thinkTok?: number | null };
  await admin!.from(GEN_TABLE).update({
    status: "ready",
    result: feature === "moment3" ? outcome.set : { hero: outcome.moment },
    trend_used_id: outcome.meta?.trendUsedId ?? null,
    in_tok: u.inTok ?? null, out_tok: u.outTok ?? null, think_tok: u.thinkTok ?? null,
    latency_ms: outcome.latencyMs,
  }).eq("id", genId);
  return outcomeReply(outcome, { generation_id: genId, cache: "miss" });
}

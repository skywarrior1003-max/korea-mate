// POST /api/mytrip/writing-full — 전체 여행 AI 글쓰기(한 번의 요청 · 3가지 표현)
//
// Owner 교정(2026-09-30): 사진마다 AI 를 부르지 않는다. 사용자가 일정·사진·메모를 다 담은 뒤
// 명시적으로 요청하면, **한 번의 요청**으로 여행 제목·Story 제목·소개와 각 기록(사진)의 제목·내용을
// calm·witty·warm 세 표현으로 함께 제안한다.
//
// body: { itineraryId, locale, mode: "load" | "generate", forceFresh? }
//   load     — 저장된 지난 제안만 돌려준다. AI 호출·차감 0(재열람).
//   generate — 같은 내용의 저장 결과가 있으면 그대로(0). 없거나 forceFresh 면 새로 1회 생성:
//              로그인 → 소유 확인 → 전체 여행 AI 글쓰기 사용권 예약(월 2회) → 회사 스위치·비용 예약 →
//              provider 1회(서울 Worker /provider) → 검증 → 저장 → 사용권 확정.
//              실패·timeout·무효 결과 = 사용권 되돌림(차감 0).
//
// 입력은 서버가 DB 에서 읽은 사실과, 소유가 확인된 여행의 기록 사진(기록마다 첫 장 · 상한 안)뿐 — 클라가 보낸 문맥·사진은 쓰지 않는다.
// 사진도 같은 한 번의 요청에 싣는다. 싣지 못한 사진은 이유와 함께 응답에 남긴다.
// 결과는 제안이다. 적용은 화면에서 사용자가 고른 항목만 기존 저장 API(PATCH)로 한다.

import { createClient } from "@supabase/supabase-js";
import { aiAllowed, aiUnavailableResponse } from "../../_lib/app-env";
import { aiOpsReserve, aiOpsSettle, usdMicroFromUsage } from "../../_lib/ai-ops-guard";
import { requireActiveUser, userActorHash } from "../../_lib/user-auth";
import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership.ts";
import { quotaIdemKey, quotaReserve, quotaSettle, quotaBalance } from "../../_lib/ai-user-quota";
import { MODEL } from "../../../src/lib/mytrip-writing/writing-core";
import { AI_CACHE_TTL_DAYS, sha256Hex, ownerHashHmac, ownerHash, computeCacheKey } from "../../../src/lib/mytrip-writing/generation-cache";
import {
  FULL_TRIP_PROMPT_VERSION, FULL_TRIP_MAX_MOMENTS, FULL_TRIP_TIMEOUT_MS, FULL_TRIP_PHOTO_LIMITS, FULL_TRIP_PHOTO_MIME, FULL_TRIP_WORST_USD_MICRO, interleaveRecordPhotos,
  fullTripReserveUsdMicro, fullTripTextBytes,
  type FullTripImage, type PhotoSkipReason,
  buildFullTripPrompt, buildFullTripProviderBody, parseFullTripProposal, daysFromItinerary,
  type FullTripFacts, type FullTripProposal,
} from "../../../src/lib/mytrip-writing/full-trip-core";
import { providerBodyBound, RESERVED_HEADER } from "../../../src/lib/ai-cost/provider-bound";
import { workerSupportsV2 } from "../../_lib/worker-caps";

interface Env extends OwnershipEnv {
  APP_ENV?: string;
  AI_MODE?: string;
  GEMINI_API_KEY?: string;
  AI_WRITING?: { fetch: typeof fetch };
  INTERNAL_KEY?: string;
  /** 비 Production 전용 — "direct" 면 서울 Worker 대신 이 환경의 키로 직접 부른다 */
  AI_PROVIDER_ROUTE?: string;
  MYTRIP_HASH_SECRET?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEN_TABLE = "mytrip_ai_generations";
// 회사 비용 예약 상한 — 서버가 허용하는 가장 큰 요청의 예약액(full-trip-core 참조). 실제 예약은 요청마다
// 보낼 본문에서 계산하고(fullTripReserveUsdMicro), 이 값을 넘는 요청은 보내지 않는다(2026-10-02).
const WORST_USD_MICRO = FULL_TRIP_WORST_USD_MICRO;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "mytrip-writing-full", ...fields }));
}

function admin(env: Env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** 서울 Worker /provider 경유(비 Production 은 AI_PROVIDER_ROUTE=direct 로 직접 호출 가능) */
function providerFetch(env: Env): typeof fetch | null {
  const isProd = (env.APP_ENV ?? "").trim().toLowerCase() === "production";
  const direct = !isProd && (env.AI_PROVIDER_ROUTE ?? "").trim().toLowerCase() === "direct";
  const binding = env.AI_WRITING, key = env.INTERNAL_KEY;
  if (!direct && binding && typeof binding.fetch === "function" && key) {
    return ((_url: RequestInfo | URL, init?: RequestInit) => binding.fetch("https://ai-writing.internal/provider", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-internal-auth": key, "x-provider-timeout-ms": String(FULL_TRIP_TIMEOUT_MS),
        // 사진을 실은 요청의 본문 상한(서울 Worker 가 12MB 로 다시 제한한다)
        "x-provider-max-bytes": new Headers(init?.headers).get("x-provider-max-bytes") ?? "64000",
        // 회사 원장 예약액 — Worker 가 본문 최대 비용(provider-bound)과 비교해 넘으면 보내지 않는다
        [RESERVED_HEADER]: new Headers(init?.headers).get(RESERVED_HEADER) ?? "0",
      },
      body: init?.body ?? null, signal: init?.signal ?? undefined,
    })) as typeof fetch;
  }
  return env.GEMINI_API_KEY ? fetch : null;
}

type Admin = NonNullable<ReturnType<typeof admin>>;
/** 이 제안에 실제로 실린 사진(기록 id)과 싣지 못한 사진(이유) — 화면이 그대로 알린다 */
interface PhotoCoverage { shown: string[]; skipped: { momentId: string; reason: PhotoSkipReason }[]; candidates: number }

/**
 * 기록의 사진 하나 — 2026-10-02: 기록의 **모든** 사진(1번 = trip_moments.storage_path, 이어서 추가 사진 sort_index 순).
 * 예전에는 "첫 사진" 이라면서 추가 사진의 첫 장을 골라 표지 사진이 빠졌다. 소유가 확인된 여행의 것만.
 */
interface PhotoCandidate { momentId: string; path: string; index: number; of: number }

async function loadFacts(db: Admin, itineraryId: string, locale: FullTripFacts["locale"]): Promise<(FullTripFacts & { photoCandidates: PhotoCandidate[] }) | null> {
  const { data: it } = await db.from("itineraries")
    .select("city, start_date, end_date, days, trip_title, story_title, story_intro").eq("id", itineraryId).maybeSingle();
  if (!it) return null;
  const { data: ms } = await db.from("trip_moments")
    .select("moment_id, day_number, place_name, title, memo, storage_path, captured_at")
    .eq("itinerary_id", itineraryId).order("day_number", { ascending: true }).order("captured_at", { ascending: true })
    .limit(FULL_TRIP_MAX_MOMENTS);
  const r = it as Record<string, unknown>;
  const { data: extra } = await db.from("trip_moment_photos").select("moment_id, storage_path, sort_index")
    .eq("itinerary_id", itineraryId).order("sort_index", { ascending: true });
  const extras = new Map<string, string[]>();
  for (const row of (extra ?? []) as { moment_id: string; storage_path: string | null }[]) {
    if (!row.storage_path) continue;
    const list = extras.get(row.moment_id) ?? [];
    list.push(row.storage_path);
    extras.set(row.moment_id, list);
  }
  // 기록마다 사진 목록(표지 먼저) → 고루 섞기: 모든 기록의 1번, 그다음 모든 기록의 2번 …
  const perMoment: { id: string; paths: string[] }[] = [];
  for (const m of (ms ?? []) as Record<string, unknown>[]) {
    const id = String(m.moment_id);
    const main = typeof m.storage_path === "string" && m.storage_path !== "" ? [m.storage_path] : [];
    const paths = [...main, ...(extras.get(id) ?? [])];
    if (paths.length > 0) perMoment.push({ id, paths });
  }
  const photoCandidates: PhotoCandidate[] = interleaveRecordPhotos(perMoment);
  const totals = new Map(perMoment.map(p => [p.id, p.paths.length]));
  return {
    locale, photoCandidates,
    city: String(r.city ?? ""), startDate: String(r.start_date ?? ""), endDate: String(r.end_date ?? ""),
    tripTitle: typeof r.trip_title === "string" ? r.trip_title : null,
    storyTitle: typeof r.story_title === "string" ? r.story_title : null,
    storyIntro: typeof r.story_intro === "string" ? r.story_intro : null,
    days: daysFromItinerary(r.days),
    moments: (ms ?? []).map(m => {
      const x = m as Record<string, unknown>;
      return {
        id: String(x.moment_id), day: typeof x.day_number === "number" ? x.day_number : null,
        place: typeof x.place_name === "string" ? x.place_name : null,
        title: typeof x.title === "string" ? x.title : null, memo: typeof x.memo === "string" ? x.memo : null,
        hasPhoto: (totals.get(String(x.moment_id)) ?? 0) > 0,
        photosTotal: totals.get(String(x.moment_id)) ?? 0,
      };
    }),
  };
}

const PHOTO_BUCKET = "moments";
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
/**
 * 기록 순서대로 사진을 내려받아 상한 안에서만 싣는다(장수·장당·합계·형식). 넘치거나 못 불러온 사진은 이유를 남긴다.
 * 서버가 service role 로 저장소에서 직접 읽는다 — 클라이언트가 보낸 이미지는 받지 않는다.
 */
async function loadPhotos(env: Env, cands: readonly PhotoCandidate[]): Promise<{ images: FullTripImage[]; skipped: { momentId: string; reason: PhotoSkipReason }[] }> {
  const L = FULL_TRIP_PHOTO_LIMITS;
  const images: FullTripImage[] = [];
  const skipped: { momentId: string; reason: PhotoSkipReason }[] = [];
  let total = 0;
  for (const c of cands) {
    if (images.length >= L.maxPhotos) { skipped.push({ momentId: c.momentId, reason: "over_count" }); continue; }
    let res: Response | null = null;
    try {
      res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${c.path.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch { res = null; }
    if (!res || !res.ok) { skipped.push({ momentId: c.momentId, reason: "load_failed" }); continue; }
    // 크기를 먼저 본다 — 상한을 넘는 파일은 내려받지 않는다(저장소 버킷은 현재 1MB·JPEG 로 제한돼 있다)
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > L.maxBytesEach) { skipped.push({ momentId: c.momentId, reason: "too_large" }); await res.body?.cancel(); continue; }
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!(FULL_TRIP_PHOTO_MIME as readonly string[]).includes(mime)) { skipped.push({ momentId: c.momentId, reason: "unsupported" }); continue; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > L.maxBytesEach) { skipped.push({ momentId: c.momentId, reason: "too_large" }); continue; }
    if (total + bytes.length > L.maxBytesTotal) { skipped.push({ momentId: c.momentId, reason: "total_limit" }); continue; }
    total += bytes.length;
    images.push({ momentId: c.momentId, mimeType: mime, data: toBase64(bytes), index: c.index, of: c.of });
  }
  return { images, skipped };
}

/**
 * 사용권을 쓰기 전에 보여 줄 사진 계획 — 내려받지 않고 크기 머리글만 본다(HEAD). 크기를 모르면 들어가는 것으로 본다.
 * 실제 요청 때 loadPhotos 가 같은 상한으로 다시 판정한다(결과가 다르면 응답의 photos 가 정본).
 */
async function planPhotos(env: Env, cands: readonly PhotoCandidate[]): Promise<{ candidates: number; will_use: number; skipped: { momentId: string; reason: PhotoSkipReason }[] }> {
  const L = FULL_TRIP_PHOTO_LIMITS;
  const skipped: { momentId: string; reason: PhotoSkipReason }[] = [];
  let use = 0, total = 0;
  for (const c of cands) {
    if (use >= L.maxPhotos) { skipped.push({ momentId: c.momentId, reason: "over_count" }); continue; }
    let size: number | null = null, ok = true;
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${c.path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "HEAD", headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "" }, signal: AbortSignal.timeout(4_000),
      });
      ok = r.ok || r.status === 405;
      const n = Number(r.headers.get("content-length") ?? "");
      size = Number.isFinite(n) && n > 0 ? n : null;
    } catch { ok = true; }
    if (!ok) { skipped.push({ momentId: c.momentId, reason: "load_failed" }); continue; }
    if (size !== null && size > L.maxBytesEach) { skipped.push({ momentId: c.momentId, reason: "too_large" }); continue; }
    if (size !== null && total + size > L.maxBytesTotal) { skipped.push({ momentId: c.momentId, reason: "total_limit" }); continue; }
    use += 1; total += size ?? 0;
  }
  return { candidates: cands.length, will_use: use, skipped };
}

export async function onRequestPost(ctx: { request: Request; env: Env }): Promise<Response> {
  let body: { itineraryId?: unknown; locale?: unknown; mode?: unknown; forceFresh?: unknown };
  try { body = await ctx.request.json(); } catch { return json({ error: "invalid_request" }, 400); }
  const itineraryId = typeof body.itineraryId === "string" && UUID_RE.test(body.itineraryId) ? body.itineraryId : null;
  const locale = (["ko", "en", "ja", "zh"].includes(body.locale as string) ? body.locale : "en") as FullTripFacts["locale"];
  const mode = body.mode === "generate" ? "generate" : "load";
  if (!itineraryId) return json({ error: "invalid_request" }, 400);

  // 소유 확인 — 게스트는 자기 기기, 계정은 연결된 모든 기기
  const own = await resolveOwnership(ctx.env, ctx.request);
  if (!own.ok) return own.response;
  const db = admin(ctx.env);
  if (!db) return json({ error: "unavailable" }, 503);
  const { data: owner } = await db.from("itineraries").select("device_id").eq("id", itineraryId).maybeSingle();
  const devId = String((owner as { device_id?: unknown } | null)?.device_id ?? "").toLowerCase();
  if (!owner || !own.devices.map(d => d.toLowerCase()).includes(devId)) return json({ error: "Not found" }, 404);

  const latestSaved = async () => {
    const { data } = await db.from(GEN_TABLE).select("id, result, created_at, context_hash")
      .eq("itinerary_id", itineraryId).eq("feature", "fullTrip").eq("locale", locale).eq("status", "succeeded")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data as { id: string; result: { proposal?: FullTripProposal; photos?: PhotoCoverage } | null; created_at: string; context_hash: string } | null;
  };

  const facts = await loadFacts(db, itineraryId, locale);
  if (!facts) return json({ error: "Not found" }, 404);
  const contextHash = await sha256Hex(JSON.stringify(facts));

  if (mode === "load") {
    const saved = await latestSaved();
    // 사용권을 쓰기 전에 알리는 사진 계획(기록마다 첫 사진 · 최대 12장 · 빠지는 사진과 이유)
    const photo_plan = await planPhotos(ctx.env, facts.photoCandidates);
    return json({ ok: true, ai_status: saved ? "saved" : "none", proposal: saved?.result?.proposal ?? null, photos: saved?.result?.photos ?? null, photo_plan,
      generation_id: saved?.id ?? null, created_at: saved?.created_at ?? null, stale: saved ? saved.context_hash !== contextHash : null });
  }

  // ── generate ──
  if (!aiAllowed(ctx.env as Parameters<typeof aiAllowed>[0])) return aiUnavailableResponse();
  const cacheKey = await computeCacheKey({ feature: "fullTrip", direction: null, itineraryId, locale, contextHash, imageSha: null, promptVersion: FULL_TRIP_PROMPT_VERSION, trendPackVersion: null });
  const forceFresh = body.forceFresh === true;
  const { data: cur } = await db.from(GEN_TABLE).select("id, status, result, expires_at").eq("cache_key", cacheKey).eq("superseded", false).maybeSingle();
  const c = cur as { id: string; status: string; result: { proposal?: FullTripProposal; photos?: PhotoCoverage } | null; expires_at: string } | null;
  if (!forceFresh && c?.status === "succeeded" && c.result?.proposal && new Date(c.expires_at).getTime() > Date.now()) {
    // 같은 내용(사진 목록 포함)의 저장 결과 — 추가 요청·차감 0
    return json({ ok: true, ai_status: "cache_server", proposal: c.result.proposal, photos: c.result.photos ?? null, generation_id: c.id, charged: false });
  }
  if (c && (c.status === "reserved" || c.status === "provider_started")) return json({ ok: false, ai_status: "fallback_busy" });

  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const pf = providerFetch(ctx.env);
  if (!pf) return json({ ok: false, ai_status: "fallback_unavailable" });
  // 배포 순서 호환(2026-10-02) — Worker 경유면 V2 요청을 처리할 수 있는 Worker 인지 먼저 본다. 옛 Worker 면 모델·예약·차감 0 으로 끝낸다
  if (pf !== fetch && !(await workerSupportsV2(ctx.env))) return json({ ok: false, ai_status: "fallback_ops_gate" });

  // 사진 — 소유가 확인된 여행의 기록 사진만, 상한 안에서(사용권 예약 전: 불러오기 실패로 차감이 생기지 않게)
  const { images, skipped } = await loadPhotos(ctx.env, facts.photoCandidates);
  const shownIds = new Set(images.map(i => i.momentId));
  const skippedIds = new Set(skipped.map(x => x.momentId));
  for (const m of facts.moments) {
    m.photo = shownIds.has(m.id) ? "shown" : skippedIds.has(m.id) ? "not_shown" : m.hasPhoto ? "not_shown" : "none";
    m.photosShown = images.filter(i => i.momentId === m.id).length;
  }
  // shown 은 사진 한 장마다 기록 id 하나(같은 기록의 사진 여러 장이면 여러 번) — 화면은 길이로 장수를 센다
  const photos: PhotoCoverage = { shown: images.map(i => i.momentId), skipped, candidates: facts.photoCandidates.length };
  const prompt = buildFullTripPrompt(facts);
  const providerBody = buildFullTripProviderBody(prompt, images);
  // 이 요청의 회사 비용 예약액 — 실제로 보낼 글 바이트와 사진 장수로 계산한다(입력 토큰 ≤ 바이트 실측).
  // 상한을 넘으면 계산이 틀렸다는 뜻이라 사용권·예약 전에 멈춘다(차감 0 · 모델 호출 0).
  // 2026-10-02(V2 전 경로 점검): 다른 기능과 같은 상한 함수(provider-bound)로 센다 — 같은 본문이면 fullTripReserveUsdMicro 와 같은 값
  const bound = providerBodyBound(providerBody);
  const reserveUsdMicro = bound.ok ? bound.usdMicro : Number.POSITIVE_INFINITY;
  if (reserveUsdMicro > WORST_USD_MICRO || reserveUsdMicro < fullTripReserveUsdMicro(fullTripTextBytes(prompt, images), images.length)) {
    log({ ok: false, fail: "over_reserve_cap", reserveUsdMicro, moments: facts.moments.length, photos: images.length });
    return json({ ok: false, ai_status: "fallback_ops_gate" });
  }

  const genId = crypto.randomUUID();
  const qEnv = ctx.env as Parameters<typeof quotaReserve>[0];
  const quota = await quotaReserve(qEnv, auth.userId, "writing", await quotaIdemKey(auth.userId, "writing", `full:${genId}`));
  if (quota.status === "exhausted") return json({ ok: false, ai_status: "fallback_quota", next_free_at: quota.resetsAt || null });
  if (quota.status !== "reserved") return json({ ok: false, ai_status: quota.status === "in_progress" ? "fallback_busy" : "fallback_ops_gate" });
  const release = () => quotaSettle(qEnv, quota.id, auth.userId, "released");

  const secret = ctx.env.MYTRIP_HASH_SECRET ?? "";
  const actor = secret ? await userActorHash(auth.userId, secret) : null;
  const gate = await aiOpsReserve(ctx.env as Parameters<typeof aiOpsReserve>[0], {
    feature: "writing", model: MODEL, worstUsdMicro: reserveUsdMicro,
    idempotencyKey: `writing-full:${genId}`, actorHash: actor,
    featureDailyCalls: 100, featureDailyUsdMicro: 1_000_000, // writing 과 공유 $1/day
  });
  if (!gate.ok) { await release(); return json({ ok: false, ai_status: "fallback_ops_gate" }); }

  if (c) await db.from(GEN_TABLE).update({ superseded: true }).eq("id", c.id);
  const oHash = secret ? await ownerHashHmac(own.currentDevice, secret) : await ownerHash(own.currentDevice);
  const { error: insErr } = await db.from(GEN_TABLE).insert({
    id: genId, cache_key: cacheKey, feature: "fullTrip", itinerary_id: itineraryId, owner_hash: oHash,
    locale, context_hash: contextHash, image_sha: null, prompt_version: FULL_TRIP_PROMPT_VERSION, model: MODEL,
    trend_pack_version: null, status: "provider_started", regenerated_from: forceFresh ? c?.id ?? null : null,
    expires_at: new Date(Date.now() + AI_CACHE_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (insErr) {
    await release();
    // 요청 전송 전 — 회사 원장은 예약만 된 상태라 전송 전 확정 무과금으로 되돌린다
    await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "released");
    return json({ ok: false, ai_status: "fallback_busy" });
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FULL_TRIP_TIMEOUT_MS + 3_000);
  let proposal: FullTripProposal | null = null, inTok: number | null = null, outTok: number | null = null, fail: string | null = null;
  let notSent = false;
  let usedModel: string = MODEL;
  try {
    const res = await pf(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${ctx.env.GEMINI_API_KEY ?? ""}`, {
      // 본문 상한은 바이트로 알린다(Worker 가 바이트로 잰다 — 글자 수는 한국어에서 바이트보다 작다)
      method: "POST", headers: { "Content-Type": "application/json", "x-provider-max-bytes": String(new TextEncoder().encode(providerBody).length + 1_000), [RESERVED_HEADER]: String(reserveUsdMicro) }, signal: controller.signal,
      body: providerBody,
    });
    // 서울 Worker 가 모델에 보내기 전에 거절했다(인증·스위치·키 없음·본문 크기) — 과금 없음이 확정이다
    notSent = res.headers.get("x-gkm-provider-called") === "0";
    usedModel = res.headers.get("x-gkm-model") ?? MODEL;
    if (!res.ok) fail = `http_${res.status}`;
    else {
      const raw = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
      inTok = raw.usageMetadata?.promptTokenCount ?? null;
      outTok = (raw.usageMetadata?.candidatesTokenCount ?? 0) + (raw.usageMetadata?.thoughtsTokenCount ?? 0) || null;
      proposal = parseFullTripProposal(raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "", facts.moments.map(m => m.id));
      if (!proposal) fail = "invalid_result";
    }
  } catch (e) {
    fail = e instanceof Error && e.name === "AbortError" ? "timeout" : "error";
  } finally { clearTimeout(timer); }
  const latency = Date.now() - started;

  if (!proposal) {
    // 모델에 보내기 전 거절이면 회사 원장 예약을 되돌린다(released). 보낸 뒤 결과를 모르면(시간 초과·오류 응답)
    // 예약액을 보존한다(unknown_billed). 사용자 사용권은 어느 경우든 되돌림(차감 0).
    await db.from(GEN_TABLE).update({ status: "failed", fail_code: `${fail}${notSent ? ":not_sent" : ""}`, latency_ms: latency }).eq("id", genId);
    // 응답과 사용량은 받았는데 형식이 틀린 경우(invalid_result)는 과금이 확정이다 — 실제 토큰으로 committed(가져오기와 같은 규칙, 2026-10-02).
    // 사용량이 없으면 예전처럼 보내기 전 거절 = released · 보낸 뒤 결과 모름 = unknown_billed(예약액 보존).
    if (!notSent && (inTok !== null || outTok !== null)) {
      await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "committed", { inTok, outTok, usdMicro: usdMicroFromUsage(inTok, outTok, usedModel) }, reserveUsdMicro);
    } else {
      await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, notSent ? "released" : "unknown_billed");
    }
    await release();
    log({ ok: false, fail, notSent, latencyMs: latency, moments: facts.moments.length, photos: images.length });
    return json({ ok: false, ai_status: `fallback_${fail}`, not_sent: notSent });
  }
  const usd = inTok !== null || outTok !== null ? usdMicroFromUsage(inTok, outTok, usedModel) : reserveUsdMicro;
  await db.from(GEN_TABLE).update({ status: "succeeded", result: { proposal, photos }, in_tok: inTok, out_tok: outTok, latency_ms: latency }).eq("id", genId);
  await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "committed", { inTok, outTok, usdMicro: usd }, reserveUsdMicro);
  await quotaSettle(qEnv, quota.id, auth.userId, "committed", { generation_id: genId });
  log({ ok: true, latencyMs: latency, moments: facts.moments.length, photos: images.length, skipped: skipped.length, inTok, outTok, usdMicro: usd, styles: Object.keys(proposal).length });
  return json({ ok: true, ai_status: "live", proposal, photos, generation_id: genId, charged: true, usage: { in_tok: inTok, out_tok: outTok, usd_micro: usd, reserved_usd_micro: reserveUsdMicro, latency_ms: latency, model: usedModel } });
}

// GET — 이번 달 남은 전체 여행 AI 글쓰기 사용권(화면 안내용). 로그인 사용자만. AI 호출 없음.
export async function onRequestGet(ctx: { request: Request; env: Env }): Promise<Response> {
  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const b = await quotaBalance(ctx.env as Parameters<typeof quotaBalance>[0], auth.userId);
  if (!b) return json({ ok: false, error: "quota_unavailable" });
  return json({ ok: true, writing: b.writing, resets_at: b.resets_at });
}

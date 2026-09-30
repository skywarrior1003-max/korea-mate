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
// 입력은 서버가 DB 에서 읽은 텍스트 사실뿐 — 클라가 보낸 문맥·사진은 쓰지 않는다. 사진 이미지는 보내지 않는다.
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
  FULL_TRIP_PROMPT_VERSION, FULL_TRIP_MAX_MOMENTS, FULL_TRIP_TIMEOUT_MS,
  buildFullTripPrompt, buildFullTripProviderBody, parseFullTripProposal, daysFromItinerary,
  type FullTripFacts, type FullTripProposal,
} from "../../../src/lib/mytrip-writing/full-trip-core";

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
const WORST_USD_MICRO = 22_000; // 입력 ~4k + 출력 상한 8,192 토큰 ≈ $0.021

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
      headers: { "Content-Type": "application/json", "x-internal-auth": key, "x-provider-timeout-ms": String(FULL_TRIP_TIMEOUT_MS) },
      body: init?.body ?? null, signal: init?.signal ?? undefined,
    })) as typeof fetch;
  }
  return env.GEMINI_API_KEY ? fetch : null;
}

type Admin = NonNullable<ReturnType<typeof admin>>;

async function loadFacts(db: Admin, itineraryId: string, locale: FullTripFacts["locale"]): Promise<FullTripFacts | null> {
  const { data: it } = await db.from("itineraries")
    .select("city, start_date, end_date, days, trip_title, story_title, story_intro").eq("id", itineraryId).maybeSingle();
  if (!it) return null;
  const { data: ms } = await db.from("trip_moments")
    .select("moment_id, day_number, place_name, title, memo, storage_path, captured_at")
    .eq("itinerary_id", itineraryId).order("day_number", { ascending: true }).order("captured_at", { ascending: true })
    .limit(FULL_TRIP_MAX_MOMENTS);
  const r = it as Record<string, unknown>;
  return {
    locale,
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
        hasPhoto: typeof x.storage_path === "string" && x.storage_path !== "",
      };
    }),
  };
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
    return data as { id: string; result: { proposal?: FullTripProposal } | null; created_at: string; context_hash: string } | null;
  };

  const facts = await loadFacts(db, itineraryId, locale);
  if (!facts) return json({ error: "Not found" }, 404);
  const contextHash = await sha256Hex(JSON.stringify(facts));

  if (mode === "load") {
    const saved = await latestSaved();
    return json({ ok: true, ai_status: saved ? "saved" : "none", proposal: saved?.result?.proposal ?? null,
      generation_id: saved?.id ?? null, created_at: saved?.created_at ?? null, stale: saved ? saved.context_hash !== contextHash : null });
  }

  // ── generate ──
  if (!aiAllowed(ctx.env as Parameters<typeof aiAllowed>[0])) return aiUnavailableResponse();
  const cacheKey = await computeCacheKey({ feature: "fullTrip", direction: null, itineraryId, locale, contextHash, imageSha: null, promptVersion: FULL_TRIP_PROMPT_VERSION, trendPackVersion: null });
  const forceFresh = body.forceFresh === true;
  const { data: cur } = await db.from(GEN_TABLE).select("id, status, result, expires_at").eq("cache_key", cacheKey).eq("superseded", false).maybeSingle();
  const c = cur as { id: string; status: string; result: { proposal?: FullTripProposal } | null; expires_at: string } | null;
  if (!forceFresh && c?.status === "succeeded" && c.result?.proposal && new Date(c.expires_at).getTime() > Date.now()) {
    // 같은 내용의 저장 결과 — 추가 요청·차감 0
    return json({ ok: true, ai_status: "cache_server", proposal: c.result.proposal, generation_id: c.id, charged: false });
  }
  if (c && (c.status === "reserved" || c.status === "provider_started")) return json({ ok: false, ai_status: "fallback_busy" });

  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const pf = providerFetch(ctx.env);
  if (!pf) return json({ ok: false, ai_status: "fallback_unavailable" });

  const genId = crypto.randomUUID();
  const qEnv = ctx.env as Parameters<typeof quotaReserve>[0];
  const quota = await quotaReserve(qEnv, auth.userId, "writing", await quotaIdemKey(auth.userId, "writing", `full:${genId}`));
  if (quota.status === "exhausted") return json({ ok: false, ai_status: "fallback_quota", next_free_at: quota.resetsAt || null });
  if (quota.status !== "reserved") return json({ ok: false, ai_status: quota.status === "in_progress" ? "fallback_busy" : "fallback_ops_gate" });
  const release = () => quotaSettle(qEnv, quota.id, auth.userId, "released");

  const secret = ctx.env.MYTRIP_HASH_SECRET ?? "";
  const actor = secret ? await userActorHash(auth.userId, secret) : null;
  const gate = await aiOpsReserve(ctx.env as Parameters<typeof aiOpsReserve>[0], {
    feature: "writing", model: MODEL, worstUsdMicro: WORST_USD_MICRO,
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
  try {
    const res = await pf(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${ctx.env.GEMINI_API_KEY ?? ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: buildFullTripProviderBody(buildFullTripPrompt(facts)),
    });
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
    // 요청은 전송됐다 — 회사 원장은 예약액 보존(unknown_billed), 사용자 사용권은 되돌림(차감 0)
    await db.from(GEN_TABLE).update({ status: "failed", fail_code: fail, latency_ms: latency }).eq("id", genId);
    await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "unknown_billed");
    await release();
    log({ ok: false, fail, latencyMs: latency, moments: facts.moments.length });
    return json({ ok: false, ai_status: `fallback_${fail}` });
  }
  const usd = inTok !== null || outTok !== null ? usdMicroFromUsage(inTok, outTok) : WORST_USD_MICRO;
  await db.from(GEN_TABLE).update({ status: "succeeded", result: { proposal }, in_tok: inTok, out_tok: outTok, latency_ms: latency }).eq("id", genId);
  await aiOpsSettle(ctx.env as Parameters<typeof aiOpsReserve>[0], gate.ledgerId, "committed", { inTok, outTok, usdMicro: usd });
  await quotaSettle(qEnv, quota.id, auth.userId, "committed", { generation_id: genId });
  log({ ok: true, latencyMs: latency, moments: facts.moments.length, inTok, outTok, usdMicro: usd, styles: Object.keys(proposal).length });
  return json({ ok: true, ai_status: "live", proposal, generation_id: genId, charged: true, usage: { in_tok: inTok, out_tok: outTok, usd_micro: usd } });
}

// GET — 이번 달 남은 전체 여행 AI 글쓰기 사용권(화면 안내용). 로그인 사용자만. AI 호출 없음.
export async function onRequestGet(ctx: { request: Request; env: Env }): Promise<Response> {
  const auth = await requireActiveUser(ctx.env as Parameters<typeof requireActiveUser>[0], ctx.request);
  if (!auth.ok) return auth.response;
  const b = await quotaBalance(ctx.env as Parameters<typeof quotaBalance>[0], auth.userId);
  if (!b) return json({ ok: false, error: "quota_unavailable" });
  return json({ ok: true, writing: b.writing, resets_at: b.resets_at });
}

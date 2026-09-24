// Cloudflare Pages Function — GET·POST·DELETE /api/story-submission
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §5-2)
//
// 본인 공개 Story 를 지역 추천에 제출한다. Story 는 복제되지 않는다 —
// story_submissions 는 itinerary_id 참조와 상태만 갖는다(068).
//
//   GET    ?itinerary_id=  → { status } (본인 것만; 없으면 status:null)
//   POST   { itinerary_id }→ 시스템 사전검사 후 pending 등록/재제출
//   DELETE { itinerary_id }→ 본인 제출 철회(withdrawn)
//
// 계약
//  · 소유 검증은 서버가 한다 — itineraries.device_id 와 x-device-id 일치.
//  · 비공개·가려진·미지원 도시·장소 부족·공개 moment 없음 → 등록 거부.
//  · pending/approved 상태에서 재제출 불가(409). rejected/withdrawn 은 pending 으로.
//  · 승인 전 항목은 어떤 추천 화면에도 나가지 않는다(recommendations 가 approved 만 읽음).

import {
  precheckSubmission, countScheduledPlaces, canResubmit,
  type SubmissionStatus,
} from "../../src/lib/community/community-core";
import { actorKey } from "../../src/lib/social/social-actions-core";

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1024;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (error: string, status: number) => json({ success: false, error }, status);

const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1; return true;
}

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/** 소유 + 제출 자격 본문 조회 — service_role 로만 */
async function ownedTrip(env: Env, id: string, deviceId: string) {
  const r = await rest(env, "GET",
    `itineraries?id=eq.${id}&select=id,device_id,city,is_public,moderation_hidden_at,days&limit=1`);
  const row = Array.isArray(r.data) ? r.data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) return null;
  if (String(row.device_id ?? "").toLowerCase() !== deviceId.toLowerCase()) return null;
  return row;
}

async function currentSubmission(env: Env, itineraryId: string) {
  const r = await rest(env, "GET",
    `story_submissions?itinerary_id=eq.${itineraryId}&select=status&limit=1`);
  const row = Array.isArray(r.data) ? r.data[0] as { status: SubmissionStatus } | undefined : undefined;
  return row?.status ?? null;
}

function parseIds(request: Request, body?: unknown): { deviceId: string; itineraryId: string } | null {
  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return null;
  let itineraryId = "";
  if (body && typeof body === "object") {
    const v = (body as Record<string, unknown>).itinerary_id;
    if (typeof v === "string") itineraryId = v.trim();
  } else {
    itineraryId = (new URL(request.url).searchParams.get("itinerary_id") ?? "").trim();
  }
  if (!UUID_RE.test(itineraryId)) return null;
  return { deviceId: deviceId.toLowerCase(), itineraryId: itineraryId.toLowerCase() };
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);
  const ids = parseIds(request);
  if (!ids) return fail("invalid_request", 400);
  const trip = await ownedTrip(env, ids.itineraryId, ids.deviceId);
  if (!trip) return fail("not_found", 404);
  return json({ status: await currentSubmission(env, ids.itineraryId) });
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_request", 400); }

  const ids = parseIds(request, body);
  if (!ids) return fail("invalid_request", 400);
  if (!underRateLimit(ids.deviceId)) return fail("rate_limited", 429);

  const trip = await ownedTrip(env, ids.itineraryId, ids.deviceId);
  if (!trip) return fail("not_found", 404);

  // 공개 moment 존재 — Story 표면 자체의 성립 조건(content-like 와 같은 축)
  const pm = await rest(env, "GET",
    `trip_moments?itinerary_id=eq.${ids.itineraryId}&is_public=eq.true&select=id&limit=1`);
  const hasPublicMoment = pm.ok && Array.isArray(pm.data) && pm.data.length > 0;

  const check = precheckSubmission({
    isPublic:         trip.is_public === true,
    moderationHidden: trip.moderation_hidden_at !== null && trip.moderation_hidden_at !== undefined,
    city:             typeof trip.city === "string" ? trip.city : null,
    placeCount:       countScheduledPlaces(trip.days),
    hasPublicMoment,
  });
  if (!check.ok) return fail(check.error, 422);

  const prev = await currentSubmission(env, ids.itineraryId);
  if (!canResubmit(prev)) return fail("already_submitted", 409);

  const submitterKey = await actorKey("share", ids.deviceId, "story_submission", ids.itineraryId);
  const now = new Date().toISOString();
  const up = await rest(env, "POST",
    "story_submissions?on_conflict=itinerary_id",
    [{
      itinerary_id: ids.itineraryId, city: check.city, status: "pending",
      submitter_key: submitterKey, submitted_at: now, decided_at: null,
      decided_note: null, updated_at: now,
    }],
    "resolution=merge-duplicates,return=minimal");
  if (!up.ok) {
    console.log(JSON.stringify({ action: "story-submission", status: "upsert_failed", httpStatus: up.status }));
    return fail("server_error", 500);
  }
  return json({ success: true, status: "pending" }, 201);
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fail("server_error", 503);
  const ids = parseIds(request);
  if (!ids) return fail("invalid_request", 400);
  const trip = await ownedTrip(env, ids.itineraryId, ids.deviceId);
  if (!trip) return fail("not_found", 404);
  const prev = await currentSubmission(env, ids.itineraryId);
  if (prev === null) return fail("not_found", 404);
  const now = new Date().toISOString();
  const up = await rest(env, "PATCH",
    `story_submissions?itinerary_id=eq.${ids.itineraryId}`,
    { status: "withdrawn", decided_at: null, updated_at: now }, "return=minimal");
  if (!up.ok) return fail("server_error", 500);
  return json({ success: true, status: "withdrawn" });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, POST, DELETE, OPTIONS" } });
}

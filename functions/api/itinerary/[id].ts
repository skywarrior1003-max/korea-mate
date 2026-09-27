// Cloudflare Pages Function: GET/PUT/PATCH/DELETE /api/itinerary/:id
//
// WHY THIS EXISTS:
// GoKoreaMate uses STATIC_EXPORT=true → Next.js API Routes excluded from out/.
// Mirrors src/app/api/itinerary/[id]/route.ts — security policy identical.
//
// SECURITY CONTRACT:
// - GET: owner-only (WHERE id + device_id). Non-owners receive 404. device_id never in response.
// - PUT: conditional UPDATE (WHERE id + device_id). 0 rows → 404.
// - PATCH: title or is_public UPDATE (WHERE id + device_id). Allowlist enforced.
// - DELETE: WHERE id + device_id.
// - x-device-id header required for all methods; body device_id ignored.

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_BODY_BYTES,
  MAX_SMALL_BODY_BYTES,
  readBodyWithLimit,
  isValidDays,
  optStr,
} from "../../../src/lib/itinerary-validate";
import { purgeItineraryCascade } from "../../_lib/itinerary-purge";
import { publishGate } from "../../../src/lib/moderation/publish-gate";
import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership.ts";

/**
 * 가려졌는지 읽어 오는 함수. PUT·PATCH 가 같은 것을 쓴다.
 *
 * 소유자 조건을 함께 건다 — 남의 여행 상태를 알려 주는 통로가 되면 안 된다.
 * `error` 는 조회 자체가 실패한 것이라 판정 불가로 넘긴다(공개를 켜 주지 않는다).
 */
function moderationReader(admin: ReturnType<typeof adminClient>, deviceScope: string[]) {
  // publishGate 의 reader 시그니처(id, deviceId)는 유지하고 scope 는 closure 로 받는다
  return async (id: string, _deviceId: string) => {
    const { data, error } = await admin
      .from("itineraries")
      .select("moderation_hidden_at")
      .eq("id", id)
      .in("device_id", deviceScope)
      .maybeSingle();
    if (error) return { ok: false, row: null };
    return { ok: true, row: (data ?? null) as { moderation_hidden_at: string | null } | null };
  };
}

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── GET — owner-only ──────────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 커버 상태는 소유자가 "현재 표지"를 표시·해제하는 데 필요하다.
  // storage_path·device_id·cover_consent_* 는 select 하지 않으므로 응답에 나갈 수 없다.
  const BASE_COLS = "id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count, is_public, copy_of, cover_kind, cover_moment_id";
  const sel = (cols: string) => admin
    .from("itineraries")
    .select(cols)
    .eq("id", id)
    .in("device_id", deviceScope)
    .maybeSingle();
  // 공개 Story 표지 제목·소개문·문체(062) — 미적용 DB 는 기존 목록으로 내려간다
  let { data, error } = await sel(`${BASE_COLS}, story_title, story_intro, story_tone`);
  if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await sel(BASE_COLS));

  if (error) {
    console.error("[functions/api/itinerary GET] db error:", error.code);
    return json({ error: "Failed to fetch itinerary" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  return json(data);
}

// ── PUT — full save (conditional UPDATE) ─────────────────────────────────────
export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  if (!isValidDays(body.days)) return json({ error: "Invalid days structure" }, 400);

  const row: Record<string, unknown> = {
    days:       body.days,
    updated_at: new Date().toISOString(),
  };
  const city        = optStr(body.city,         100); if (city)        row.city         = city;
  const startDate   = optStr(body.start_date,    20); if (startDate)   row.start_date   = startDate;
  const endDate     = optStr(body.end_date,      20); if (endDate)     row.end_date     = endDate;
  const travelers   = optStr(body.travelers,     50); if (travelers)   row.travelers    = travelers;
  const travelStyle = optStr(body.travel_style, 100); if (travelStyle) row.travel_style = travelStyle;
  const tripTitle   = optStr(body.trip_title,   300); if (tripTitle)   row.trip_title   = tripTitle;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 관리자가 가린 여행은 다시 공개할 수 없다.
  //
  // 이 검사가 없으면 가려진 사람이 공개를 다시 켜서 그대로 되돌릴 수 있고,
  // 그러면 가린 의미가 없어진다. **끄는 것은 언제나 허용한다** — 공개를 줄이는
  // 방향이다. 제목 수정도 막지 않는다.
  // 왜 막혔는지는 알려 주되 누가 신고했는지·관리자 메모는 알려 주지 않는다
  const putGate = await publishGate(moderationReader(admin, deviceScope), id, deviceId, row.is_public);
  if (!putGate.allowed) return json({ error: putGate.error }, putGate.status);

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .in("device_id", deviceScope)
    .select("id");

  if (error) {
    console.error("[functions/api/itinerary PUT] db error:", error.code);
    return json({ error: "Failed to update itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── PATCH — title or is_public (allowlist) ───────────────────────────────────
export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as {
    trip_title?: unknown; is_public?: unknown;
    story_title?: unknown; story_intro?: unknown; story_tone?: unknown;
  };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const title = typeof body.trip_title === "string" ? body.trip_title.trim().slice(0, 300) : "";
  if (title) row.trip_title = title;
  if (typeof body.is_public === "boolean") row.is_public = body.is_public;
  // 공개 Story 표지 제목·소개문·문체 (062, STORY-HERO-TONE-SELECTION V2).
  // 사용자가 저장한 최종값만 공개 표지에 쓰인다. 빈 문자열은 "지움"(null)이다.
  if (typeof body.story_title === "string") {
    const v = body.story_title.trim().slice(0, 80);
    row.story_title = v || null;
  }
  if (typeof body.story_intro === "string") {
    const v = body.story_intro.trim().slice(0, 300);
    row.story_intro = v || null;
  }
  if (body.story_tone === "calm" || body.story_tone === "witty" || body.story_tone === "warm") {
    row.story_tone = body.story_tone;
  }

  if (Object.keys(row).length === 1) return json({ error: "No valid fields to update" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 사람이 실제로 쓰는 공개 토글이 이 경로다. 규칙을 PUT 에만 적어 두면
  // 여기로 그대로 우회할 수 있다 — 같은 판정을 건다.
  const gate = await publishGate(moderationReader(admin, deviceScope), id, deviceId, row.is_public);
  if (!gate.allowed) return json({ error: gate.error }, gate.status);

  const runUpdate = (r: Record<string, unknown>) => admin
    .from("itineraries")
    .update(r)
    .eq("id", id)
    .in("device_id", deviceScope)
    .select("id");

  let { data, error } = await runUpdate(row);
  // 062 미적용 DB(story_* 컬럼 없음) — 해당 필드만 빼고 나머지를 저장한다.
  // (trip_moments title 의 061 fallback 과 같은 패턴 — 배포 순서 안전장치)
  if (error && (error.code === "42703" || error.code === "PGRST204") &&
      ("story_title" in row || "story_intro" in row || "story_tone" in row)) {
    const { story_title: _t, story_intro: _i, story_tone: _o, ...rest } = row;
    if (Object.keys(rest).length > 1) ({ data, error } = await runUpdate(rest));
  }

  if (error) {
    console.error("[functions/api/itinerary PATCH] db error:", error.code);
    return json({ error: "Failed to update itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceScope = own.devices;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1단계: 소유권 확인 (Storage 삭제 전 SELECT로 검증)
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", id)
    .in("device_id", deviceScope)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found or permission denied" }, 404);

  // 2~6단계는 공용 cascade(ACCOUNT-DELETE-V1 에서 계정 삭제와 공유) —
  // 순서·실패 계약은 아래 원본 주석 그대로 functions/_lib/itinerary-purge.ts 에 있다.
  {
    const purged = await purgeItineraryCascade(admin, id);
    if (!purged.ok) {
      const msg = purged.stage === "photo_collect" || purged.stage === "storage"
        ? "Failed to remove photos"
        : purged.stage === "trip_moments" ? "Failed to delete moments" : "Failed to delete itinerary";
      return json({ error: msg }, purged.status);
    }
    return json({ ok: true });
  }

}

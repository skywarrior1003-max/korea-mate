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
import { collectItineraryPhotoPaths, removeItineraryStorage } from "../../../src/lib/photo-delete";
import { publishGate } from "../../../src/lib/moderation/publish-gate";

/**
 * 가려졌는지 읽어 오는 함수. PUT·PATCH 가 같은 것을 쓴다.
 *
 * 소유자 조건을 함께 건다 — 남의 여행 상태를 알려 주는 통로가 되면 안 된다.
 * `error` 는 조회 자체가 실패한 것이라 판정 불가로 넘긴다(공개를 켜 주지 않는다).
 */
function moderationReader(admin: ReturnType<typeof adminClient>) {
  return async (id: string, deviceId: string) => {
    const { data, error } = await admin
      .from("itineraries")
      .select("moderation_hidden_at")
      .eq("id", id)
      .eq("device_id", deviceId)
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

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("itineraries")
    // 커버 상태는 소유자가 "현재 표지"를 표시·해제하는 데 필요하다.
    // storage_path·device_id·cover_consent_* 는 select 하지 않으므로 응답에 나갈 수 없다.
    .select("id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count, is_public, copy_of, cover_kind, cover_moment_id")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

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

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

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
  const putGate = await publishGate(moderationReader(admin), id, deviceId, row.is_public);
  if (!putGate.allowed) return json({ error: putGate.error }, putGate.status);

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
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

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as { trip_title?: unknown; is_public?: unknown };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const title = typeof body.trip_title === "string" ? body.trip_title.trim().slice(0, 300) : "";
  if (title) row.trip_title = title;
  if (typeof body.is_public === "boolean") row.is_public = body.is_public;

  if (Object.keys(row).length === 1) return json({ error: "No valid fields to update" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 사람이 실제로 쓰는 공개 토글이 이 경로다. 규칙을 PUT 에만 적어 두면
  // 여기로 그대로 우회할 수 있다 — 같은 판정을 건다.
  const gate = await publishGate(moderationReader(admin), id, deviceId, row.is_public);
  if (!gate.allowed) return json({ error: gate.error }, gate.status);

  const { data, error } = await admin
    .from("itineraries")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

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

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1단계: 소유권 확인 (Storage 삭제 전 SELECT로 검증)
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found or permission denied" }, 404);

  // 2단계: 연결 Storage 파일 경로 수집 — 첫 장 slot 과 자식 사진을 모두 모은다.
  //
  // 자식 행(`trip_moment_photos`)은 4단계에서 FK CASCADE 로 함께 사라진다.
  // 여기서 경로를 미리 챙기지 않으면 그 파일들은 아무도 가리키지 않는 채
  // Storage 에 남고, 가리키던 행이 없으니 나중에 찾아낼 방법도 없다.
  //
  // 둘 중 하나라도 못 읽으면 목록이 불완전하다. 그 상태로 지우면 "지운 줄 알았는데
  // 남은" 파일이 생기므로, 조용히 넘기지 않고 여기서 멈춘다.
  const collected = await collectItineraryPhotoPaths({
    legacy: async () => {
      const { data, error } = await admin
        .from("trip_moments")
        .select("storage_path")
        .eq("itinerary_id", id)
        .not("storage_path", "is", null);
      return { ok: !error, rows: (data ?? []) as { storage_path: string | null }[] };
    },
    child: async () => {
      const { data, error } = await admin
        .from("trip_moment_photos")
        .select("storage_path")
        .eq("itinerary_id", id);
      return { ok: !error, rows: (data ?? []) as { storage_path: string | null }[] };
    },
  }, id);

  if (!collected.ok) {
    // 경로는 로그에도 남기지 않는다. 어느 쪽 조회가 실패했는지만 적는다.
    console.error("[itinerary DELETE] photo path collect failed:", collected.stage);
    return json({ error: "Failed to remove photos" }, 500);
  }
  const storagePaths = collected.paths;

  // 3단계: Storage-first 삭제 (Storage 실패 시 DB 미삭제)
  if (storagePaths.length > 0) {
    const storageErr = await removeItineraryStorage(admin.storage, storagePaths);
    if (storageErr) {
      console.error("[itinerary DELETE] storage remove failed:", storageErr, { count: storagePaths.length });
      return json({ error: "Failed to remove photos" }, 500);
    }
  }

  // 4단계: trip_moments 명시적 DELETE (FK/CASCADE 없는 경우 고아 행 방지)
  const { error: momDelErr } = await admin
    .from("trip_moments")
    .delete()
    .eq("itinerary_id", id);

  if (momDelErr) {
    // Storage는 이미 삭제됐으나 trip_moments DB 삭제 실패
    console.error("[itinerary DELETE] CRITICAL: storage deleted but moments db delete failed", {
      itineraryId: id,
      pathCount: storagePaths.length,
      code: momDelErr.code,
    });
    return json({ error: "Failed to delete moments" }, 500);
  }

  // 5단계: itinerary DB 삭제
  const { data, error } = await admin
    .from("itineraries")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    // Storage·trip_moments 삭제 완료 후 itinerary DB 삭제 실패
    console.error("[itinerary DELETE] CRITICAL: moments deleted but itinerary db delete failed", {
      itineraryId: id,
      code: error.code,
    });
    return json({ error: "Failed to delete itinerary" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

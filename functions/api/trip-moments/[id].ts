// Cloudflare Pages Function: DELETE · PATCH /api/trip-moments/:id
//
// DELETE — moment 소유자만 삭제
//          moment.device_id 일치 + 연결 itinerary 소유권 이중 확인
// PATCH  — moment 소유자만 memo 수정 (화이트리스트: memo 만 반영)
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id 확인
// - 연결 itinerary도 동일 device 소유인지 재확인
// - 비소유자·미존재 = 404 (정보 누출 방지)
// - PATCH 응답에 device_id·storage_path·photo_data 미포함
// - service_role 사용

import { createClient } from "@supabase/supabase-js";
import { UUID_RE, readBodyWithLimit } from "../../../src/lib/itinerary-validate";
import { removeItineraryStorage } from "../../../src/lib/photo-delete";
import { photoPathsToRemove, type ChildPhotoRow } from "../../../src/lib/trip-moments/photo-set";
import { buildResetPatch } from "../../../src/lib/trip-cover/cover-state-core";
import { patchMomentMemo, type MomentAdminLike } from "../../../src/lib/trip-moments/memo-patch-core";

const MAX_MOMENT_BODY_BYTES = 8 * 1024; // 8 KB — text only, no photo_data

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

export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.id as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1단계: moment 존재 + device_id 일치 확인 → itinerary_id, storage_path 취득
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, storage_path")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!moment) return json({ error: "Not found" }, 404);

  // 2단계: 연결 itinerary 소유권 재확인 (FK 부재 보완)
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found" }, 404);

  // 3단계: Storage-first 삭제 — 첫 장과 추가 사진(052)을 함께 치운다.
  //
  // 자식 행은 FK ON DELETE CASCADE 라 4단계에서 저절로 사라진다. 그래서 파일을
  // 먼저 지우지 않으면 아무도 가리키지 않는 파일이 Storage 에 남는다.
  const { data: extraRows } = await admin
    .from("trip_moment_photos")
    .select("photo_id, storage_path, sort_index, created_at")
    .eq("moment_id", momentId);

  const paths = photoPathsToRemove(moment.storage_path, (extraRows ?? []) as ChildPhotoRow[]);
  if (paths.length > 0) {
    const storageErr = await removeItineraryStorage(admin.storage, paths);
    if (storageErr) {
      console.error("[trip-moments/:id DELETE] storage remove failed:", storageErr);
      return json({ error: "Failed to remove photo" }, 500);
    }
  }

  // 4단계: DB 삭제
  const { error } = await admin
    .from("trip_moments")
    .delete()
    .eq("moment_id", momentId)
    .eq("device_id", deviceId);

  if (error) {
    console.error("[trip-moments/:id DELETE] db error:", error.code);
    return json({ error: "Failed to delete moment" }, 500);
  }

  // 5단계: 이 사진이 커버였다면 일정을 auto 로 되돌린다 (TASK-TRIP-COVER-V1B)
  //
  // FK 는 ON DELETE SET NULL 이므로 4단계에서 cover_moment_id 는 이미 NULL 이
  // 됐고, CHECK 도 moment 상태에서 NULL 을 허용하므로 삭제가 막히지 않는다.
  // 다만 cover_kind='moment' 가 남아 있으면 UI·프록시가 매번 무효 판정을
  // 거쳐야 하므로 여기서 정리한다.
  //
  // best-effort — 실패해도 사진 삭제 성공(200)을 되돌리지 않는다.
  // 프록시가 cover_moment_id=NULL 을 무효로 보고 관광 커버로 fallback 하므로
  // 정리에 실패해도 사용자에게 보이는 동작은 동일하다.
  const { error: cleanupErr } = await admin
    .from("itineraries")
    .update(buildResetPatch(new Date().toISOString()))
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .eq("cover_kind", "moment");

  if (cleanupErr) {
    console.error(
      "[trip-moments/:id DELETE] cover cleanup failed (photo already deleted)",
      JSON.stringify({ itinerary_id: moment.itinerary_id, code: cleanupErr.code }),
    );
  }

  return json({ ok: true });
}

// ── PATCH — 본인 memo 수정 ───────────────────────────────────────────────────
export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.id as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const read = await readBodyWithLimit(ctx.request, MAX_MOMENT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const result = await patchMomentMemo(
    momentId,
    deviceId,
    (read.body ?? {}) as Record<string, unknown>,
    admin as unknown as MomentAdminLike,
  );
  return json(result.body, result.status);
}

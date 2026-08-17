// Cloudflare Pages Function: DELETE /api/trip-moments/:momentId/photos/:photoId
//
// 사진 한 장만 지운다. Memory 와 메모, 나머지 사진은 그대로 둔다.
//
// `photoId` 는 둘 중 하나다
//   "legacy"  — `trip_moments.storage_path` 에 들어 있는 첫 장
//   <uuid>    — `trip_moment_photos` 의 한 행
//
// 첫 장을 지울 때
//   그냥 비우면 표지(`cover_moment_id` → `storage_path`)가 사라지고 목록 API 의
//   `has_photo` 도 false 가 된다 — 사진이 아직 두 장 남아 있어도 없는 것처럼
//   보인다. 그래서 다음 사진을 첫 장 자리로 올리고 그 자식 행은 지운다.
//   남은 사진이 없을 때만 첫 장 자리를 비운다.
//
// 지우는 순서
//   Storage 를 먼저 치우고 DB 를 정리한다. 반대로 하면 기록만 사라지고 파일이
//   남아 아무도 찾지 못하는 orphan 이 된다. 기존 moment 삭제와 같은 순서다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id 확인 후에만 진행
// - 지울 대상은 그 moment 에 속한 것만 — photo_id 로 조회할 때 moment_id 를 함께 건다
// - 요청에서 storage path 를 받지 않는다
// - 응답에 device_id·storage_path 원문을 담지 않는다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../../src/lib/itinerary-validate";
import { PHOTO_BUCKET } from "../../../../../src/lib/photo-validate";
import { removeMomentStorage } from "../../../../../src/lib/photo-delete";
import {
  planLegacyPhotoDelete, LEGACY_PHOTO_ID, type ChildPhotoRow,
} from "../../../../../src/lib/trip-moments/photo-set";

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
    headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.momentId as string;
  const photoId  = (ctx.params.photoId as string ?? "").trim();
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const isLegacy = photoId === LEGACY_PHOTO_ID;
  if (!isLegacy && !UUID_RE.test(photoId)) return json({ error: "Invalid photo ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 소유권 — 이 기기의 moment 가 아니면 여기서 끝난다
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, storage_path")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!moment) return json({ error: "Not found" }, 404);

  // ── 추가 사진 한 장 ──────────────────────────────────────────────────────
  if (!isLegacy) {
    // moment_id 를 함께 건다 — 남의 Memory 의 사진 id 를 넣어도 찾히지 않는다
    const { data: row } = await admin
      .from("trip_moment_photos")
      .select("photo_id, storage_path")
      .eq("photo_id", photoId)
      .eq("moment_id", momentId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (!row) return json({ error: "Not found" }, 404);

    const storageErr = await removeMomentStorage(admin.storage, (row as { storage_path: string }).storage_path);
    if (storageErr) {
      console.error("[moment photo DELETE] storage error");
      return json({ error: "Failed to delete photo" }, 500);
    }

    const { error } = await admin
      .from("trip_moment_photos")
      .delete()
      .eq("photo_id", photoId)
      .eq("moment_id", momentId);

    if (error) {
      console.error("[moment photo DELETE] db error:", error.code);
      return json({ error: "Failed to delete photo" }, 500);
    }
    return json({ deleted: true, promoted: false });
  }

  // ── 첫 장 ────────────────────────────────────────────────────────────────
  const { data: rows } = await admin
    .from("trip_moment_photos")
    .select("photo_id, storage_path, sort_index, created_at")
    .eq("moment_id", momentId);

  const plan = planLegacyPhotoDelete(
    (moment as { storage_path: string | null }).storage_path,
    (rows ?? []) as ChildPhotoRow[],
  );
  if (!plan) return json({ error: "Not found" }, 404);

  const storageErr = await removeMomentStorage(admin.storage, plan.removePath);
  if (storageErr) {
    console.error("[moment photo DELETE] legacy storage error");
    return json({ error: "Failed to delete photo" }, 500);
  }

  // 다음 사진을 첫 장 자리로 올린다 (없으면 비운다)
  const { error: updErr } = await admin
    .from("trip_moments")
    .update({ storage_path: plan.nextLegacy })
    .eq("moment_id", momentId)
    .eq("device_id", deviceId);

  if (updErr) {
    console.error("[moment photo DELETE] promote error:", updErr.code);
    return json({ error: "Failed to delete photo" }, 500);
  }

  // 올라간 행은 자식 목록에서 뺀다 — 두 자리에 같은 사진이 있으면 개수가
  // 하나 더 세어지고 화면에도 두 번 뜬다.
  if (plan.promotedId) {
    const { error: delErr } = await admin
      .from("trip_moment_photos")
      .delete()
      .eq("photo_id", plan.promotedId)
      .eq("moment_id", momentId);
    if (delErr) {
      // 파일은 살아 있고 첫 장에도 등록돼 있다. 화면은 중복을 걸러 내지만
      // 개수가 하나 더 세어지므로 남겨서 알린다.
      console.error("[moment photo DELETE] promoted row cleanup failed:", delErr.code);
    }
  }

  return json({ deleted: true, promoted: plan.promotedId !== null });
}

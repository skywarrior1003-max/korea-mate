// Cloudflare Pages Function: GET/POST/PUT/DELETE /api/user-spots/:id/photos
//
// 내 장소 사진 여러 장(최대 3장 · 088 user_spot_photos).
//
// GET    — 순서대로 사진 목록(소유자 전용 · 600초 만료 URL)
// POST   — 사진 한 장 덧붙이기. 대표 사진이 없으면 대표가 되고, 있으면 2·3번째가 된다.
// PUT    — 순서 바꾸기 { order: [key, key, …] } — 1번이 대표 사진
// DELETE — ?key=<key> 한 장 빼기. 대표를 빼면 다음 사진이 대표가 된다.
//
// SECURITY CONTRACT (photo.ts 와 같다):
// - 소유권은 resolveOwnership 하나로. 남의 장소와 없는 장소는 같은 404.
// - JPEG 전용 · 최대 1 MB · MIME + SOI + 구조 검증 · APP1(EXIF/GPS) 제거
// - object path 는 전부 서버가 만든다. 응답에는 storage path 를 담지 않는다 —
//   화면은 파일 이름의 UUID 조각(key)만 본다. key 로 경로를 다시 만들어 이 장소의
//   것인지 확인한 뒤에만 쓴다.
// - 대표 사진이 바뀌면 공개 동의(photo_public)는 내린다(088 함수가 처리).
//
// 한 장 전용 photo.ts 는 그대로 둔다 — 예전 화면·테스트가 그 길을 쓴다.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { stripJpegApp1 } from "../../../../src/lib/jpeg-strip-exif";
import { resolveOwnership, type OwnershipEnv } from "../../../_lib/ownership.ts";
import {
  MAX_PHOTO_BYTES,
  PHOTO_BUCKET,
  validateMimeType,
  validatePhotoSize,
  hasJpegSoi,
} from "../../../../src/lib/photo-validate";
import {
  USER_SPOT_PHOTO_DEVICE_LIMIT,
  makeUserSpotPhotoPath,
  isUserSpotPhotoQuotaExceeded,
  removeUserSpotPhoto,
} from "../../../../src/lib/user-spots/photo-core";
import { createMomentSignedUrl, PHOTO_URL_EXPIRES_IN } from "../../../../src/lib/photo-url";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string>;
}

/** 장소당 사진 수. 대표 1 + 088 자식 2. */
export const USER_SPOT_PHOTOS_PER_PLACE = 3;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type Admin = ReturnType<typeof adminClient>;

type SpotRow = {
  id: string;
  device_id: string;
  photo_storage_path: string | null;
  photo_public: boolean;
};

/** 저장 경로 → 화면용 key(파일 이름의 UUID). 이 장소의 경로 규칙이 아니면 null. */
function keyOf(spotId: string, path: string): string | null {
  const prefix = `user-spots/${spotId}/`;
  if (!path.startsWith(prefix) || !path.endsWith(".jpg")) return null;
  const k = path.slice(prefix.length, -4);
  return UUID_RE.test(k) ? k : null;
}

async function loadOwned(ctx: PagesCtx): Promise<{ admin: Admin; spot: SpotRow; deviceScope: string[] } | Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceScope = own.devices;

  let admin: Admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, device_id, photo_storage_path, photo_public")
    .eq("id", id)
    .in("device_id", deviceScope)
    .maybeSingle();
  if (error) {
    console.error("[user-spots/:id/photos] db read error:", error.code);
    return json({ error: "Server error" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);
  return { admin, spot: data as SpotRow, deviceScope };
}

/** 순서대로의 저장 경로 — 1번이 대표. */
async function orderedPaths(admin: Admin, spot: SpotRow): Promise<string[] | null> {
  const { data, error } = await admin
    .from("user_spot_photos")
    .select("storage_path, sort_index")
    .eq("spot_id", spot.id)
    .order("sort_index", { ascending: true });
  if (error) {
    console.error("[user-spots/:id/photos] children read error:", error.code);
    return null;
  }
  const kids = (data ?? []).map(r => (r as { storage_path: string }).storage_path);
  return spot.photo_storage_path ? [spot.photo_storage_path, ...kids] : kids;
}

async function listBody(admin: Admin, spot: SpotRow, paths: string[]) {
  const photos: Array<{ key: string; main: boolean; url: string | null; expiresAt: string | null }> = [];
  for (let i = 0; i < paths.length; i++) {
    const key = keyOf(spot.id, paths[i]);
    if (!key) continue;
    const r = await createMomentSignedUrl(admin.storage, paths[i], PHOTO_URL_EXPIRES_IN);
    photos.push({
      key, main: i === 0 && paths[i] === spot.photo_storage_path,
      url: typeof r === "string" ? null : r.signedUrl,
      expiresAt: typeof r === "string" ? null : r.expiresAt,
    });
  }
  return { photos, count: photos.length, limit: USER_SPOT_PHOTOS_PER_PLACE, photo_public: spot.photo_public === true };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const owned = await loadOwned(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot } = owned;
  const paths = await orderedPaths(admin, spot);
  if (!paths) return json({ error: "Server error" }, 500);
  return json(await listBody(admin, spot, paths));
}

// ── POST — 한 장 덧붙이기 ─────────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const cl = ctx.request.headers.get("content-length");
  if (cl) {
    const n = parseInt(cl, 10);
    if (!isNaN(n) && n > MAX_PHOTO_BYTES + 256 * 1024) return json({ error: "Request too large", code: "TOO_LARGE" }, 413);
  }

  const owned = await loadOwned(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot, deviceScope } = owned;

  const paths = await orderedPaths(admin, spot);
  if (!paths) return json({ error: "Server error" }, 500);
  if (paths.length >= USER_SPOT_PHOTOS_PER_PLACE) {
    return json({ error: `Up to ${USER_SPOT_PHOTOS_PER_PLACE} photos per place`, code: "PLACE_PHOTO_LIMIT" }, 409);
  }

  let formData: FormData;
  try { formData = await ctx.request.formData(); }
  catch { return json({ error: "Invalid multipart form data" }, 400); }
  const photoField = formData.get("photo");
  if (!(photoField instanceof File)) return json({ error: "Missing or invalid 'photo' field" }, 400);

  const mimeResult = validateMimeType(photoField.type);
  if (!mimeResult.ok) return json({ error: mimeResult.error, code: "BAD_TYPE" }, mimeResult.status);

  let fileBytes: Uint8Array;
  try { fileBytes = new Uint8Array(await photoField.arrayBuffer()); }
  catch { return json({ error: "Failed to read file" }, 400); }
  const sizeResult = validatePhotoSize(fileBytes.length);
  if (!sizeResult.ok) return json({ error: sizeResult.error, code: "TOO_LARGE" }, sizeResult.status);
  if (!hasJpegSoi(fileBytes)) return json({ error: "Not a valid JPEG", code: "BAD_TYPE" }, 400);

  let stripped: Uint8Array;
  try { stripped = stripJpegApp1(fileBytes); }
  catch { return json({ error: "Invalid JPEG structure", code: "BAD_TYPE" }, 400); }

  // 기기 한도 — 대표 사진과 2·3번째 사진을 함께 센다.
  const [{ count: mains, error: e1 }, { count: kids, error: e2 }] = await Promise.all([
    admin.from("user_spots").select("id", { count: "exact", head: true })
      .in("device_id", deviceScope).not("photo_storage_path", "is", null),
    admin.from("user_spot_photos").select("photo_id", { count: "exact", head: true })
      .in("device_id", deviceScope),
  ]);
  if (e1 || e2) {
    console.error("[user-spots/:id/photos POST] count error:", e1?.code ?? e2?.code);
    return json({ error: "Server error" }, 500);
  }
  if (isUserSpotPhotoQuotaExceeded(false, (mains ?? 0) + (kids ?? 0))) {
    return json({ error: `Photo limit reached (${USER_SPOT_PHOTO_DEVICE_LIMIT})`, code: "DEVICE_PHOTO_LIMIT" }, 400);
  }

  const storagePath = makeUserSpotPhotoPath(spot.id, crypto.randomUUID());
  const { error: upErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, stripped, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    console.error("[user-spots/:id/photos POST] storage upload error:", upErr.message);
    return json({ error: "Upload failed", code: "UPLOAD_FAILED" }, 500);
  }

  // 대표 사진이 비어 있으면 대표 자리에, 아니면 다음 자리에.
  let dbErr: string | null = null;
  if (!spot.photo_storage_path) {
    const { data: up, error } = await admin
      .from("user_spots")
      .update({ photo_storage_path: storagePath, photo_public: false, updated_at: new Date().toISOString() })
      .eq("id", spot.id)
      .is("photo_storage_path", null)
      .select("id");
    if (error || !up || up.length === 0) dbErr = error?.code ?? "no row";
  } else {
    const { error } = await admin.from("user_spot_photos").insert({
      spot_id: spot.id, device_id: spot.device_id, storage_path: storagePath, sort_index: paths.length,
    });
    if (error) dbErr = error.message?.includes("user_spot_photo_limit") ? "limit" : (error.code ?? "insert");
  }
  if (dbErr) {
    // 참조 없는 파일을 남기지 않는다.
    const rb = await removeUserSpotPhoto(admin.storage, storagePath);
    if (rb) console.error("[user-spots/:id/photos POST] rollback failed", JSON.stringify({ orphaned_path: storagePath, error: rb }));
    if (dbErr === "limit") return json({ error: `Up to ${USER_SPOT_PHOTOS_PER_PLACE} photos per place`, code: "PLACE_PHOTO_LIMIT" }, 409);
    console.error("[user-spots/:id/photos POST] db error:", dbErr);
    return json({ error: "Failed to save photo", code: "SAVE_FAILED" }, 500);
  }

  const fresh = await loadOwned(ctx);
  if (fresh instanceof Response) return json({ ok: true }, 201);
  const after = await orderedPaths(fresh.admin, fresh.spot);
  return json({ ok: true, key: keyOf(spot.id, storagePath), ...(after ? await listBody(fresh.admin, fresh.spot, after) : {}) }, 201);
}

// ── PUT — 순서 바꾸기 ─────────────────────────────────────────────────────────
export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const owned = await loadOwned(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot } = owned;

  let body: { order?: unknown };
  try { body = await ctx.request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }
  const order = body.order;
  if (!Array.isArray(order) || order.length === 0 || order.length > USER_SPOT_PHOTOS_PER_PLACE
      || !order.every(k => typeof k === "string" && UUID_RE.test(k))) {
    return json({ error: "order must be the photo keys" }, 400);
  }
  const paths = (order as string[]).map(k => makeUserSpotPhotoPath(spot.id, k));
  const { data, error } = await admin.rpc("user_spot_photos_set_order", { p_spot: spot.id, p_paths: paths });
  if (error) {
    console.error("[user-spots/:id/photos PUT] rpc error:", error.code);
    return json({ error: "Server error" }, 500);
  }
  if (data !== true) return json({ error: "The photo list changed. Reload and try again.", code: "ORDER_MISMATCH" }, 409);

  const fresh = await loadOwned(ctx);
  if (fresh instanceof Response) return json({ ok: true });
  const after = await orderedPaths(fresh.admin, fresh.spot);
  return json({ ok: true, ...(after ? await listBody(fresh.admin, fresh.spot, after) : {}) });
}

// ── DELETE — 한 장 빼기 ───────────────────────────────────────────────────────
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const owned = await loadOwned(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot } = owned;

  const key = new URL(ctx.request.url).searchParams.get("key") ?? "";
  if (!UUID_RE.test(key)) return json({ error: "Invalid key" }, 400);
  const path = makeUserSpotPhotoPath(spot.id, key);

  const { data, error } = await admin.rpc("user_spot_photos_remove", { p_spot: spot.id, p_path: path });
  if (error) {
    console.error("[user-spots/:id/photos DELETE] rpc error:", error.code);
    return json({ error: "Failed to delete photo" }, 500);
  }
  if (data === "ONLY_ANCHOR") {
    return json({
      error: "This photo is the only information about this place. Add a location first, or delete the place itself.",
      code:  "PHOTO_IS_ONLY_ANCHOR",
    }, 409);
  }
  // 없는 사진을 빼는 요청은 오류가 아니다 — 재시도·중복 클릭이 같은 결과를 낸다.
  if (data === path) {
    const rmErr = await removeUserSpotPhoto(admin.storage, path);
    // 기록은 이미 빠졌다. 파일만 남았으면 회수할 경로를 로그로 남긴다(사용자 화면은 정상).
    if (rmErr) console.error("[user-spots/:id/photos DELETE] storage remove failed", JSON.stringify({ orphaned_path: path, error: rmErr }));
  }

  const fresh = await loadOwned(ctx);
  if (fresh instanceof Response) return json({ ok: true });
  const after = await orderedPaths(fresh.admin, fresh.spot);
  return json({ ok: true, ...(after ? await listBody(fresh.admin, fresh.spot, after) : {}) });
}

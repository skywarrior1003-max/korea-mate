// Cloudflare Pages Function: /api/trip-moments/:momentId/photos
//
//   GET  — 이 Memory 의 사진 목록 (서명 URL)
//   POST — 사진 한 장 추가
//
// 왜 기존 `photo.ts` 를 두고 새로 두나
//   `POST .../photo` 는 "한 장을 넣거나 갈아 끼운다" 는 뜻이고 그 계약을 쓰는
//   곳이 이미 있다. 여기는 "이미 있는 것 뒤에 한 장 더" 다. 뜻이 다르니 자리도
//   나눈다 — 기존 호출자는 아무것도 바뀌지 않는다.
//
//   첫 장은 여전히 `trip_moments.storage_path` 다. 표지(`cover_moment_id`)와
//   목록 API 의 `has_photo` 가 그 값을 보기 때문에, 비워 두면 사진이 있는데도
//   없는 것처럼 보인다. 그래서 첫 장이 비어 있으면 이 경로도 거기에 채운다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id + itinerary 소유권 이중 확인 (photo.ts 와 동일)
// - Storage 경로는 서버가 makeStoragePath 로 만든다 — 요청에서 받지 않는다
// - JPEG 전용·1MB·MIME·SOI·APP1 제거 전부 기존 파이프라인 그대로
// - 한도는 실제 사진 개수(첫 장 + 추가 사진)로 센다
// - 응답에 device_id·storage_path 원문을 담지 않는다 (서명 URL 과 photo_id 만)
// - service_role key·내부 오류 문구를 응답에 담지 않는다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { stripJpegApp1 } from "../../../../src/lib/jpeg-strip-exif";
import {
  MAX_PHOTO_BYTES,
  DEVICE_PHOTO_LIMIT,
  ITINERARY_PHOTO_LIMIT,
  PHOTO_BUCKET,
  validateMimeType,
  validatePhotoSize,
  hasJpegSoi,
  makeStoragePath,
} from "../../../../src/lib/photo-validate";
import {
  mergePhotoSet, nextSortIndex, totalPhotoCount, withinPhotoLimit,
  type ChildPhotoRow,
} from "../../../../src/lib/trip-moments/photo-set";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

type Admin = ReturnType<typeof adminClient>;

/** moment 와 그 itinerary 가 이 기기 것인지 확인한다. photo.ts 와 같은 두 단계. */
async function ownedMoment(admin: Admin, momentId: string, deviceId: string) {
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, storage_path")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!moment) return null;

  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!itinerary) return null;

  return moment as { moment_id: string; itinerary_id: string; storage_path: string | null };
}

async function childRows(admin: Admin, momentId: string): Promise<ChildPhotoRow[]> {
  const { data } = await admin
    .from("trip_moment_photos")
    .select("photo_id, storage_path, sort_index, created_at")
    .eq("moment_id", momentId);
  return (data ?? []) as ChildPhotoRow[];
}

// ── GET — 사진 목록 ──────────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.momentId as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin: Admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const moment = await ownedMoment(admin, momentId, deviceId);
  if (!moment) return json({ error: "Not found" }, 404);

  const set = mergePhotoSet(moment.storage_path, await childRows(admin, momentId));
  if (set.length === 0) return json({ photos: [] });

  // 한 번에 서명한다 — 사진 수만큼 왕복하지 않기 위해서다
  const { data: signed, error } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(set.map(s => s.path), SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("[moment photos GET] sign error:", error.message);
    return json({ error: "Failed to load photos" }, 500);
  }

  const byPath = new Map<string, string>();
  for (const row of signed ?? []) {
    // supabase 는 요청한 경로를 그대로 돌려준다. 못 만든 것은 건너뛴다.
    if (row?.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
  // storage_path 원문은 내보내지 않는다 — 지울 때 쓰는 것은 photo_id 다
  const photos = set
    .map(s => ({ id: s.id, isFirst: s.isLegacy, url: byPath.get(s.path) ?? null }))
    .filter(p => p.url !== null);

  return json({ photos, expiresAt });
}

// ── POST — 사진 한 장 추가 ───────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.momentId as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl) {
    const clNum = parseInt(cl, 10);
    if (!isNaN(clNum) && clNum > MAX_PHOTO_BYTES + 256 * 1024) {
      return json({ error: "Request too large" }, 413);
    }
  }

  let formData: FormData;
  try { formData = await ctx.request.formData(); }
  catch { return json({ error: "Invalid multipart form data" }, 400); }

  const photoField = formData.get("photo");
  if (!(photoField instanceof File)) {
    return json({ error: "Missing or invalid 'photo' field" }, 400);
  }

  const mimeResult = validateMimeType(photoField.type);
  if (!mimeResult.ok) return json({ error: mimeResult.error }, mimeResult.status);

  let fileBytes: Uint8Array;
  try { fileBytes = new Uint8Array(await photoField.arrayBuffer()); }
  catch { return json({ error: "Failed to read file" }, 400); }

  const sizeResult = validatePhotoSize(fileBytes.length);
  if (!sizeResult.ok) return json({ error: sizeResult.error }, sizeResult.status);

  if (!hasJpegSoi(fileBytes)) return json({ error: "Not a valid JPEG" }, 400);

  let stripped: Uint8Array;
  try { stripped = stripJpegApp1(fileBytes); }
  catch { return json({ error: "Invalid JPEG structure" }, 400); }

  let admin: Admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const moment = await ownedMoment(admin, momentId, deviceId);
  if (!moment) return json({ error: "Not found" }, 404);

  // ── 한도 — 실제 사진 개수로 센다 ─────────────────────────────────────────
  // 예전에는 `storage_path` 가 있는 moment 행 수만 셌다. 사진이 moment 당 한
  // 장이던 시절에는 그게 곧 사진 수였지만 지금은 아니다 — 그대로 두면 한
  // Memory 에 스무 장을 넣어도 카운터가 1 이다.
  const [devLegacy, devChild, itinLegacy, itinChild] = await Promise.all([
    admin.from("trip_moments").select("moment_id", { count: "exact", head: true })
      .eq("device_id", deviceId).not("storage_path", "is", null),
    admin.from("trip_moment_photos").select("photo_id", { count: "exact", head: true })
      .eq("device_id", deviceId),
    admin.from("trip_moments").select("moment_id", { count: "exact", head: true })
      .eq("itinerary_id", moment.itinerary_id).not("storage_path", "is", null),
    admin.from("trip_moment_photos").select("photo_id", { count: "exact", head: true })
      .eq("itinerary_id", moment.itinerary_id),
  ]);

  const deviceTotal = totalPhotoCount(devLegacy.count ?? 0, devChild.count ?? 0);
  if (!withinPhotoLimit(deviceTotal, DEVICE_PHOTO_LIMIT)) {
    return json({ error: `Device photo limit reached (${DEVICE_PHOTO_LIMIT})`, code: "DEVICE_LIMIT" }, 400);
  }
  const itinTotal = totalPhotoCount(itinLegacy.count ?? 0, itinChild.count ?? 0);
  if (!withinPhotoLimit(itinTotal, ITINERARY_PHOTO_LIMIT)) {
    return json({ error: `Itinerary photo limit reached (${ITINERARY_PHOTO_LIMIT})`, code: "ITINERARY_LIMIT" }, 400);
  }

  // ── Storage ──────────────────────────────────────────────────────────────
  const versionUuid = crypto.randomUUID();
  const storagePath = makeStoragePath(moment.itinerary_id, momentId, versionUuid);

  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, stripped, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("[moment photos POST] upload error:", uploadError.message);
    return json({ error: "Failed to store photo" }, 500);
  }

  // ── DB ───────────────────────────────────────────────────────────────────
  // 첫 장이 비어 있으면 거기에 넣는다. 표지와 has_photo 가 그 값을 보기 때문에
  // 첫 장을 건너뛰고 자식 행부터 만들면 사진이 있는데도 없는 것처럼 보인다.
  if (moment.storage_path === null) {
    const { error } = await admin
      .from("trip_moments")
      .update({ storage_path: storagePath })
      .eq("moment_id", momentId)
      .eq("device_id", deviceId);

    if (error) {
      // 기록하지 못한 파일은 즉시 되돌린다 — 남기면 아무도 모르는 orphan 이다
      const { error: rb } = await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
      if (rb) console.error("[moment photos POST] rollback failed:", JSON.stringify({ orphaned_path: storagePath }));
      console.error("[moment photos POST] first-slot update error:", error.code);
      return json({ error: "Failed to save photo" }, 500);
    }
    return json({ id: "legacy", isFirst: true }, 201);
  }

  const rows = await childRows(admin, momentId);
  const { data: inserted, error: insertError } = await admin
    .from("trip_moment_photos")
    .insert({
      moment_id:    momentId,
      itinerary_id: moment.itinerary_id,
      device_id:    deviceId,
      storage_path: storagePath,
      sort_index:   nextSortIndex(rows),
    })
    .select("photo_id")
    .maybeSingle();

  if (insertError || !inserted) {
    const { error: rb } = await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
    if (rb) console.error("[moment photos POST] rollback failed:", JSON.stringify({ orphaned_path: storagePath }));
    console.error("[moment photos POST] insert error:", insertError?.code);
    return json({ error: "Failed to save photo" }, 500);
  }

  return json({ id: (inserted as { photo_id: string }).photo_id, isFirst: false }, 201);
}

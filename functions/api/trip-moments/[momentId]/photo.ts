// Cloudflare Pages Function: POST /api/trip-moments/:momentId/photo
//
// 사진 업로드 → APP1 제거 → Storage 저장 → DB storage_path 갱신.
// DB 갱신 실패 시 새 파일 즉시 롤백 삭제.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id 확인
// - 연결 itinerary 소유권 이중 확인
// - multipart/form-data의 "photo" 필드, JPEG 전용, 최대 1 MB
// - MIME + SOI bytes + 전체 구조 검증 (stripJpegApp1 via 구조 파싱)
// - 신규 사진: device >= 100 또는 itinerary >= 30 거부
// - 교체: COUNT 제한 제외
// - photo_data / base64 수신·저장 금지
// - service_role key, 내부 오류, device_id 응답 노출 금지

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

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  // ── 1. 파라미터 검증 ─────────────────────────────────────────────────────────
  const momentId = ctx.params.momentId as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  // Content-Length 조기 거부 (multipart 오버헤드 ~4KB 허용)
  const cl = ctx.request.headers.get("content-length");
  if (cl) {
    const clNum = parseInt(cl, 10);
    if (!isNaN(clNum) && clNum > MAX_PHOTO_BYTES + 4 * 1024) {
      return json({ error: "Request too large" }, 413);
    }
  }

  // ── 2. multipart 파싱 ────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await ctx.request.formData();
  } catch {
    return json({ error: "Invalid multipart form data" }, 400);
  }

  const photoField = formData.get("photo");
  if (!(photoField instanceof File)) {
    return json({ error: "Missing or invalid 'photo' field" }, 400);
  }

  // ── 3. MIME 검증 ─────────────────────────────────────────────────────────────
  const mimeResult = validateMimeType(photoField.type);
  if (!mimeResult.ok) return json({ error: mimeResult.error }, mimeResult.status);

  // ── 4. 파일 읽기 + 크기 검증 ────────────────────────────────────────────────
  let fileBytes: Uint8Array;
  try {
    fileBytes = new Uint8Array(await photoField.arrayBuffer());
  } catch {
    return json({ error: "Failed to read file" }, 400);
  }

  const sizeResult = validatePhotoSize(fileBytes.length);
  if (!sizeResult.ok) return json({ error: sizeResult.error }, sizeResult.status);

  // ── 5. JPEG SOI 빠른 검증 ───────────────────────────────────────────────────
  if (!hasJpegSoi(fileBytes)) {
    return json({ error: "Not a valid JPEG" }, 400);
  }

  // ── 6. APP1 제거 + 전체 구조 검증 ───────────────────────────────────────────
  let stripped: Uint8Array;
  try {
    stripped = stripJpegApp1(fileBytes);
  } catch {
    return json({ error: "Invalid JPEG structure" }, 400);
  }

  // ── 7. admin client ──────────────────────────────────────────────────────────
  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 8. moment 소유권 확인 (device_id 일치) ───────────────────────────────────
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id, storage_path")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!moment) return json({ error: "Not found" }, 404);

  // ── 9. itinerary 소유권 이중 확인 (FK 부재 보완) ────────────────────────────
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found" }, 404);

  const isReplacement = moment.storage_path !== null;

  // ── 10. 신규 사진 수량 제한 (교체는 제외) ───────────────────────────────────
  if (!isReplacement) {
    const { count: deviceCount } = await admin
      .from("trip_moments")
      .select("moment_id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .not("storage_path", "is", null);

    if ((deviceCount ?? 0) >= DEVICE_PHOTO_LIMIT) {
      return json({ error: `Device photo limit reached (${DEVICE_PHOTO_LIMIT})` }, 400);
    }

    const { count: itinCount } = await admin
      .from("trip_moments")
      .select("moment_id", { count: "exact", head: true })
      .eq("itinerary_id", moment.itinerary_id)
      .not("storage_path", "is", null);

    if ((itinCount ?? 0) >= ITINERARY_PHOTO_LIMIT) {
      return json({ error: `Itinerary photo limit reached (${ITINERARY_PHOTO_LIMIT})` }, 400);
    }
  }

  // ── 11. Storage 업로드 ───────────────────────────────────────────────────────
  const versionUuid = crypto.randomUUID();
  const storagePath = makeStoragePath(moment.itinerary_id, momentId, versionUuid);

  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, stripped, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("[photo POST] storage upload error:", uploadError.message);
    return json({ error: "Upload failed" }, 500);
  }

  // ── 12. DB storage_path 갱신 ─────────────────────────────────────────────────
  const { error: dbError } = await admin
    .from("trip_moments")
    .update({ storage_path: storagePath })
    .eq("moment_id", momentId)
    .eq("device_id", deviceId);

  if (dbError) {
    // 롤백: 방금 올린 파일 삭제
    console.error("[photo POST] db update error, rolling back:", dbError.code);
    const { error: rollbackErr } = await admin.storage
      .from(PHOTO_BUCKET)
      .remove([storagePath]);
    if (rollbackErr) {
      console.error(
        "[photo POST] rollback delete failed",
        JSON.stringify({ orphaned_path: storagePath, error: rollbackErr.message }),
      );
    }
    return json({ error: "Failed to save photo reference" }, 500);
  }

  // ── 13. 교체 성공 후 이전 파일 삭제 (실패 = 성공 응답 유지 + 구조화 로그) ──
  if (isReplacement && typeof moment.storage_path === "string") {
    const { error: oldDelErr } = await admin.storage
      .from(PHOTO_BUCKET)
      .remove([moment.storage_path]);
    if (oldDelErr) {
      console.error(
        "[photo POST] old file delete failed",
        JSON.stringify({ orphaned_path: moment.storage_path, error: oldDelErr.message }),
      );
    }
  }

  return json({ ok: true });
}

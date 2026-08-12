// Cloudflare Pages Function: POST/DELETE /api/user-spots/:id/photo
//
// POST   — My Place 사진 업로드·교체
// DELETE — 사진 자체 삭제 (공개 동의만 끄는 것과 다르다)
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - user_spots.device_id = x-device-id 확인, 아니면 404 (존재 여부 비노출)
// - multipart/form-data 의 "photo" 필드, JPEG 전용, 최대 1 MB
// - MIME + SOI bytes + 구조 파싱 검증, APP1(EXIF/GPS) 제거
// - object path 는 전부 서버 생성 — 클라이언트가 경로를 정하지 못한다
// - photo_storage_path 는 어떤 응답에도 담지 않는다
// - service_role key·내부 오류·device_id 응답 노출 금지
//
// Moment 쪽 photo endpoint 는 건드리지 않는다. 검증 인프라만 공유한다.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { stripJpegApp1 } from "../../../../src/lib/jpeg-strip-exif";
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

type SpotPhotoRow = { id: string; photo_storage_path: string | null; photo_public: boolean };

/** id·device 검증 후 소유한 행의 사진 상태를 읽는다. 실패하면 Response 를 준다. */
async function loadOwnedSpot(
  ctx: PagesCtx,
): Promise<{ admin: ReturnType<typeof adminClient>; spot: SpotPhotoRow; deviceId: string } | Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, photo_storage_path, photo_public")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[user-spots/:id/photo] db read error:", error.code);
    return json({ error: "Server error" }, 500);
  }
  // 남의 행과 없는 행을 같은 응답으로 돌려준다 — 존재 여부가 새면 안 된다.
  if (!data) return json({ error: "Not found" }, 404);

  return { admin, spot: data as SpotPhotoRow, deviceId };
}

// ── POST — 업로드 / 교체 ──────────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  // ── 1. Content-Length 조기 거부 (multipart 오버헤드 256KB 허용) ─────────────
  const cl = ctx.request.headers.get("content-length");
  if (cl) {
    const clNum = parseInt(cl, 10);
    if (!isNaN(clNum) && clNum > MAX_PHOTO_BYTES + 256 * 1024) {
      return json({ error: "Request too large" }, 413);
    }
  }

  // ── 2. 소유권 ───────────────────────────────────────────────────────────────
  const owned = await loadOwnedSpot(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot, deviceId } = owned;

  // ── 3. multipart 파싱 ───────────────────────────────────────────────────────
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

  // ── 4. MIME ─────────────────────────────────────────────────────────────────
  const mimeResult = validateMimeType(photoField.type);
  if (!mimeResult.ok) return json({ error: mimeResult.error }, mimeResult.status);

  // ── 5. 실제 바이트 읽기 + 크기 재검증 ───────────────────────────────────────
  // 선언된 Content-Length 를 믿지 않는다.
  let fileBytes: Uint8Array;
  try {
    fileBytes = new Uint8Array(await photoField.arrayBuffer());
  } catch {
    return json({ error: "Failed to read file" }, 400);
  }

  const sizeResult = validatePhotoSize(fileBytes.length);
  if (!sizeResult.ok) return json({ error: sizeResult.error }, sizeResult.status);

  // ── 6. JPEG SOI 빠른 검증 ───────────────────────────────────────────────────
  if (!hasJpegSoi(fileBytes)) {
    return json({ error: "Not a valid JPEG" }, 400);
  }

  // ── 7. APP1(EXIF/GPS) 제거 + 구조 검증 ──────────────────────────────────────
  // 클라이언트가 압축했든 안 했든 서버가 다시 확인한다.
  let stripped: Uint8Array;
  try {
    stripped = stripJpegApp1(fileBytes);
  } catch {
    return json({ error: "Invalid JPEG structure" }, 400);
  }

  const isReplacement = typeof spot.photo_storage_path === "string" && spot.photo_storage_path.length > 0;

  // ── 8. 수량 한도 (교체는 제외) ──────────────────────────────────────────────
  // best-effort: COUNT → upload 사이 창에서 동시 요청이면 잠깐 넘길 수 있다.
  if (!isReplacement) {
    const { count, error: countErr } = await admin
      .from("user_spots")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .not("photo_storage_path", "is", null);

    if (countErr) {
      console.error("[user-spots/:id/photo POST] count error:", countErr.code);
      return json({ error: "Server error" }, 500);
    }
    if (isUserSpotPhotoQuotaExceeded(false, count ?? 0)) {
      return json({ error: `Photo limit reached (${USER_SPOT_PHOTO_DEVICE_LIMIT})` }, 400);
    }
  }

  // ── 9. Storage 업로드 ───────────────────────────────────────────────────────
  const storagePath = makeUserSpotPhotoPath(spot.id, crypto.randomUUID());

  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, stripped, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("[user-spots/:id/photo POST] storage upload error:", uploadError.message);
    return json({ error: "Upload failed" }, 500);
  }

  // ── 10. DB 갱신 — 새 사진이면 공개 동의는 반드시 처음부터 다시 ──────────────
  // 이전 사진을 공개해도 된다고 했다고 해서, 방금 올린 다른 사진까지 공개해도
  // 된다고 말한 적은 없다. 교체는 동의를 물려받지 않는다.
  const { data: updated, error: dbError } = await admin
    .from("user_spots")
    .update({
      photo_storage_path: storagePath,
      photo_public:       false,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", spot.id)
    .eq("device_id", deviceId)
    .select("id");

  if (dbError || !updated || updated.length === 0) {
    // 참조가 남지 않는 파일을 만들지 않는다. 방금 올린 것만 되돌린다.
    console.error("[user-spots/:id/photo POST] db update failed, rolling back:", dbError?.code ?? "no row");
    const { error: rollbackErr } = await admin.storage.from(PHOTO_BUCKET).remove([storagePath]);
    if (rollbackErr) {
      console.error(
        "[user-spots/:id/photo POST] rollback delete failed",
        JSON.stringify({ orphaned_path: storagePath, error: rollbackErr.message }),
      );
    }
    return json({ error: "Failed to save photo" }, 500);
  }

  // ── 11. 교체 성공 후 이전 파일 정리 ─────────────────────────────────────────
  // 여기서 실패해도 사용자의 새 사진은 이미 정상이다. 되돌리면 오히려
  // 성공한 작업을 깬다. 회수할 경로를 로그로 남긴다.
  if (isReplacement && spot.photo_storage_path && spot.photo_storage_path !== storagePath) {
    const oldErr = await removeUserSpotPhoto(admin.storage, spot.photo_storage_path);
    if (oldErr) {
      console.error(
        "[user-spots/:id/photo POST] old file delete failed",
        JSON.stringify({ orphaned_path: spot.photo_storage_path, error: oldErr }),
      );
    }
  }

  return json({ ok: true, has_photo: true, photo_public: false }, 201);
}

// ── DELETE — 사진 삭제 ────────────────────────────────────────────────────────
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const owned = await loadOwnedSpot(ctx);
  if (owned instanceof Response) return owned;
  const { admin, spot, deviceId } = owned;

  // 사진이 없으면 할 일이 없다. 없는 것을 지우는 요청은 오류가 아니다 —
  // 재시도와 중복 클릭이 같은 결과를 내야 한다.
  if (!spot.photo_storage_path) {
    return json({ ok: true, has_photo: false, photo_public: false });
  }

  // ── STEP A — 공개 동의부터 끈다 ─────────────────────────────────────────────
  // 뒤 단계가 실패해도 사진이 공개 후보로 남아 있으면 안 된다. 순서가 반대면
  // Storage 삭제 실패 시 "지우려던 사진이 여전히 공개 대상" 인 상태가 된다.
  if (spot.photo_public) {
    const { error: consentErr } = await admin
      .from("user_spots")
      .update({ photo_public: false, updated_at: new Date().toISOString() })
      .eq("id", spot.id)
      .eq("device_id", deviceId);

    if (consentErr) {
      console.error("[user-spots/:id/photo DELETE] consent off failed:", consentErr.code);
      return json({ error: "Failed to delete photo" }, 500);
    }
  }

  // ── STEP B — Storage object 제거 ────────────────────────────────────────────
  const storageErr = await removeUserSpotPhoto(admin.storage, spot.photo_storage_path);
  if (storageErr) {
    // 동의는 꺼진 채, 경로는 남는다. 다시 눌러 이어갈 수 있는 상태다.
    console.error("[user-spots/:id/photo DELETE] storage remove failed:", storageErr);
    return json({ error: "Failed to delete photo" }, 500);
  }

  // ── STEP C — 경로 비우기 ────────────────────────────────────────────────────
  const { error: clearErr } = await admin
    .from("user_spots")
    .update({ photo_storage_path: null, photo_public: false, updated_at: new Date().toISOString() })
    .eq("id", spot.id)
    .eq("device_id", deviceId);

  if (clearErr) {
    // 파일은 없는데 경로만 남은 좁은 구간이다. 성공으로 덮지 않는다.
    // 다시 삭제를 호출하면 STEP B 가 "이미 없음" 을 실패로 보지 않으므로
    // 이 지점을 통과해 경로가 정리된다.
    console.error(
      "[user-spots/:id/photo DELETE] path clear failed after storage removal",
      JSON.stringify({ user_spot_id: spot.id, error: clearErr.code }),
    );
    return json({ error: "Photo removed but record update failed. Please retry." }, 500);
  }

  return json({ ok: true, has_photo: false, photo_public: false });
}

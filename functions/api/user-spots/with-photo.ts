// Cloudflare Pages Function: POST /api/user-spots/with-photo
//
// 사진 하나만으로도 My Place 를 만든다.
//
// 기존 photo API 는 `/api/user-spots/{id}/photo` 라 id 가 먼저 있어야 하는데,
// 사진이 유일한 근거인 장소는 그 id 를 만들 방법이 없었다. 순환을 끊으려고
// 서버가 id 를 먼저 만들고, 사진을 올린 뒤, 그 경로를 담아 행을 넣는다.
//
// 빈 행을 먼저 만들어 두는 방식은 쓰지 않는다. 업로드가 실패하면 사용자가
// 만들려던 적 없는 이름도 위치도 사진도 없는 카드가 목록에 남는다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - id·object 경로·파일명 전부 서버 생성 — 클라이언트가 정하지 못한다
// - multipart 의 "photo" 필드, JPEG 전용, 최대 1 MB
// - MIME + SOI bytes + 구조 파싱 검증, APP1(EXIF/GPS) 제거
// - device 사진 100장 한도 (기존 계약과 동일)
// - photo_public 은 항상 false 로 시작 — 만들자마자 공개 동의가 붙지 않는다
// - photo_storage_path 는 어떤 응답에도 담지 않는다
//
// 이 경로는 static 이라 같은 레벨의 `[id].ts` 보다 우선한다
// (functions/api/itinerary/copy.ts 와 [id].ts 가 같은 형태로 운영 중이다).

import { createClient } from "@supabase/supabase-js";
import { UUID_RE, str, optStr } from "../../../src/lib/itinerary-validate";
import { stripJpegApp1 } from "../../../src/lib/jpeg-strip-exif";
import {
  MAX_PHOTO_BYTES,
  PHOTO_BUCKET,
  validateMimeType,
  validatePhotoSize,
  hasJpegSoi,
} from "../../../src/lib/photo-validate";
import {
  USER_SPOT_PHOTO_DEVICE_LIMIT,
  makeUserSpotPhotoPath,
  isUserSpotPhotoQuotaExceeded,
  removeUserSpotPhoto,
} from "../../../src/lib/user-spots/photo-core";

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

const VALID_CATEGORIES = ["attraction", "nature", "restaurant", "event", "accommodation"] as const;

/** multipart 값은 전부 문자열로 온다. 좌표만 숫자로 되돌린다. */
function coord(v: FormDataEntryValue | null, min: number, max: number): number | null | "invalid" {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) return "invalid";
  return n;
}

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  // ── 1. device ───────────────────────────────────────────────────────────────
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  // Content-Length 조기 거부 (multipart 오버헤드 256KB 허용)
  const cl = ctx.request.headers.get("content-length");
  if (cl) {
    const clNum = parseInt(cl, 10);
    if (!isNaN(clNum) && clNum > MAX_PHOTO_BYTES + 256 * 1024) {
      return json({ error: "Request too large" }, 413);
    }
  }

  // ── 2. multipart 파싱 ───────────────────────────────────────────────────────
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

  // ── 3. 사진 검증 — 기존 photo API 와 같은 순서·같은 함수 ────────────────────
  const mimeResult = validateMimeType(photoField.type);
  if (!mimeResult.ok) return json({ error: mimeResult.error }, mimeResult.status);

  let fileBytes: Uint8Array;
  try {
    fileBytes = new Uint8Array(await photoField.arrayBuffer());
  } catch {
    return json({ error: "Failed to read file" }, 400);
  }

  const sizeResult = validatePhotoSize(fileBytes.length);
  if (!sizeResult.ok) return json({ error: sizeResult.error }, sizeResult.status);

  if (!hasJpegSoi(fileBytes)) return json({ error: "Not a valid JPEG" }, 400);

  let stripped: Uint8Array;
  try {
    stripped = stripJpegApp1(fileBytes);
  } catch {
    return json({ error: "Invalid JPEG structure" }, 400);
  }

  // ── 4. metadata (전부 선택) ─────────────────────────────────────────────────
  // id·photo_storage_path·photo_public 은 받지 않는다. 클라이언트가 보내도
  // 아래에서 읽지 않으므로 그대로 무시된다.
  const name     = str(formData.get("name"), 300);
  const category = str(formData.get("category"), 50);
  if (category && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, 400);
  }
  const city    = optStr(formData.get("city"),     100);
  const address = optStr(formData.get("address"),  500);
  const note    = optStr(formData.get("note"),    2000);

  const lat = coord(formData.get("lat"),  -90,  90);
  const lng = coord(formData.get("lng"), -180, 180);
  if (lat === "invalid") return json({ error: "lat must be between -90 and 90" }, 400);
  if (lng === "invalid") return json({ error: "lng must be between -180 and 180" }, 400);
  // 좌표는 짝일 때만 위치다. DB CHECK 도 같은 규칙을 검사한다.
  if ((lat === null) !== (lng === null)) {
    return json({ error: "lat and lng must be provided together" }, 400);
  }

  // ── 5. admin client ─────────────────────────────────────────────────────────
  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 6. device 사진 한도 (항상 신규 슬롯이다) ────────────────────────────────
  // best-effort: COUNT → upload 사이 창에서 동시 요청이면 잠깐 넘길 수 있다.
  const { count, error: countErr } = await admin
    .from("user_spots")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .not("photo_storage_path", "is", null);

  if (countErr) {
    console.error("[user-spots/with-photo] count error:", countErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (isUserSpotPhotoQuotaExceeded(false, count ?? 0)) {
    return json({ error: `Photo limit reached (${USER_SPOT_PHOTO_DEVICE_LIMIT})` }, 400);
  }

  // ── 7. id 를 먼저 만든다 ────────────────────────────────────────────────────
  // 행보다 파일이 먼저 올라가야 INSERT 순간부터 사진이 Anchor 로 성립한다.
  // 그러려면 경로에 들어갈 id 가 그 전에 있어야 한다. user_spots.id 는
  // UUID(DEFAULT gen_random_uuid) 라 서버가 만든 값을 그대로 써도 된다.
  const spotId      = crypto.randomUUID();
  const storagePath = makeUserSpotPhotoPath(spotId, crypto.randomUUID());

  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, stripped, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    console.error("[user-spots/with-photo] storage upload error:", uploadError.message);
    return json({ error: "Upload failed" }, 500);
  }

  // ── 8. row INSERT — 경로를 함께 넣는다 ──────────────────────────────────────
  const row: Record<string, unknown> = {
    id:                 spotId,
    device_id:          deviceId,
    photo_storage_path: storagePath,
    // 새 사진은 언제나 비공개로 시작한다. 만드는 행위가 공개 동의는 아니다.
    photo_public:       false,
  };
  if (name)              row.name     = name;
  if (category)          row.category = category;
  if (city !== undefined)    row.city    = city;
  if (address !== undefined) row.address = address;
  if (note !== undefined)    row.note    = note;
  if (lat !== null)      row.lat = lat;
  if (lng !== null)      row.lng = lng;

  const { data: inserted, error: insertErr } = await admin
    .from("user_spots")
    .insert(row)
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at, submission_status, photo_public")
    .single();

  if (insertErr || !inserted) {
    // 참조가 없는 파일을 남기지 않는다.
    console.error("[user-spots/with-photo] insert failed, rolling back:", insertErr?.code ?? "no row");
    const rollbackErr = await removeUserSpotPhoto(admin.storage, storagePath);
    if (rollbackErr) {
      console.error(
        "[user-spots/with-photo] rollback delete failed",
        JSON.stringify({ orphaned_path: storagePath, error: rollbackErr }),
      );
    }
    return json({ error: "Failed to create place" }, 500);
  }

  // storage path 는 응답에 담지 않는다. 화면이 알아야 하는 것은 사진이 있다는
  // 사실뿐이고, 파일이 필요하면 소유자 전용 signed URL API 를 따로 부른다.
  return json({ ...inserted, has_photo: true, photo_public: false }, 201);
}

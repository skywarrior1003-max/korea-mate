// Cloudflare Pages Function: GET/PUT/DELETE /api/user-spots/:id
//
// GET    — 소유자만 단건 조회 (device_id never in response)
// PUT    — 소유자만 전체 업데이트 (name 필수)
// DELETE — 소유자만 삭제
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - 모든 쿼리에 WHERE id AND device_id (소유자 확인 단일 원자 쿼리)
// - 비소유자 요청은 404 반환 (정보 누출 방지)
// - device_id는 응답에 포함하지 않음

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
  str,
  nullableStr,
} from "../../../src/lib/itinerary-validate";
import { removeUserSpotPhoto, toPhotoMeta } from "../../../src/lib/user-spots/photo-core";

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

// ── GET — 소유자 단건 조회 ────────────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at, submission_status, photo_storage_path, photo_public")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[user-spots/:id GET] db error:", error.code);
    return json({ error: "Failed to fetch spot" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  // 화면이 알아야 하는 것은 "사진이 있는가" 이지 그 파일이 어디 있는가가
  // 아니다. photo_storage_path 는 응답에서 빼고 boolean 으로만 내보낸다.
  const row = data as Record<string, unknown>;
  const { photo_storage_path: _path, ...rest } = row;
  return json({ ...rest, ...toPhotoMeta(row) });
}

// ── PUT — 소유자 전체 업데이트 ────────────────────────────────────────────────
export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_USER_SPOT_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  // name 은 3-state 다: 생략=유지 · null 또는 빈 문자열=지움 · 문자열=교체.
  // 최소 식별 계약은 아래에서 **기존 행과 합친 최종 상태**로 판정한다 —
  // payload 만 보면 "이름을 지워도 되는가" 에 답할 수 없기 때문이다.
  const nameTouched = body.name !== undefined;
  const name = str(body.name, 300);

  // category 검증
  const category = str(body.category, 50);
  if (category && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, 400);
  }

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (nameTouched) row.name = name || null;

  if (category)                    row.category  = category;
  const city     = nullableStr(body.city,      100); if (city !== undefined)     row.city      = city;
  const address  = nullableStr(body.address,   500); if (address !== undefined)  row.address   = address;
  const note     = nullableStr(body.note,     2000); if (note !== undefined)     row.note      = note;
  const photoUrl = nullableStr(body.photo_url, 500); if (photoUrl !== undefined) row.photo_url = photoUrl;

  if (body.lat !== undefined) {
    if (body.lat === null) { row.lat = null; }
    else if (typeof body.lat !== "number" || !isFinite(body.lat)) { return json({ error: "lat must be a finite number" }, 400); }
    else if (body.lat < -90 || body.lat > 90) { return json({ error: "lat must be between -90 and 90" }, 400); }
    else { row.lat = body.lat; }
  }
  if (body.lng !== undefined) {
    if (body.lng === null) { row.lng = null; }
    else if (typeof body.lng !== "number" || !isFinite(body.lng)) { return json({ error: "lng must be a finite number" }, 400); }
    else if (body.lng < -180 || body.lng > 180) { return json({ error: "lng must be between -180 and 180" }, 400); }
    else { row.lng = body.lng; }
  }

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 최종 상태 검증 ────────────────────────────────────────────────────────
  // 소유한 기존 행을 먼저 읽어 patch 를 얹은 결과를 만든다. 이름이 있던 행에서
  // 이름만 지우는 요청은 그 행에 좌표가 있을 때만 안전하다.
  const { data: current, error: readErr } = await admin
    .from("user_spots")
    .select("name, lat, lng, photo_storage_path")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (readErr) {
    console.error("[user-spots/:id PUT] read error:", readErr.code);
    return json({ error: "Failed to update spot" }, 500);
  }
  if (!current) return json({ error: "Not found or permission denied" }, 404);

  const cur = current as {
    name: string | null; lat: number | null; lng: number | null;
    photo_storage_path: string | null;
  };
  const finalName = (row.name !== undefined ? row.name : cur.name) as string | null;
  const finalLat  = (row.lat  !== undefined ? row.lat  : cur.lat)  as number | null;
  const finalLng  = (row.lng  !== undefined ? row.lng  : cur.lng)  as number | null;
  // 사진 경로는 이 요청으로 바뀌지 않는다. 전용 photo API 만 건드린다.
  const hasPhoto  = typeof cur.photo_storage_path === "string" && cur.photo_storage_path.length > 0;

  if ((finalLat === null) !== (finalLng === null)) {
    return json({ error: "lat and lng must be provided together" }, 400);
  }
  // 사진만으로 만들어진 장소도 메모·분류를 고칠 수 있어야 한다.
  // name 조항은 legacy 호환이며 최종 Anchor 가 아니다 (migration 049 주석 참조).
  if (!(finalName ?? "").trim() && finalLat === null && !hasPhoto) {
    return json({ error: "Provide a name, or a location (lat and lng)" }, 400);
  }

  const { data, error } = await admin
    .from("user_spots")
    .update(row)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[user-spots/:id PUT] db error:", error.code);
    return json({ error: "Failed to update spot" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

// ── DELETE — 소유자 삭제 ──────────────────────────────────────────────────────
// 사진이 붙은 장소를 지울 때는 파일부터 없앤다. 행을 먼저 지우면 그 파일을
// 가리키는 것이 아무것도 없어져 회수할 방법이 사라진다.
export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 사진 정리 ───────────────────────────────────────────────────────────────
  const { data: existing, error: readErr } = await admin
    .from("user_spots")
    .select("id, photo_storage_path, photo_public")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (readErr) {
    console.error("[user-spots/:id DELETE] read error:", readErr.code);
    return json({ error: "Failed to delete spot" }, 500);
  }
  if (!existing) return json({ error: "Not found or permission denied" }, 404);

  const cur = existing as { photo_storage_path: string | null; photo_public: boolean };
  if (cur.photo_storage_path) {
    // 삭제 도중 문제가 생겨도 사진이 공개 후보로 남지 않게 동의부터 끈다.
    if (cur.photo_public) {
      const { error: consentErr } = await admin
        .from("user_spots")
        .update({ photo_public: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("device_id", deviceId);
      if (consentErr) {
        console.error("[user-spots/:id DELETE] consent off failed:", consentErr.code);
        return json({ error: "Failed to delete spot" }, 500);
      }
    }

    const storageErr = await removeUserSpotPhoto(admin.storage, cur.photo_storage_path);
    if (storageErr) {
      // 행을 남긴다. 파일이 남았는데 참조가 사라지는 쪽보다, 둘 다 남아
      // 다시 시도할 수 있는 쪽이 낫다.
      console.error("[user-spots/:id DELETE] storage remove failed:", storageErr);
      return json({ error: "Failed to remove photo" }, 500);
    }
  }

  const { data, error } = await admin
    .from("user_spots")
    .delete()
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (error) {
    console.error("[user-spots/:id DELETE] db error:", error.code);
    return json({ error: "Failed to delete spot" }, 500);
  }
  if (!data || data.length === 0) return json({ error: "Not found or permission denied" }, 404);

  return json({ ok: true });
}

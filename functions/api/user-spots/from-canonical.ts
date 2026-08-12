// Cloudflare Pages Function: POST /api/user-spots/from-canonical
//
// 공개 장소를 개인 장소로 남긴다.
//
// 클라이언트가 보내는 것은 어느 장소인가(city_spot_id) 하나뿐이다. 이름·좌표·
// 도시·분류는 서버가 city_spots 에서 직접 읽는다. 클라이언트가 그 값들을 함께
// 보내더라도 읽지 않는다 — 사실의 출처는 우리 DB 이지 요청 본문이 아니다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - city_spot_id 는 정수만, 서버가 존재를 확인한다
// - 저장하는 사실 값은 전부 서버가 읽은 것 (name·city·category·lat·lng)
// - city_spot_id(게시 back-reference) 는 건드리지 않는다
// - display_title·display_memo 는 NULL 로 시작한다 (AI 는 아직 없다)
// - photo_public 은 false, note 는 손대지 않는다
// - photo_storage_path 는 응답에 담지 않는다
//
// 이 경로는 static 이라 같은 레벨의 [id].ts 보다 우선한다
// (functions/api/user-spots/with-photo.ts 와 같은 형태).

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
} from "../../../src/lib/itinerary-validate";
import {
  buildCanonicalSnapshot,
  type CanonicalRow,
} from "../../../src/lib/user-spots/canonical-core";

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
  // ── 1. device ───────────────────────────────────────────────────────────────
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_USER_SPOT_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  // ── 2. 요청은 id 하나뿐이다 ─────────────────────────────────────────────────
  // 다른 키가 함께 와도 아래에서 읽지 않으므로 그대로 무시된다.
  const raw = body.city_spot_id;
  const citySpotId = typeof raw === "number" ? raw : NaN;
  if (!Number.isInteger(citySpotId) || citySpotId <= 0) {
    return json({ error: "city_spot_id must be a positive integer", code: "INVALID_REQUEST" }, 400);
  }

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 3. 사실 값은 서버가 읽는다 ──────────────────────────────────────────────
  const { data: canonical, error: readErr } = await admin
    .from("city_spots")
    .select("id, name, city, category, lat, lng")
    .eq("id", citySpotId)
    .maybeSingle();

  if (readErr) {
    console.error("[user-spots/from-canonical] canonical read error:", readErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (!canonical) {
    return json({ error: "That place was not found", code: "CANONICAL_PLACE_NOT_FOUND" }, 404);
  }

  // ── 4. 옮겨 담을 수 있는 값인지 ─────────────────────────────────────────────
  const built = buildCanonicalSnapshot(canonical as CanonicalRow);
  if (!built.ok) {
    console.error("[user-spots/from-canonical] unusable canonical:", built.reason);
    return json({
      error: "That place cannot be saved right now",
      code:  "CANONICAL_PLACE_NOT_USABLE",
    }, 400);
  }

  // ── 5. INSERT ───────────────────────────────────────────────────────────────
  // 게시 상태(city_spot_id)·검토 상태·note 는 건드리지 않는다. 개인 기록을
  // 하나 만드는 일이지 공개 절차를 시작하는 일이 아니다.
  //
  // 같은 장소를 여러 번 남길 수 있다. 같은 광안리라도 다른 날·다른 사진이면
  // 다른 기억이다. 중복을 DB 로 막지 않는다.
  const row: Record<string, unknown> = {
    device_id:    deviceId,
    photo_public: false,
    ...built.snapshot,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("user_spots")
    .insert(row)
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at, submission_status, photo_public, related_city_spot_id, display_title, display_memo")
    .single();

  if (insertErr || !inserted) {
    console.error("[user-spots/from-canonical] insert failed:", insertErr?.code ?? "no row");
    return json({ error: "Failed to save place" }, 500);
  }

  return json({ ...inserted, has_photo: false }, 201);
}

// Cloudflare Pages Function: GET/POST /api/trip-moments
//
// GET  ?itinerary_id=  — itinerary 소유자의 text moments 반환 (photo_data 없음)
//                        사진 존재 여부는 has_photo:boolean 으로만 알린다
// POST                 — 새 text moment 저장
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - GET/POST 전 itineraries.id + itineraries.device_id 소유권 확인
// - 비소유자·존재하지 않는 itinerary = 404 (정보 누출 방지)
// - photo_data 수신·저장 금지
// - storage_path 원문·Storage key·signed URL 을 응답에 포함하지 않는다.
//   클라이언트는 사진 동기화 완료 여부만 알면 되므로 has_photo:boolean 만 내보낸다
//   (재업로드 방지·커버 후보 판정에 필요한 최소 정보)
// - service_role 사용

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  readBodyWithLimit,
  str,
  optNum,
} from "../../../src/lib/itinerary-validate";
import { normalizeMemo } from "../../../src/lib/trip-moments/memo-patch-core";

import { normalizePlaceName, normalizeCitySpotId } from "../../../src/lib/trip-moments/public-consent-core";
import { normalizeStopKey, isMissingColumnError } from "../../../src/lib/trip-moments/stop-binding";

const MAX_MOMENT_BODY_BYTES = 8 * 1024; // 8 KB — text/GPS only, no photo_data

const VALID_CATEGORIES = ["food", "scenery", "people", "culture", "random"] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
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

async function verifyItineraryOwner(
  // 호출부가 넘기는 것은 adminClient() 의 반환값이다. bare createClient 제네릭과
  // 다르므로 실제 넘어오는 타입을 그대로 쓴다.
  admin: ReturnType<typeof adminClient>,
  itineraryId: string,
  deviceId:    string,
): Promise<boolean> {
  const { data } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", itineraryId)
    .eq("device_id", deviceId)
    .maybeSingle();
  return !!data;
}

// ── GET — itinerary 소유자의 text moments ────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const itineraryId = new URL(ctx.request.url).searchParams.get("itinerary_id") ?? "";
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary_id" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const owned = await verifyItineraryOwner(admin, itineraryId, deviceId);
  if (!owned) return json({ error: "Not found" }, 404);

  // storage_path 는 내부 판정에만 쓰고 응답에는 넣지 않는다
  // stop_key(055)는 아직 적용되지 않은 환경이 있을 수 있다 — 컬럼 없음 오류면
  // 그 컬럼 없이 한 번 더 읽는다(cover-state-core 의 031 fallback 과 같은 방식).
  const MOMENT_COLS      = "moment_id, itinerary_id, memo, category, lat, lng, location_label, captured_at, day_number, storage_path, place_name, city_spot_id, is_public";
  const MOMENT_COLS_055  = `${MOMENT_COLS}, stop_key`;
  const listMoments = (cols: string) => admin
    .from("trip_moments")
    .select(cols)
    .eq("itinerary_id", itineraryId)
    .eq("device_id", deviceId)
    .order("captured_at", { ascending: false });
  let { data, error } = await listMoments(MOMENT_COLS_055);
  if (error && isMissingColumnError(error)) ({ data, error } = await listMoments(MOMENT_COLS));

  if (error) {
    console.error("[trip-moments GET] db error:", error.code);
    return json({ error: "Failed to fetch moments" }, 500);
  }

  // storage_path 를 has_photo 로 축약해 원문 경로가 클라이언트로 나가지 않게 한다
  const rows = (data ?? []).map((r) => {
    const { storage_path, ...rest } = r as Record<string, unknown>;
    return { ...rest, has_photo: Boolean(storage_path) };
  });

  return json(rows);
}

// ── POST — 새 text moment 생성 ────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const read = await readBodyWithLimit(ctx.request, MAX_MOMENT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  const momentId    = str(body.moment_id, 36);
  const itineraryId = str(body.itinerary_id, 36);
  if (!UUID_RE.test(momentId))    return json({ error: "Invalid moment_id" }, 400);
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary_id" }, 400);

  const categoryRaw = str(body.category, 50);
  const category: ValidCategory = (VALID_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw as ValidCategory
    : "random";

  // memo: 무음 절단 금지 — 초과 시 400 (PATCH 와 동일 정책). 공백만 입력은 "" 허용.
  const memoNorm = normalizeMemo(body.memo ?? "");
  if (!memoNorm.ok) return json({ error: "Invalid memo" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 부모 itinerary 소유권 확인 (FK 부재 보완)
  const owned = await verifyItineraryOwner(admin, itineraryId, deviceId);
  if (!owned) return json({ error: "Not found" }, 404);

  // 장소 표시명 — 선택 사항이다. 없어도 저장을 막지 않는다.
  const placeRes = normalizePlaceName(body.place_name ?? null);
  if (!placeRes.ok) return json({ error: placeRes.error }, 400);
  const spotRes = normalizeCitySpotId(body.city_spot_id ?? null);
  if (!spotRes.ok) return json({ error: spotRes.error }, 400);
  // 일정 장소의 일반 열쇠(055). 형식만 검사한다 — 어느 일정 항목인지는 소유자의
  // 일정 JSON 안에서만 의미가 있고, 서버가 그것을 대조할 이유가 없다.
  const stopRes = normalizeStopKey(body.stop_key ?? null);
  if (!stopRes.ok) return json({ error: stopRes.error }, 400);

  // 공식 장소 id 는 클라이언트 말을 믿지 않는다 — 실제로 있는 장소인지 본다.
  // 없다고 Memory 저장을 막지는 않는다(대부분의 Memory 는 공식 장소가 아니다).
  if (spotRes.citySpotId !== null) {
    const { data: spot } = await admin
      .from("city_spots").select("id").eq("id", spotRes.citySpotId).maybeSingle();
    if (!spot) return json({ error: "Invalid city_spot_id" }, 400);
  }

  const row: Record<string, unknown> = {
    moment_id:      momentId,
    itinerary_id:   itineraryId,
    device_id:      deviceId,
    memo:           memoNorm.memo,
    category,
    location_label: str(body.location_label, 200),
    captured_at:    str(body.captured_at, 30) || new Date().toISOString(),
    // is_public 은 여기서 받지 않는다 — 기본값 false 로 들어가고, 공개 선택은
    // 동의를 함께 확인하는 전용 경로(`PUT .../public`)에서만 바뀐다.
    ...(placeRes.placeName !== null ? { place_name:   placeRes.placeName }   : {}),
    ...(spotRes.citySpotId  !== null ? { city_spot_id: spotRes.citySpotId } : {}),
    ...(stopRes.stopKey     !== null ? { stop_key:     stopRes.stopKey }     : {}),
    // photo_data: 수신·저장 금지
  };

  const lat = optNum(body.lat);
  const lng = optNum(body.lng);
  if (lat !== undefined) {
    if (lat < -90  || lat > 90)  return json({ error: "lat out of range" }, 400);
    row.lat = lat;
  }
  if (lng !== undefined) {
    if (lng < -180 || lng > 180) return json({ error: "lng out of range" }, 400);
    row.lng = lng;
  }

  if (body.day_number !== null && body.day_number !== undefined) {
    if (typeof body.day_number !== "number" || !Number.isInteger(body.day_number)) {
      return json({ error: "day_number must be an integer" }, 400);
    }
    row.day_number = body.day_number;
  }

  let { error } = await admin
    .from("trip_moments")
    .upsert(row, { onConflict: "moment_id" });

  // 055 미적용 환경: stop_key 컬럼이 없으면 그 값만 빼고 한 번 더 저장한다.
  // 순간 자체는 남고, 장소 결합만 빠진다(자유 순간으로 보임). 저장을 막지 않는다.
  if (error && "stop_key" in row && isMissingColumnError(error)) {
    console.warn("[trip-moments POST] stop_key column missing — migration 055 not applied; saving without it");
    const { stop_key: _omit, ...rowWithoutStopKey } = row;
    void _omit;
    ({ error } = await admin.from("trip_moments").upsert(rowWithoutStopKey, { onConflict: "moment_id" }));
  }

  if (error) {
    console.error("[trip-moments POST] db error:", error.code);
    return json({ error: "Failed to save moment" }, 500);
  }

  return json({ moment_id: momentId }, 201);
}

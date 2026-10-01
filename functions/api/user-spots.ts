// Cloudflare Pages Function: GET/POST /api/user-spots
//
// GET  — 이 device가 등록한 모든 My Picks 반환 (device_id never in response)
// POST — 새 My Pick 장소 등록
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - device_id는 헤더에서만 취득 (body의 device_id 무시)
// - category는 city_spots CHECK constraint와 동일 5종만 허용
// - service_role key로 user_spots 테이블 직접 접근

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_USER_SPOT_BODY_BYTES,
  readBodyWithLimit,
  str,
  optStr,
} from "../../src/lib/itinerary-validate";
import { toPhotoMeta } from "../../src/lib/user-spots/photo-core";
import { resolveOwnership, type OwnershipEnv } from "../_lib/ownership.ts";

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

const VALID_CATEGORIES = ["attraction", "nature", "restaurant", "event", "accommodation"] as const;

// ── GET — device의 My Picks 목록 ─────────────────────────────────────────────
export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, name, city, address, lat, lng, category, note, photo_url, created_at, updated_at, submission_status, photo_storage_path, photo_public, related_city_spot_id, display_title, display_memo, import_source")
    .in("device_id", deviceScope)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[user-spots GET] db error:", error.code);
    return json({ error: "Failed to fetch spots" }, 500);
  }

  // 2·3번째 사진(088) 수 — 카드가 "n/3장" 을 보여 줄 수 있게 한 번에 센다.
  // 읽기 실패는 목록을 막지 않는다(대표 사진 유무만으로 센다).
  const ids = (data ?? []).map(r => (r as { id: string }).id);
  const extra = new Map<string, number>();
  if (ids.length > 0) {
    const { data: kids, error: kidsErr } = await admin
      .from("user_spot_photos")
      .select("spot_id")
      .in("spot_id", ids);
    if (kidsErr) console.error("[user-spots GET] photo count error:", kidsErr.code);
    for (const k of kids ?? []) {
      const sid = (k as { spot_id: string }).spot_id;
      extra.set(sid, (extra.get(sid) ?? 0) + 1);
    }
  }

  // 목록에도 storage path 는 내보내지 않는다. 사진 유무와 공개 동의만 준다.
  const rows = (data ?? []).map(raw => {
    const row = raw as Record<string, unknown>;
    const { photo_storage_path: _path, ...rest } = row;
    const meta = toPhotoMeta(row);
    return { ...rest, ...meta, photo_count: (meta.has_photo ? 1 : 0) + (extra.get(row.id as string) ?? 0) };
  });

  return json(rows);
}

// ── POST — 새 My Pick 등록 ────────────────────────────────────────────────────
export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_USER_SPOT_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_USER_SPOT_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  // 최소 식별 계약 — 이름이 있거나, 좌표가 짝으로 있거나.
  //
  // 예전에는 name 만 필수였다. 그러면 "여기, 이 자리" 라고만 말하고 싶은
  // 장소를 담을 수 없다. 반대로 아무 조건도 없으면 나중에 아무도 알아볼 수
  // 없는 빈 행이 남는다. DB CHECK(047)도 같은 규칙을 건다.
  const name = str(body.name, 300);

  // category 검증
  const category = str(body.category, 50);
  if (category && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
    return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, 400);
  }

  const row: Record<string, unknown> = {
    device_id:  deviceId,
    updated_at: new Date().toISOString(),
  };
  if (name) row.name = name;

  if (category)                    row.category  = category;
  const city     = optStr(body.city,      100); if (city)     row.city      = city;
  const address  = optStr(body.address,   500); if (address)  row.address   = address;
  const note     = optStr(body.note,     2000); if (note)     row.note      = note;
  const photoUrl = optStr(body.photo_url, 500); if (photoUrl) row.photo_url = photoUrl;

  if (body.lat !== undefined && body.lat !== null) {
    if (typeof body.lat !== "number") return json({ error: "lat must be a finite number" }, 400);
    if (!isFinite(body.lat) || body.lat < -90 || body.lat > 90) return json({ error: "lat must be between -90 and 90" }, 400);
    row.lat = body.lat;
  }
  if (body.lng !== undefined && body.lng !== null) {
    if (typeof body.lng !== "number") return json({ error: "lng must be a finite number" }, 400);
    if (!isFinite(body.lng) || body.lng < -180 || body.lng > 180) return json({ error: "lng must be between -180 and 180" }, 400);
    row.lng = body.lng;
  }

  // 좌표는 짝으로만 — 한쪽만 있으면 지도에 찍을 수도 고칠 수도 없다.
  const hasLat = row.lat !== undefined;
  const hasLng = row.lng !== undefined;
  if (hasLat !== hasLng) {
    return json({ error: "lat and lng must be provided together" }, 400);
  }

  // 최소 식별 계약 판정. DB CHECK 가 잡기 전에 여기서 정상 validation 으로
  // 돌려준다 — 사용자에게 DB 제약 위반 500 을 보여주지 않는다.
  // 이 경로에는 사진이 오지 않는다. 그래서 여기서 만들 수 있는 근거는 좌표뿐이다.
  //
  // 이름·주소·메모·분류는 아무리 채워도 근거가 아니다. 제목은 장소를 이해하는
  // 근거가 아니라 표현 값이고, 그것만 있는 행은 나중에 그게 무엇이었는지 아무도
  // 알 수 없다. 사진만으로 만들려면 /api/user-spots/with-photo 를 쓴다.
  //
  // DB CHECK 의 legacy name 항은 그대로 둔다 — 이름만으로 만들어진 예전 행이
  // 아직 있고, 그 행을 고치는 길까지 막을 이유는 없다. 새로 만드는 길만 닫는다.
  //
  // 2026-10-01 Owner 결정으로 바뀌었다 — "위치 미정" 저장을 연다. 지도가 열리지
  // 않거나(지도 인증 실패) 링크에서 자리를 못 읽은 사람이 저장 자체를 못 하면
  // 그 장소는 기록되지 못하고 사라진다. 대신 좌표를 지어내지 않는다: 이름(2자 이상)
  // 만 받고, 위치는 비운 채 저장한다. 화면은 "위치 미정 — 지도·길찾기 불가" 를
  // 따로 보여 준다. DB CHECK(047)의 name 항이 이 행을 그대로 받아 준다.
  const nameOnly = !(hasLat && hasLng) && typeof name === "string" && name.trim().length >= 2;
  if (!(hasLat && hasLng) && !nameOnly) {
    return json({
      error: "A new place needs a location or a name (2+ characters). Use the photo endpoint to save a place from a photo.",
      code:  "ANCHOR_REQUIRED",
    }, 400);
  }

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[user-spots POST] db error:", error.code);
    return json({ error: "Failed to create spot" }, 500);
  }

  return json({ id: data.id }, 201);
}

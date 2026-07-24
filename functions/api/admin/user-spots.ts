// Cloudflare Pages Function: GET/PATCH/POST /api/admin/user-spots
//
// GET          — pending 신청 목록 (관리자 전용)
// GET ?id=<>   — 단건 조회 + 중복 후보 (duplicateCandidates.byName / .byLocation)
// PATCH        — approved / rejected 전환 (관리자 전용)
// POST         — publish_user_spot RPC 호출 (city_spots 반영)
//
// SECURITY CONTRACT:
// - x-admin-key 헤더 필수 (서버 ADMIN_KEY 검증)
// - DB 내부 오류 원문 클라이언트 노출 금지
// - 중복 판정 서버에서만 수행
// - device_id 응답 미포함

import { checkAdminAuth, getServiceRoleHeaders, json } from "../../_lib/admin-auth";

interface Env {
  ADMIN_KEY:                 string;
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Ctx = { request: Request; env: Env };

const REVIEW_STATUSES = new Set(["approved", "rejected"]);

// RPC 오류 메시지 → HTTP 상태 코드 매핑 (allowlist 6종)
const RPC_ERROR_MAP: Record<string, number> = {
  USER_SPOT_NOT_FOUND:         404,
  USER_SPOT_NOT_APPROVED:      409,
  USER_SPOT_ALREADY_PUBLISHED: 409,
  USER_SPOT_REQUIRED_FIELD:    400,
  USER_SPOT_INVALID_OVERRIDE:  400,
  USER_SPOT_DUPLICATE_NAME:    409,
};

// 이름 정규화: 대소문자·선행후행공백·하이픈·연속공백 차이를 동일 취급
function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

// Haversine 거리 계산 (단위: 미터)
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinHalfLng * sinHalfLng;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GET — 목록 or 단건 조회 ───────────────────────────────────────────────────
export const onRequestGet = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) return json({ error: "Admin DB not configured" }, 503);

  const url    = new URL(request.url);
  const spotId = url.searchParams.get("id")?.trim();

  // ── 단건 조회 + 중복 후보 ────────────────────────────────────────────────
  if (spotId) {
    const spotRes = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_spots` +
      `?id=eq.${encodeURIComponent(spotId)}&limit=1` +
      `&select=id,name,city,address,lat,lng,category,note,photo_url,` +
      `created_at,updated_at,submission_status,submitted_at,city_spot_id,published_at`,
      { headers: dbHeaders },
    );
    if (!spotRes.ok) {
      console.error("[admin/user-spots GET ?id] db error:", await spotRes.text());
      return json({ error: "Database error." }, 500);
    }
    const rows = (await spotRes.json()) as Record<string, unknown>[];
    if (rows.length === 0) return json({ error: "Not found" }, 404);
    const spot = rows[0];

    const city = typeof spot.city === "string" ? spot.city : "";
    const name = typeof spot.name === "string" ? spot.name : "";
    const lat  = typeof spot.lat  === "number" ? spot.lat  : null;
    const lng  = typeof spot.lng  === "number" ? spot.lng  : null;

    // byName: 동일 city 내 정규화 이름 일치 후보
    // ilike 단독 대신 서버에서 normalizeName() 적용 → 공백·하이픈·대소문자 차이 통합 처리
    let byName: unknown[] = [];
    if (city && name) {
      const normalizedTarget = normalizeName(name);
      const cityRes = await fetch(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/city_spots` +
        `?city=eq.${encodeURIComponent(city)}` +
        `&select=id,city,name,address,lat,lng,source_type` +
        `&limit=500`,
        { headers: dbHeaders },
      );
      if (cityRes.ok) {
        const candidates = (await cityRes.json()) as Array<Record<string, unknown>>;
        byName = candidates.filter((c) => {
          const cname = typeof c.name === "string" ? c.name : "";
          return normalizeName(cname) === normalizedTarget;
        });
      } else {
        console.error("[admin/user-spots GET ?id byName] db error:", await cityRes.text());
      }
    }

    // byLocation: ±0.0015° 박스 사전 필터 → Haversine ≤100m 최종 필터
    let byLocation: unknown[] = [];
    if (lat !== null && lng !== null) {
      const latMin = lat - 0.0015;
      const latMax = lat + 0.0015;
      const lngMin = lng - 0.0015;
      const lngMax = lng + 0.0015;
      const locRes = await fetch(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/city_spots` +
        `?lat=gte.${latMin}&lat=lte.${latMax}` +
        `&lng=gte.${lngMin}&lng=lte.${lngMax}` +
        `&select=id,city,name,address,lat,lng,source_type`,
        { headers: dbHeaders },
      );
      if (locRes.ok) {
        const candidates = (await locRes.json()) as Array<Record<string, unknown>>;
        byLocation = candidates.filter((c) => {
          const clat = typeof c.lat === "number" ? c.lat : null;
          const clng = typeof c.lng === "number" ? c.lng : null;
          if (clat === null || clng === null) return false;
          return haversineMeters(lat, lng, clat, clng) <= 100;
        });
      } else {
        console.error("[admin/user-spots GET ?id byLocation] db error:", await locRes.text());
      }
    }

    return json({ spot, duplicateCandidates: { byName, byLocation } });
  }

  // ── 목록 조회 ─────────────────────────────────────────────────────────────
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_spots` +
    `?submission_status=in.(pending,approved)` +
    `&order=submitted_at.desc` +
    `&limit=200` +
    `&select=id,name,city,address,category,note,submission_status,submitted_at,photo_url,lat,lng,city_spot_id,published_at`,
    { headers: dbHeaders },
  );

  if (!res.ok) {
    console.error("[admin/user-spots GET] db error:", await res.text());
    return json({ error: "Database error" }, 500);
  }

  return json(await res.json());
};

// ── PATCH — approved / rejected 전환 ─────────────────────────────────────────
export const onRequestPatch = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) return json({ error: "Admin DB not configured" }, 503);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const id     = String(body.id     ?? "").trim();
  const status = String(body.status ?? "").trim();

  if (!id)                          return json({ error: "id is required" }, 400);
  if (!REVIEW_STATUSES.has(status)) return json({ error: "status must be 'approved' or 'rejected'" }, 400);

  // pending인 spot만 업데이트 (이미 결정된 spot 보호)
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_spots` +
    `?id=eq.${encodeURIComponent(id)}&submission_status=eq.pending`,
    {
      method:  "PATCH",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body:    JSON.stringify({
        submission_status: status,
        updated_at:        new Date().toISOString(),
      }),
    },
  );

  if (!res.ok) {
    console.error("[admin/user-spots PATCH] db error:", await res.text());
    return json({ error: "Update failed" }, 500);
  }

  return json({ ok: true });
};

// ── POST — publish_user_spot RPC 호출 ────────────────────────────────────────
export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const dbHeaders = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!dbHeaders) return json({ error: "Admin DB not configured" }, 503);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const id = String(body.id ?? "").trim();
  if (!id) return json({ error: "id is required" }, 400);

  // overrides 미전달 시 null 전달 (RPC p_overrides DEFAULT NULL)
  const overrides = body.overrides !== undefined ? body.overrides : null;

  const rpcRes = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/publish_user_spot`,
    {
      method:  "POST",
      headers: dbHeaders,
      body:    JSON.stringify({
        p_user_spot_id: id,
        p_overrides:    overrides,
      }),
    },
  );

  if (rpcRes.ok) {
    const data = (await rpcRes.json()) as Record<string, unknown>;
    return json({ ok: true, city_spot_id: data.city_spot_id });
  }

  // RPC 오류 처리 — DB 원문 노출 금지
  let rpcBody: Record<string, unknown> = {};
  try { rpcBody = (await rpcRes.json()) as Record<string, unknown>; }
  catch { /* JSON 파싱 실패 시 빈 객체 유지 */ }

  const rpcMessage = typeof rpcBody.message === "string" ? rpcBody.message : "";
  const mappedStatus = RPC_ERROR_MAP[rpcMessage];

  if (mappedStatus !== undefined) {
    return json({ error: rpcMessage }, mappedStatus);
  }

  // 미매핑 오류: 원문 서버 로그만, 클라이언트에는 일반화된 메시지
  console.error("[admin/user-spots POST] unmapped RPC error:", JSON.stringify(rpcBody));
  return json({ error: "Database error." }, 500);
};

// ── Other methods → 405 ──────────────────────────────────────────────────────
export const onRequest = async (): Promise<Response> =>
  json({ error: "Method not allowed" }, 405);

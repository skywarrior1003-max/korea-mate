// Cloudflare Pages Function: DELETE /api/trip-moments/:id
//
// DELETE — moment 소유자만 삭제
//          moment.device_id 일치 + 연결 itinerary 소유권 이중 확인
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id 확인
// - 연결 itinerary도 동일 device 소유인지 재확인
// - 비소유자·미존재 = 404 (정보 누출 방지)
// - service_role 사용

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../src/lib/itinerary-validate";

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

export async function onRequestDelete(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.id as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1단계: moment 존재 + device_id 일치 확인 → itinerary_id 취득
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!moment) return json({ error: "Not found" }, 404);

  // 2단계: 연결 itinerary 소유권 재확인 (FK 부재 보완)
  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", moment.itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!itinerary) return json({ error: "Not found" }, 404);

  // 3단계: 삭제
  const { error } = await admin
    .from("trip_moments")
    .delete()
    .eq("moment_id", momentId)
    .eq("device_id", deviceId);

  if (error) {
    console.error("[trip-moments/:id DELETE] db error:", error.code);
    return json({ error: "Failed to delete moment" }, 500);
  }

  return json({ ok: true });
}

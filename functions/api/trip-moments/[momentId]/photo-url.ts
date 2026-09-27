// Cloudflare Pages Function: GET /api/trip-moments/:momentId/photo-url
//
// 소유자 전용 사진 signed URL 발급 (600초 유효).
// bucket은 비공개 유지 — service_role 서버 전용.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id = x-device-id 확인
// - 연결 itinerary 소유권 이중 확인
// - storage_path 없는 moment → 404
// - 응답: signedUrl·expiresAt만 반환 (storage_path·device_id·key 비노출)
// - 비소유자·미존재·사진 없음 = 404 (정보 누출 방지)
// - service_role 서버에서만 사용

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { handlePhotoUrlCore, AdminLike } from "../../../../src/lib/photo-url-core";
import { resolveOwnership, type OwnershipEnv } from "../../../_lib/ownership.ts";

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

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.momentId as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  // LINKING-V1 — 소유권은 공통 판정기 하나로: guest=자기 device, account=연결된 전 기기,
  // linked device 의 무세션/타계정 접근은 여기서 즉시 거부된다(§3.2 direct fallback 금지).
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  return handlePhotoUrlCore(momentId, deviceId, admin as unknown as AdminLike);
}

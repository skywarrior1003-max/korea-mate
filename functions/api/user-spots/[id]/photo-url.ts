// Cloudflare Pages Function: GET /api/user-spots/:id/photo-url
//
// 소유자 전용 사진 signed URL 발급 (600초). Moment 쪽과 같은 계약이다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - user_spots.device_id = x-device-id 확인, 아니면 404
// - private bucket 유지 — getPublicUrl·영구 URL 사용 금지
// - 응답은 signedUrl·expiresAt 뿐. storage_path·device_id·key 비노출
// - 남의 장소에 사진이 있는지 없는지도 알려주지 않는다 (둘 다 404)

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { createMomentSignedUrl, PHOTO_URL_EXPIRES_IN } from "../../../../src/lib/photo-url";

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
  const id = ctx.params.id as string;
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const { data, error } = await admin
    .from("user_spots")
    .select("id, photo_storage_path")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[user-spots/:id/photo-url GET] db error:", error.code);
    return json({ error: "Server error" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  const storagePath = (data as { photo_storage_path: string | null }).photo_storage_path;
  if (!storagePath) return json({ error: "Not found" }, 404);

  // createMomentSignedUrl 은 이름만 Moment 일 뿐 경로를 받아 처리하는 일반
  // 함수다. 같은 private bucket 을 쓰므로 그대로 재사용한다.
  const result = await createMomentSignedUrl(admin.storage, storagePath, PHOTO_URL_EXPIRES_IN);
  if (typeof result === "string") {
    console.error("[user-spots/:id/photo-url GET] signed url error:", result);
    return json({ error: "Failed to create photo URL" }, 500);
  }

  return json(result);
}

// Cloudflare Pages Function: PUT /api/trip-moments/:momentId/public
//
// 이 Memory 를 공개 Story 에 포함할지 정한다.
//
// 왜 별도 자리인가
//   메모 PATCH 는 `memo` 하나만 반영하고 `is_public` 은 받아도 무시한다 —
//   그 계약을 깨지 않는다. 공개 여부는 일반 필드 갱신과 무게가 다르므로
//   전용 경로에서 동의까지 확인하고 처리한다.
//
// 이것만으로 공개되지 않는다
//   `is_public=true` 는 "공개 대상으로 골랐다" 는 소유자 쪽 표시다. 실제로
//   바깥으로 나가려면 앞으로도 **itinerary.is_public === true AND
//   moment.is_public === true** 두 개가 모두 참이어야 하고, 그 공개 경로는
//   아직 만들지 않았다. 지금은 어떤 공개 응답에도 Memory 가 들어가지 않는다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - moment.device_id 일치 + 연결 itinerary 소유권 이중 확인 (기존 패턴 그대로)
// - 비소유자·미존재 = 404 (존재 여부 누출 방지)
// - 동의 시각·판본은 **서버가** 적는다. 요청 값을 쓰지 않는다
// - 켤 때만 동의 확인. 끌 때는 묻지 않고 동의 기록을 지운다
// - 응답에 device_id·storage_path·좌표를 담지 않는다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE, MAX_SMALL_BODY_BYTES, readBodyWithLimit } from "../../../../src/lib/itinerary-validate";
import { parsePublicRequest, buildPublicPatch } from "../../../../src/lib/trip-moments/public-consent-core";

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
    headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" },
  });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const momentId = ctx.params.momentId as string;
  if (!UUID_RE.test(momentId)) return json({ error: "Invalid moment ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);

  const parsed = parsePublicRequest(read.body);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 소유권 — moment 와 그 itinerary 둘 다 이 기기 것이어야 한다
  const { data: moment } = await admin
    .from("trip_moments")
    .select("moment_id, itinerary_id")
    .eq("moment_id", momentId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!moment) return json({ error: "Not found" }, 404);

  const { data: itinerary } = await admin
    .from("itineraries")
    .select("id")
    .eq("id", (moment as { itinerary_id: string }).itinerary_id)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!itinerary) return json({ error: "Not found" }, 404);

  const patch = buildPublicPatch(parsed.isPublic, new Date().toISOString());

  const { error } = await admin
    .from("trip_moments")
    .update(patch)
    .eq("moment_id", momentId)
    .eq("device_id", deviceId);

  if (error) {
    console.error("[moment public PUT] db error:", error.code);
    return json({ error: "Failed to update" }, 500);
  }

  return json({ is_public: patch.is_public });
}

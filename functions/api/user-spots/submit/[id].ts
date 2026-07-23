// Cloudflare Pages Function: PATCH /api/user-spots/submit/:id
//
// 소유자가 자신의 장소를 공개 신청합니다 (none|rejected → pending).
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 검증)
// - WHERE id AND device_id 로 소유자 확인
// - device당 pending 최대 5건 초과 시 429
// - already pending → 409 / already approved → 409
// - city_spots 자동 반영 없음 (별도 관리자 작업)

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";

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

const MAX_PENDING_PER_DEVICE = 5;

export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const id = (ctx.params.id ?? "").trim();
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 1. 현재 장소 조회 (소유자 확인)
  const { data: spot, error: fetchErr } = await admin
    .from("user_spots")
    .select("id, submission_status")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[user-spots/submit PATCH] fetch error:", fetchErr.code);
    return json({ error: "Failed to fetch spot" }, 500);
  }
  if (!spot) return json({ error: "Not found" }, 404);

  const current = (spot as { submission_status: string }).submission_status;

  // 2. 상태 검증
  if (current === "pending")  return json({ error: "Already submitted for review" }, 409);
  if (current === "approved") return json({ error: "Already approved" }, 409);
  // 'none' 또는 'rejected' 만 통과

  // 3. device당 pending 건수 확인
  const { count, error: countErr } = await admin
    .from("user_spots")
    .select("*", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .eq("submission_status", "pending");

  if (countErr) {
    console.error("[user-spots/submit PATCH] count error:", countErr.code);
    return json({ error: "Failed to check pending limit" }, 500);
  }
  if ((count ?? 0) >= MAX_PENDING_PER_DEVICE) {
    return json({ error: `Pending limit reached (max ${MAX_PENDING_PER_DEVICE})` }, 429);
  }

  // 4. pending 전환
  const { error: updateErr } = await admin
    .from("user_spots")
    .update({
      submission_status: "pending",
      submitted_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq("id", id)
    .eq("device_id", deviceId);

  if (updateErr) {
    console.error("[user-spots/submit PATCH] update error:", updateErr.code);
    return json({ error: "Failed to submit" }, 500);
  }

  return json({ ok: true });
}

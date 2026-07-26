// Cloudflare Pages Function: PATCH /api/itinerary/helpful/:id
// Increments helpful_count for an itinerary, deduplicated by device_id.
// Uses add_itinerary_helpful_vote RPC (service_role only, atomic INSERT + UPDATE).
//
// TASK-HELPFUL-GUARD: RPC 호출 전 서버에서 3가지를 검증한다 —
//   대상 존재+공개 / 셀프 반응 아님 / 요청 기기가 해당 원본의 복사본 소유.
//   Helpful 을 "복사 후 실제로 써본 사람의 반응"으로 유지하기 위함이며,
//   DB·RPC·제약은 변경하지 않는다.

import { createClient } from "@supabase/supabase-js";
import { guardedHelpfulVote, type HelpfulAdminLike } from "../../../../src/lib/helpful-guard-core";

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
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase not configured");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPatch(ctx: PagesCtx): Promise<Response> {
  const itineraryId = (ctx.params.id ?? "").trim();
  if (!UUID_RE.test(itineraryId)) return json({ error: "Invalid itinerary id" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!deviceId) return json({ error: "x-device-id header required" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const result = await guardedHelpfulVote(
    itineraryId,
    deviceId,
    admin as unknown as HelpfulAdminLike,
  );
  return json(result.body, result.status);
}

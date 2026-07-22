// Cloudflare Pages Function: POST /api/itinerary/copy
//
// 공유된 일정을 요청 device의 소유로 복사한다.
// copy_of에 원본 id를 기록하며, days/trip_title 등 컨텐츠는 그대로 복제.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 (UUID 형식 검증)
// - share_id는 body에서 검증 후 service_role로 조회
// - 신규 UUID는 서버에서 생성 (클라이언트가 제어 불가)
// - device_id는 헤더에서만 취득 (body의 device_id 무시)

import { createClient } from "@supabase/supabase-js";
import {
  UUID_RE,
  MAX_SMALL_BODY_BYTES,
  readBodyWithLimit,
  isValidUUID,
  str,
  optStr,
} from "../../../src/lib/itinerary-validate";

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

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) {
    return json({ error: "Invalid device ID" }, 400);
  }

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;

  const shareId = str(body.share_id, 36);
  if (!isValidUUID(shareId)) return json({ error: "Invalid share_id" }, 400);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // 원본 일정 조회 (service_role — device_id 포함 전체 행 접근)
  const { data: source, error: fetchErr } = await admin
    .from("itineraries")
    .select("city, start_date, end_date, travelers, travel_style, days, trip_title")
    .eq("id", shareId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[copy] fetch error:", fetchErr.code);
    return json({ error: "Failed to fetch source itinerary" }, 500);
  }
  if (!source) return json({ error: "Source itinerary not found" }, 404);

  const newId = crypto.randomUUID();

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id:           newId,
    device_id:    deviceId,
    city:         source.city,
    start_date:   source.start_date,
    end_date:     source.end_date,
    travelers:    source.travelers,
    travel_style: source.travel_style,
    days:         source.days,
    copy_of:      shareId,
    copied_at:    now,
    updated_at:   now,
    trip_title:   optStr(source.trip_title, 300) ?? "Copied Trip",
  };

  const { error: insertErr } = await admin.from("itineraries").insert(row);

  if (insertErr) {
    console.error("[copy] insert error:", insertErr.code);
    return json({ error: "Failed to create copy" }, 500);
  }

  // 원본 copy_count 원자적 증가 — 실패해도 복사본 생성 성공 유지
  const { error: countErr } = await admin.rpc("increment_copy_count", { p_id: shareId });
  if (countErr) {
    console.error("[copy] copy_count increment error:", countErr.code);
  }

  return json({ id: newId }, 201);
}

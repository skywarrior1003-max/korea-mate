// Cloudflare Pages Function: POST /api/itinerary/copy
//
// 공유된 일정을 요청 device의 소유로 복사한다.
// copy_of 에 원본 id 를 기록한다. 복사되는 것은 **일정 구조**뿐이다 —
// 도시·일수·날짜별 장소·순서·좌표. 원작자의 제목·원 여행 날짜·메모·사진·
// trip_moments·Story 본문은 복사하지 않는다(COMMUNITY-V1 §2).
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
} from "../../../src/lib/itinerary-validate";
import {
  buildCopiedItinerary, copiedTripTitle, copiedDateRange, normalizeCopyLocale,
} from "../../../src/lib/share/copied-itinerary";
import { resolveCitySlug } from "../../../src/data/cities/identity";
import { isModerationHidden } from "../../../src/lib/moderation/story-moderation-core";

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
    .select("city, start_date, end_date, travelers, travel_style, days, moderation_hidden_at")
    .eq("id", shareId)
    .eq("is_public", true)
    .maybeSingle();

  if (fetchErr) {
    console.error("[copy] fetch error:", fetchErr.code);
    return json({ error: "Failed to fetch source itinerary" }, 500);
  }
  if (!source) return json({ error: "Source itinerary not found" }, 404);
  // 관리자가 가린 여행은 복사 대상이 아니다. 복사되면 가린 내용이 다른 계정으로
  // 퍼져 나가고, 그 복사본을 다시 공개할 수도 있다.
  if (isModerationHidden(source as { moderation_hidden_at: string | null })) {
    return json({ error: "Source itinerary not found" }, 404);
  }

  const newId = crypto.randomUUID();

  const now = new Date().toISOString();
  // COMMUNITY-V1 §2: 원작자의 제목과 원 여행 날짜는 복사 금지 항목이다.
  //  · 제목 — 받은 사람 locale 의 중립 제목(도시 기반). body.locale 은 4locale
  //    enum 으로만 해석하고 그 밖의 값은 en 이다.
  //  · 날짜 — 일수만 유지하고 복사 시점(KST 오늘)부터 다시 편다.
  const locale = normalizeCopyLocale(body.locale);
  const range  = copiedDateRange(source.start_date, source.end_date);
  const row: Record<string, unknown> = {
    id:           newId,
    device_id:    deviceId,
    // 지원 5도시는 canonical slug 로 저장한다(표시명·과거 라벨 원본 → slug).
    // 해석 불가 값은 원본 유지 — 임의 도시로 바꾸지 않는다(TRIP-CITY-CONTRACT-FINAL-CLOSEOUT-V1).
    city:         resolveCitySlug(source.city) ?? source.city,
    start_date:   range.start_date,
    end_date:     range.end_date,
    travelers:    source.travelers,
    travel_style: source.travel_style,
    // 원본을 그대로 옮기지 않는다. 원작성자가 자기 My Place 에 적어 둔 메모와
    // `user_spot:<원작성자 uuid>` 열쇠는 빼고, 지도와 스케줄러가 쓰는 좌표는
    // 남긴다 — 받은 사람은 이 일정을 실제로 다녀야 한다.
    days:         buildCopiedItinerary(source.days),
    copy_of:      shareId,
    copied_at:    now,
    updated_at:   now,
    trip_title:   copiedTripTitle(str(source.city ?? "", 64) || null, locale),
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

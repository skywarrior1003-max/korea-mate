// Cloudflare Pages Function: PUT /api/itinerary/:id/cover
//
// 일정 커버를 auto / asset(승인 관광 사진) / moment(개인 Memory 사진 1장) 중
// 하나로 전환한다.
//
// SECURITY CONTRACT:
// - x-device-id(UUID) + 일정 소유권 필수
// - assetId 는 V1A manifest 화이트리스트만 허용
// - moment 는 같은 itinerary·같은 device 소유 + 실제 사진 존재 + 정확한 동의 버전
// - 요청으로 URL·storage_path 를 받지 않는다 (parseCoverRequest 가 화이트리스트 파싱)
// - 소유권·존재 실패는 전부 404 로 통일 — 타 사용자 자원 존재를 누출하지 않는다
// - trip_moments.is_public 은 읽지도 쓰지도 않는다
// - 모든 전환은 한 번의 UPDATE 로 5개 커버 필드를 함께 설정·초기화 (CHECK 위반 방지)

import { createClient } from "@supabase/supabase-js";
import { UUID_RE, MAX_SMALL_BODY_BYTES, readBodyWithLimit } from "../../../../src/lib/itinerary-validate";
import { assetById } from "../../../../src/lib/trip-cover/assets.data";
import { parseCoverRequest, buildCoverPatch } from "../../../../src/lib/trip-cover/cover-state-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string | string[]>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 소유권·존재 실패는 전부 이 응답으로 통일한다 */
const notFound = () => json({ error: "Not found" }, 404);

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function onRequestPut(ctx: PagesCtx): Promise<Response> {
  const raw = ctx.params["id"];
  const id  = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  if (!UUID_RE.test(id)) return json({ error: "Invalid ID" }, 400);

  const deviceId = (ctx.request.headers.get("x-device-id") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return json({ error: "Invalid device ID" }, 400);

  const cl = ctx.request.headers.get("content-length");
  if (cl && parseInt(cl, 10) > MAX_SMALL_BODY_BYTES) return json({ error: "Request too large" }, 413);

  const read = await readBodyWithLimit(ctx.request, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return json({ error: read.error }, read.status);

  const parsed = parseCoverRequest(read.body);
  if (!parsed.ok || !parsed.kind) return json({ error: parsed.error ?? "Invalid body" }, parsed.status);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  // ── 일정 소유권 ────────────────────────────────────────────────────────────
  const { data: itin, error: itinErr } = await admin
    .from("itineraries")
    .select("id, device_id")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (itinErr) {
    console.error("[cover PUT] itinerary lookup error:", itinErr.code);
    return json({ error: "Failed to load itinerary" }, 500);
  }
  if (!itin) return notFound();

  const now = new Date().toISOString();

  // ── kind 별 추가 검증 ──────────────────────────────────────────────────────
  if (parsed.kind === "asset") {
    // manifest 화이트리스트 — 임의 문자열을 저장하지 않는다
    if (!assetById(parsed.assetId ?? "")) return notFound();
  }

  if (parsed.kind === "moment") {
    const { data: moment, error: mErr } = await admin
      .from("trip_moments")
      .select("moment_id, itinerary_id, device_id, storage_path")
      .eq("moment_id", parsed.momentId ?? "")
      .maybeSingle();

    if (mErr) {
      console.error("[cover PUT] moment lookup error:", mErr.code);
      return json({ error: "Failed to load photo" }, 500);
    }
    // 존재하지 않음 / 다른 일정 / 다른 기기 / 사진 없음 → 전부 404 로 통일
    if (!moment) return notFound();
    if (String(moment.itinerary_id) !== String(itin.id)) return notFound();
    if (String(moment.device_id) !== String(itin.device_id)) return notFound();
    if (!moment.storage_path) return notFound();
  }

  // ── 단일 UPDATE 로 5개 필드 + updated_at 을 함께 설정 ──────────────────────
  const patch = buildCoverPatch(parsed.kind, {
    assetId:  parsed.assetId,
    momentId: parsed.momentId,
    now,
  });

  const { data: updated, error: upErr } = await admin
    .from("itineraries")
    .update(patch)
    .eq("id", id)
    .eq("device_id", deviceId)
    .select("id");

  if (upErr) {
    console.error("[cover PUT] update error:", upErr.code);
    return json({ error: "Failed to update cover" }, 500);
  }
  if (!updated || updated.length === 0) return notFound();

  // storage_path·device_id 등 내부 정보를 응답에 포함하지 않는다
  return json({ ok: true, cover_kind: patch.cover_kind, updated_at: patch.updated_at });
}

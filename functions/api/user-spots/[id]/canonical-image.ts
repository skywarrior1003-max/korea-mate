// Cloudflare Pages Function: GET /api/user-spots/:id/canonical-image
//
// 개인 사진이 없는 My Place 에서 보여줄 공개 장소 대표 이미지를 준다.
//
// 개인 사진이 있으면 아무것도 주지 않는다. 사용자가 직접 찍은 사진 위에
// 카탈로그 사진이 덮이면, 그건 그 사람의 기록이 아니라 우리 데이터다.
//
// SECURITY CONTRACT:
// - x-device-id header 필수 · 소유자 확인, 아니면 404
// - 관계(related_city_spot_id)가 있을 때만 조회한다. 좌표 근접으로 장소를
//   추측해 사진을 붙이지 않는다 — 근처에 있었다는 것은 그곳이었다가 아니다.
// - display_eligible = true 인 이미지만. rights_status 문자열로 판단하지 않는다.
// - 표기가 필요한데 보여줄 출처가 없으면 그 이미지는 주지 않는다.
// - photo_storage_path 는 응답에 담지 않는다.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import {
  pickCanonicalImage,
  type CanonicalImageRow,
} from "../../../../src/lib/user-spots/canonical-core";

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

  const { data: spot, error: spotErr } = await admin
    .from("user_spots")
    .select("id, related_city_spot_id, photo_storage_path")
    .eq("id", id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (spotErr) {
    console.error("[user-spots/:id/canonical-image] db error:", spotErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (!spot) return json({ error: "Not found" }, 404);

  const row = spot as { related_city_spot_id: number | null; photo_storage_path: string | null };

  // 개인 사진이 있으면 대표 이미지를 주지 않는다.
  if (typeof row.photo_storage_path === "string" && row.photo_storage_path.length > 0) {
    return json({ imageUrl: null, sourceUrl: null, reason: "has_own_photo" });
  }
  if (row.related_city_spot_id === null) {
    return json({ imageUrl: null, sourceUrl: null, reason: "no_relation" });
  }

  // 이미지와 출처를 한 번에 가져온다 — 카드마다 따로 부르지 않는다.
  const { data: images, error: imgErr } = await admin
    .from("city_spot_images")
    .select("image_url, display_eligible, is_primary, attribution_required, city_spot_sources(source_url)")
    .eq("city_spot_id", row.related_city_spot_id);

  if (imgErr) {
    console.error("[user-spots/:id/canonical-image] image read error:", imgErr.code);
    return json({ error: "Server error" }, 500);
  }

  const rows: CanonicalImageRow[] = (images ?? []).map(r => {
    const rec = r as Record<string, unknown>;
    const src = rec.city_spot_sources as { source_url?: string | null } | null | undefined;
    return {
      image_url:            String(rec.image_url ?? ""),
      display_eligible:     rec.display_eligible === true,
      is_primary:           rec.is_primary === true,
      attribution_required: rec.attribution_required === true,
      source_url:           (src?.source_url ?? null) as string | null,
    };
  });

  const picked = pickCanonicalImage(rows);
  if (!picked) return json({ imageUrl: null, sourceUrl: null, reason: "no_usable_image" });

  return json(picked);
}

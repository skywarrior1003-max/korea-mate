// Cloudflare Pages Function: POST /api/trip-moments/from-user-spot
//
// 내 장소(user_spots)의 사진·메모를 여행의 그 장소 기록(trip_moments)으로 옮겨 담는다.
// [이 장소로 오늘 My Trip 시작] · [현재 여행에 추가] 뒤에 화면이 한 번 부른다 —
// 사용자가 같은 사진·메모를 "순간 기록" 으로 다시 적지 않게 하려는 것이다.
//
// body: { itinerary_id, user_spot_id, moment_id(새 uuid), day_number?, captured_at? }
//
// SECURITY CONTRACT
// - 여행·장소 둘 다 이 사용자의 것이어야 한다(resolveOwnership). 아니면 같은 404.
// - 만들어지는 기록은 비공개다(is_public 기본 false). 공개는 기존 동의 경로에서만.
// - 사진은 Storage 안에서 복사한다. 원본은 이미 EXIF·GPS 가 제거된 파일이다
//   (user-spots 업로드가 압축 + APP1 제거). 새 경로는 서버가 만든다.
// - 응답에 storage path 를 담지 않는다.
// - 같은 여행에 같은 장소 기록이 이미 있으면 새로 만들지 않고 그 기록을 알려 준다
//   (stop_key = user_spot:<id> — 일정 항목의 sourceKey 와 같은 열쇠라 카드에 바로 붙는다).
// - AI 호출 없음.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE, readBodyWithLimit, str } from "../../../src/lib/itinerary-validate";
import { resolveOwnership, type OwnershipEnv } from "../../_lib/ownership.ts";
import {
  DEVICE_PHOTO_LIMIT, ITINERARY_PHOTO_LIMIT, PHOTO_BUCKET, makeStoragePath,
} from "../../../src/lib/photo-validate";
import { totalPhotoCount, remainingSlots } from "../../../src/lib/trip-moments/photo-set";
import { isMissingColumnError } from "../../../src/lib/trip-moments/stop-binding";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
interface PagesCtx { request: Request; env: Env }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function adminClient(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** 기록 메모 한도(memo-patch-core 와 같은 2000자). 넘으면 자르지 않고 옮기지 않는다. */
const MEMO_MAX = 2000;

export async function onRequestPost(ctx: PagesCtx): Promise<Response> {
  const own = await resolveOwnership(ctx.env as OwnershipEnv, ctx.request);
  if (!own.ok) return own.response;
  const deviceId = own.currentDevice;
  const deviceScope = own.devices;

  const read = await readBodyWithLimit(ctx.request, 4 * 1024);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body as Record<string, unknown>;
  const itineraryId = str(body.itinerary_id, 36);
  const spotId      = str(body.user_spot_id, 36);
  const momentId    = str(body.moment_id, 36);
  if (!UUID_RE.test(itineraryId) || !UUID_RE.test(spotId) || !UUID_RE.test(momentId)) {
    return json({ error: "Invalid id" }, 400);
  }
  const dayNumber = typeof body.day_number === "number" && Number.isInteger(body.day_number) && body.day_number >= 1 && body.day_number <= 60
    ? body.day_number : null;
  const capturedAt = str(body.captured_at, 30);

  let admin;
  try { admin = adminClient(ctx.env); }
  catch { return json({ error: "Server configuration error" }, 503); }

  const [{ data: itin }, { data: spot }] = await Promise.all([
    admin.from("itineraries").select("id").eq("id", itineraryId).in("device_id", deviceScope).maybeSingle(),
    admin.from("user_spots")
      .select("id, name, display_title, display_memo, note, address, lat, lng, photo_storage_path")
      .eq("id", spotId).in("device_id", deviceScope).maybeSingle(),
  ]);
  if (!itin || !spot) return json({ error: "Not found" }, 404);
  const s = spot as {
    id: string; name: string | null; display_title: string | null; display_memo: string | null;
    note: string | null; address: string | null; lat: number | null; lng: number | null; photo_storage_path: string | null;
  };

  const stopKey = `user_spot:${s.id}`;

  // 이미 있으면 그대로 — 두 번 눌러도 기록이 둘이 되지 않는다.
  const { data: existing, error: exErr } = await admin
    .from("trip_moments").select("moment_id")
    .eq("itinerary_id", itineraryId).eq("stop_key", stopKey).in("device_id", deviceScope)
    .limit(1).maybeSingle();
  if (exErr && !isMissingColumnError(exErr)) {
    console.error("[trip-moments/from-user-spot] existing read error:", exErr.code);
    return json({ error: "Server error" }, 500);
  }
  if (existing) return json({ moment_id: (existing as { moment_id: string }).moment_id, existed: true, photos_copied: 0, photos_failed: 0 });

  // 장소 사진 경로(1번 대표 → 2·3번)
  const paths: string[] = [];
  if (s.photo_storage_path) paths.push(s.photo_storage_path);
  const { data: kids } = await admin
    .from("user_spot_photos").select("storage_path, sort_index")
    .eq("spot_id", s.id).order("sort_index", { ascending: true });
  for (const k of kids ?? []) paths.push((k as { storage_path: string }).storage_path);

  const memoSrc = (s.display_memo ?? "").trim() || (s.note ?? "").trim();
  const placeName = ((s.display_title ?? "").trim() || (s.name ?? "").trim() || (s.address ?? "").trim()).slice(0, 200);

  const row: Record<string, unknown> = {
    moment_id:      momentId,
    itinerary_id:   itineraryId,
    device_id:      deviceId,
    memo:           memoSrc.length <= MEMO_MAX ? memoSrc : "",
    category:       "random",
    location_label: placeName,
    captured_at:    capturedAt || new Date().toISOString(),
    stop_key:       stopKey,
    ...(placeName ? { place_name: placeName } : {}),
    ...(dayNumber !== null ? { day_number: dayNumber } : {}),
    ...(typeof s.lat === "number" && typeof s.lng === "number" ? { lat: s.lat, lng: s.lng } : {}),
  };
  const { error: insErr } = await admin.from("trip_moments").insert(row);
  if (insErr) {
    console.error("[trip-moments/from-user-spot] insert error:", insErr.code);
    return json({ error: "Failed to save moment" }, 500);
  }

  // 사진 복사 — 한도 안에서만. 한 장이 실패해도 기록과 다른 사진은 남는다.
  let copied = 0, failed = 0;
  if (paths.length > 0) {
    const [devLegacy, devChild, itinLegacy, itinChild] = await Promise.all([
      admin.from("trip_moments").select("moment_id", { count: "exact", head: true }).in("device_id", deviceScope).not("storage_path", "is", null),
      admin.from("trip_moment_photos").select("photo_id", { count: "exact", head: true }).in("device_id", deviceScope),
      admin.from("trip_moments").select("moment_id", { count: "exact", head: true }).eq("itinerary_id", itineraryId).not("storage_path", "is", null),
      admin.from("trip_moment_photos").select("photo_id", { count: "exact", head: true }).eq("itinerary_id", itineraryId),
    ]);
    const room = Math.min(
      remainingSlots(totalPhotoCount(devLegacy.count ?? 0, devChild.count ?? 0), DEVICE_PHOTO_LIMIT),
      remainingSlots(totalPhotoCount(itinLegacy.count ?? 0, itinChild.count ?? 0), ITINERARY_PHOTO_LIMIT),
    );
    let first = true, sort = 1;
    for (let i = 0; i < paths.length; i++) {
      if (i >= room) { failed++; continue; }
      const to = makeStoragePath(itineraryId, momentId, crypto.randomUUID());
      const { error: cpErr } = await admin.storage.from(PHOTO_BUCKET).copy(paths[i], to);
      if (cpErr) { console.error("[trip-moments/from-user-spot] copy error:", cpErr.message); failed++; continue; }
      const { error: dbErr } = first
        ? await admin.from("trip_moments").update({ storage_path: to }).eq("moment_id", momentId).in("device_id", deviceScope)
        : await admin.from("trip_moment_photos").insert({
            moment_id: momentId, itinerary_id: itineraryId, device_id: deviceId, storage_path: to, sort_index: sort,
          });
      if (dbErr) {
        await admin.storage.from(PHOTO_BUCKET).remove([to]);
        console.error("[trip-moments/from-user-spot] photo db error:", dbErr.code);
        failed++;
        continue;
      }
      if (first) first = false; else sort++;
      copied++;
    }
  }

  return json({ moment_id: momentId, existed: false, photos_copied: copied, photos_failed: failed }, 201);
}

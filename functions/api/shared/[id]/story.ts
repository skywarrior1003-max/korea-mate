// Cloudflare Pages Function: GET /api/shared/:id/story
//
// 공개된 일정을 브라우저에 돌려준다. 정제한 것만 돌려준다.
//
// 왜 서버를 거치나
//   예전에는 브라우저가 Supabase RPC 를 직접 불러 `days` 원본을 통째로 받았다.
//   화면이 쓰지 않는 좌표·지도 링크·내부 식별자가 함께 나갔고, My Place 를
//   담은 일정이라면 그 장소의 비공개 메모까지 실렸다. 정제를 서버에서 한 번
//   하면 브라우저는 애초에 그것들을 받지 못한다.
//
// SECURITY CONTRACT:
// - is_public = true 인 행만 읽는다. 비공개·미존재는 똑같이 404 (존재 여부 누출 방지)
// - `days` 원본을 응답에 담지 않는다 — serializePublicItinerary 를 통과한 값만 나간다
// - device_id·email·is_public·copy_of 는 조회 자체를 하지 않는다 (PUBLIC_SELECT_COLUMNS)
// - service_role 키는 서버에만 있고 응답·오류 메시지에 담기지 않는다
// - DB 오류는 code 만 로그에 남기고 본문은 일반 문구로 답한다
//
// Memory 는 여기서만 나간다
//   `memories` 는 **여행이 공개이고 + 그 Memory 를 골랐고 + 동의 판본이 맞는**
//   것만 담는다. 하나도 없으면 빈 배열이고 오류가 아니다. 사진은 주소 대신
//   되돌릴 수 없는 값 하나로 나가고, 실제 바이트는 이미지 프록시가 매 요청
//   권한을 다시 보고 내준다.
//
// 아직 남은 것
//   `get_shared_itinerary` 의 anon EXECUTE 는 그대로다. 이 경로를 쓰지 않고
//   RPC 를 직접 부르면 여전히 원본이 나온다. 권한 회수는 이 경로가 운영에서
//   정상 동작하는 것을 확인한 뒤 다음 작업에서 한다.

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { serializePublicItinerary, PUBLIC_SELECT_COLUMNS } from "../../../../src/lib/share/public-story";
import {
  serializePublicMemories, PUBLIC_MEMORY_SELECT_COLUMNS,
  isMemoryPublic, type InternalMemoryRow, type InternalPhotoRow,
} from "../../../../src/lib/share/public-memory";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "../../../../src/lib/trip-moments/public-consent-core";
import { mergePhotoSet, type ChildPhotoRow } from "../../../../src/lib/trip-moments/photo-set";

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
    headers: {
      "Content-Type":  "application/json",
      // 공개 일정은 제목·조회수가 바뀐다. 짧게만 캐시한다.
      "Cache-Control": "public, max-age=0, s-maxage=60, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const raw = ctx.params["id"];
  const id  = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  if (!UUID_RE.test(id)) return json({ error: "Not found" }, 404);

  const url = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: "Server configuration error" }, 503);

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("itineraries")
    .select(PUBLIC_SELECT_COLUMNS)
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    console.error("[shared story GET] db error:", error.code);
    return json({ error: "Failed to load itinerary" }, 500);
  }
  if (!data) return json({ error: "Not found" }, 404);

  const itinerary = serializePublicItinerary(data);

  // ── 공개된 Memory ────────────────────────────────────────────────────────
  // 여기까지 왔다는 것은 여행이 공개라는 뜻이다(위에서 is_public 을 걸었다).
  // 그래도 Memory 쪽 조건은 따로 본다 — 여행 공개가 Memory 공개는 아니다.
  const { data: momentRows, error: mErr } = await admin
    .from("trip_moments")
    .select(PUBLIC_MEMORY_SELECT_COLUMNS)
    .eq("itinerary_id", id)
    .eq("is_public", true);

  if (mErr) {
    // Memory 를 못 읽었다고 일정 전체를 막지 않는다 — 빈 목록으로 내보낸다.
    console.error("[shared story GET] memory read error:", mErr.code);
    return json({ ...itinerary, memories: [] });
  }

  const rows = ((momentRows ?? []) as unknown as InternalMemoryRow[])
    .filter(r => isMemoryPublic(r, MEMORY_PUBLIC_CONSENT_VERSION));

  if (rows.length === 0) return json({ ...itinerary, memories: [] });

  // 사진 순서는 소유자 화면과 같은 규칙을 쓴다 — 따로 만들지 않는다.
  const ids = rows.map(r => r.moment_id);
  const { data: photoRows } = await admin
    .from("trip_moment_photos")
    .select("photo_id, moment_id, storage_path, sort_index, created_at")
    .in("moment_id", ids);

  const childByMoment = new Map<string, ChildPhotoRow[]>();
  for (const p of (photoRows ?? []) as unknown as InternalPhotoRow[]) {
    const list = childByMoment.get(p.moment_id) ?? [];
    list.push(p as ChildPhotoRow);
    childByMoment.set(p.moment_id, list);
  }

  const photoPathsByMoment = new Map<string, string[]>();
  for (const r of rows) {
    photoPathsByMoment.set(
      r.moment_id,
      mergePhotoSet(r.storage_path, childByMoment.get(r.moment_id) ?? []).map(s => s.path),
    );
  }

  // 사라진 공식 장소는 열쇠만 빠진다 — Story 는 그대로 나간다.
  const spotIds = [...new Set(rows.map(r => r.city_spot_id).filter((n): n is number => typeof n === "number"))];
  let validCitySpotIds: Set<number> | undefined;
  if (spotIds.length > 0) {
    const { data: spots } = await admin.from("city_spots").select("id").in("id", spotIds);
    validCitySpotIds = new Set(((spots ?? []) as { id: number }[]).map(s => s.id));
  }

  const memories = await serializePublicMemories({
    itineraryId: id,
    rows,
    photoPathsByMoment,
    consentVersion: MEMORY_PUBLIC_CONSENT_VERSION,
    validCitySpotIds,
  });

  return json({ ...itinerary, memories });
}

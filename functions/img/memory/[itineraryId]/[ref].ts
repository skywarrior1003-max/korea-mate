// Cloudflare Pages Function: GET /img/memory/:itineraryId/:ref
//
// 공개 Story 의 Memory 사진을 내준다. 버킷은 계속 비공개다 — 이 서버만 읽는다.
//
// 왜 매번 다시 보나
//   한 번 통과한 주소가 계속 열려 있으면, 사용자가 공개를 끄거나 여행을
//   비공개로 되돌려도 사진이 계속 나간다. 그래서 요청마다 처음부터 확인한다:
//   여행이 공개인가 → 그 Memory 를 골랐는가 → 동의 판본이 맞는가 → 그 사진이
//   정말 그 Memory 것인가. 커버 프록시가 쓰는 방식과 같다.
//
// `ref` 가 무엇인가
//   저장 경로도 moment id 도 photo id 도 아니다. 그 셋을 섞어 만든 되돌릴 수
//   없는 값이다. 서버가 그 여행의 공개 사진들을 훑어 같은 값을 다시 계산해
//   맞춰 본다 — 맞는 것이 없으면 없는 사진이다. 그래서
//   ① 값에서 경로를 복원할 수 없고
//   ② 다른 여행·다른 Memory 의 값을 들고 와도 맞지 않고
//   ③ 비공개 Memory 의 사진은 애초에 비교 대상에 들어오지 않는다.
//   경로를 요청에서 받지 않으므로 임의 파일을 집어 오게 만들 수도 없다.
//
// SECURITY CONTRACT:
// - x-device-id 를 요구하지 않는다 (공개 경로다). 대신 소유자 API 는 그대로 잠겨 있다
// - private 버킷을 service_role 로 읽고 **바이트만** 돌려준다
// - 저장 경로·moment id·photo id·device_id 를 응답 본문·헤더 어디에도 담지 않는다
// - 차단 사유를 구분해 알려 주지 않는다 — 전부 같은 404 (존재 여부 누출 방지)
// - Content-Type 은 image/jpeg 고정 (moments 버킷은 JPEG 전용)
// - 짧은 공개 캐시 — 공개를 끄면 곧 막힌다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../../src/lib/itinerary-validate";
import { PHOTO_BUCKET } from "../../../../src/lib/photo-validate";
import {
  photoRef, isPhotoRef, isMemoryPublic,
  PUBLIC_MEMORY_SELECT_COLUMNS, type InternalMemoryRow, type InternalPhotoRow,
} from "../../../../src/lib/share/public-memory";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "../../../../src/lib/trip-moments/public-consent-core";
import { mergePhotoSet, type ChildPhotoRow } from "../../../../src/lib/trip-moments/photo-set";

/** 커버 프록시와 같은 짧은 공개 캐시 — 공개를 끄면 곧 반영된다 */
const PUBLIC_CACHE = "public, max-age=0, s-maxage=60, must-revalidate";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string | string[]>;
}

/** 막힌 이유를 구분해 주지 않는다 — 비공개인지 없는지 알려 주면 그것도 정보다 */
function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" },
  });
}

const one = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v : (v?.[0] ?? "");

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const itineraryId = one(ctx.params["itineraryId"]);
  const ref         = one(ctx.params["ref"]);
  if (!UUID_RE.test(itineraryId)) return notFound();
  if (!isPhotoRef(ref))           return notFound();

  const url = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return notFound();

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ① 여행이 공개인가
  const { data: itin } = await admin
    .from("itineraries").select("id").eq("id", itineraryId).eq("is_public", true).maybeSingle();
  if (!itin) return notFound();

  // ② 그 여행에서 공개로 고른 Memory 들
  const { data: momentRows } = await admin
    .from("trip_moments")
    .select(PUBLIC_MEMORY_SELECT_COLUMNS)
    .eq("itinerary_id", itineraryId)
    .eq("is_public", true);

  // ③ 동의 판본까지 맞는 것만 남긴다
  const rows = ((momentRows ?? []) as unknown as InternalMemoryRow[])
    .filter(r => isMemoryPublic(r, MEMORY_PUBLIC_CONSENT_VERSION));
  if (rows.length === 0) return notFound();

  const { data: photoRows } = await admin
    .from("trip_moment_photos")
    .select("photo_id, moment_id, storage_path, sort_index, created_at")
    .in("moment_id", rows.map(r => r.moment_id));

  const childByMoment = new Map<string, ChildPhotoRow[]>();
  for (const p of (photoRows ?? []) as unknown as InternalPhotoRow[]) {
    const list = childByMoment.get(p.moment_id) ?? [];
    list.push(p as ChildPhotoRow);
    childByMoment.set(p.moment_id, list);
  }

  // ④ 공개 대상 사진들만 같은 식으로 값을 계산해 맞춰 본다.
  //    비공개 Memory 의 사진은 여기 들어오지도 않는다.
  let match: string | null = null;
  for (const r of rows) {
    for (const slot of mergePhotoSet(r.storage_path, childByMoment.get(r.moment_id) ?? [])) {
      if (await photoRef(itineraryId, r.moment_id, slot.path) === ref) { match = slot.path; break; }
    }
    if (match) break;
  }
  if (!match) return notFound();

  // ⑤ 비공개 버킷에서 바이트만 가져온다
  const { data: blob, error } = await admin.storage.from(PHOTO_BUCKET).download(match);
  if (error || !blob) {
    // 지워진 사진이면 여기로 온다. 내부 경로는 로그에도 남기지 않는다.
    console.error("[memory img] download failed");
    return notFound();
  }

  return new Response(await blob.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type":           "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":          PUBLIC_CACHE,
    },
  });
}

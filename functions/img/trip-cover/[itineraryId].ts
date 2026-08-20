// Cloudflare Pages Function: GET /img/trip-cover/:itineraryId
//
// 공개 일정의 커버 이미지를 결정해 돌려준다.
//   유효한 개인 Memory 사진  → private moments 버킷 JPEG bytes
//   auto / asset / 개인 무효 → 관광 자산 bytes 직접 200 (V1A 프록시와 동일 검증)
//   비공개 · 미존재 · 오류    → 브랜드 SVG 200
//
// TASK-SHARE-OG-PREVIEW-FIX-01: 예전에는 관광 커버를 302 → /img/cover/:assetId
// 로 넘겼지만, 일부 메신저 크롤러가 og:image 의 redirect 를 따라가지 않아
// 미리보기가 빈 회색으로 나왔다. 이제 모든 분기가 이미지 bytes 를 직접 200 으로
// 반환한다 — 이 함수는 redirect 를 전혀 내보내지 않는다.
//
// SECURITY CONTRACT:
// - 입력은 itineraryId 하나뿐. URL·경로·파일명을 클라이언트가 지정할 수 없다
// - 개인 사진은 매 요청 is_public·cover_kind·동의·일정 일치·기기 일치를 재검증
// - signed URL·storage_path 를 응답 본문·헤더·오류에 노출하지 않는다
// - 관광 자산 원본은 asset-proxy 코어가 V1A 와 같은 허용 목록·MIME·크기로 검증
// - trip_moments.is_public 은 읽지 않는다
// - redirect 없음: 외부 URL 은 물론 같은 도메인으로도 redirect 하지 않는다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../src/lib/itinerary-validate";
import { COVER_ASSETS } from "../../../src/lib/trip-cover/assets.data";
import { resolveTourismCoverAsset } from "../../../src/lib/trip-cover/cover-core";
import type { CoverAsset } from "../../../src/lib/trip-cover/cover-core";
import { fetchApprovedAssetBytes } from "../../../src/lib/trip-cover/asset-proxy";
import { coverETag, etagMatches, resolveEffectiveCover } from "../../../src/lib/trip-cover/cover-state-core";
import type { ItineraryCoverRow, CoverAdminLike } from "../../../src/lib/trip-cover/cover-state-core";

const PHOTO_BUCKET = "moments";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL:  string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface PagesCtx {
  request: Request;
  env:     Env;
  params:  Record<string, string | string[]>;
}

/** 개인 사진 캐시 — 공개 철회를 반영해야 하므로 브라우저는 매번 재검증한다 */
const PERSONAL_CACHE = "public, max-age=0, s-maxage=60, must-revalidate";

function brandFallback(): Response {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#191C21"/><stop offset="0.55" stop-color="#2A1D1A"/>` +
    `<stop offset="1" stop-color="#FF4A2D"/></linearGradient></defs>` +
    `<rect width="1200" height="630" fill="url(#g)"/>` +
    `<rect x="0" y="0" width="10" height="630" fill="#FF4A2D"/></svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type":           "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":          "public, max-age=60",
    },
  });
}

/**
 * 관광 자산 bytes 를 직접 200 으로 서빙한다 (예전 302 → /img/cover 대체).
 * 커버 상태가 바뀌면 응답이 달라져야 하므로 예전 redirect 와 같은 재검증 캐시
 * 계약을 유지한다 — 장기/immutable 캐시 금지. edge 60초는 크롤러 burst 흡수용.
 */
async function serveTourismAsset(asset: CoverAsset): Promise<Response> {
  const r = await fetchApprovedAssetBytes(asset.image_url);
  if (!r.ok) return brandFallback();
  return new Response(r.buf, {
    status: 200,
    headers: {
      "Content-Type":           r.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":          "public, max-age=0, s-maxage=60, must-revalidate",
    },
  });
}

/** auto/asset → 표시할 관광 자산 결정 (cover-core 공용 순수 함수 — OG 메타와 동일 결정) */
function resolveTourismAsset(itin: ItineraryCoverRow, days: unknown): CoverAsset | undefined {
  return resolveTourismCoverAsset(COVER_ASSETS, {
    itineraryId:  itin.id,
    coverKind:    itin.cover_kind,
    coverAssetId: itin.cover_asset_id,
    days,
  });
}

export async function onRequestGet(ctx: PagesCtx): Promise<Response> {
  const raw = ctx.params["itineraryId"];
  const id  = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  if (!UUID_RE.test(id)) return brandFallback();

  const url  = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return brandFallback();
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── 1~4. 조회 + 개인 커버 판정 (cover-kind API 와 동일한 공용 helper) ──────
  const result = await resolveEffectiveCover(id, admin as unknown as CoverAdminLike);
  if (result.status === 404) return brandFallback();   // 비공개·미존재

  if (result.kind === "tourism") {
    const asset = resolveTourismAsset(result.itin, result.days);
    return asset ? serveTourismAsset(asset) : brandFallback();
  }

  const itin: ItineraryCoverRow = result.itin;
  const storagePath = result.storagePath;

  // ── 5. ETag 먼저 — 일치하면 Storage 를 건드리지 않고 304 ───────────────────
  const etag = coverETag(itin, storagePath);
  if (etagMatches(ctx.request.headers.get("If-None-Match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": PERSONAL_CACHE, "X-Content-Type-Options": "nosniff" },
    });
  }

  // ── 6. private 버킷을 service_role 로 읽어 bytes 만 반환 ───────────────────
  const { data: blob, error: dlErr } = await admin.storage
    .from(PHOTO_BUCKET)
    .download(storagePath);

  if (dlErr || !blob) {
    // 파일이 사라졌으면 관광 커버로 — 내부 경로는 로그에도 남기지 않는다
    console.error("[trip-cover] storage download failed for itinerary", itin.id);
    const asset = resolveTourismAsset(itin, result.days);
    return asset ? serveTourismAsset(asset) : brandFallback();
  }

  const buf = await blob.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type":           "image/jpeg",   // moments 버킷은 image/jpeg 전용
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":          PERSONAL_CACHE,
      ETag:                     etag,
    },
  });
}

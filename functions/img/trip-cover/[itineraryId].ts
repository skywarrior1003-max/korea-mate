// Cloudflare Pages Function: GET /img/trip-cover/:itineraryId
//
// 공개 일정의 커버 이미지를 결정해 돌려준다.
//   유효한 개인 Memory 사진  → private moments 버킷 JPEG bytes
//   auto / asset / 개인 무효 → 302 (같은 도메인) /img/cover/:assetId
//   비공개 · 미존재 · 오류    → 브랜드 SVG 200
//
// SECURITY CONTRACT:
// - 입력은 itineraryId 하나뿐. URL·경로·파일명을 클라이언트가 지정할 수 없다
// - 개인 사진은 매 요청 is_public·cover_kind·동의·일정 일치·기기 일치를 재검증
// - signed URL·storage_path 를 응답 본문·헤더·오류에 노출하지 않는다
// - 302 Location 은 같은 도메인 상대 경로만. 외부 URL redirect 금지
// - trip_moments.is_public 은 읽지 않는다
// - 재귀 없음: 이 함수는 자기 자신으로 redirect 하지 않는다

import { createClient } from "@supabase/supabase-js";
import { UUID_RE } from "../../../src/lib/itinerary-validate";
import { COVER_ASSETS, assetById, pickAsset } from "../../../src/lib/trip-cover/assets.data";
import { resolveTheme } from "../../../src/lib/trip-cover/cover-core";
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

/** 같은 도메인 상대 경로로만 이동한다. 최종 이미지는 V1A 의 immutable 캐시를 탄다. */
function toTourismCover(assetId: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location:       `/img/cover/${encodeURIComponent(assetId)}`,
      // redirect 자체는 커버 상태가 바뀌면 달라져야 하므로 장기 캐시하지 않는다
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** auto/asset → 표시할 관광 자산 결정 (V1A 로직 재사용) */
function resolveTourismAsset(itin: ItineraryCoverRow, days: unknown): string | null {
  if (itin.cover_kind === "asset" && itin.cover_asset_id) {
    if (assetById(itin.cover_asset_id)) return itin.cover_asset_id;
    // manifest 에서 사라진 자산이면 auto 로 떨어진다
  }
  const list = Array.isArray(days)
    ? days
    : ((days as { scheduled?: unknown[] } | null)?.scheduled ?? []);
  const places = (list as Array<{ places?: Array<Record<string, unknown>> }>)
    .flatMap((d) => d?.places ?? [])
    .map((p) => ({
      name:     typeof p.name === "string" ? p.name : null,
      category: typeof p.category === "string" ? p.category : null,
      location: typeof p.location === "string" ? p.location : null,
    }));

  const theme = resolveTheme({ places }).theme;
  return pickAsset(itin.id, theme)?.asset_id ?? COVER_ASSETS[0]?.asset_id ?? null;
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
    const assetId = resolveTourismAsset(result.itin, result.days);
    return assetId ? toTourismCover(assetId) : brandFallback();
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
    const assetId = resolveTourismAsset(itin, result.days);
    return assetId ? toTourismCover(assetId) : brandFallback();
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

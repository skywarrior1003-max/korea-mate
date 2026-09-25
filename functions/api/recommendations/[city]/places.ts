// GET /api/recommendations/:city/places?mode=popular|new&page=1&limit=24
// (PAGINATION-AND-NEW-DISCOVERY-V1 §5)
//
// 응답: { items: [{ id, likeCount, usageCount, rank }], page, limit, total, hasMore }
//  · rank = 페이지와 무관한 전역 순위(page 2 첫 rank = page 1 마지막 + 1)
//  · popular: 도시 전체 적격 후보(반응 0 포함) — RPC community_rank_places
//  · new: 최근 60일 게시 연결 장소(pool ≤ 1000) — RPC community_rank_new_places,
//    기준 시각은 서버 UTC(p_now — 사용자 입력이 아니다)
//  · limit 최대 30 · score/dislike/freshness 비반환

import { resolveCitySlug } from "../../../../src/data/cities/identity";
import { clampPage, clampPublicLimit } from "../../../../src/lib/community/ranking-page-core";
import {
  type RecoEnv, rankPlacesPage, rankNewPlacesPage,
} from "../../../../src/lib/community/recommendations-server";

type Ctx = { request: Request; env: RecoEnv; params: { city: string } };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0, s-maxage=60" },
  });
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "server_error" }, 503);
  }
  const city = resolveCitySlug(ctx.params.city);
  if (!city) return json({ error: "unsupported_city" }, 404);
  const u = new URL(ctx.request.url);
  const mode = u.searchParams.get("mode") === "new" ? "new" : "popular";
  const page = clampPage(u.searchParams.get("page"));
  const limit = clampPublicLimit(u.searchParams.get("limit"));
  const offset = (page - 1) * limit;

  const result = mode === "new"
    ? await rankNewPlacesPage(env, city, new Date().toISOString(), limit, offset)
    : await rankPlacesPage(env, city, limit, offset);
  if (!result) return json({ error: "server_error" }, 500);

  return json({
    items: result.items,
    page, limit,
    total: result.total,
    hasMore: offset + result.items.length < result.total,
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
}

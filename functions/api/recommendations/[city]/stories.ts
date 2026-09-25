// GET /api/recommendations/:city/stories?mode=popular|new&page=1&limit=24
// (PAGINATION-AND-NEW-DISCOVERY-V1 §5·§7)
//
// 응답: { items: [{ id, title, days, stops, likeCount, copyCount, approvedAt, cover, rank }],
//         page, limit, total, hasMore }
//  · popular: 승인 ∩ 공개·비가림 Story 전체의 기존 score 순위
//  · new: first_approved_at 실재(소급 금지) ∩ 60일 창 ∩ 공개 moment 존재.
//    공식 코스는 이 집합에 존재하지 않는다. 재승인은 신규 시각을 만들지 않는다
//    (first_approved_at 은 DB 트리거가 1회만 기록·불변).
//  · rank = 전역 순위 · score/dislike/freshness 비반환 · limit 최대 30

import { resolveCitySlug } from "../../../../src/data/cities/identity";
import { clampPage, clampPublicLimit, paginateRanked } from "../../../../src/lib/community/ranking-page-core";
import {
  type RecoEnv, loadStoryCandidates, rankStoriesPopular, rankStoriesNew,
  serializeStoryCard, coverRefByStory,
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

  const cands = await loadStoryCandidates(env, city);
  const ranked = mode === "new" ? rankStoriesNew(cands, Date.now()) : rankStoriesPopular(cands);
  const pageOut = paginateRanked(ranked, page, limit);
  // cover 는 현재 페이지 카드에만(≤limit≤30) — 페이지당 비용 상수화
  const covers = await coverRefByStory(env, pageOut.items.map(r => r.id));
  return json({
    items: pageOut.items.map(r => ({
      ...serializeStoryCard(r, covers.get(r.id) ? `/img/memory/${r.id}/${covers.get(r.id)}` : null),
      rank: r.rank,
    })),
    page: pageOut.page,
    limit: pageOut.limit,
    total: pageOut.total,
    hasMore: pageOut.hasMore,
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
}

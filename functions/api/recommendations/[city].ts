// Cloudflare Pages Function — GET /api/recommendations/:city
// (COMMUNITY-V1 §6 → COLD-START-V1 → PAGINATION-AND-NEW-DISCOVERY-V1 §5)
//
// Hub 용 결합 응답(하위호환 유지):
//   GET /api/recommendations/busan?limit=3
//   → { stories: [{ id, title, days, stops, likeCount, copyCount, approvedAt, cover }],
//       places:  [{ id, likeCount, usageCount, rank }] }
//
// 계약
//  · 장소 순위는 DB RPC(071)가 **도시 전체 적격 집합** 기준으로 확정한다.
//    Worker 는 상위 limit 행만 받는다 — PostgREST max-rows(1000) 절단이
//    seoul(1846)·jeju(1496)에서 846/496개를 누락시키던 구조의 근본 수정.
//  · 페이지 목록(인기|신규·page·limit)은 /:city/places · /:city/stories 가 담당.
//  · score·싫어요 수·freshness 는 어떤 응답에도 없다(§6).
//  · public limit 은 최대 30 — 큰 값을 보내도 초과 반환하지 않는다.

import { resolveCitySlug } from "../../../src/data/cities/identity";
import { clampPublicLimit } from "../../../src/lib/community/ranking-page-core";
import {
  type RecoEnv, rankPlacesPage, loadStoryCandidates, rankStoriesPopular,
  serializeStoryCard, coverRefByStory,
} from "../../../src/lib/community/recommendations-server";

type Ctx = { request: Request; env: RecoEnv; params: { city: string } };

/** cover 계산 상한 — 카드에 이미지가 필요한 상위권만(비용 방어) */
const COVER_MAX_STORIES = 12;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // 순위는 초 단위 실시간일 필요가 없다 — 짧은 공유 캐시로 폭주만 막는다.
      "Cache-Control": "public, max-age=0, s-maxage=60",
    },
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
  const limit = clampPublicLimit(u.searchParams.get("limit"));

  // ── 여행자 추천 코스 = 승인된 공개 Story (인기 순위 상위 limit) ──
  const cands = await loadStoryCandidates(env, city);
  const rankedStories = rankStoriesPopular(cands).slice(0, limit);
  const covers = await coverRefByStory(env, rankedStories.slice(0, COVER_MAX_STORIES).map(r => r.id));
  const stories = rankedStories.map(r => {
    const ref = covers.get(r.id);
    return serializeStoryCard(r, ref ? `/img/memory/${r.id}/${ref}` : null);
  });

  // ── 추천 장소 — 전체 적격 집합 기준의 전역 순위 상위 limit(RPC) ──
  const placePage = await rankPlacesPage(env, city, limit, 0);
  if (!placePage) return json({ error: "server_error" }, 500);

  return json({ stories, places: placePage.items });
}

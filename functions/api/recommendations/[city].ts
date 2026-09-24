// Cloudflare Pages Function — GET /api/recommendations/:city
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §6)
//
// 지역별 커뮤니티 추천 순위 — 서버가 신뢰원이다. 클라이언트가 보낸 count·score
// 는 존재하지 않는다(전부 서버 집계).
//
//   GET /api/recommendations/busan?limit=20
//   → { stories: [{ id, title, days, stops, likeCount, copyCount, approvedAt }],
//       places:  [{ id, likeCount, usageCount }] }
//
// 계약
//  · stories = story_submissions approved ∩ 지금도 공개·비가림인 Story 만.
//    Story 본문·사진·메모는 싣지 않는다 — 카드가 필요한 제목·규모만.
//  · 정렬은 score(like−dislike+3×고유활용) 순이지만 **score·싫어요 수는 응답에
//    없다** — 공개 숫자는 좋아요·활용뿐(§3-4). score 를 주면 싫어요가 역산된다.
//  · places = 반응이 실제로 존재하는 장소의 순위(전체보기용). 없으면 빈 배열 —
//    화면은 기존 seed 를 그대로 쓴다(초기 콘텐츠 유지 §1).

import {
  compareRanked, type RankInput,
} from "../../../src/lib/community/community-core";
import { resolveCitySlug } from "../../../src/data/cities/identity";

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env; params: { city: string } };

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

async function rest(env: Env, pathQ: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: false, data: null }; }
}

const rows = (r: { ok: boolean; data: unknown }): Record<string, unknown>[] =>
  r.ok && Array.isArray(r.data) ? r.data as Record<string, unknown>[] : [];

function tally(list: Record<string, unknown>[], key = "target_key"): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of list) {
    const k = String(row[key] ?? "");
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env } = ctx;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "server_error" }, 503);
  }
  const city = resolveCitySlug(ctx.params.city);
  if (!city) return json({ error: "unsupported_city" }, 404);
  const u = new URL(ctx.request.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 20, 1), 50);

  // ── 여행자 추천 코스 = 승인된 공개 Story ──────────────────────────────────
  const subs = rows(await rest(env,
    `story_submissions?city=eq.${city}&status=eq.approved&select=itinerary_id,decided_at&limit=200`));
  const subById = new Map(subs.map(s => [String(s.itinerary_id), String(s.decided_at ?? "")]));
  let stories: unknown[] = [];
  if (subById.size > 0) {
    const idList = [...subById.keys()].map(encodeURIComponent).join(",");
    // 승인 뒤 비공개·가림으로 바뀐 Story 는 지금 이 자리에서 걸러진다(§5-2).
    const trips = rows(await rest(env,
      `itineraries?id=in.(${idList})&is_public=eq.true&moderation_hidden_at=is.null` +
      `&select=id,trip_title,days,copy_of&limit=200`));
    const liveIds = trips.map(t => String(t.id));
    if (liveIds.length > 0) {
      const inList = liveIds.map(encodeURIComponent).join(",");
      const [likes, dislikes, copies] = await Promise.all([
        rest(env, `content_likes?target_type=eq.story&target_key=in.(${inList})&select=target_key&limit=10000`),
        rest(env, `content_dislikes?target_type=eq.story&target_key=in.(${inList})&select=target_key&limit=10000`),
        rest(env, `itineraries?copy_of=in.(${inList})&select=copy_of,device_id&limit=10000`),
      ]);
      const likeBy = tally(rows(likes));
      const dislikeBy = tally(rows(dislikes));
      // 고유 활용 = 원본별 **복사한 기기 수**(같은 사람이 여러 번 복사해도 1)
      const usageBy = new Map<string, Set<string>>();
      for (const c of rows(copies)) {
        const src = String(c.copy_of ?? ""); const dev = String(c.device_id ?? "");
        if (!src || !dev) continue;
        if (!usageBy.has(src)) usageBy.set(src, new Set());
        usageBy.get(src)!.add(dev);
      }
      const ranked: (RankInput & { trip: Record<string, unknown> })[] = trips.map(t => {
        const id = String(t.id);
        return {
          id,
          likes:    likeBy.get(id) ?? 0,
          dislikes: dislikeBy.get(id) ?? 0,
          usage:    usageBy.get(id)?.size ?? 0,
          approvedAt: subById.get(id) ?? null,
          trip: t,
        };
      }).sort(compareRanked);
      stories = ranked.slice(0, limit).map(r => {
        const days = r.trip.days;
        const dayList = Array.isArray(days) ? days
          : (days && typeof days === "object" && Array.isArray((days as { scheduled?: unknown[] }).scheduled))
            ? (days as { scheduled: unknown[] }).scheduled : [];
        let stops = 0;
        for (const d of dayList) {
          const p = (d && typeof d === "object") ? (d as { places?: unknown }).places : null;
          if (Array.isArray(p)) stops += p.length;
        }
        return {
          id: r.id,
          title: typeof r.trip.trip_title === "string" ? r.trip.trip_title : null,
          days: dayList.length,
          stops,
          likeCount: r.likes,
          copyCount: r.usage,
          approvedAt: r.approvedAt,
        };
      });
    }
  }

  // ── 추천 장소 순위 — 반응이 실제로 있는 장소만(없으면 화면은 seed 유지) ──
  const cityLikes = rows(await rest(env,
    `place_likes?target_type=eq.city_spot&select=target_key&limit=10000`));
  const cityDislikes = rows(await rest(env,
    `content_dislikes?target_type=eq.city_spot&select=target_key&limit=10000`));
  // COMMUNITY-V2 §2 — 활용 = place_usage(저장 또는 여행 추가, actor 고유·누적형).
  const cityUsage = rows(await rest(env,
    `place_usage?target_type=eq.city_spot&select=target_key&limit=10000`));
  const engaged = new Set([
    ...tally(cityLikes).keys(), ...tally(cityDislikes).keys(), ...tally(cityUsage).keys(),
  ]);
  let places: unknown[] = [];
  if (engaged.size > 0) {
    // 이 도시의 공개 장소로 한정한다(다른 도시 반응이 섞이지 않게).
    const idList = [...engaged].filter(k => /^\d{1,10}$/.test(k)).join(",");
    const spots = idList ? rows(await rest(env,
      `city_spots?id=in.(${idList})&city=eq.${city}&is_published=eq.true&select=id&limit=200`)) : [];
    const likeBy = tally(cityLikes); const dislikeBy = tally(cityDislikes); const usageBy = tally(cityUsage);
    const ranked: RankInput[] = spots.map(s => {
      const id = String(s.id);
      return { id, likes: likeBy.get(id) ?? 0, dislikes: dislikeBy.get(id) ?? 0, usage: usageBy.get(id) ?? 0 };
    }).sort(compareRanked);
    places = ranked.slice(0, limit).map(r => ({
      id: Number(r.id), likeCount: r.likes, usageCount: r.usage,
    }));
  }

  return json({ stories, places });
}

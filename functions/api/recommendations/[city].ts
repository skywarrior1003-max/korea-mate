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
  compareRanked, comparePlaceRanked, type RankInput, type PlaceRankInput,
} from "../../../src/lib/community/community-core";
import { resolveCitySlug } from "../../../src/data/cities/identity";
// COLD-START-RANKING-POLICY-V1 §2-2 — 반응 0 상태의 순위 기준은 기존
// official/editorial 추천 순서다(Hub Owner 확정 순서 → canonical 연결 순서).
// 서버가 이 순서를 tie-break 로 써서 **도시 전체 후보의 최종 연속 순위**를
// 결정한다 — 클라이언트는 재정렬하지 않는다.
// regional-recommendations 를 직접 import 하지 않는 이유는 editorial-order-core 참조
// (CF CI Functions 번들러가 json import attribute 를 파싱하지 못한다).
import { editorialSpotOrder } from "../../../src/lib/community/editorial-order-core";
// 대표 이미지(§7-2) — 공개 Story 와 완전히 같은 동의 필터·순서·ref 규칙을 쓴다.
// 새 규칙을 만들지 않는다: isMemoryPublic(동의 판본)·orderMemories·photoRef 재사용.
import {
  isMemoryPublic, orderMemories, photoRef, type InternalMemoryRow, type InternalPhotoRow,
} from "../../../src/lib/share/public-memory";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "../../../src/lib/trip-moments/public-consent-core";
import { mergePhotoSet, type ChildPhotoRow } from "../../../src/lib/trip-moments/photo-set";

/** cover 계산 상한 — 카드에 이미지가 필요한 상위권만(비용 방어) */
const COVER_MAX_STORIES = 12;

/**
 * 각 Story 의 대표 이미지 ref (`/img/memory/:id/:ref` 로 조립할 값).
 * 공개 moment(현재 동의 판본) 중 소유자 화면과 같은 순서에서 사진이 있는 첫 장.
 * 없으면 없는 대로 둔다 — 이미지를 지어내지 않는다.
 */
async function coverRefByStory(env: Env, storyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (storyIds.length === 0) return out;
  const inList = storyIds.map(encodeURIComponent).join(",");
  const moments = rows(await rest(env,
    `trip_moments?itinerary_id=in.(${inList})&is_public=eq.true` +
    `&select=moment_id,itinerary_id,day_number,captured_at,storage_path,is_public,public_consent_at,public_consent_version&limit=2000`));
  const eligible = (moments as unknown as (InternalMemoryRow & { itinerary_id: string })[])
    .filter(r => isMemoryPublic(r, MEMORY_PUBLIC_CONSENT_VERSION));
  if (eligible.length === 0) return out;
  const momentIds = eligible.map(r => r.moment_id).map(encodeURIComponent).join(",");
  const photos = rows(await rest(env,
    `trip_moment_photos?moment_id=in.(${momentIds})&select=photo_id,moment_id,storage_path,sort_index,created_at&limit=4000`));
  const childByMoment = new Map<string, ChildPhotoRow[]>();
  for (const p of photos as unknown as InternalPhotoRow[]) {
    const list = childByMoment.get(p.moment_id) ?? [];
    list.push(p as ChildPhotoRow);
    childByMoment.set(p.moment_id, list);
  }
  const byStory = new Map<string, (InternalMemoryRow & { itinerary_id: string })[]>();
  for (const r of eligible) {
    const list = byStory.get(r.itinerary_id) ?? [];
    list.push(r);
    byStory.set(r.itinerary_id, list);
  }
  for (const [storyId, list] of byStory) {
    for (const r of orderMemories(list)) {
      const paths = mergePhotoSet(r.storage_path, childByMoment.get(r.moment_id) ?? []).map(s => s.path);
      if (paths.length === 0) continue;
      out.set(storyId, await photoRef(storyId, r.moment_id, paths[0]));
      break;
    }
  }
  return out;
}

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
      const top = ranked.slice(0, limit);
      const covers = await coverRefByStory(env, top.slice(0, COVER_MAX_STORIES).map(r => r.id));
      stories = top.map(r => {
        const days = r.trip.days;
        const dayList = Array.isArray(days) ? days
          : (days && typeof days === "object" && Array.isArray((days as { scheduled?: unknown[] }).scheduled))
            ? (days as { scheduled: unknown[] }).scheduled : [];
        let stops = 0;
        for (const d of dayList) {
          const p = (d && typeof d === "object") ? (d as { places?: unknown }).places : null;
          if (Array.isArray(p)) stops += p.length;
        }
        const ref = covers.get(r.id);
        return {
          id: r.id,
          title: typeof r.trip.trip_title === "string" ? r.trip.trip_title : null,
          days: dayList.length,
          stops,
          likeCount: r.likes,
          copyCount: r.usage,
          approvedAt: r.approvedAt,
          // 되돌릴 수 없는 ref 로 조립한 공개 프록시 경로 — 저장 경로·moment id 비노출
          cover: ref ? `/img/memory/${r.id}/${ref}` : null,
        };
      });
    }
  }

  // ── 추천 장소 cold-start 연속 순위 (COLD-START-RANKING-POLICY-V1 §2) ──
  // 도시의 공개 추천 후보 **전체**를 순위 대상으로 한다 — 반응 0 장소도
  // 제외·분리하지 않는다. 전부 0인 초기 상태에서는 editorial 순서가 곧 순위다.
  const cityLikes = rows(await rest(env,
    `place_likes?target_type=eq.city_spot&select=target_key&limit=10000`));
  const cityDislikes = rows(await rest(env,
    `content_dislikes?target_type=eq.city_spot&select=target_key&limit=10000`));
  // COMMUNITY-V2 §2 — 활용 = place_usage(저장 또는 여행 추가, actor 고유·누적형).
  const cityUsage = rows(await rest(env,
    `place_usage?target_type=eq.city_spot&select=target_key&limit=10000`));
  const spots = rows(await rest(env,
    `city_spots?city=eq.${city}&is_published=eq.true&select=id&limit=2000`));
  let places: unknown[] = [];
  if (spots.length > 0) {
    // ④ 기존 추천 순서: Hub Owner 확정 순서 → canonical 연결 순서(스냅숏).
    const editorialIdx = new Map(editorialSpotOrder(city).map((eid, i) => [String(eid), i]));
    const likeBy = tally(cityLikes); const dislikeBy = tally(cityDislikes); const usageBy = tally(cityUsage);
    const ranked: PlaceRankInput[] = spots.map(s => {
      const id = String(s.id);
      return {
        id,
        likes:    likeBy.get(id) ?? 0,
        dislikes: dislikeBy.get(id) ?? 0,
        usage:    usageBy.get(id) ?? 0,
        editorialIndex: editorialIdx.get(id) ?? Number.POSITIVE_INFINITY,
      };
    }).sort(comparePlaceRanked);
    // 전체 보기가 도시 전체 연속 순위를 그린다 — 장소 상한은 도시 규모(≤2000).
    const placeLimit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 20, 1), 2000);
    places = ranked.slice(0, placeLimit).map((r, i) => ({
      id: Number(r.id), likeCount: r.likes, usageCount: r.usage,
      // 서버 확정 순위 — 클라이언트는 이 값을 그대로 표시만 한다(§6)
      rank: i + 1,
    }));
  }

  return json({ stories, places });
}

// 추천 API 공용 서버 로직 (PAGINATION-AND-NEW-DISCOVERY-V1 §5)
//
// /api/recommendations/:city(허브 top3)·/:city/places·/:city/stories 가 공유한다.
// 원칙:
//  · 장소 순위는 DB RPC(071)가 **전체 적격 집합** 기준으로 계산한다 — Worker 는
//    페이지 행만 받는다(PostgREST max-rows 1000 절단 사고의 구조적 재발 방지).
//  · Story 는 도시당 승인 수가 작아 Worker 가 코어로 계산한다(≤1000 pool).
//  · score·dislike·freshness 는 응답 조립에 아예 실리지 않는다.
import {
  compareRanked, type RankInput,
} from "./community-core.ts";
import {
  compareNewRanked, newPool, type NewRankInput,
} from "./ranking-page-core.ts";
import { editorialSpotOrder } from "./editorial-order-core.ts";
import {
  isMemoryPublic, orderMemories, photoRef, type InternalMemoryRow, type InternalPhotoRow,
} from "../share/public-memory.ts";
import { MEMORY_PUBLIC_CONSENT_VERSION } from "../trip-moments/public-consent-core.ts";
import { mergePhotoSet, type ChildPhotoRow } from "../trip-moments/photo-set.ts";

export interface RecoEnv { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }

export async function rest(env: RecoEnv, pathQ: string) {
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

export const rows = (r: { ok: boolean; data: unknown }): Record<string, unknown>[] =>
  r.ok && Array.isArray(r.data) ? r.data as Record<string, unknown>[] : [];

async function rpc(env: RecoEnv, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  try { return { ok: res.ok, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: false, data: null }; }
}

export interface RankedPlaceItem { id: number; likeCount: number; usageCount: number; rank: number }
export interface RankedPlacePage { items: RankedPlaceItem[]; total: number }

/** 인기 장소 — RPC 가 전역 순위·페이지를 확정. rank 는 페이지 무관 전역 값 */
export async function rankPlacesPage(
  env: RecoEnv, city: string, limit: number, offset: number,
): Promise<RankedPlacePage | null> {
  const r = await rpc(env, "community_rank_places", {
    p_city: city, p_editorial: editorialSpotOrder(city), p_limit: limit, p_offset: offset,
  });
  if (!r.ok || !Array.isArray(r.data)) return null;
  const list = r.data as { total: number; rank: number; id: number; like_count: number; usage_count: number }[];
  return {
    total: list.length > 0 ? Number(list[0].total) : await placesTotal(env, city),
    items: list.map(x => ({ id: Number(x.id), likeCount: Number(x.like_count), usageCount: Number(x.usage_count), rank: Number(x.rank) })),
  };
}

async function placesTotal(env: RecoEnv, city: string): Promise<number> {
  // offset 이 total 을 넘어 빈 페이지가 온 경우의 total 계산 — head count 만
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/city_spots?city=eq.${city}&is_published=eq.true&select=id&limit=1`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact" } });
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

/** 신규 장소(60일 창·pool≤1000) — RPC 확정. p_now 는 서버 시각(사용자 입력 아님) */
export async function rankNewPlacesPage(
  env: RecoEnv, city: string, nowIso: string, limit: number, offset: number,
): Promise<RankedPlacePage | null> {
  const r = await rpc(env, "community_rank_new_places", {
    p_city: city, p_now: nowIso, p_limit: limit, p_offset: offset,
  });
  if (!r.ok || !Array.isArray(r.data)) return null;
  const list = r.data as { total: number; rank: number; id: number; like_count: number; usage_count: number }[];
  return {
    total: list.length > 0 ? Number(list[0].total) : 0,
    items: list.map(x => ({ id: Number(x.id), likeCount: Number(x.like_count), usageCount: Number(x.usage_count), rank: Number(x.rank) })),
  };
}

// ── Story 후보 ───────────────────────────────────────────────────────────────

export interface StoryCandidate extends RankInput {
  title: string | null;
  days: number;
  stops: number;
  /** 최초 승인 시각(ms) — 신규 자격의 원천. NULL(소급 금지 정책)이면 null */
  firstApprovedAtMs: number | null;
  /** 현재 동의 판본의 공개 moment 존재 여부(신규 자격 조건) */
  hasPublicMoment: boolean;
}

function tally(list: Record<string, unknown>[], key = "target_key"): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of list) {
    const k = String(row[key] ?? "");
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * 도시의 승인 Story 후보 전체(승인 ∩ 지금도 공개·비가림)를 반응 집계와 함께.
 * 본문·사진·메모는 싣지 않는다. 공식 코스는 애초에 이 집합에 없다.
 */
export async function loadStoryCandidates(env: RecoEnv, city: string): Promise<StoryCandidate[]> {
  const subs = rows(await rest(env,
    `story_submissions?city=eq.${city}&status=eq.approved&select=itinerary_id,decided_at,first_approved_at&limit=1000`));
  if (subs.length === 0) return [];
  const subById = new Map(subs.map(s => [String(s.itinerary_id), s]));
  const idList = [...subById.keys()].map(encodeURIComponent).join(",");
  const trips = rows(await rest(env,
    `itineraries?id=in.(${idList})&is_public=eq.true&moderation_hidden_at=is.null` +
    `&select=id,trip_title,days&limit=1000`));
  if (trips.length === 0) return [];
  const liveIds = trips.map(t => String(t.id));
  const inList = liveIds.map(encodeURIComponent).join(",");
  const [likes, dislikes, copies, moments] = await Promise.all([
    rest(env, `content_likes?target_type=eq.story&target_key=in.(${inList})&select=target_key&limit=10000`),
    rest(env, `content_dislikes?target_type=eq.story&target_key=in.(${inList})&select=target_key&limit=10000`),
    rest(env, `itineraries?copy_of=in.(${inList})&select=copy_of,device_id&limit=10000`),
    rest(env, `trip_moments?itinerary_id=in.(${inList})&is_public=eq.true` +
      `&select=itinerary_id,is_public,public_consent_at,public_consent_version&limit=5000`),
  ]);
  const likeBy = tally(rows(likes));
  const dislikeBy = tally(rows(dislikes));
  const usageBy = new Map<string, Set<string>>();
  for (const c of rows(copies)) {
    const src = String(c.copy_of ?? ""); const dev = String(c.device_id ?? "");
    if (!src || !dev) continue;
    if (!usageBy.has(src)) usageBy.set(src, new Set());
    usageBy.get(src)!.add(dev);
  }
  const publicMoment = new Set<string>();
  for (const m of rows(moments) as unknown as (Pick<InternalMemoryRow, "is_public" | "public_consent_at" | "public_consent_version"> & { itinerary_id: string })[]) {
    if (isMemoryPublic(m, MEMORY_PUBLIC_CONSENT_VERSION)) publicMoment.add(String(m.itinerary_id));
  }
  return trips.map(t => {
    const id = String(t.id);
    const sub = subById.get(id)!;
    const dayList = Array.isArray(t.days) ? t.days
      : (t.days && typeof t.days === "object" && Array.isArray((t.days as { scheduled?: unknown[] }).scheduled))
        ? (t.days as { scheduled: unknown[] }).scheduled : [];
    let stops = 0;
    for (const d of dayList) {
      const p = (d && typeof d === "object") ? (d as { places?: unknown }).places : null;
      if (Array.isArray(p)) stops += p.length;
    }
    const firstAt = Date.parse(String(sub.first_approved_at ?? ""));
    return {
      id,
      likes: likeBy.get(id) ?? 0,
      dislikes: dislikeBy.get(id) ?? 0,
      usage: usageBy.get(id)?.size ?? 0,
      approvedAt: typeof sub.decided_at === "string" ? sub.decided_at : null,
      title: typeof t.trip_title === "string" ? t.trip_title : null,
      days: dayList.length,
      stops,
      firstApprovedAtMs: Number.isFinite(firstAt) ? firstAt : null,
      hasPublicMoment: publicMoment.has(id),
    };
  });
}

/** 인기 Story — 기존 score 순(§2-1) */
export function rankStoriesPopular(cands: StoryCandidate[]): StoryCandidate[] {
  return [...cands].sort(compareRanked);
}

/**
 * 신규 Story(§2-2·§3) — first_approved_at 실재 ∩ 60일 창 ∩ 공개 moment 존재.
 * pool 최신순 1000 → newScore 정렬. 공식 코스·소급 승인분(firstAt null)은 제외.
 */
export function rankStoriesNew(cands: StoryCandidate[], nowMs: number): StoryCandidate[] {
  const eligible = cands.filter(c => c.firstApprovedAtMs !== null && c.hasPublicMoment);
  const pool = newPool(nowMs, eligible.map(c => ({ ...c, firstAtMs: c.firstApprovedAtMs! })));
  return pool.sort(compareNewRanked(nowMs)) as unknown as StoryCandidate[];
}

/** 카드 직렬화 — 허용 필드만(§5-2). rank 는 호출부(전역)에서 붙인다 */
export function serializeStoryCard(c: StoryCandidate, cover: string | null) {
  return {
    id: c.id,
    title: c.title,
    days: c.days,
    stops: c.stops,
    likeCount: c.likes,
    copyCount: c.usage,
    approvedAt: c.approvedAt ?? null,
    cover,
  };
}

// ── 대표 이미지(cover) — 공개 Story 와 동일 동의·순서·ref 규칙 ───────────────
export async function coverRefByStory(env: RecoEnv, storyIds: string[]): Promise<Map<string, string>> {
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

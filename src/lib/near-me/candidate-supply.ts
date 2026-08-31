// Near-me candidate supply — pure part of the /api/trip/plan candidate pipeline
// (TASK-SCHEDULER-V2-P1-NEIGHBORHOOD-ROUTE-QUALITY-V1: extracted from functions/api/trip/plan.ts without behavior change
// so the offline scheduler benchmark can run the exact same supply on an isolated/corrected dataset).
//
//   rows(city_spots) → zoned places (bbox/zone rings) → expandZones(target supply) → score → exclude used → diversify
//
// No DB access here. The API fetches rows and calls buildNearMeCandidates(); QA harnesses do the same with their own rows.

import type { NearMePlaceRow, ZonedPlace, PlaceCategory } from "./types.ts";
import { CATEGORY_MAP, ALL_PLACE_CATEGORIES } from "./types.ts";
import { rowsToZonedPlaces, expandZones } from "./zone-classifier.ts";
import { computeTotalScore, buildLikedCategorySet } from "./scorer.ts";
import { diversifyByCategory } from "./candidate-diversity.ts";
import { MOCK_NEAR_ME_PLACES } from "./mock/mock-places.ts";
import type { TripPaceChoice } from "../trip-pace/pace-core.ts";
import { buildClusters, clustersAdjacent } from "../scheduler/route-quality.ts";

export interface Coord { lat: number; lng: number }

export interface CandidateSupplyInput {
  coordinate:        Coord;
  timestamp:         string;
  categories?:       PlaceCategory[] | null;
  liked_place_ids?:  string[];
  itinerary_coords?: Coord[];
  event_coords?:     Coord[];
  limit:             number;
  exclude_place_ids?: string[];
  trip_pace?:        TripPaceChoice;
  /** P1 권역 집중 공급. 기본 true. false 면 예전처럼 도시 전역 점수순. */
  clusterFocus?:     boolean;
}

export interface ScoredCandidate {
  place_id: string; category: PlaceCategory; coordinate: Coord; zone_id: 1 | 2 | 3; distance_m: number; score: number;
}

export function buildNearMeCandidates(rawRows: NearMePlaceRow[], input: CandidateSupplyInput): { results: ScoredCandidate[]; nearMeCount: number } {
  const allCategories = (input.categories ?? ALL_PLACE_CATEGORIES) as PlaceCategory[];
  const excluded = new Set((input.exclude_place_ids ?? []).map(String));

  const zonedPlaces: ZonedPlace[] = rowsToZonedPlaces(rawRows, input.coordinate);

  // "가까운 데 다섯 곳" 이 아니라 "오늘 고를 수 있는 후보가 이만큼" 을 기준으로 넓힌다.
  let { candidates } = expandZones(zonedPlaces, {
    targetSupply: input.limit,
    isUsable:     (p) => !excluded.has(String(p.place_id)),
  });

  // Mock fallback when no live candidates
  if (candidates.length === 0) {
    const catSet = new Set<string>(allCategories as string[]);
    candidates = (MOCK_NEAR_ME_PLACES as NearMePlaceRow[])
      .filter(p => { const mapped = CATEGORY_MAP[p.category]; return mapped !== undefined && catSet.has(mapped as string); })
      .filter(p => p.lat !== null && p.lng !== null)
      .map(p => ({ place_id: p.place_id, category: (CATEGORY_MAP[p.category] ?? "attraction") as PlaceCategory, coordinate: { lat: p.lat as number, lng: p.lng as number }, zone_id: 3 as const, distance_m: 5_000 }));
  }

  const likedCategories = buildLikedCategorySet(input.liked_place_ids ?? [], candidates as never);

  const scored: ScoredCandidate[] = candidates.map(c => ({
    place_id: c.place_id, category: c.category, coordinate: c.coordinate, zone_id: c.zone_id, distance_m: c.distance_m,
    score: computeTotalScore(c as never, {
      coordinate: input.coordinate as never, timestamp: input.timestamp, categories: allCategories as never,
      liked_place_ids: input.liked_place_ids, itinerary_coords: input.itinerary_coords as never, event_coords: input.event_coords as never,
      pace: input.trip_pace,
    } as never, likedCategories),
  }));

  // 이미 다녀온 곳을 **먼저** 뺀 뒤 자른다.
  const usable = excluded.size > 0 ? scored.filter(c => !excluded.has(String(c.place_id))) : scored;

  // ── P1 권역 → Day (TASK-SCHEDULER-V2-P1): 오늘 후보를 한 권역(+인접)에서 주로 공급한다 ──
  // 점수 상위 30개를 도시 전역에서 긁어 오면 하루가 여러 권역에 걸쳐 지그재그가 된다(실측 2026-08-30 부산 10일).
  // 남은(usable) 후보 전체로 좌표 권역을 만들고, 남은 점수 질량이 가장 큰 권역을 오늘의 주 권역으로 삼아
  // 주 권역 + 인접 권역에서 먼저 채우고, 모자라면 나머지에서 채운다. 어제 쓴 곳은 usable 에 없으므로
  // 주 권역은 날마다 자연히 옮겨 간다(권역 → Day 배정). 도시 이름·고정 목록 없음. 카테고리 다양성 규칙은 그대로다.
  const results = input.clusterFocus === false ? (diversifyByCategory(usable as never, input.limit) as ScoredCandidate[]) : focusSupply(usable, input.limit);
  return { results, nearMeCount: results.length };
}

function focusSupply(usable: ScoredCandidate[], limit: number): ScoredCandidate[] {
  if (usable.length <= limit) return diversifyByCategory(usable as never, limit) as ScoredCandidate[];
  const { clusters, clusterOf } = buildClusters(usable.map(c => ({ key: c.place_id, coordinate: c.coordinate, score: c.score })));
  const mass = new Map<number, number>();
  for (const c of usable) { const cid = clusterOf.get(c.place_id); if (cid === undefined) continue; mass.set(cid, (mass.get(cid) ?? 0) + Math.max(0, c.score)); }
  let primary: number | undefined, best = -1;
  for (const [cid, m] of mass) if (m > best) { primary = cid; best = m; }
  if (primary === undefined) return diversifyByCategory(usable as never, limit) as ScoredCandidate[];
  const near = usable.filter(c => { const cid = clusterOf.get(c.place_id); return cid !== undefined && clustersAdjacent(clusters[primary!]!, clusters[cid]!); });
  const far  = usable.filter(c => !near.includes(c));
  const head = diversifyByCategory(near as never, limit) as ScoredCandidate[];
  if (head.length >= limit) return head;
  const seen = new Set(head.map(c => c.place_id));
  const tail = (diversifyByCategory(far as never, limit - head.length) as ScoredCandidate[]).filter(c => !seen.has(c.place_id));
  return [...head, ...tail].slice(0, limit);
}

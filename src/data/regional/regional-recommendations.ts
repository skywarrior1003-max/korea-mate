// 5도시 공식 지역 추천 — 런타임 어댑터 (FIVE-CITY-REGIONAL-RECOMMENDATIONS-INTEGRATION-V1).
//
// 원천: data/regional-recommendations/normalized/* (normalized-v1, 5도시,
//   policy=OWNER_APPROVED_PUBLIC_SOURCE_USE_WITH_ATTRIBUTION_AND_TAKEDOWN,
//   원격 branch data/five-city-regional-content-handoff-v1 에서 exact-copy 반입).
// 이 파일이 읽는 regional-*-v1.json 은 그 normalized 원문에서 UI 가 쓰는 필드만
// 추린 것이고, canonical linkage 는 city_spots.external_id / city_spot_sources 를
// READ-ONLY 로 1회 조회해 published city_spot id 로 고정했다(64/64 해석).
// 없는 데이터(가짜 기간·인기·작성자)는 만들지 않는다 — null 은 null 로 남는다.
//
// 기존 src/data/curated-trips.ts(경주 공식 57코스)는 삭제하지 않고
// 경주의 보조 원천으로 이 어댑터 아래에서 병합한다 — Gyeongju-only 의존은 제거.
import tripsRaw from "./regional-trips-v1.json" with { type: "json" };
import placesRaw from "./regional-places-v1.json" with { type: "json" };
import { curatedTripsForCity } from "../curated-trips.ts";

export interface RegionalTripStop {
  name: string | null;
  nameEn: string | null;
  /** published city_spots.id — canonical 링크가 불충분하면 null(임의 매칭 금지) */
  spotId: number | null;
  linkage: string | null;
}

export interface RecommendedTrip {
  id: string;
  city: string;
  title: string;
  titleEn: string | null;
  theme: string | null;
  durationLabel: string | null;
  days: number | null;
  stops: RegionalTripStop[];
  /** 공식 provenance — UI 배지 남발 금지, 데이터로만 유지 */
  source: unknown;
  origin: "regional-official" | "gyeongju-official";
}

export interface RecommendedPlace {
  id: string;
  city: string;
  name: string | null;
  nameEn: string | null;
  category: string | null;
  linkage: string | null;
  spotId: number | null;
  spotIdsAll: number[];
  validFrom: string | null;
  validTo: string | null;
  whyNow: string | null;
}

interface TripsFile { trips: Array<Omit<RecommendedTrip, "origin">> }
interface PlacesFile { places: RecommendedPlace[] }

const REGIONAL_TRIPS: RecommendedTrip[] = (tripsRaw as unknown as TripsFile).trips
  .map(t => ({ ...t, origin: "regional-official" as const }));
const REGIONAL_PLACES: RecommendedPlace[] = (placesRaw as unknown as PlacesFile).places;

/** locale 에 맞는 코스 제목 — 번역을 창작하지 않는다(title_en 없으면 원제) */
export function tripDisplayTitle(trip: RecommendedTrip, locale: string): string {
  if (locale !== "ko" && trip.titleEn) return trip.titleEn;
  return trip.title;
}

/**
 * 도시별 공식 추천 여행. 5도시 normalized 코스가 1순위이고,
 * 경주는 기존 공식 57코스를 뒤에 이어 붙인다(중복 제목 제외).
 */
export function getRecommendedTrips(city: string): RecommendedTrip[] {
  const slug = city.toLowerCase();
  const primary = REGIONAL_TRIPS.filter(t => t.city === slug);
  if (slug !== "gyeongju") return primary;
  const seen = new Set(primary.map(t => t.title.trim()));
  const legacy: RecommendedTrip[] = curatedTripsForCity("gyeongju")
    .filter(t => !seen.has(t.title.trim()))
    .map(t => ({
      id: t.id, city: "gyeongju",
      title: t.title, titleEn: null,
      theme: t.theme, durationLabel: null,
      days: t.days, stops: [],
      source: { provider: "Gyeongju official travel content", category: t.category },
      origin: "gyeongju-official" as const,
    }));
  return [...primary, ...legacy];
}

export function getAllRecommendedTrips(): RecommendedTrip[] {
  return ["busan", "seoul", "jeju", "gyeongju", "jeonju"].flatMap(getRecommendedTrips);
}

/** 이 코스가 실제로 연결하는 published 장소 id 들(실측 — 개수를 지어내지 않는다) */
export function tripLinkedSpotIds(trip: RecommendedTrip): number[] {
  return [...new Set(trip.stops.map(s => s.spotId).filter((v): v is number => v !== null))];
}

/**
 * 도시별 공식 추천 장소(recommended_now). 유효기간이 명시된 항목은
 * 기간이 지난 것을 조용히 제외한다 — 철 지난 행사를 추천이라 부르지 않는다.
 */
export function getRecommendedPlaces(city: string, today = new Date()): RecommendedPlace[] {
  const slug = city.toLowerCase();
  const iso = today.toISOString().slice(0, 10);
  return REGIONAL_PLACES.filter(p => {
    if (p.city !== slug) return false;
    if (p.validTo && p.validTo < iso) return false;
    return true;
  });
}

/** canonical 연결이 확정된 추천 장소의 city_spot id 목록(도시별, 순서 보존) */
export function recommendedSpotIds(city: string, today = new Date()): number[] {
  const out: number[] = [];
  for (const p of getRecommendedPlaces(city, today)) {
    for (const id of (p.spotId !== null ? [p.spotId, ...p.spotIdsAll] : p.spotIdsAll)) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

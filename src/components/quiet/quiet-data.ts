// Quiet Home/Search 공용 데이터 — 도시 목록과 전역 검색 인덱스.
//
// 장소 인덱스는 기존 discovery fetch(fetchCitySpots)를 그대로 재사용한다.
// 새 API·새 스키마 없음. 5도시 published 스팟을 첫 검색 활성화 때 한 번 받고
// 모듈 레벨로 캐시한다(같은 세션 내 재요청 없음).
import { fetchCitySpots } from "@/lib/city-spots";
import type { CitySpot } from "@/data/cities/types";
import { CITY_SLUGS, type CitySlug } from "@/data/cities";

export interface QuietCity {
  slug: CitySlug;
  /** 영문 표기(검색 매칭·빌드타임 메타용). 표시 이름은 tripForm.city_* 를 쓴다 */
  en: string;
  /** tripForm 메시지 키 */
  labelKey: string;
}

const EN_NAME: Record<CitySlug, string> = {
  busan: "Busan", seoul: "Seoul", jeju: "Jeju Island", gyeongju: "Gyeongju", jeonju: "Jeonju",
};

export const QUIET_CITIES: QuietCity[] = CITY_SLUGS.map(slug => ({
  slug,
  en: EN_NAME[slug],
  labelKey: `city_${slug.charAt(0).toUpperCase()}${slug.slice(1)}`,
}));

export function quietCity(slug: string): QuietCity | undefined {
  return QUIET_CITIES.find(c => c.slug === slug.toLowerCase());
}

// ── 장소 인덱스(전역 검색용) ────────────────────────────────
let spotsPromise: Promise<CitySpot[]> | null = null;

/** 5도시 discovery 스팟 — 검색이 처음 열릴 때 한 번만 로드 */
export function loadSearchSpots(): Promise<CitySpot[]> {
  if (!spotsPromise) {
    spotsPromise = Promise.all(CITY_SLUGS.map(slug => fetchCitySpots(slug)))
      .then(lists => lists.flat())
      .catch(() => []);
  }
  return spotsPromise;
}

// ── 도시별 스팟(허브·View all 용) ───────────────────────────
const cityCache = new Map<string, Promise<CitySpot[]>>();

export function loadCitySpots(slug: string): Promise<CitySpot[]> {
  const key = slug.toLowerCase();
  let p = cityCache.get(key);
  if (!p) {
    p = fetchCitySpots(key).catch(() => []);
    cityCache.set(key, p);
  }
  return p;
}

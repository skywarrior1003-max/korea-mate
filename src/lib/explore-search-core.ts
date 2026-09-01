// Explore 검색 haystack — 사용자에게 **보이는** 텍스트만 substring 으로 찾는다.
//
// 왜 따로 있나 (2026-09-01, TASK-ZMILLENNIAL-ROLLOUT-PREFLIGHT)
//   ExploreCity 의 검색은 raw `name`·`description`(대부분 EN)·tags·district 만 봤다. 그래서
//   한글 이름만 있는 행은 `지밀레니얼` 로도 못 찾았고(name_l10n 미포함, 직전 수정), 한글 설명에만
//   있는 말(`지민`)은 desc_l10n 을 안 봐서 0건이었다. 표시되는 locale 텍스트를 모두 haystack 에
//   넣으면 어느 언어로 검색해도 같은 장소가 나온다.
//
// 계약
//   - substring · 대소문자 무시 (기존과 같다). ranking 없음.
//   - 포함: name, name_l10n 값, description, desc_l10n 값, why_it_matters, why_l10n 값, tags,
//     subcategory, district — 전부 카드/모달/상세에 실제로 보이는 값이다.
//   - 제외: id·external_id·lat/lng·source/provenance·image URL·지도 URL 같은 내부값. 객체 전체를
//     stringify 해서 찾지 않는다.
//   - 장소별 특수 분기 없음.

export interface SearchableSpot {
  name: string;
  nameL10n?: object | null;
  description?: string | null;
  descriptionL10n?: object | null;
  whyItMatters?: string | null;
  whyItMattersL10n?: object | null;
  tags?: string[] | null;
  subcategory?: string | null;
  district?: string | null;
}

function l10nValues(l10n: object | null | undefined): string[] {
  if (!l10n || typeof l10n !== "object") return [];
  return Object.values(l10n).filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** 검색 대상 문자열 목록(소문자). 빈 값은 빼고, 순서는 의미 없다. */
export function spotSearchHaystack(spot: SearchableSpot): string[] {
  const parts: Array<string | null | undefined> = [
    spot.name,
    ...l10nValues(spot.nameL10n),
    spot.description,
    ...l10nValues(spot.descriptionL10n),
    spot.whyItMatters,
    ...l10nValues(spot.whyItMattersL10n),
    ...(spot.tags ?? []),
    spot.subcategory,
    spot.district,
  ];
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map(p => p.toLowerCase());
}

/** 정규화된 검색어(소문자·trim). 빈 검색어면 모든 장소가 통과한다. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchesExploreSearch(spot: SearchableSpot, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return spotSearchHaystack(spot).some(h => h.includes(normalizedQuery));
}

/**
 * 결과 순서용 tier — 이름에 맞은 장소가 설명에서만 맞은 장소보다 앞에 온다.
 *   0 이름(name·name_l10n) · 1 tags·subcategory·district · 2 설명·why · 3 불일치
 * 설명까지 찾게 되면서 `성산일출봉` 같은 검색어에 그 장소를 "언급만" 하는 행이 스물 넘게 같이 나온다.
 * ranking 을 새로 만드는 것이 아니라, 기존 목록 순서(id 순)를 유지한 채 이 tier 로만 stable 정렬한다.
 */
export function exploreSearchTier(spot: SearchableSpot, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const has = (v: string | null | undefined) => typeof v === "string" && v.toLowerCase().includes(normalizedQuery);
  if (has(spot.name) || l10nValues(spot.nameL10n).some(has)) return 0;
  if ((spot.tags ?? []).some(has) || has(spot.subcategory) || has(spot.district)) return 1;
  if (has(spot.description) || l10nValues(spot.descriptionL10n).some(has) || has(spot.whyItMatters) || l10nValues(spot.whyItMattersL10n).some(has)) return 2;
  return 3;
}

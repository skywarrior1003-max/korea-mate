// NEW 행의 DB-level 멱등 identity (TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 §18~22)
//
// 결정: NEW_ROW_IDENTITY_STRATEGY = city_spots.(source_type, external_id)
//   · migration 012 의 `idx_city_spots_source_external` UNIQUE (WHERE external_id IS NOT NULL) 이 DB 차원에서 중복 INSERT 를 막는다.
//   · source_type = "canonical" — 기존 관례(manual · tourapi · google · user · busan_enrichment_v1)와 같은 계열의 소문자 토큰.
//     package run 이름("five-city-core-v1")을 쓰지 않는다: 같은 장소가 package v2/refresh 로 다시 들어와도 같은 키여야 한다
//     (PACKAGE_VERSION_COUPLED_IDENTITY=NO).
//   · external_id = "<city>:<canonical_id>" — 전주 canonical id(OFF-9751 · KTO-126626)는 도시 접두가 없어 다른 도시와 충돌할 수
//     있으므로 city 를 namespace 로 붙인다. busan-A-00029 같은 id 도 같은 형식으로 통일한다.
//   · MATCH_REPLACE(기존 행)의 source_type/external_id 는 건드리지 않는다(데이터계약 §4 동결).
//   · city_spot_sources 는 provenance 이지 멱등 키가 아니다(city_spots INSERT 와 atomic 하지 않음) — 후보 B 기각.

export const CANONICAL_SOURCE_TYPE = "canonical" as const;

export function canonicalExternalId(city: string, canonicalId: string): string {
  const c = city.trim().toLowerCase();
  const k = canonicalId.trim();
  if (!c || !k) throw new Error(`canonicalExternalId: empty city/canonical_id (${city}/${canonicalId})`);
  if (c.includes(":") || k.includes(":")) throw new Error(`canonicalExternalId: ':' is the namespace separator (${city}/${canonicalId})`);
  return `${c}:${k}`;
}

export function parseCanonicalExternalId(externalId: string): { city: string; canonicalId: string } | null {
  const i = externalId.indexOf(":");
  if (i <= 0 || i === externalId.length - 1) return null;
  return { city: externalId.slice(0, i), canonicalId: externalId.slice(i + 1) };
}

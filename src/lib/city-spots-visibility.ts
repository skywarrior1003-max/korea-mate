// city_spots 서비스 노출 게이트 (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · Gate B)
//
// 왜 필요한가
//   5도시 통합으로 city_spots 가 714 → 4,88x 행이 된다. 기존 행 중 서비스에서 뺀 legacy
//   (부산 historical Food 228 · 경주 EXCLUDED 3 · 준중복 3)를 **삭제하지 않고** 사용자 발견
//   경로에서만 숨겨야 한다. 컬럼은 데이터계약 §5 의 `is_published`(migration 056) 를 쓴다.
//
// 두 가지 조회를 구분한다 — 이것이 이 모듈의 전부다.
//   discovery : Explore 목록 · 플래너 자동 후보 · near-me · sitemap. `is_published = true` 만.
//   reference : 사용자가 이미 가진 id 를 다시 찾는 경우 — Saved/My Trip 의 place_id hydration,
//               Story/Moment 의 city_spot_id 검증, /place/<id> 정적 경로, 플래너 place_map.
//               숨긴 legacy 라도 과거 기록을 깨뜨리지 않기 위해 **필터하지 않는다**.
//
// 배포 순서 안전장치
//   DISCOVERY_VISIBILITY_GATE_ENABLED 가 false 인 동안은 어떤 쿼리에도 is_published 조건이 붙지
//   않는다. 컬럼이 아직 없는 Production 에 이 코드가 먼저 배포돼도 Explore 가 깨지지 않는다.
//   migration 056 이 Production 에 적용된 뒤, 릴리스 커밋에서만 true 로 바꾼다(그 커밋이 곧 게이트 ON).
//   → 2026-08-22 TASK-FIVE-CITY-CORE-VISIBILITY-GATE-RELEASE-V1: migration 056·057 Owner 적용·검증 완료
//     (714행 전부 is_published=true) 후 ON. 이 시점에는 discovery 결과가 바뀌지 않는다(true 714 = 전체).
//     컬럼이 없는 환경에서 ON 이면 조회가 명시적으로 실패한다(조용한 fallback 없음) — 의도된 동작.
//   env 로 켜지 않는 이유: Cloudflare Functions(ctx.env)와 Next 빌드(process.env)가 다른 env 를
//   보므로 두 표면이 서로 다른 상태가 될 수 있다. 코드 상수 하나가 두 표면을 동시에 바꾼다.

export const DISCOVERY_VISIBILITY_GATE_ENABLED = true;

export const PUBLISHED_COLUMN = "is_published" as const;

export type VisibilityScope = "discovery" | "reference";

/** 이 조회에 is_published 조건을 붙여야 하는가 */
export function discoveryGateActive(scope: VisibilityScope, enabled: boolean = DISCOVERY_VISIBILITY_GATE_ENABLED): boolean {
  return scope === "discovery" && enabled;
}

/** supabase-js 쿼리 빌더용 — discovery 이고 게이트가 켜져 있을 때만 `.eq("is_published", true)` */
//   제네릭을 PostgrestFilterBuilder 에 묶지 않는다 — 타입 인스턴스가 지나치게 깊어져(TS2589) 빌드가 깨진다.
//   필요한 것은 `.eq` 하나뿐이므로 구조적 타입으로 좁혀 호출하고 원래 타입으로 돌려준다.
export function applyVisibility<Q>(
  query: Q,
  scope: VisibilityScope,
  enabled: boolean = DISCOVERY_VISIBILITY_GATE_ENABLED,
): Q {
  if (!discoveryGateActive(scope, enabled)) return query;
  return (query as unknown as { eq(column: string, value: boolean): unknown }).eq(PUBLISHED_COLUMN, true) as Q;
}

/** PostgREST URL 조회용(빌드 타임 fetch) — 붙일 query string 조각. 없으면 빈 문자열 */
export function visibilityRestFilter(scope: VisibilityScope, enabled: boolean = DISCOVERY_VISIBILITY_GATE_ENABLED): string {
  return discoveryGateActive(scope, enabled) ? `&${PUBLISHED_COLUMN}=eq.true` : "";
}

/**
 * 이미 읽은 행이 발견 표면에 보여도 되는가. 컬럼이 없거나(undefined) NULL 이면 보이는 쪽으로 —
 * 게이트 OFF 상태와 migration 전 데이터가 모두 "지금과 같은 노출" 을 유지해야 하기 때문이다.
 * 명시적으로 false 인 행만 숨긴다.
 */
export function isDiscoverable(
  row: { is_published?: boolean | null } | null | undefined,
  enabled: boolean = DISCOVERY_VISIBILITY_GATE_ENABLED,
): boolean {
  if (!row) return false;
  if (!enabled) return true;
  return row.is_published !== false;
}

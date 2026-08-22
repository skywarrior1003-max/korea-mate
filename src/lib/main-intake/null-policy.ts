// 필드별 null 의미 — "없음"을 세 가지로 가른다. (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)
//
//   REPLACE_WITH_VALUE     신규 검증 값으로 교체
//   INTENTIONALLY_CLEAR    신규 source 가 이 필드의 권위이고 기존 값이 출처불명·오매칭이라 비운다
//   NO_SOURCE_VALUE        신규 artifact 가 이 필드를 제공하지 않는다 — 기존 값은 건드리지 않되 '자동 fallback' 이라고 부르지 않는다
//   PRESERVE_RUNTIME_FIELD 런타임/사용자 소유 — importer 가 절대 쓰지 않는다
//   MANUAL_REVIEW          사람이 정한다 — importer 가 쓰지 않는다
//
// undefined · null · "" 는 같은 뜻이 아니다: undefined = artifact 에 키 없음, null = artifact 가 명시적으로 비움,
// "" = 공백 문자열(값 없음으로 본다). 모두 NO_SOURCE_VALUE 로 수렴시키되 로그에는 구분해 남긴다.

export type NullPolicy =
  | "REPLACE_WITH_VALUE"
  | "INTENTIONALLY_CLEAR"
  | "FINAL_ABSENT_CLEAR"     // Final 이 소유하는 필드인데 공식 값 없음이 확정 → legacy 로 보충하지 않고 clear (058-WRITER-CORRECTION §7)
  | "NO_SOURCE_VALUE"
  | "PRESERVE_RUNTIME_FIELD"
  | "MANUAL_REVIEW" | "VISIBILITY_GATE";

/** importer 가 UPDATE 로 쓸 수 있는 city_spots 컬럼과 소유 구분 */
export const FIELD_OWNERSHIP: Record<string, "SOURCE" | "RUNTIME" | "MANUAL" | "REFERENCE" | "VISIBILITY"> = {
  id: "REFERENCE",
  // Gate B (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1): 서비스 노출 게이트. importer 가 ACTIVE 에 true, 승인된 legacy 에 false 를 준다.
  is_published: "VISIBILITY",
  city: "REFERENCE",
  name: "SOURCE",
  name_l10n: "SOURCE",
  description: "SOURCE",
  desc_l10n: "SOURCE",
  why_it_matters: "SOURCE",
  why_l10n: "SOURCE",
  category: "SOURCE",
  subcategory: "SOURCE",
  district: "SOURCE",
  address: "SOURCE",
  lat: "SOURCE",
  lng: "SOURCE",
  official_url: "SOURCE",
  map_url: "SOURCE",
  naver_map_url: "SOURCE",
  opening_hours: "SOURCE",
  tags: "SOURCE",
  image_url: "SOURCE",
  duration_minutes: "MANUAL",
  best_time_slot: "MANUAL",
  entry_fee: "MANUAL",
  difficulty: "MANUAL",
  solo_friendly: "MANUAL",
  foreign_card_accepted: "MANUAL",
  cash_only: "MANUAL",
  rating: "RUNTIME",
  affiliate_url: "MANUAL",
  affiliate_provider: "MANUAL",
  source_type: "REFERENCE",   // 데이터계약 §4: 동결
  external_id: "REFERENCE",   // 데이터계약 §4: 동결
  created_at: "RUNTIME",
  updated_at: "RUNTIME",
};

/** legacy 값이 출처불명이라 신규 권위 source 가 비어 있어도 비워야 하는 필드·조건 */
export function isLegacyClearCandidate(field: string, oldValue: unknown): boolean {
  if (field === "image_url" && typeof oldValue === "string") {
    // 데이터계약 §16: Unsplash 자동 승계 금지 — 신규 검증 이미지가 없으면 비운다
    return /unsplash\.com/i.test(oldValue);
  }
  return false;
}

export interface FieldDecision {
  field: string;
  policy: NullPolicy;
  /** UPDATE 문에 실을 값 (policy 가 REPLACE/CLEAR 일 때만 의미 있음) */
  value?: unknown;
  sourceState: "value" | "undefined" | "null" | "empty";
}

function sourceState(v: unknown): FieldDecision["sourceState"] {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string" && v.trim() === "") return "empty";
  if (Array.isArray(v) && v.length === 0) return "empty";
  return "value";
}

/**
 * 한 필드에 대해 무엇을 할지 정한다. 런타임/수동/참조 필드는 source 값이 있어도 쓰지 않는다.
 */
/**
 * ctx.finalOwned  : 이 행의 artifact 가 해당 필드를 Final 필드로 매핑함(intake row.owned_fields). 값이 없으면 "공식 값 없음" 확정 → FINAL_ABSENT_CLEAR.
 * ctx.deferred    : 값은 있으나 schema 로 구조화되지 못해 sidecar 로 보존(intake row.deferred_fields) → DB 컬럼 no-op.
 * ctx 없음(NOT_OWNED/RUNTIME_DERIVED) → NO_SOURCE_VALUE(no-op). Main 이 ownership 을 추측하지 않는다 — intake 가 매핑에서 기계적으로 기록한다.
 */
export function decideField(field: string, sourceValue: unknown, oldValue: unknown, ctx: { finalOwned?: boolean; deferred?: boolean } = {}): FieldDecision {
  const owner = FIELD_OWNERSHIP[field];
  const state = sourceState(sourceValue);
  if (owner === undefined) return { field, policy: "MANUAL_REVIEW", sourceState: state };
  if (owner === "RUNTIME" || owner === "REFERENCE") return { field, policy: "PRESERVE_RUNTIME_FIELD", sourceState: state };
  if (owner === "MANUAL") return { field, policy: "MANUAL_REVIEW", sourceState: state };
  if (owner === "VISIBILITY") return { field, policy: "VISIBILITY_GATE", value: sourceValue === true, sourceState: state };
  if (state === "value") return { field, policy: "REPLACE_WITH_VALUE", value: sourceValue, sourceState: state };
  if (isLegacyClearCandidate(field, oldValue)) return { field, policy: "INTENTIONALLY_CLEAR", value: null, sourceState: state };
  if (ctx.deferred) return { field, policy: "NO_SOURCE_VALUE", sourceState: state };
  if (ctx.finalOwned) return { field, policy: "FINAL_ABSENT_CLEAR", value: null, sourceState: state };
  return { field, policy: "NO_SOURCE_VALUE", sourceState: state };
}

/** 쓸 값이 실제로 있는 policy 만 UPDATE 에 싣는다 */
export function isWritePolicy(p: NullPolicy): boolean {
  return p === "REPLACE_WITH_VALUE" || p === "INTENTIONALLY_CLEAR" || p === "FINAL_ABSENT_CLEAR" || p === "VISIBILITY_GATE";
}

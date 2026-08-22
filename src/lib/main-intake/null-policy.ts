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
  | "NO_SOURCE_VALUE"
  | "PRESERVE_RUNTIME_FIELD"
  | "MANUAL_REVIEW";

/** importer 가 UPDATE 로 쓸 수 있는 city_spots 컬럼과 소유 구분 */
export const FIELD_OWNERSHIP: Record<string, "SOURCE" | "RUNTIME" | "MANUAL" | "REFERENCE"> = {
  id: "REFERENCE",
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
export function decideField(field: string, sourceValue: unknown, oldValue: unknown): FieldDecision {
  const owner = FIELD_OWNERSHIP[field];
  const state = sourceState(sourceValue);
  if (owner === undefined) return { field, policy: "MANUAL_REVIEW", sourceState: state };
  if (owner === "RUNTIME" || owner === "REFERENCE") return { field, policy: "PRESERVE_RUNTIME_FIELD", sourceState: state };
  if (owner === "MANUAL") return { field, policy: "MANUAL_REVIEW", sourceState: state };
  if (state === "value") return { field, policy: "REPLACE_WITH_VALUE", value: sourceValue, sourceState: state };
  if (isLegacyClearCandidate(field, oldValue)) return { field, policy: "INTENTIONALLY_CLEAR", value: null, sourceState: state };
  return { field, policy: "NO_SOURCE_VALUE", sourceState: state };
}

/** 쓸 값이 실제로 있는 policy 만 UPDATE 에 싣는다 */
export function isWritePolicy(p: NullPolicy): boolean {
  return p === "REPLACE_WITH_VALUE" || p === "INTENTIONALLY_CLEAR";
}

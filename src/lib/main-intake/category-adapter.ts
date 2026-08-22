// category 어댑터 — Main CHECK 5종으로만. (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1)
// migration 014 의 선례: 비표준 값은 subcategory 에 보존하고 category 는 표준 5종으로.

export const MAIN_CATEGORIES = ["attraction", "restaurant", "nature", "event", "accommodation"] as const;
export type MainCategory = typeof MAIN_CATEGORIES[number];
export type CategoryMappingKind = "DIRECT_MAP" | "NORMALIZE_MAP" | "UNSUPPORTED_DEFER" | "SCHEMA_CHANGE_REQUIRED";

const RULES: Record<string, [MainCategory, CategoryMappingKind]> = {
  attraction: ["attraction", "DIRECT_MAP"], restaurant: ["restaurant", "DIRECT_MAP"], nature: ["nature", "DIRECT_MAP"],
  event: ["event", "DIRECT_MAP"], accommodation: ["accommodation", "DIRECT_MAP"],
  food: ["restaurant", "NORMALIZE_MAP"],        // jeju
  shopping: ["attraction", "NORMALIZE_MAP"],    // seoul — 의미는 subcategory 'shopping' 에 남는다
  // jeonju domain
  FOOD: ["restaurant", "NORMALIZE_MAP"], PLACE_NATURE: ["nature", "NORMALIZE_MAP"],
  ACCOMMODATION_HANOK_REVIEW: ["accommodation", "NORMALIZE_MAP"],
  PLACE_TOURISM: ["attraction", "NORMALIZE_MAP"], PLACE_TOURISM_REVIEW: ["attraction", "NORMALIZE_MAP"],
  PLACE_CULTURAL: ["attraction", "NORMALIZE_MAP"], PLACE_HERITAGE: ["attraction", "NORMALIZE_MAP"],
  PLACE_GENERAL: ["attraction", "NORMALIZE_MAP"], ACTIVITY_EXPERIENCE: ["attraction", "NORMALIZE_MAP"],
  SPECIALTY_INTEREST: ["attraction", "NORMALIZE_MAP"],
};

// Gate C (TASK-FIVE-CITY-CORE-PREPROD-GATE-V1) — Semantic Category Contract
//   RUNTIME_COMPAT_CATEGORY = `category`(Main 5종) · SOURCE_SEMANTIC_CATEGORY = 원본의 여행 의미.
//   semantic ≠ runtime 이면 subcategory 에 semantic 토큰을 두고 raw 세부 분류는 content_meta.subcategory_raw 로 deferred.
//   semantic == runtime 이면 subcategory = raw. → (category, subcategory) 만으로 semantic 이 복원된다.
export const SEMANTIC_CATEGORIES = ["attraction", "restaurant", "nature", "event", "accommodation", "shopping", "culture", "heritage", "activity", "specialty"] as const;
export type SemanticCategory = typeof SEMANTIC_CATEGORIES[number];
const SEMANTIC: Record<string, SemanticCategory> = {
  attraction: "attraction", restaurant: "restaurant", nature: "nature", event: "event", accommodation: "accommodation",
  food: "restaurant", shopping: "shopping",
  FOOD: "restaurant", PLACE_NATURE: "nature", ACCOMMODATION_HANOK_REVIEW: "accommodation",
  PLACE_TOURISM: "attraction", PLACE_TOURISM_REVIEW: "attraction", PLACE_GENERAL: "attraction",
  PLACE_CULTURAL: "culture", PLACE_HERITAGE: "heritage", ACTIVITY_EXPERIENCE: "activity", SPECIALTY_INTEREST: "specialty",
};
// 전주 SPECIALTY_INTEREST + menu '쇼핑' = shopping
const SEMANTIC_SUB_OVERRIDE: Record<string, SemanticCategory> = { "SPECIALTY_INTEREST|쇼핑": "shopping" };

export interface CategoryMapping {
  category: MainCategory;
  subcategory: string | null;
  kind: CategoryMappingKind;
  /** 원본이 실제로 뜻하는 여행 의미 — 절대 잃지 않는다 */
  semantic: string;
  /** semantic 토큰이 subcategory 를 차지해 deferred 된 원본 세부 분류 */
  subcategoryRawDeferred: string | null;
}

/** (category, subcategory) 에서 semantic 이 복원되는가 — LOSSY 검산 */
export function isSemanticRecoverable(category: string, subcategory: string | null | undefined, semantic: string): boolean {
  return semantic === category || subcategory === semantic;
}

/** 저장된 행에서 semantic 을 되읽는다 (UI/검색 필터가 쓸 수 있는 단일 규칙) */
export function semanticOf(row: { category: string; subcategory?: string | null }): string {
  const sub = row.subcategory ?? null;
  return sub && (SEMANTIC_CATEGORIES as readonly string[]).includes(sub) && sub !== row.category ? sub : row.category;
}

export function mapCategory(source: string | null | undefined, sub?: string | null): CategoryMapping {
  const key = (source ?? "").trim();
  const rule = RULES[key];
  const raw = sub && sub.trim() ? sub.trim() : null;
  if (rule) {
    const [category, kind] = rule;
    const semantic = SEMANTIC_SUB_OVERRIDE[`${key}|${raw ?? ""}`] ?? SEMANTIC[key]!;
    if (semantic !== category) return { category, subcategory: semantic, kind, semantic, subcategoryRawDeferred: raw };
    return { category, subcategory: raw, kind, semantic, subcategoryRawDeferred: null };
  }
  // 모르는 값은 attraction 으로 몰지 않는다 — DEFER 표시와 함께 subcategory 에 원문을 남긴다
  return { category: "attraction", subcategory: raw || key || null, kind: "UNSUPPORTED_DEFER", semantic: key || "unknown", subcategoryRawDeferred: null };
}

export function isMainCategory(v: unknown): v is MainCategory {
  return typeof v === "string" && (MAIN_CATEGORIES as readonly string[]).includes(v);
}

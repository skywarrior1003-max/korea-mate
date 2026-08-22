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

export interface CategoryMapping {
  category: MainCategory;
  subcategory: string | null;
  kind: CategoryMappingKind;
}

export function mapCategory(source: string | null | undefined, sub?: string | null): CategoryMapping {
  const key = (source ?? "").trim();
  const rule = RULES[key];
  if (rule) {
    const [category, kind] = rule;
    const subcategory = sub && sub.trim() ? sub.trim() : (kind === "NORMALIZE_MAP" && key.toLowerCase() !== category ? key : null);
    return { category, subcategory, kind };
  }
  // 모르는 값은 attraction 으로 몰지 않는다 — DEFER 표시와 함께 subcategory 에 원문을 남긴다
  return { category: "attraction", subcategory: sub?.trim() || key || null, kind: "UNSUPPORTED_DEFER" };
}

export function isMainCategory(v: unknown): v is MainCategory {
  return typeof v === "string" && (MAIN_CATEGORIES as readonly string[]).includes(v);
}

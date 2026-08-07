// P1 restaurant candidate → city_spots insert row **미리보기**.
//
// 이 모듈은 row 를 만들기만 한다. 쓰지 않는다. DB client 를 import 하지도 않는다.
//
// 실제 schema 에서 확인한 계약(2026-08-07 read-only):
//   NOT NULL   : city, name, category  (+ 기본값 있는 solo_friendly/foreign_card_accepted/
//                cash_only/source_type/created_at/updated_at)
//   CHECK      : category ∈ attraction|restaurant|nature|event|accommodation
//   UNIQUE     : (city, name)
//   UNIQUE 부분: (source_type, external_id) WHERE external_id IS NOT NULL
//   nullable   : duration_minutes, subcategory, opening_hours, tags, image_url ...
//
// 없는 값을 지어내지 않는다. duration_minutes 는 원천에 0% 이고 스케줄러가 읽지도 않으므로
// NULL 로 둔다 — 임의의 체류시간 숫자를 만드는 순간 그건 가짜 데이터다.

import type { P1Restaurant } from "./p1-selector.ts";
import { DISTRICT_KO_TO_ROMAN } from "./identity-matcher.ts";

/** 신규 row 의 출처 표식. 기존 manual 86건에는 절대 쓰지 않는다. */
export const IMPORT_SOURCE_TYPE = "busan_enrichment_v1";
export const CITY_KEY = "busan";

export type ImageRights =
  | "IMAGE_USE_ALLOWED"
  | "IMAGE_USE_EXISTING_POLICY_ALLOWED"
  | "IMAGE_RIGHTS_REVIEW"
  | "NO_IMAGE";

/**
 * 이미지 권리 분류.
 * `operational_assumed` 는 **명시적 라이선스가 아니다** — 운영상 가정일 뿐이므로
 * 자동 공개 대상으로 올리지 않고 review 로 보낸다.
 */
export function classifyImageRights(r: P1Restaurant): ImageRights {
  if (r.curated_count <= 0) return "NO_IMAGE";
  if (r.image_rights === "operational_assumed") return "IMAGE_RIGHTS_REVIEW";
  if (r.image_rights === "N/A") return "IMAGE_RIGHTS_REVIEW";
  return "IMAGE_RIGHTS_REVIEW";
}

/** 한글 구 → 기존 86건과 같은 로마자 표기. 모르는 값은 바꾸지 않는다. */
export function toRomanDistrict(ko: string): string | null {
  const t = (ko ?? "").trim();
  if (!t) return null;
  return DISTRICT_KO_TO_ROMAN[t] ?? null;
}

/** 실제 insert 될 컬럼만 담는다. 여기 없는 컬럼은 DB 기본값에 맡긴다. */
export interface CitySpotInsertPreview {
  city:        string;
  name:        string;
  category:    "restaurant";
  district:    string | null;
  address:     string | null;
  description: string | null;
  lat:         number;
  lng:         number;
  subcategory:      null;
  duration_minutes: null;
  best_time_slot:   null;
  tags:             null;
  opening_hours:    null;
  image_url:        null;
  official_url: string | null;
  source_type:  string;
  external_id:  string;
}

export interface MappedRow {
  candidate_id: string;
  row: CitySpotInsertPreview;
  /** 원천에 자유문자열 영업시간이 있는가 — 이번엔 DB 에 쓰지 않는다 */
  source_raw_hours_available: boolean;
  image_rights: ImageRights;
  /** 표시명으로 영문을 썼는가 (P1 은 전부 영문 보유가 전제) */
  name_source: "name_en" | "name_ko";
  issues: string[];
}

/**
 * candidate → insert 미리보기.
 *
 * name 은 영문을 쓴다 — 대상 사용자가 외국인 개별여행자이고 기존 86건도 전부 영문이다.
 * 영문이 없으면 한글로 떨어뜨리되 issue 로 남긴다(임의 번역하지 않는다).
 */
/** 표시명 결정 규칙. 유니크 충돌 검사와 실제 mapping 이 같은 값을 봐야 한다. */
export function displayName(r: Pick<P1Restaurant, "name_en" | "name_ko">): string {
  return (r.name_en ?? r.name_ko ?? "").trim();
}

export function mapToCitySpot(r: P1Restaurant): MappedRow {
  const issues: string[] = [];

  const nameSource: "name_en" | "name_ko" = r.name_en ? "name_en" : "name_ko";
  const name = displayName(r);
  if (!name) issues.push("name 비어 있음 — NOT NULL 위반");
  if (nameSource === "name_ko") issues.push("영문명 없음 — 한글명으로 표시됨(번역하지 않음)");

  const district = toRomanDistrict(r.district);
  if (r.district && !district) issues.push(`구 로마자 매핑 없음: ${r.district}`);

  if (!r.description_en) issues.push("영문 설명 없음");

  const row: CitySpotInsertPreview = {
    city:        CITY_KEY,
    name,
    category:    "restaurant",
    district,
    address:     r.address || null,
    description: r.description_en,       // 한글 설명을 영문 자리에 넣지 않는다
    lat:         r.lat,
    lng:         r.lng,
    subcategory:      null,              // 원천 없음 — 만들지 않는다
    duration_minutes: null,              // 원천 0%, 스케줄러 미사용
    best_time_slot:   null,              // 원천 없음
    tags:             null,              // 원천 없음
    opening_hours:    null,              // raw 문자열을 JSONB 로 포장하지 않는다
    image_url:        null,              // 권리 확정 전 공개하지 않는다
    official_url:     null,
    source_type:      IMPORT_SOURCE_TYPE,
    external_id:      r.candidate_id,
  };

  return {
    candidate_id: r.candidate_id,
    row,
    source_raw_hours_available: Boolean(r.raw_hours),
    image_rights: classifyImageRights(r),
    name_source: nameSource,
    issues,
  };
}

/** NOT NULL / CHECK / 값 범위 위반 검출 */
export function validatePreview(row: CitySpotInsertPreview): string[] {
  const bad: string[] = [];
  if (!row.city)     bad.push("city NOT NULL 위반");
  if (!row.name)     bad.push("name NOT NULL 위반");
  if (row.category !== "restaurant") bad.push("category CHECK 위반");
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) bad.push("좌표 무효");
  if (!row.external_id) bad.push("external_id 없음 — lineage 불가");
  if (row.source_type !== IMPORT_SOURCE_TYPE) bad.push("source_type 예상값 아님");
  return bad;
}

/** (city,name) 유니크 충돌을 미리 찾는다 — 신규끼리, 그리고 기존 이름과 */
export function findNameCollisions(
  rows: readonly MappedRow[],
  existingNames: readonly string[],
): { withinNew: string[]; withExisting: string[] } {
  const seen = new Set<string>();
  const withinNew: string[] = [];
  for (const m of rows) {
    const k = m.row.name.toLowerCase();
    if (seen.has(k)) withinNew.push(m.row.name);
    seen.add(k);
  }
  const ex = new Set(existingNames.map(n => n.toLowerCase()));
  const withExisting = rows.filter(m => ex.has(m.row.name.toLowerCase())).map(m => m.row.name);
  return { withinNew: [...new Set(withinNew)].sort(), withExisting: [...new Set(withExisting)].sort() };
}

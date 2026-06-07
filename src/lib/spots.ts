/**
 * spots.ts — 전 카테고리 통합 DB 인프라 (Task 3)
 * Supabase `spots` 테이블 타입 정의 + CRUD 함수
 *
 * 테이블 생성 SQL → supabase/migrations/001_spots_table.sql 참조
 */

import { supabase } from "./supabase";

// ── 카테고리 정의 ─────────────────────────────────────────────
export type SpotCategory =
  | "attraction"
  | "restaurant"
  | "cafe"
  | "hiking"
  | "activity"
  | "accommodation"
  | "cultural"
  | "market"
  | "shopping";

export type HikingDifficulty = "easy" | "moderate" | "hard";

// ── 마스터 스팟 레코드 ────────────────────────────────────────
export interface SpotRow {
  id?: string;               // UUID — Supabase auto-generated
  place_id: string;          // 고유 슬러그 (Join Key): "busan-haeundae-beach"
  name: string;
  name_ko?: string;          // 한국어 이름
  category: SpotCategory;
  subcategory?: string;      // "michelin-star", "coastal", "summit", "K-POP" 등
  city: string;
  district?: string;
  address?: string;
  description?: string;
  image_url?: string;
  duration_minutes?: number;
  // 등산/트레킹 전용 메타
  difficulty?: HikingDifficulty;
  required_gear?: string;    // 예: "Hiking shoes required, bring 1L water"
  // 공통 실용 정보
  tips?: string;
  price_range?: string;      // "Free", "₩15,000~₩30,000"
  michelin_stars?: 1 | 2 | 3;
  opening_hours?: string;
  foreign_card_accepted?: boolean;
  solo_friendly?: boolean;
  google_maps_url?: string;
  naver_maps_url?: string;
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── 단건 조회 ─────────────────────────────────────────────────
export async function fetchSpotByPlaceId(placeId: string): Promise<SpotRow | null> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("place_id", placeId)
    .single();
  if (error) { console.error("[Supabase] spot fetch:", error.message); return null; }
  return data as SpotRow;
}

// ── 카테고리별 목록 조회 ──────────────────────────────────────
export async function fetchSpotsByCategory(
  category: SpotCategory,
  city = "Busan",
  limit = 50
): Promise<SpotRow[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("category", category)
    .eq("city", city)
    .eq("is_published", true)
    .order("michelin_stars", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(limit);
  if (error) { console.error("[Supabase] spots list:", error.message); return []; }
  return (data ?? []) as SpotRow[];
}

// ── 전체 조회 ─────────────────────────────────────────────────
export async function fetchAllSpots(city = "Busan"): Promise<SpotRow[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("city", city)
    .eq("is_published", true)
    .order("category")
    .order("name");
  if (error) { console.error("[Supabase] all spots:", error.message); return []; }
  return (data ?? []) as SpotRow[];
}

// ── 단건 Upsert ───────────────────────────────────────────────
export async function upsertSpot(row: SpotRow): Promise<boolean> {
  const { error } = await supabase
    .from("spots")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "place_id" });
  if (error) { console.error("[Supabase] spot upsert:", error.message); return false; }
  return true;
}

// ── 대량 Upsert (CSV 업로더용) ────────────────────────────────
export async function bulkUpsertSpots(rows: SpotRow[]): Promise<{ success: number; failed: number; errors: string[] }> {
  const CHUNK = 50; // Supabase 단건 제한 대응
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(r => ({
      ...r,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("spots")
      .upsert(chunk, { onConflict: "place_id" });
    if (error) {
      failed += chunk.length;
      errors.push(`Chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}`);
    } else {
      success += chunk.length;
    }
  }

  return { success, failed, errors };
}

// ── CSV 헤더 → SpotRow 필드 플렉시블 매핑 ──────────────────────
const HEADER_MAP: Record<string, keyof SpotRow> = {
  place_id: "place_id",
  id_key: "place_id",
  unq_key: "place_id",
  unique_key: "place_id",
  name: "name",
  name_en: "name",
  english_name: "name",
  name_ko: "name_ko",
  korean_name: "name_ko",
  name_kr: "name_ko",
  category: "category",
  type: "category",
  subcategory: "subcategory",
  sub_category: "subcategory",
  city: "city",
  district: "district",
  area: "district",
  gu: "district",
  address: "address",
  addr: "address",
  description: "description",
  desc: "description",
  about: "description",
  image_url: "image_url",
  photo_url: "image_url",
  image: "image_url",
  photo: "image_url",
  duration_minutes: "duration_minutes",
  duration: "duration_minutes",
  time_minutes: "duration_minutes",
  difficulty: "difficulty",
  level: "difficulty",
  required_gear: "required_gear",
  gear: "required_gear",
  equipment: "required_gear",
  tips: "tips",
  tip: "tips",
  advice: "tips",
  price_range: "price_range",
  price: "price_range",
  cost: "price_range",
  michelin_stars: "michelin_stars",
  stars: "michelin_stars",
  michelin: "michelin_stars",
  opening_hours: "opening_hours",
  hours: "opening_hours",
  open: "opening_hours",
  foreign_card_accepted: "foreign_card_accepted",
  card_ok: "foreign_card_accepted",
  solo_friendly: "solo_friendly",
  solo: "solo_friendly",
  google_maps_url: "google_maps_url",
  google_map: "google_maps_url",
  maps_url: "google_maps_url",
  naver_maps_url: "naver_maps_url",
  naver_map: "naver_maps_url",
  is_published: "is_published",
  published: "is_published",
  active: "is_published",
};

/**
 * CSV row(Record<string,string>) → SpotRow 변환
 * 헤더 이름이 달라도 HEADER_MAP으로 유연하게 파싱
 */
export function csvRowToSpot(row: Record<string, string>): Partial<SpotRow> {
  const spot: Partial<SpotRow> = {
    city: "Busan",
    is_published: true,
    foreign_card_accepted: true,
    solo_friendly: true,
  };

  for (const [csvKey, rawValue] of Object.entries(row)) {
    const normalized = csvKey.toLowerCase().trim().replace(/\s+/g, "_");
    const field = HEADER_MAP[normalized];
    if (!field || !rawValue.trim()) continue;

    const v = rawValue.trim();
    switch (field) {
      case "duration_minutes":
      case "michelin_stars":
        spot[field] = parseInt(v, 10) as never;
        break;
      case "foreign_card_accepted":
      case "solo_friendly":
      case "is_published":
        spot[field] = ["true","yes","1","o","y"].includes(v.toLowerCase()) as never;
        break;
      default:
        (spot as Record<string, unknown>)[field] = v;
    }
  }

  return spot;
}

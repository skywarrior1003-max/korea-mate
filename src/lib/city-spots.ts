import { supabase } from "./supabase";
import type { CitySpot, LocalizedText } from "@/data/cities/types";

// ── 카테고리 타입 가드 ────────────────────────────────────────────────────────

const VALID_CATEGORIES = ["attraction", "restaurant", "nature", "event", "accommodation"] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

function toCategory(raw: string): ValidCategory {
  if ((VALID_CATEGORIES as readonly string[]).includes(raw)) return raw as ValidCategory;
  return "attraction"; // DB CHECK constraint으로 실제 도달 불가
}

// ── Supabase row 타입 ─────────────────────────────────────────────────────────

export interface CitySpotRow {
  id: number;
  city: string;
  name: string;
  name_l10n: LocalizedText | null;
  category: string;
  subcategory: string | null;
  district: string | null;
  address: string | null;
  description: string | null;
  desc_l10n: LocalizedText | null;
  why_it_matters: string | null;
  why_l10n: LocalizedText | null;
  image_url: string | null;
  map_url: string | null;
  naver_map_url: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  best_time_slot: string | null;
  opening_hours: { open: string; close: string } | null;
  tags: string[] | null;
  solo_friendly: boolean;
  foreign_card_accepted: boolean;
  cash_only: boolean;
  source_type: "manual" | "tourapi" | "google";
  external_id: string | null;
  rating: number | null;
  official_url: string | null;
  affiliate_url: string | null;
  affiliate_provider: string | null;
  entry_fee: string | null;
  difficulty: string | null;
  created_at: string;
  updated_at: string;
}

// ── Row → CitySpot 어댑터 ─────────────────────────────────────────────────────

export function rowToCitySpot(row: CitySpotRow): CitySpot {
  return {
    id:                   row.id,
    name:                 row.name,
    category:             toCategory(row.category),
    city:                 row.city,
    district:             row.district ?? undefined,
    address:              row.address ?? "",
    description:          row.description ?? "",
    whyItMatters:         row.why_it_matters ?? undefined,
    mapUrl:               row.map_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name)}`,
    naverMapUrl:          row.naver_map_url ?? undefined,
    durationMinutes:      row.duration_minutes ?? undefined,
    bestTimeSlot:         row.best_time_slot ?? undefined,
    openingHours:         row.opening_hours ?? null,
    tags:                 row.tags ?? [],
    relatedSurvivalGuides: [],
    soloFriendly:         row.solo_friendly,
    foreignCardAccepted:  row.foreign_card_accepted,
    cashOnly:             row.cash_only,
    image:                row.image_url ?? undefined,
    lat:                  row.lat ?? undefined,
    lng:                  row.lng ?? undefined,
    nameL10n:             row.name_l10n ?? undefined,
    descriptionL10n:      row.desc_l10n ?? undefined,
    whyItMattersL10n:     row.why_l10n ?? undefined,
    officialUrl:          row.official_url ?? undefined,
    affiliateUrl:         row.affiliate_url ?? undefined,
    affiliateProvider:    row.affiliate_provider ?? undefined,
    entryFee:             row.entry_fee ?? undefined,
    difficulty:           (row.difficulty as CitySpot["difficulty"]) ?? undefined,
    subcategory:          row.subcategory ?? undefined,
  };
}

// ── Fetch 함수 ────────────────────────────────────────────────────────────────

export async function fetchCitySpots(city: string): Promise<CitySpot[]> {
  const { data, error } = await supabase
    .from("city_spots")
    .select("*")
    .eq("city", city)
    .order("id");

  if (error) {
    console.error("[city-spots] fetch error:", error.message);
    return [];
  }

  return (data as CitySpotRow[]).map(rowToCitySpot);
}

export async function fetchCitySpotsByCategory(
  city: string,
  category: string
): Promise<CitySpot[]> {
  const { data, error } = await supabase
    .from("city_spots")
    .select("*")
    .eq("city", city)
    .eq("category", category)
    .order("id");

  if (error) {
    console.error("[city-spots] category fetch error:", error.message);
    return [];
  }

  return (data as CitySpotRow[]).map(rowToCitySpot);
}

export async function upsertCitySpot(
  row: Omit<CitySpotRow, "id" | "created_at" | "updated_at">
): Promise<boolean> {
  const { error } = await supabase
    .from("city_spots")
    .upsert({ ...row, updated_at: new Date().toISOString() });

  if (error) {
    console.error("[city-spots] upsert error:", error.message);
    return false;
  }
  return true;
}

// ── 장소명 정규화 매칭 ────────────────────────────────────────────────────────
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").replace(/\s+/g, " ").trim();
}

export function matchCitySpot(placeName: string, spots: CitySpot[]): CitySpot | null {
  if (!placeName || spots.length === 0) return null;
  const needle = normName(placeName);

  // 1. Exact normalized match
  let hit = spots.find(s => normName(s.name) === needle);
  if (hit) return hit;

  // 2. One contains the other
  hit = spots.find(s => {
    const hay = normName(s.name);
    return needle.includes(hay) || hay.includes(needle);
  });
  if (hit) return hit;

  // 3. Any keyword from spot name (≥4 chars) found in needle
  hit = spots.find(s =>
    normName(s.name).split(" ").filter(w => w.length >= 4).some(w => needle.includes(w))
  );
  return hit ?? null;
}

export async function bulkUpsertCitySpots(
  rows: Omit<CitySpotRow, "id" | "created_at" | "updated_at">[]
): Promise<{ success: number; failed: number }> {
  const CHUNK = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map(r => ({
      ...r,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("city_spots").upsert(chunk);
    if (error) {
      console.error(`[city-spots] bulk chunk ${Math.floor(i / CHUNK) + 1}:`, error.message);
      failed += chunk.length;
    } else {
      success += chunk.length;
    }
  }

  return { success, failed };
}

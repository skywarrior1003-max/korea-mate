import { supabase } from "./supabase";
import type { CitySpot, LocalizedText } from "@/data/cities/types";

// ── Supabase row 타입 ─────────────────────────────────────────────────────────

export interface CitySpotRow {
  id: number;
  city: string;
  name: string;
  name_l10n: LocalizedText | null;
  category: string;
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
  created_at: string;
  updated_at: string;
}

// ── Row → CitySpot 어댑터 ─────────────────────────────────────────────────────

export function rowToCitySpot(row: CitySpotRow): CitySpot {
  return {
    id:                   row.id,
    name:                 row.name,
    category:             row.category as CitySpot["category"],
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

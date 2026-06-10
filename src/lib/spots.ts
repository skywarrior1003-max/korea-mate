import { supabase } from "./supabase";

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

export interface SpotRow {
  id?: number;
  place_id: string;
  title: string;
  category: SpotCategory;
  description?: string;
  image_url?: string;
  difficulty?: HikingDifficulty;
  duration_min?: number;
  required_gear?: string;
  affiliate_url?: string;
  created_at?: string;
}

export async function fetchSpotByPlaceId(placeId: string): Promise<SpotRow | null> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("place_id", placeId)
    .single();
  if (error) { console.error("[Supabase] spot fetch:", error.message); return null; }
  return data as SpotRow;
}

export async function fetchSpotsByCategory(
  category: SpotCategory,
  limit = 50
): Promise<SpotRow[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("category", category)
    .order("title")
    .limit(limit);
  if (error) { console.error("[Supabase] spots list:", error.message); return []; }
  return (data ?? []) as SpotRow[];
}

export async function fetchAllSpots(): Promise<SpotRow[]> {
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .order("category")
    .order("title");
  if (error) { console.error("[Supabase] all spots:", error.message); return []; }
  return (data ?? []) as SpotRow[];
}

export async function searchSpots(query: string, limit = 14): Promise<SpotRow[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from("spots")
    .select("place_id, title, category, description, duration_min, image_url")
    .ilike("title", `%${query.trim()}%`)
    .order("title")
    .limit(limit);
  if (error) { console.error("[Supabase] spot search:", error.message); return []; }
  return (data ?? []) as SpotRow[];
}

export async function upsertSpot(row: SpotRow): Promise<boolean> {
  const { error } = await supabase
    .from("spots")
    .upsert(row, { onConflict: "place_id" });
  if (error) { console.error("[Supabase] spot upsert:", error.message); return false; }
  return true;
}

export async function bulkUpsertSpots(
  rows: SpotRow[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const CHUNK = 50;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
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

// CSV 헤더 → SpotRow 필드 매핑
const HEADER_MAP: Record<string, keyof SpotRow> = {
  place_id:       "place_id",
  id_key:         "place_id",
  unq_key:        "place_id",
  unique_key:     "place_id",
  title:          "title",
  name:           "title",
  name_en:        "title",
  english_name:   "title",
  category:       "category",
  type:           "category",
  description:    "description",
  desc:           "description",
  about:          "description",
  image_url:      "image_url",
  photo_url:      "image_url",
  image:          "image_url",
  photo:          "image_url",
  difficulty:     "difficulty",
  level:          "difficulty",
  duration_min:   "duration_min",
  duration:       "duration_min",
  duration_minutes: "duration_min",
  time_minutes:   "duration_min",
  required_gear:  "required_gear",
  gear:           "required_gear",
  equipment:      "required_gear",
  affiliate_url:  "affiliate_url",
  affiliate:      "affiliate_url",
  booking_url:    "affiliate_url",
  buy_url:        "affiliate_url",
};

// ── 유저 Dislike 기록 ─────────────────────────────────────────
export async function dislikeSpot(placeId: string, deviceId?: string): Promise<boolean> {
  const { error } = await supabase
    .from("spot_reactions")
    .insert({ place_id: placeId, reaction: "dislike", device_id: deviceId ?? null });
  if (error) { console.error("[Supabase] dislike:", error.message); return false; }
  return true;
}

// ── 관리자: 신뢰도 이슈 스팟 조회 ────────────────────────────
export async function fetchFlaggedSpots(
  threshold = 1
): Promise<{ place_id: string; title: string; count: number }[]> {
  const { data: reactions, error } = await supabase
    .from("spot_reactions")
    .select("place_id")
    .eq("reaction", "dislike");
  if (error) { console.error("[Supabase] flagged:", error.message); return []; }

  const counts: Record<string, number> = {};
  for (const row of (reactions ?? [])) {
    counts[row.place_id] = (counts[row.place_id] ?? 0) + 1;
  }

  const filtered = Object.entries(counts)
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1]);

  if (filtered.length === 0) return [];

  const placeIds = filtered.map(([id]) => id);
  const { data: spotsData } = await supabase
    .from("spots")
    .select("place_id, title")
    .in("place_id", placeIds);

  const titleMap = Object.fromEntries(
    (spotsData ?? []).map((s: { place_id: string; title: string }) => [s.place_id, s.title])
  );

  return filtered.map(([place_id, count]) => ({
    place_id,
    title: titleMap[place_id] ?? place_id,
    count,
  }));
}

export function csvRowToSpot(row: Record<string, string>): Partial<SpotRow> {
  const spot: Partial<SpotRow> = {};

  for (const [csvKey, rawValue] of Object.entries(row)) {
    const normalized = csvKey.toLowerCase().trim().replace(/\s+/g, "_");
    const field = HEADER_MAP[normalized];
    if (!field || !rawValue.trim()) continue;

    const v = rawValue.trim();
    if (field === "duration_min") {
      spot.duration_min = parseInt(v, 10);
    } else {
      (spot as Record<string, unknown>)[field] = v;
    }
  }

  return spot;
}

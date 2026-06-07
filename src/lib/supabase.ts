import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AI 생성 7일 일정 ─────────────────────────────────────────
export interface ItineraryRow {
  id:           string;
  city:         string;
  start_date:   string;
  end_date:     string;
  travelers:    string;
  travel_style: string;
  days:         unknown;
}

export async function upsertItinerary(row: ItineraryRow): Promise<boolean> {
  const { error } = await supabase
    .from("itineraries")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { console.error("[Supabase] itinerary upsert:", error.message); return false; }
  return true;
}

export async function fetchItinerary(id: string): Promise<ItineraryRow | null> {
  const { data, error } = await supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, days")
    .eq("id", id)
    .single();
  if (error) { console.error("[Supabase] itinerary fetch:", error.message); return null; }
  return data;
}

// ── 플래너 세션 ──────────────────────────────────────────────
export interface PlannerSessionRow {
  id:            string;
  num_days:      number;
  start_date:    string;
  arrival_times: string[];
  scheduled:     unknown; // Record<number, CartItem[]>
}

export async function upsertPlannerSession(row: PlannerSessionRow): Promise<boolean> {
  const { error } = await supabase
    .from("planner_sessions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { console.error("[Supabase] planner upsert:", error.message); return false; }
  return true;
}

export async function fetchPlannerSession(id: string): Promise<PlannerSessionRow | null> {
  const { data, error } = await supabase
    .from("planner_sessions")
    .select("id, num_days, start_date, arrival_times, scheduled")
    .eq("id", id)
    .single();
  if (error) { console.error("[Supabase] planner fetch:", error.message); return null; }
  return data;
}

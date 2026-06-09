import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AI 생성 7일+ 일정 ────────────────────────────────────────
export interface ItineraryRow {
  id:           string;
  city:         string;
  start_date:   string;
  end_date:     string;
  travelers:    string;
  travel_style: string;
  days:         unknown;
  trip_title?:  string;
  device_id?:   string;
  created_at?:  string;
  updated_at?:  string;
}

export async function upsertItinerary(row: ItineraryRow): Promise<boolean> {
  const { error } = await supabase
    .from("itineraries")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { console.error("[Supabase] itinerary upsert:", error.message); return false; }
  return true;
}

export async function fetchItinerary(id: string, deviceId?: string): Promise<ItineraryRow | null> {
  let q = supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, days, trip_title, device_id, updated_at")
    .eq("id", id);
  // RLS 정책이 device_id를 요구할 때 필터 추가 (own-trip fallback)
  if (deviceId) q = q.eq("device_id", deviceId);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error("[Supabase] itinerary fetch:", error.message); return null; }
  return data;
}

export async function updateItineraryTitle(id: string, title: string, deviceId?: string): Promise<boolean> {
  let q = supabase
    .from("itineraries")
    .update({ trip_title: title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (deviceId) q = q.eq("device_id", deviceId);
  const { error } = await q;
  if (error) { console.error("[Supabase] title update:", error.message); return false; }
  return true;
}

export async function fetchItinerariesByDevice(deviceId: string): Promise<ItineraryRow[]> {
  const { data, error } = await supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, updated_at")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false });
  if (error) { console.error("[Supabase] itineraries by device:", error.message); return []; }
  return (data ?? []) as ItineraryRow[];
}

export async function deleteItinerary(id: string, deviceId?: string): Promise<boolean> {
  let q = supabase.from("itineraries").delete().eq("id", id);
  if (deviceId) q = q.eq("device_id", deviceId);
  const { error } = await q;
  if (error) { console.error("[Supabase] itinerary delete:", error.message); return false; }
  return true;
}

// ── 플래너 세션 ──────────────────────────────────────────────
export interface PlannerSessionRow {
  id:            string;
  num_days:      number;
  start_date:    string;
  arrival_times: string[];
  scheduled:     unknown;
  device_id?:    string;
  created_at?:   string;
  updated_at?:   string;
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
    .select("id, num_days, start_date, arrival_times, scheduled, device_id, updated_at")
    .eq("id", id)
    .single();
  if (error) { console.error("[Supabase] planner fetch:", error.message); return null; }
  return data;
}

export async function fetchPlannersByDevice(deviceId: string): Promise<PlannerSessionRow[]> {
  const { data, error } = await supabase
    .from("planner_sessions")
    .select("id, num_days, start_date, updated_at")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false });
  if (error) { console.error("[Supabase] planners by device:", error.message); return []; }
  return (data ?? []) as PlannerSessionRow[];
}

export async function deletePlannerSession(id: string, deviceId?: string): Promise<boolean> {
  let q = supabase.from("planner_sessions").delete().eq("id", id);
  if (deviceId) q = q.eq("device_id", deviceId);
  const { error } = await q;
  if (error) { console.error("[Supabase] planner delete:", error.message); return false; }
  return true;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://placeholder.supabase.co";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// 빌드 시 env 누락 경고 — 키 값은 절대 출력하지 않음
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured — all DB calls will fail at runtime.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AI 생성 7일+ 일정 ────────────────────────────────────────
export interface ItineraryRow {
  id:            string;
  city:          string;
  start_date:    string;
  end_date:      string;
  travelers:     string;
  travel_style:  string;
  days:          unknown;
  trip_title?:   string;
  device_id?:    string;
  created_at?:   string;
  updated_at?:   string;
  view_count?:   number;
  helpful_count?: number;
}

// Popular trips feed (TASK-034 — view_count >= 2, ordered by weighted score)
export interface PopularTrip {
  id:            string;
  city:          string;
  start_date:    string;
  end_date:      string;
  travel_style:  string;
  view_count:    number;
  helpful_count: number;
  copy_count?:   number;
  trip_title?:   string;
}

// ⚠️ TASK-SEC-02: 017_lockdown_itineraries.sql 적용 후 아래 직접 테이블 접근 함수들은
//   anon SELECT/INSERT/UPDATE/DELETE 권한이 전면 회수되어 42501(permission denied) 실패.
//   device_id 제거는 코드 레벨 개선이며 실제 보안 차단의 주체는 DB 레벨 REVOKE(017).
//   복구: Phase 2에서 SECURITY DEFINER RPC 또는 서버 API Route로 교체.

export async function upsertItinerary(row: ItineraryRow): Promise<boolean> {
  // ⚠️ 017 migration 후 INSERT/UPDATE 모두 anon 권한 없음 → 실패 (false 반환)
  const { error } = await supabase
    .from("itineraries")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { console.error("[Supabase] itinerary upsert:", error.message); return false; }
  return true;
}

export async function fetchItinerary(id: string, deviceId?: string): Promise<ItineraryRow | null> {
  // ⚠️ 017 migration 후 anon SELECT 권한 없음 → 실패 (null 반환)
  // device_id는 SELECT 목록에서 제외: Phase 2 컬럼 제한 선제 대응 (보안 차단은 DB REVOKE)
  let q = supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, days, trip_title, updated_at, view_count, helpful_count")
    .eq("id", id);
  // Phase 2에서 소유권 토큰으로 대체 예정
  if (deviceId) q = q.eq("device_id", deviceId);
  const { data, error } = await q.maybeSingle();
  if (error) { console.error("[Supabase] itinerary fetch:", error.message); return null; }
  return data;
}

// TASK-SEC-02: 공유 페이지 전용 안전 조회 — SECURITY DEFINER RPC 경유
// device_id / email / created_at 미반환. 직접 REST 테이블 접근 대체.
export async function fetchSharedItinerary(id: string): Promise<ItineraryRow | null> {
  const { data, error } = await supabase
    .rpc("get_shared_itinerary", { p_id: id });
  if (error) { console.error("[Supabase] shared fetch:", error.message); return null; }
  const rows = data as ItineraryRow[] | null;
  return rows?.[0] ?? null;
}

export async function updateItineraryTitle(id: string, title: string, deviceId?: string): Promise<boolean> {
  // ⚠️ 017 migration 후 anon UPDATE 권한 없음 → 실패 (false 반환)
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
  // ⚠️ 017 migration 후 anon SELECT 권한 없음 → 실패 ([] 반환, My Trips 빈 화면)
  const { data, error } = await supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travelers, travel_style, updated_at")
    .eq("device_id", deviceId)
    .order("updated_at", { ascending: false });
  if (error) { console.error("[Supabase] itineraries by device:", error.message); return []; }
  return (data ?? []) as ItineraryRow[];
}

export async function deleteItinerary(id: string, deviceId?: string): Promise<boolean> {
  // ⚠️ 017 migration 후 anon DELETE 권한 없음 → 실패 (false 반환)
  let q = supabase.from("itineraries").delete().eq("id", id);
  if (deviceId) q = q.eq("device_id", deviceId);
  const { error } = await q;
  if (error) { console.error("[Supabase] itinerary delete:", error.message); return false; }
  return true;
}

// TASK-034: popular trips feed — weighted score = view_count + helpful_count × 3
// ⚠️ 017 migration 후 anon SELECT 권한 없음 → 실패 ([] 반환, 인기 여행 미노출)
export async function fetchPopularTrips(limit = 6): Promise<PopularTrip[]> {
  const { data, error } = await supabase
    .from("itineraries")
    .select("id, city, start_date, end_date, travel_style, view_count, helpful_count, trip_title")
    .gte("view_count", 2)
    .order("view_count", { ascending: false })
    .limit(limit * 2); // 클라이언트 가중 정렬 후 slice → 여유분 2배 조회
  if (error) { console.error("[Supabase] popular trips:", error.message); return []; }
  const rows = (data ?? []) as PopularTrip[];
  return rows
    .sort((a, b) => (b.view_count + (b.helpful_count ?? 0) * 3) - (a.view_count + (a.helpful_count ?? 0) * 3))
    .slice(0, limit);
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
  try {
    const { data, error } = await supabase
      .from("planner_sessions")
      .select("id, num_days, start_date, arrival_times, scheduled, device_id, updated_at")
      .eq("id", id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) { console.error("[Supabase] planner fetch:", error.message); return null; }
    return (data?.[0] ?? null) as PlannerSessionRow | null;
  } catch (e) {
    console.error("[Supabase] planner fetch exception:", (e as Error).message);
    return null;
  }
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

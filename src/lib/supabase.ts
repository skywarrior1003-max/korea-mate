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
  is_public?:    boolean;
  copy_of?:      string | null;
  copy_count?:   number;
  /** 현재 표지 종류. 소유자 GET 에서만 내려온다 */
  cover_kind?:      "auto" | "asset" | "moment";
  /** cover_kind="moment" 일 때 표지로 쓰는 Memory. 경로가 아니라 ID 다 */
  cover_moment_id?: string | null;
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

// 공유 페이지 전용 조회 — 서버가 정제한 것만 받는다.
//
// 예전에는 여기서 `get_shared_itinerary` RPC 를 직접 불렀다. RPC 는 device_id·
// email 을 빼 주지만 `days` 는 통째로 돌려준다. 그 안에 화면이 쓰지도 않는
// 좌표·지도 링크·내부 식별자가 있었고, My Place 를 담은 일정이라면 그 장소의
// 비공개 메모까지 브라우저로 나갔다.
//
// 이제 Pages Function 이 service_role 로 읽고 whitelist 로 정제한 뒤 돌려준다
// (`functions/api/shared/[id]/story.ts`). 브라우저는 애초에 원본을 받지 않는다.
export async function fetchSharedItinerary(id: string): Promise<ItineraryRow | null> {
  let res: Response;
  try {
    res = await fetch(`/api/shared/${encodeURIComponent(id)}/story`);
  } catch {
    console.error("[shared] fetch failed");
    return null;
  }
  if (!res.ok) {
    // 비공개·미존재는 둘 다 404 다 — 존재 여부를 구분해 주지 않는다
    if (res.status !== 404) console.error("[shared] fetch status:", res.status);
    return null;
  }
  try { return (await res.json()) as ItineraryRow; }
  catch { return null; }
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

// ── 플래너 세션 ─ 제거됨 ───────────────────────
// PlannerSessionRow 타입과 helper 4종(upsertPlannerSession / fetchPlannerSession /
// fetchPlannersByDevice / deletePlannerSession)은 제거했다.
//
// 호출처가 0건인 dead code 였다. 브라우저 번들·Functions Worker 번들 어느
// 쪽에도 들어가지 않았고(tree-shaking), 사용자 기능과 연결된 적도 없다.
//
// 남겨 두면 오해를 불러서 위험하다. planner_sessions 는 029_lockdown_planner_sessions.sql
// 로 anon·authenticated 권한을 전면 회수한 상태라 이 helper 들을 그대로 불러도
// 42501 로 실패한다. "있으니 쓸 수 있겠지" 하고 손대면 그제서야 드러난다.
//
// 현재 일정 저장·조회는 planner_sessions 가 아니라 itineraries 와 그 서버 API
// (functions/api/itinerary*, src/lib/itinerary-api.ts) 를 쓴다.
//
// 재유입 방지는 src/lib/planner-sessions-removal-guard.test.ts 가 지킨다.
// 029 migration 의 주석은 적용 시점(2026)의 기록이므로 그대로 둔다.

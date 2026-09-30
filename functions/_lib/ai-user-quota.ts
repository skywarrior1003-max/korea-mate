// 사용자별 무료 AI 이용 횟수 (084_ai_user_usage_ledger · EXTERNAL-TRIP-IMPORT-V2)
//
// 회사 비용 게이트(ai-ops-guard)와 별개의 축이다. 순서는 항상
//   로그인(requireActiveUser) → 사용자 횟수 예약(여기) → 회사 스위치·비용 예약 → provider
// 이고, provider 결과가 "사용자가 받은 완성 작업"일 때만 확정(committed)한다.
// 실패·timeout·무효 결과·중복 요청은 해제(released)한다 — 사용자 차감 0.
//
// 원장 표·RPC 가 없는 환경(Production 미적용 등)에서는 fail-closed: 횟수를 셀 수 없으면
// AI 를 부르지 않는다(무제한 무료가 열리지 않게).

export interface QuotaEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type QuotaFeature = "import" | "personalize" | "writing";
export type QuotaPool = "welcome_import" | "plan_import" | "writing";

export type QuotaReserve =
  | { status: "reserved"; id: number; pool: QuotaPool }
  | { status: "replay"; id: number; pool: QuotaPool; result: unknown }
  | { status: "in_progress" }
  | { status: "exhausted"; pool: QuotaPool; resetsAt: string }
  | { status: "unavailable" };

export interface QuotaBalance {
  welcome_import: number;
  plan_import: number;
  writing: number;
  resets_at: string;
}

async function rpc(env: QuotaEnv, fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data: unknown }> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, data: null };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

/** 같은 사용자의 같은 입력은 같은 키 — 새로고침·중복 클릭이 두 번 차감되지 않는다 */
export async function quotaIdemKey(userId: string, feature: QuotaFeature, input: string): Promise<string> {
  const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10); // KST 날짜
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}|${feature}|${day}|${input}`));
  return `${feature}:` + [...new Uint8Array(buf)].slice(0, 20).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function quotaReserve(env: QuotaEnv, userId: string, feature: QuotaFeature, idemKey: string): Promise<QuotaReserve> {
  const r = await rpc(env, "ai_user_reserve", { p_user: userId, p_feature: feature, p_idem: idemKey });
  const d = r.data as { status?: string; id?: number; pool?: QuotaPool; result?: unknown; resets_at?: string } | null;
  if (!r.ok || !d || typeof d.status !== "string") return { status: "unavailable" };
  if (d.status === "reserved" && typeof d.id === "number" && d.pool) return { status: "reserved", id: d.id, pool: d.pool };
  if (d.status === "replay" && typeof d.id === "number" && d.pool) return { status: "replay", id: d.id, pool: d.pool, result: d.result };
  if (d.status === "in_progress") return { status: "in_progress" };
  if (d.status === "exhausted" && d.pool) return { status: "exhausted", pool: d.pool, resetsAt: d.resets_at ?? "" };
  return { status: "unavailable" };
}

/** 확정은 사용자가 받은 완성 결과가 있을 때만. result 는 같은 요청 재응답용(원문 아님). */
export async function quotaSettle(env: QuotaEnv, id: number, userId: string, status: "committed" | "released", result?: unknown): Promise<boolean> {
  const r = await rpc(env, "ai_user_settle", { p_id: id, p_user: userId, p_status: status, p_result: status === "committed" ? (result ?? null) : null });
  return r.ok && r.data === true;
}

export async function quotaBalance(env: QuotaEnv, userId: string): Promise<QuotaBalance | null> {
  const r = await rpc(env, "ai_user_balance", { p_user: userId });
  const d = r.data as QuotaBalance | null;
  if (!r.ok || !d || typeof d.plan_import !== "number") return null;
  return d;
}

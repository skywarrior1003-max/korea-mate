// 사용자별 무료 AI 이용 횟수 (084 → 086 → 087 · EXTERNAL-TRIP-IMPORT-V2)
// 087(2026-09-25 Owner 작업 지시 기준으로 교정):
//  · 일정 만들기(plan) 월 1회 — 글·링크 가져오기 분석과 AI 일정(개인화·레거시 생성)이 공유
//    + 신규 회원 최초 보너스 1회(계정당 1회, 가져오기 전용 아님)
//  · 전체 여행 AI 글쓰기(writing) 월 2회 — My Trip·Story 공유, 3문체 한 요청 = 1회
// '월' 기준(서울 시각 달력 월)과 보너스 만료(없음)는 원문에 없는 값 — DB 함수 한 곳(ai_user_period_now)에 둔다.
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
/** 087 부터 새 행은 plan(가져오기·AI 일정) | writing(전체 여행 글쓰기). 나머지는 084·086 과거 값. */
export type QuotaPool = "plan" | "writing" | "shared_30d" | "welcome_import" | "plan_import";

export type QuotaReserve =
  | { status: "reserved"; id: number; pool: QuotaPool; period?: string }
  | { status: "replay"; id: number; pool: QuotaPool; result: unknown }
  | { status: "in_progress" }
  | { status: "exhausted"; pool: QuotaPool; resetsAt: string }
  | { status: "unavailable" };

/** 남은 무료 사용권 — 유료 잔액은 없다(결제 미구현). */
export interface QuotaBalance {
  /** 이번 '월'(YYYY-MM, 서울 시각) */
  period: string;
  /** 다음 달 시작(ISO, UTC) — 월 사용권이 다시 생기는 시각 */
  resets_at: string;
  /** 일정 만들기(가져오기·AI 일정 공유): 월 1회 + 최초 보너스 1회(계정당 1회) */
  plan: { monthly_limit: number; monthly_remaining: number; bonus_remaining: number };
  /** 전체 여행 AI 글쓰기(My Trip·Story 공유): 월 2회 */
  writing: { monthly_limit: number; monthly_remaining: number };
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
  const d = r.data as { status?: string; id?: number; pool?: QuotaPool; period?: string; result?: unknown; resets_at?: string } | null;
  if (!r.ok || !d || typeof d.status !== "string") return { status: "unavailable" };
  if (d.status === "reserved" && typeof d.id === "number" && d.pool) return { status: "reserved", id: d.id, pool: d.pool, ...(typeof d.period === "string" ? { period: d.period } : {}) };
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

/** 사용자 무료 횟수 되돌림(완성 결과 없음 → 차감 0). 회사 비용 원장(aiOpsSettle)의 정산과는 별개 축이다. */
export function quotaRelease(env: QuotaEnv, id: number, userId: string): Promise<boolean> {
  return quotaSettle(env, id, userId, "released");
}

export async function quotaBalance(env: QuotaEnv, userId: string): Promise<QuotaBalance | null> {
  const r = await rpc(env, "ai_user_balance", { p_user: userId });
  const d = r.data as QuotaBalance | null;
  if (!r.ok || !d || !d.plan || !d.writing || typeof d.plan.monthly_remaining !== "number") return null;
  return d;
}

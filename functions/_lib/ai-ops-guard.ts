// 공통 AI 운영 게이트 (V2-AI-HARDCAP…-V1 §6·§7·§8)
//
// 모든 provider 호출은 이 게이트를 지나야 한다. 순서:
//   ① AI_MODE(env) — 전역 최상위. off 면 어떤 하위 설정도 못 뒤집는다.
//   ② DB 스위치(ai_ops_switches) — ai_master 와 기능 스위치가 **둘 다 'live'**
//      여야 한다. 조회 실패·행 부재·오타 = 차단(fail-closed). env 재배포 없이
//      행 UPDATE 만으로 즉시 정지된다(§8 "배포 없는 비상정지" 경로).
//      (이 파일은 값·비밀을 로그·응답에 싣지 않는다)
//   ③ 비용 예약(ai_ops_reserve) — 최악 비용을 원자 예약. 실패하면 provider 를
//      호출하지 않는다. 성공 시 ledgerId 로 commit/release/unknown 을 정산한다.
//
// 사용자 응답은 내부 상태를 드러내지 않는 일반 문구만 쓴다.
import { aiAllowed } from "./app-env";

export interface OpsEnv {
  APP_ENV?: string; AI_MODE?: string; GEMINI_API_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type AiFeature =
  | "personalize" | "writing" | "import_analyze" | "itinerary_legacy" | "canary" | "curator";

const FEATURE_KEY: Record<AiFeature, string> = {
  personalize: "feature_personalize",
  writing: "feature_writing",
  import_analyze: "feature_import_analyze",
  itinerary_legacy: "feature_itinerary_legacy",
  canary: "feature_canary",
  curator: "feature_curator",
};

/** 사용자용 일반 차단 응답 — 기본 기능은 계속 쓸 수 있다는 사실만 전한다 */
export function aiFeatureUnavailable(status = 503): Response {
  return new Response(JSON.stringify({ error: "ai_unavailable_in_this_environment" }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function rest(env: OpsEnv, pathQ: string, init?: RequestInit) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  try { return { ok: res.ok, data: text ? JSON.parse(text) : null }; }
  catch { return { ok: false, data: null }; }
}

// isolate 수명 내 짧은 캐시 — 비상정지 반영 지연 ≤30s
let switchCache: { at: number; map: Map<string, string> } | null = null;
const SWITCH_TTL_MS = 30_000;

export async function readSwitches(env: OpsEnv): Promise<Map<string, string> | null> {
  if (switchCache && Date.now() - switchCache.at < SWITCH_TTL_MS) return switchCache.map;
  const r = await rest(env, "ai_ops_switches?select=ops_key,value_text&limit=100");
  if (!r.ok || !Array.isArray(r.data)) return null; // 조회 실패 = 차단(호출부)
  const map = new Map((r.data as { ops_key: string; value_text: string }[])
    .map(x => [x.ops_key, x.value_text.trim().toLowerCase()]));
  switchCache = { at: Date.now(), map };
  return map;
}

/** 테스트 전용 — 캐시 초기화 */
export function _resetSwitchCache(): void { switchCache = null; }

export interface ReserveInput {
  feature: AiFeature;
  model: string;
  /** 최악 비용(USD micro) — cost-model 근거 상수 */
  worstUsdMicro: number;
  idempotencyKey: string;
  actorHash?: string | null;
  featureDailyCalls: number;
  featureDailyUsdMicro: number;
}

export type OpsGateResult =
  | { ok: true; ledgerId: number }
  | { ok: false; response: Response };

/**
 * provider 호출 직전 게이트. 실패 Response 를 그대로 반환하면 된다.
 * mock 등 provider 를 부르지 않는 경로는 이 게이트를 거치지 않는다(과금 0).
 */
export async function aiOpsReserve(env: OpsEnv, input: ReserveInput): Promise<OpsGateResult> {
  // ① 전역 env 게이트 — 최우선. 하위 스위치로 뒤집을 수 없다.
  if (!aiAllowed(env)) return { ok: false, response: aiFeatureUnavailable() };
  // ② DB 스위치 — master AND feature 둘 다 'live'. 부재·오타·조회실패 = 차단.
  const sw = await readSwitches(env);
  if (!sw) return { ok: false, response: aiFeatureUnavailable() };
  if (sw.get("ai_master") !== "live") return { ok: false, response: aiFeatureUnavailable() };
  if (sw.get(FEATURE_KEY[input.feature]) !== "live") return { ok: false, response: aiFeatureUnavailable() };
  // ③ 원자 비용 예약 — 실패 시 provider 미호출
  const r = await rest(env, "rpc/ai_ops_reserve", {
    method: "POST",
    body: JSON.stringify({
      p_route: input.feature, p_model: input.model,
      p_worst_usd_micro: Math.max(1, Math.ceil(input.worstUsdMicro)),
      p_idem_key: input.idempotencyKey,
      p_actor_hash: input.actorHash ?? null,
      p_feature_daily_calls: input.featureDailyCalls,
      p_feature_daily_usd_micro: input.featureDailyUsdMicro,
    }),
  });
  const row = r.ok && Array.isArray(r.data) ? r.data[0] as { ok: boolean; reason: string; ledger_id: number | null } : null;
  if (!row) return { ok: false, response: aiFeatureUnavailable() };
  if (!row.ok) {
    // 중복 요청은 추가 과금 없이 명확한 상태로(사유 문자열은 내부 코드값만)
    const status = row.reason === "duplicate_idempotency" ? 409 : 503;
    return { ok: false, response: aiFeatureUnavailable(status) };
  }
  return { ok: true, ledgerId: Number(row.ledger_id) };
}

/**
 * 정산. committed: usage 기반 실비 / released: 명확한 무과금 실패만 /
 * unknown_billed: timeout·연결단절 등 과금 불명(예약액 보존).
 */
export async function aiOpsSettle(
  env: OpsEnv, ledgerId: number,
  status: "committed" | "released" | "unknown_billed",
  usage?: { inTok?: number | null; outTok?: number | null; usdMicro?: number | null },
): Promise<void> {
  await rest(env, "rpc/ai_ops_settle", {
    method: "POST",
    body: JSON.stringify({
      p_ledger_id: ledgerId, p_status: status,
      p_committed_usd_micro: status === "committed" ? Math.max(0, Math.ceil(usage?.usdMicro ?? 0)) : null,
      p_input_tokens: usage?.inTok ?? null, p_output_tokens: usage?.outTok ?? null,
    }),
  }).catch(() => { /* 정산 실패는 요청을 죽이지 않는다 — reserved 로 남아 예산에 계속 계상 */ });
}

/** 공식 단가(cost-model 과 동일 원장) — 실비 commit 계산용 */
export const USD_MICRO_PER_IN_TOK = 0.30;   // $0.30/1M = 0.30 µ$/tok
export const USD_MICRO_PER_OUT_TOK = 2.50;  // $2.50/1M
export function usdMicroFromUsage(inTok: number | null | undefined, outTok: number | null | undefined): number {
  return Math.ceil((inTok ?? 0) * USD_MICRO_PER_IN_TOK + (outTok ?? 0) * USD_MICRO_PER_OUT_TOK);
}

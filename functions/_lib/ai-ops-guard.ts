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
  // ②-b 예약 초과 차단(2026-10-02) — 오늘(UTC, 예약 함수의 날짜 기준과 같다) 이 기능에서 실제 비용이 예약액을
  //   넘은 호출이 하나라도 있으면 예약 계산이 틀린 것이다. 그날은 더 보내지 않는다 — 초과가 쌓이지 않게.
  //   일·월·기능 상한은 확정 비용(committed)으로 다시 계산되므로 이미 생긴 초과분도 이후 예약에 반영된다.
  if (await hasOverrunToday(env, input.feature)) {
    console.error(JSON.stringify({ event: "ai_ops_overrun_block", feature: input.feature }));
    return { ok: false, response: aiFeatureUnavailable() };
  }
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
 * 운영 점검 전용 예약(2026-10-02) — 관리자 모델 가용성 점검처럼 **AI 스위치가 꺼진 상태에서도** 돌아야 하는 아주 작은 호출을
 * 회사 원장에 남기고(감사), route 별 일일 호출·금액 상한과 회사 일·월 상한을 그대로 적용한다. 스위치만 보지 않는다.
 * 사용자 기능에는 쓰지 않는다(그쪽은 aiOpsReserve).
 */
export async function aiOpsReserveOpsCheck(env: OpsEnv, input: { route: string; worstUsdMicro: number; dailyCalls: number; dailyUsdMicro: number; actorHash?: string | null }): Promise<{ ok: true; ledgerId: number } | { ok: false; reason: string }> {
  // 원장을 쓰지 못하면(설정 없음·연결 실패) 부르지 않는다 — fail-closed
  const r = await rest(env, "rpc/ai_ops_reserve", {
    method: "POST",
    body: JSON.stringify({
      p_route: input.route, p_model: "ops-check",
      p_worst_usd_micro: Math.max(1, Math.ceil(input.worstUsdMicro)),
      p_idem_key: `${input.route}:${crypto.randomUUID()}`,
      p_actor_hash: input.actorHash ?? null,
      p_feature_daily_calls: input.dailyCalls,
      p_feature_daily_usd_micro: input.dailyUsdMicro,
    }),
  }).catch(() => ({ ok: false, data: null }));
  const row = r.ok && Array.isArray(r.data) ? r.data[0] as { ok: boolean; reason: string; ledger_id: number | null } : null;
  if (!row) return { ok: false, reason: "ledger_unavailable" };
  return row.ok ? { ok: true, ledgerId: Number(row.ledger_id) } : { ok: false, reason: row.reason };
}

/**
 * 오늘 이 기능에 확정 비용 > 예약액 인 행이 있는가. 조회 실패는 "있다"로 본다(스위치와 같은 fail-closed).
 * 하루 행 수는 기능별 일일 호출 상한(writing 100 등) 안이라 한 번에 읽는다.
 */
export async function hasOverrunToday(env: OpsEnv, feature: AiFeature, now: Date = new Date()): Promise<boolean> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const r = await rest(env, `ai_ops_ledger?route=eq.${encodeURIComponent(feature)}&status=eq.committed` +
    `&created_at=gte.${encodeURIComponent(day)}&select=reserved_usd_micro,committed_usd_micro&limit=5000`);
  if (!r.ok || !Array.isArray(r.data)) return true;
  return (r.data as { reserved_usd_micro: number | null; committed_usd_micro: number | null }[])
    .some(x => typeof x.committed_usd_micro === "number" && typeof x.reserved_usd_micro === "number" && x.committed_usd_micro > x.reserved_usd_micro);
}

/**
 * 정산. committed: usage 기반 실비 / released: 명확한 무과금 실패만 /
 * unknown_billed: timeout·연결단절 등 과금 불명(예약액 보존).
 */
export async function aiOpsSettle(
  env: OpsEnv, ledgerId: number,
  status: "committed" | "released" | "unknown_billed",
  usage?: { inTok?: number | null; outTok?: number | null; usdMicro?: number | null },
  /** 이 호출의 예약액 — 넘기면 확정액이 더 클 때 "초과 지출" 을 따로 기록한다(이후 차단 기록 ai_ops_overrun_block 과 구분) */
  reservedUsdMicro?: number,
): Promise<void> {
  const committed = status === "committed" ? Math.max(0, Math.ceil(usage?.usdMicro ?? 0)) : null;
  if (committed !== null && typeof reservedUsdMicro === "number" && committed > reservedUsdMicro) {
    console.error(JSON.stringify({ event: "ai_ops_overrun", ledgerId, reservedUsdMicro, committedUsdMicro: committed, inTok: usage?.inTok ?? null, outTok: usage?.outTok ?? null }));
  }
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
/**
 * 모델별 공식 단가(유료 · 1M 토큰당 $ = 토큰당 µ$) — ai.google.dev/gemini-api/docs/pricing 2026-09-30 확인.
 * 3.8 Flash 는 2027-01-01 부터 두 배(공지). 서울 Worker 가 x-gkm-model 로 실제 모델을 알려 준다.
 */
const MODEL_PRICES: Record<string, (at: Date) => { inTok: number; outTok: number }> = {
  "gemini-2.5-flash": () => ({ inTok: 0.30, outTok: 2.50 }),
  "gemini-3.5-flash-lite": () => ({ inTok: 0.30, outTok: 2.50 }),
  "gemini-3.8-flash": at => at.getTime() < Date.UTC(2027, 0, 1) ? { inTok: 0.75, outTok: 3.75 } : { inTok: 1.50, outTok: 7.50 },
};
/**
 * 표에 없는 모델 이름이 오면(Worker 설정이 바뀌었는데 이 표를 고치지 않은 경우, 2026-10-02) 기본 단가로 적으면
 * 실제보다 싸게 기록되어 예약 초과도 숨는다. 표에서 가장 비싼 단가로 적는다 — 초과가 드러나 그날 그 기능이 멈춘다.
 * 모델 이름을 넘기지 않는 예전 호출부는 그대로 기본 단가다.
 */
function highestKnownPrice(at: Date): { inTok: number; outTok: number } {
  const all = Object.values(MODEL_PRICES).map(f => f(at));
  return { inTok: Math.max(...all.map(p => p.inTok)), outTok: Math.max(...all.map(p => p.outTok)) };
}
export function usdMicroFromUsage(inTok: number | null | undefined, outTok: number | null | undefined, model?: string | null): number {
  const p = model
    ? (MODEL_PRICES[model] ? MODEL_PRICES[model]!(new Date()) : highestKnownPrice(new Date()))
    : { inTok: USD_MICRO_PER_IN_TOK, outTok: USD_MICRO_PER_OUT_TOK };
  return Math.ceil((inTok ?? 0) * p.inTok + (outTok ?? 0) * p.outTok);
}

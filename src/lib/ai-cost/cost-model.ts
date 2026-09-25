// AI 원가 모델 (V2-AI-COST-AUDIT-V1 · 2026-09-25) — 순수 계산 전용.
// runtime 동작을 바꾸지 않는다. 다음 하드캡 TASK 의 차감량·예산 산정 입력이다.
//
// 가격 원장(공식): https://ai.google.dev/gemini-api/docs/pricing
//   조사 2026-09-25 04:5x UTC (13:5x KST) · 모델 SKU: gemini-2.5-flash (paid tier)
//   input(text/image/video) $0.30 / 1M tok · output $2.50 / 1M tok (thinking 포함)
//   context caching $0.03 / 1M tok (+storage $1.00/1M tok/h) — 현재 코드 미사용
// 환율: open.er-api.com 2026-09-25 00:02 UTC 기준 1 USD = 1,368.6 KRW
//   시나리오: 강세 1,300 · 기준 1,368.6 · 약세 1,450

export const MODEL_SKU = "gemini-2.5-flash" as const;
export const PRICE_IN_PER_MTOK_USD = 0.30;
export const PRICE_OUT_PER_MTOK_USD = 2.50; // thinking 토큰 포함
/** 모델 출력 하드 최대(공식 모델 스펙) — maxOutputTokens 미설정 경로의 최악값 */
export const MODEL_MAX_OUTPUT_TOKENS = 65_536;

export const FX = { strongKRW: 1300, base: 1368.6, weakKRW: 1450 } as const;

/**
 * 문자→토큰 보수 환산. 영문 ~4 chars/tok·한글 ~2 chars/tok 혼합 프롬프트를
 * 3 chars/tok 으로 잡는다(과소평가 방지 쪽으로 보수적).
 */
export const CHARS_PER_TOKEN = 3;
export const tokensFromChars = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

export interface CallProfile {
  /** 코드 근거 주석은 audit 문서 §2·§3 참조 */
  feature: string;
  inTokensTypical: number;
  inTokensMax: number;
  outTokensTypical: number;
  /** 코드의 maxOutputTokens. 미설정(UNBOUNDED)이면 MODEL_MAX_OUTPUT_TOKENS */
  outTokensMax: number;
  /** 사용자 행동 1회당 정상 provider 성공 호출 수 */
  billableCallsTypical: number;
  /** 최악(재시도 포함) 과금 호출 수 — 503 재시도는 무과금이므로 성공 기준 */
  billableCallsWorst: number;
}

export const callCostUSD = (inTok: number, outTok: number): number =>
  (inTok * PRICE_IN_PER_MTOK_USD + outTok * PRICE_OUT_PER_MTOK_USD) / 1_000_000;

export const actionCostUSD = (p: CallProfile, kind: "typical" | "worst"): number =>
  kind === "typical"
    ? p.billableCallsTypical * callCostUSD(p.inTokensTypical, p.outTokensTypical)
    : p.billableCallsWorst * callCostUSD(p.inTokensMax, p.outTokensMax);

export const usdToKrw = (usd: number, fx: number = FX.base): number => usd * fx;

// ── 기능 프로파일 (코드 상수 근거 — audit §3 표와 1:1) ──────────────────────
export const PROFILES: Record<string, CallProfile> = {
  // functions/api/generate-itinerary.ts — buildPrompt ≤~12k chars,
  // V2-HARDCAP 에서 maxOutputTokens: 8192 캡 적용(감사 시점엔 UNBOUNDED 였다)
  itinerary: {
    feature: "일정 생성",
    inTokensTypical: tokensFromChars(9_000),
    inTokensMax: tokensFromChars(14_000),
    outTokensTypical: 4_000,
    outTokensMax: 8_192, // generate-itinerary generationConfig.maxOutputTokens
    billableCallsTypical: 1,
    billableCallsWorst: 1, // 503 재시도만 존재(무과금)·parse 재호출 없음
  },
  // functions/api/mytrip/writing.ts — Worker 1회, out 700~3,400 · 이미지 ≤400k b64
  writing: {
    feature: "Story/AI Writing",
    inTokensTypical: 1_500,
    inTokensMax: 3_500, // 텍스트 ≤~2k tok + 이미지 1장 토큰화(보수 1.5k)
    outTokensTypical: 1_200,
    outTokensMax: 3_400, // MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS
    billableCallsTypical: 1,
    billableCallsWorst: 1, // single-flight·캐시·429 원장
  },
  // functions/api/import/analyze.ts — 텍스트 ≤18,000 chars, out 4,096, retry 0
  importAnalyze: {
    feature: "가져오기 분석",
    inTokensTypical: tokensFromChars(12_000),
    inTokensMax: tokensFromChars(19_000),
    outTokensTypical: 1_500,
    outTokensMax: 4_096,
    billableCallsTypical: 1,
    billableCallsWorst: 1,
  },
  // functions/api/trip/personalize.ts — prompt ≤6,000 chars, out 700, retry 0
  personalize: {
    feature: "여행 개인화",
    inTokensTypical: 1_500,
    inTokensMax: tokensFromChars(6_500),
    outTokensTypical: 500,
    outTokensMax: 700,
    billableCallsTypical: 1,
    billableCallsWorst: 1,
  },
};

// ── 5,900원 이용권 경제성 ────────────────────────────────────────────────────
export const TICKET_PRICE_KRW = 5_900;

export interface TicketEconomics {
  fxKrwPerUsd: number;
  /** PG 수수료율(범위 계산용) */
  pgFeeRate: number;
  /** 부가세 포함가 가정 시 공급가 환산 적용 여부 */
  vatInclusive: boolean;
}

/** 결제 후 AI 에 쓸 수 있는 금액(KRW) — 문서 미확정 항목은 호출부가 범위로 돌린다 */
export function usableKrw(e: TicketEconomics): number {
  const supply = e.vatInclusive ? TICKET_PRICE_KRW / 1.1 : TICKET_PRICE_KRW;
  return supply * (1 - e.pgFeeRate);
}

export interface ScenarioResult {
  credits: number;
  costTypicalKRW: number;
  costWorstKRW: number;
  usableKRW: number;
  marginTypicalKRW: number;
  marginWorstKRW: number;
  breakevenActionsWorst: number;
}

/** credits 회를 profile 기능에 전부 사용할 때의 경제성 */
export function ticketScenario(
  credits: number, profile: CallProfile, econ: TicketEconomics,
): ScenarioResult {
  const typ = usdToKrw(actionCostUSD(profile, "typical"), econ.fxKrwPerUsd) * credits;
  const worst = usdToKrw(actionCostUSD(profile, "worst"), econ.fxKrwPerUsd) * credits;
  const usable = usableKrw(econ);
  const worstPer = usdToKrw(actionCostUSD(profile, "worst"), econ.fxKrwPerUsd);
  return {
    credits,
    costTypicalKRW: typ,
    costWorstKRW: worst,
    usableKRW: usable,
    marginTypicalKRW: usable - typ,
    marginWorstKRW: usable - worst,
    breakevenActionsWorst: worstPer > 0 ? Math.floor(usable / worstPer) : Infinity,
  };
}

// AI 사용권 정책 SSOT (V2-AI-HARDCAP-EMERGENCY-SWITCH-AND-NON-AI-SCHEDULER-V1 §2)
//
// Owner 최신 확정(2026-09-25). 과거 제안(1~5일 · 30일당 통합 1회 · 일정 3크레딧)은
// 폐기됐고 재도입 금지 — usage-policy-guard.test.ts 가 이 파일과 소비처를 고정한다.
// 이번 TASK 는 정책 상수·계약만 둔다: 실제 무료/유료 차감·월 초기화는
// 로그인·원장 TASK 에서 구현한다(여기 값이 그 TASK 의 입력).

/** 기본(비AI) 일정 생성 — 무제한·차감 0. 어떤 원장에도 계상하지 않는다 */
export const BASE_SCHEDULER_CREDIT_COST = 0 as const;

/** 일정 기간(기본·AI 공통) */
export const TRIP_DAYS_MIN = 1 as const;
export const TRIP_DAYS_MAX = 14 as const;

/**
 * 과금 단위 = **사용자가 받은 완성 작업 1건**. 내부 provider 호출 수가 아니다.
 * 실패·timeout·invalid result·안전 차단 = 사용자 차감 0.
 */
export const CREDIT_COST = {
  /** AI 일정 개인화·다듬기: 완성 1건당 */
  aiPersonalize: 1,
  /** Story/My Trip 전체 여행 글쓰기·다듬기: 완성 1건당 */
  aiFullTripWriting: 1,
} as const;

/** 금지된 과거 정책 — 어떤 코드도 이 값을 쓰면 안 된다(가드 테스트 근거) */
export const FORBIDDEN_LEGACY = {
  itineraryCostThreeCredits: 3, // "일정 1건=3크레딧" 금지
  tripDaysMaxFive: 5,           // "1~5일" 금지
} as const;

/** 5,900원 일회성 결제 — 구독·자동갱신 없음·구매 사용권 만료 없음 */
export const TICKET = {
  priceKRW: 5_900,
  firstPurchaseCredits: 100,  // 80 + 첫 결제 보너스 20
  firstPurchaseBonus: 20,
  repeatPurchaseCredits: 80,
  subscription: false,
  expiry: null,
} as const;

/**
 * 무료 이용(월) — 로그인·원장 TASK 에서 구현. 월 초기화 기준·시간대는 그 TASK 에서 확정.
 *  · AI 일정 개인화: 월 1회
 *  · 전체 여행 글쓰기: 월 2회 — Story/My Trip 두 표면이 **하나의 풀을 공유**
 *  · 합계 월 3회. 기본 일정·직접 편집은 무료 횟수에 포함하지 않는다.
 */
export const FREE_MONTHLY = {
  aiPersonalize: 1,
  fullTripWritingSharedPool: 2,
  total: 3,
} as const;

/**
 * 가져오기(외부 일정 글·링크 → 내 여행) 무료 이용 — Owner 확정 2026-09-30 (EXTERNAL-TRIP-IMPORT-V2).
 *  · 신규 사용자의 첫 가져오기 1회는 위 월 3회와 별도로 무료(평생 1회).
 *  · 그 이후 가져오기는 AI 일정 개인화와 **월 1회를 공유**한다(개인화 1회 풀을 함께 쓴다).
 *  · 가져오기는 AI 가 원문을 바꾸지 않는다 — 추출만 한다(순서·시간·내용 그대로).
 *  · 원장: supabase/migrations/084_ai_user_usage_ledger.sql (풀 welcome_import · plan_import · writing).
 *    월 기준은 KST 달력 월(매월 1일 00:00 KST 초기화).
 */
export const IMPORT_FREE = {
  welcomeOnce: 1,
  /** 월 풀 이름 — 개인화와 공유 */
  sharedMonthlyPool: "plan_import",
  sharedMonthlyLimit: FREE_MONTHLY.aiPersonalize,
} as const;

// AI 사용권 정책 SSOT (V2-AI-HARDCAP-EMERGENCY-SWITCH-AND-NON-AI-SCHEDULER-V1 §2)
//
// Owner 최신 확정(2026-09-25). 과거 제안(1~5일 · 30일당 통합 1회 · 일정 3크레딧)은
// 폐기됐고 재도입 금지 — usage-policy-guard.test.ts 가 이 파일과 소비처를 고정한다.
// 이번 TASK 는 정책 상수·계약만 둔다: 실제 무료/유료 차감·월 초기화는
// 로그인·원장 TASK 에서 구현한다(여기 값이 그 TASK 의 입력).
//
// ▶ 정정(2026-09-30, EXTERNAL-IMPORT-V2-POLICY-CORRECTION): Owner 가 확정 정책을 다시 밝혔다 —
//   **비용이 드는 AI 도움은 성공 시점부터 30일 이동 구간에 무료 1회**이고, AI 일정 개인화·Story 의
//   명시적 AI 글쓰기·외부 일정 AI 분석이 **같은 1회**를 쓴다. 위 "30일당 통합 1회 폐기" 문장과 아래
//   FREE_MONTHLY(월 1+2) 는 승인 정책이 아니었다 — FREE_AI 가 SSOT 다. (1~5일·일정 3크레딧 금지는 그대로)
//
// ▶ 재정정(2026-09-30, MYTRIP-FULL-TRIP-AI-WRITING-AND-ENTITLEMENT-CORRECTION): Owner 가 **2026-09-25 작업 지시**를
//   기준으로 바로잡았다 — 위 정정(30일 통합 1회)은 다시 적용하지 않는다. SSOT 는 FREE_MONTHLY(087).
//   · 일정 만들기(plan) 월 1회 = 글·링크 가져오기 분석 + AI 일정(개인화·레거시 생성) 공유, 신규 회원 최초 1회 추가
//   · 전체 여행 AI 글쓰기(writing) 월 2회 = My Trip·Story 공유, 3문체 한 요청 = 1회
//   · '월' 갱신 시점·최초 보너스 만료는 원문에 없다 — DB(ai_user_period_now = 서울 시각 달력 월, 보너스 만료 없음)에만 두고 Owner 결정 대기

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
 * 무료 AI 도움 — Owner 확정(2026-09-30 재확인). 원장: 084 → 086(shared_30d).
 *  · 비용이 드는 AI 도움은 **성공한 사용 시점부터 30일 이동 구간에 1회**.
 *  · AI 일정 개인화 · Story 의 명시적 AI 글쓰기(제목·표지·기록 문구) · 외부 일정 AI 분석이 **같은 1회**를 쓴다.
 *  · 한 요청으로 여러 문체(3안)를 받아도 사용자 기준 1회. 캐시에서 돌려준 결과는 차감 0.
 *  · 실패·timeout·무효 결과·중복 요청·저장·재방문·직접 편집은 차감 0.
 *  · 첫 가져오기 추가 무료·달력 월 기준·글쓰기 별도 횟수는 **없다**.
 *  · 유료 이용권은 미구현 — 화면에 유료 잔액을 보이지 않고, 무료 소진 뒤 무제한 호출도 열지 않는다.
 *  · 가져오기의 AI 는 원문을 바꾸지 않는다 — 추출만(순서·시간·내용 그대로).
 */
/** @deprecated 086(30일 통합 1회) 기록 — 087 에서 FREE_MONTHLY 로 대체. 새 코드에서 쓰지 않는다 */
export const FREE_AI = {
  windowDays: 30,
  uses: 1,
  sharedBy: ["personalize", "writing", "import"],
  ledgerPool: "shared_30d",
} as const;

/**
 * 무료 사용권(087 · 2026-09-25 Owner 작업 지시 기준 · 2026-09-30 재정정).
 *  · plan: 일정 만들기 월 1회 — 글·링크 가져오기 분석과 AI 일정(개인화·레거시 생성)이 공유.
 *          신규 회원 최초 보너스 1회(계정당 1회 · 가져오기 전용 아님 · 매월 재지급 없음).
 *  · writing: 전체 여행 AI 글쓰기 월 2회 — My Trip·Story 공유. 3가지 표현을 한 요청으로 받으면 1회.
 *  · 차감 0: 기본 일정·추천 코스·직접 편집·사진 업로드·Story 열람·실패·저장 결과 재열람.
 *  · 유료 이용권은 미구현 — 유료 잔액을 보이지 않고 소진 뒤 무제한 호출도 열지 않는다.
 */
export const FREE_MONTHLY = {
  plan: { monthly: 1, welcomeBonusOnce: 1, sharedBy: ["import", "personalize"] },
  writing: { monthly: 2, sharedBy: ["writing"] },
  ledgerMigration: "087",
} as const;

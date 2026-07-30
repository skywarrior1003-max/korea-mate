// GoKoreaMate — 상업 표면 게이트
//
// Product Constitution v1.1 §14-1 「상업 표면의 세 범위」를 코드로 강제한다.
//
//   A. Trip-Flow Commerce   기본 비활성
//   B. Post-Plan Commerce   기본 비활성 (정상화 후 활성 가능)
//   C. Editorial Content    명시적으로 승인된 표면에서만 활성
//
// 왜 하드코딩 상수인가
//   환경변수(NEXT_PUBLIC_*)는 정적 export 에서 빌드 시 인라인되므로 배포 설정
//   실수로 켜질 여지가 있다. 상수로 두면 켜는 행위가 반드시 코드 변경과 리뷰를
//   거친다. URL query·localStorage·브라우저 조작으로도 바꿀 수 없다.
//
// 무엇을 하지 않는가
//   - src/config/affiliates.ts 의 공급자 설정을 삭제하지 않는다
//   - 기존 추적 URL 값을 바꾸지 않는다
//   - DB 의 affiliate_url·affiliate_provider 원본을 건드리지 않는다
//   차단하는 것은 **렌더와 payload 생성**이지 원본 보관이 아니다.
//
// CSS 숨김으로 처리하지 않는다. anchor 와 payload 자체가 생성되면 안 된다.

// ── A. Trip-Flow Commerce ────────────────────────────────────────────────────
//
// 장소 발견 → 저장 → 일정 담기 → 일정 생성 → 일정 항목 → 공유·복사 일정.
// 이 경로에는 상업 문맥이 들어가지 않는다.
//
// 재활성화 조건은 §14-1-A 를 따르며, 사용자 명시 승인이 필요하다.
export const TRIP_FLOW_COMMERCE_ENABLED = false;

// ── B. Post-Plan Commerce ────────────────────────────────────────────────────
//
// 비상업적 일정이 **확정된 뒤** 일정 데이터와 분리된 영역.
// 코드와 기존 추적 URL 은 보존하되, 아래 10개 조건을 충족하기 전에는 렌더하지
// 않는다 — 스케줄러 입력 분리 · provider-neutral adapter · 공급자 비교와 승인 ·
// 화면에 보이는 Sponsored 표시 · rel 속성만으로 대체 금지 · 사용자 선택 시에만
// 외부 이동 · 취소/환불/다국어/추적 정확성/운영비 검토 · 회귀·수익 QA ·
// 사용자 명시 승인.
export const POST_PLAN_COMMERCE_ENABLED = false;

// ── C. Editorial Content Affiliate ───────────────────────────────────────────
//
// 일정 흐름 밖의 편집 콘텐츠. **전역 true 가 아니다.**
// 명시적으로 승인된 표면만 통과하며, 분류되지 않은 신규 표면은 자동으로
// Trip-Flow 로 판정되어 비활성화된다 (§14-1-C).

/** 편집 콘텐츠 표면 식별자 — 새 표면은 여기에 추가하기 전까지 자동 비활성 */
export type EditorialAffiliateSurface =
  | "city-landing"      // 도시 소개·준비물 안내 페이지
  | "blog";             // 편집 블로그 아티클

/**
 * 현재 운영 승인된 표면.
 *
 * 미승인 사유 기록
 *   survival-guide — 사용자 가시 제휴 고지가 없다(`rel="sponsored"` 만).
 *                    고지 보강 전까지 승인 목록에 넣지 않는다.
 *   shared-itinerary — 공유 일정은 §14-1-A Trip-Flow 대상이다.
 */
const APPROVED_EDITORIAL_SURFACES: readonly string[] = ["city-landing", "blog"];

/**
 * 편집 콘텐츠 제휴를 이 표면에서 렌더해도 되는가.
 *
 * 알 수 없는 값 · undefined · null · 오타는 **항상 false** 다.
 * "모르면 끈다"가 §14-1-C 의 기본 동작이다.
 */
export function isEditorialAffiliateEnabled(surface: unknown): boolean {
  if (typeof surface !== "string") return false;
  return APPROVED_EDITORIAL_SURFACES.includes(surface);
}

// ── 공통 ─────────────────────────────────────────────────────────────────────

/**
 * 같은 컴포넌트가 여러 문맥에서 쓰일 때의 표면 구분.
 * 호출부가 **반드시** 전달해야 하며 선택 prop 으로 두지 않는다 — 선택이면
 * 새 호출부가 조용히 통과한다.
 */
export type CommerceSurface = EditorialAffiliateSurface | "shared-itinerary";

/** 표면 문자열에 대한 최종 판정. Editorial 승인 표면이 아니면 전부 차단된다. */
export function isCommerceAllowedOnSurface(surface: CommerceSurface): boolean {
  if (surface === "shared-itinerary") return TRIP_FLOW_COMMERCE_ENABLED;
  return isEditorialAffiliateEnabled(surface);
}

// ── Trip-Flow 데이터 경계 ────────────────────────────────────────────────────
//
// Cart · Saved · cartHints · plan 요청 · 스케줄러 후보에 존재해선 안 되는 키.
// place-detail-core 의 FORBIDDEN_COMMERCE_KEYS 와 같은 목적이며, 이쪽이 Explore·
// 일정 경로 전체를 담당한다.
//
// 주의: 일반적인 의미로도 쓰이는 넓은 키(`offer` 단독 등)는 넣지 않는다.
// 오탐으로 정상 데이터를 지우는 편이 더 위험하다.
export const FORBIDDEN_TRIP_COMMERCE_KEYS: readonly string[] = [
  "commerce",
  "affiliate_url", "affiliateUrl",
  "affiliate_provider", "affiliateProvider",
  "booking_url", "bookingUrl",
  "hasAffiliate", "affiliatePartner", "affiliateType",
  "hasTicketing", "hasMerchandise",
  "offerId", "offer_id",
  "commission",
  "commercialPriority", "commercial_priority",
];

/** 객체 트리에서 상업 키를 재귀 제거한다. 순환 참조에서 멈춘다. */
export function stripTripCommerceKeys<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map(v => stripTripCommerceKeys(v, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_TRIP_COMMERCE_KEYS.includes(k)) continue;
    out[k] = stripTripCommerceKeys(v, seen);
  }
  return out as T;
}

/** 객체 트리에 남아 있는 상업 키 목록. 비어 있어야 정상이다. */
export function findTripCommerceKeys(value: unknown, seen = new WeakSet<object>()): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value as object)) return [];
  seen.add(value as object);

  const found: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) found.push(...findTripCommerceKeys(v, seen));
    return [...new Set(found)];
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_TRIP_COMMERCE_KEYS.includes(k)) found.push(k);
    found.push(...findTripCommerceKeys(v, seen));
  }
  return [...new Set(found)];
}

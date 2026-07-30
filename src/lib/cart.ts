import { stripTripCommerceKeys, findTripCommerceKeys } from "@/config/commerce-surfaces";
import { getItemSourceKey, IDENTITY_STORAGE_KEYS } from "@/lib/place-identity";
// ─────────────────────────────────────────────
//  KoreaMate · Cart (localStorage)
//  사용자가 [Add to My Itinerary]를 눌렀을 때
//  선택한 이벤트들을 브라우저에 저장·관리한다.
// ─────────────────────────────────────────────

const STORAGE_KEY = IDENTITY_STORAGE_KEYS.cart;
export const CART_EVENT = "koreamate-cart-updated";

// ── 타입 정의 ──────────────────────────────────

export interface TransitInfo {
  distanceKm: number;
  walkMinutes: number | null;
  subwayMinutes: number | null;
  taxiMinutes: number | null;
  description: string;
}

export interface CommerceInfo {
  affiliateType: "activity" | "transport" | "booking" | "connectivity" | null;
  hasAffiliate: boolean;
  affiliatePartner: string | null;
  affiliateUrl: string | null;
  hasMerchandise: boolean;
  hasTicketing: boolean;
  bookingUrl: string | null;
}

/** events.json 한 항목과 1:1 대응하는 타입 */
export interface EventItem {
  id: string;
  /**
   * 데이터 원천에서의 고유 식별자. 중복·Added·Remove 판정은 이 값으로 한다.
   *
   * `id` 는 저장된 일정(unscheduled[].id)과 공유·복사 호환을 위해 형식을
   * 유지해야 하는데, 서로 다른 소스가 같은 숫자를 써서 `local-24` 하나로는
   * 다른 장소를 구분할 수 없다. 판정용 identity 만 분리한다.
   *
   * optional 인 이유: 이 필드가 없던 시절의 localStorage·저장 일정이 그대로
   * 열려야 한다. 마이그레이션 전 항목은 getItemSourceKey 가 id 로 fallback 한다.
   * 새로 만드는 항목에는 항상 넣는다.
   */
  sourceKey?: string;
  type: string;
  isAnchor: boolean;
  journeyCluster: string | null;
  stage: string;
  anchorEventId: string | null;
  relatedSpotIds: number[];
  relatedSurvivalGuides: string[];
  transitFromAnchor: TransitInfo | null;
  name: string;
  shortName: string;
  tags: string[];
  city: string;
  district: string;
  address: string;
  mapUrl: string;
  naverMapUrl?: string;
  naverSearchKeyword?: string;
  description: string;
  whyItMatters: string;
  recommendedDurationMinutes: number;
  bestTimeSlot: string;
  openingHours: { open: string; close: string } | null;
  image: string | null;
  startDate: string | null;
  endDate: string | null;
  isTrending: boolean;
  soloFriendly: boolean;
  foreignCardAccepted: boolean;
  cashOnly: boolean;
  englishMenu: boolean;
  barrierFree: boolean;
  koreanSurvivalScore: number;
  notice: string | null;
  // optional — 장소 상세에서 담은 항목은 상업 키 자체를 갖지 않는다
  // (place-detail-core.toItineraryEvent). 소비처는 optional chaining 을 쓴다.
  commerce?: CommerceInfo;
  lat?: number;
  lng?: number;
  hidden?: boolean;
  displayUntil?: string | null;
}

/** 장바구니에 저장되는 항목 = EventItem + 장바구니 전용 필드 */
export interface CartItem extends EventItem {
  addedAt: number;   // Date.now() — 추가된 시각 (ms)
  sortOrder: number; // 타임라인에서의 순서 (드래그앤드롭용)
}

// ── 내부 헬퍼 ──────────────────────────────────

/** SSR(서버)에서는 localStorage가 없으므로 항상 빈 배열로 안전하게 처리 */
// Trip-Flow Commerce (§14-1-A) — 과거 브라우저에 저장된 항목에는 commerce 가
// 남아 있을 수 있다. 로드할 때 상업 키만 제거하고, **실제로 바뀐 경우에만**
// 다시 저장한다. 매 로드마다 재저장하면 불필요한 쓰기와 이벤트가 발생한다.
//
// 사용자 장소·일정·메모·즐겨찾기·방문 상태는 건드리지 않는다. 전체 초기화도
// 하지 않는다. 정확히 알려진 상업 키만 재귀 제거한다.
function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (findTripCommerceKeys(parsed).length === 0) return parsed;

    const cleaned = stripTripCommerceKeys(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[]): void {
  // 저장 직전에도 한 번 더 거른다 — 어느 화면에서 담았든 Cart 에는 상업 문맥이
  // 들어가지 않는다.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripTripCommerceKeys(items)));
  // CartDrawer 등 구독 컴포넌트에 변경 알림
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

// ── 핵심 CRUD 함수들 ───────────────────────────

/**
 * 장바구니 전체 조회
 * sortOrder 기준으로 정렬해서 반환한다.
 */
export function getCart(): CartItem[] {
  return readStorage().sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 이벤트를 장바구니에 추가
 * 이미 담긴 항목이면 조용히 무시한다 (중복 방지).
 */
export function addToCart(event: EventItem): void {
  const items = readStorage();
  // id 가 아니라 sourceKey 로 비교한다. 서로 다른 소스의 두 장소가 같은
  // `local-<n>` id 를 갖는 경우가 실측 118/158 카드라, id 비교는 다른 장소를
  // 중복으로 오판해 추가 자체를 막는다.
  const key = getItemSourceKey(event);
  const alreadyExists = items.some((item) => getItemSourceKey(item) === key);
  if (alreadyExists) return;

  const newItem: CartItem = {
    ...event,
    addedAt: Date.now(),
    sortOrder: items.length, // 맨 마지막에 추가
  };

  writeStorage([...items, newItem]);
}

/**
 * 특정 이벤트를 장바구니에서 제거
 */
/** 인자는 **sourceKey** 다. id 로 지우면 같은 id 의 다른 장소까지 사라진다. */
export function removeFromCart(sourceKey: string): void {
  const items = readStorage();
  const filtered = items.filter((item) => getItemSourceKey(item) !== sourceKey);
  // 제거 후 sortOrder를 0부터 다시 정렬해 빈 번호가 없도록 한다
  const reIndexed = filtered.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
  writeStorage(reIndexed);
}

/**
 * 특정 이벤트가 장바구니에 담겨 있는지 확인
 * [Add] / [Remove] 버튼 상태 표시에 사용한다.
 */
/**
 * 인자는 **sourceKey** 다 (getItemSourceKey 로 얻은 값).
 *
 * 기존 id 로도 매칭하는 fallback 을 두면 안 된다. 서로 다른 두 장소가 같은
 * `local-24` 를 갖는 것이 바로 이 작업이 고치는 결함인데, id 를 함께 보면
 * 한 장소를 담았을 때 다른 장소가 "이미 담김"으로 나온다.
 *
 * 마이그레이션 전 항목은 getItemSourceKey 가 id 를 돌려주므로, 호출부가
 * 같은 helper 로 만든 값을 넘기는 한 그 경우에도 정확히 맞는다.
 */
export function isInCart(sourceKey: string): boolean {
  return readStorage().some((item) => getItemSourceKey(item) === sourceKey);
}

/**
 * 장바구니를 완전히 비운다
 */
export function clearCart(): void {
  writeStorage([]);
}

/**
 * 드래그앤드롭 후 순서를 저장
 * @param orderedIds — 새 순서대로 나열된 이벤트 ID 배열
 *
 * 예) 사용자가 타임라인에서 카드를 끌어다 놓으면
 *     새 순서의 ID 배열을 이 함수에 넘기면 된다.
 */
export function updateSortOrder(orderedIds: string[]): void {
  const items = readStorage();
  // orderedIds 는 sourceKey 목록이다. id 로 찾으면 같은 id 의 다른 장소를 집는다.
  const updatedItems = orderedIds
    .map((key, index) => {
      const item = items.find((i) => getItemSourceKey(i) === key);
      if (!item) return null;
      return { ...item, sortOrder: index };
    })
    .filter((item): item is CartItem => item !== null);

  writeStorage(updatedItems);
}

// ── 비즈니스 로직 헬퍼 ──────────────────────────

/**
 * 현재 장바구니 내용을 기반으로
 * 사용자에게 추천해야 할 서바이벌 가이드 ID 목록을 반환한다.
 *
 * 로직:
 *  - 각 이벤트의 relatedSurvivalGuides 수집
 *  - cashOnly 항목이 하나라도 있으면 "payments" 가이드 강제 포함
 *  - 도시가 2개 이상이면 "getting-around" 강제 포함
 */
export function getSuggestedSurvivalGuides(): string[] {
  const items = getCart();
  if (items.length === 0) return [];

  const guideSet = new Set<string>();

  for (const item of items) {
    item.relatedSurvivalGuides.forEach((g) => guideSet.add(g));

    if (item.cashOnly) {
      guideSet.add("payments");
    }
  }

  const uniqueCities = new Set(items.map((item) => item.city));
  if (uniqueCities.size >= 2) {
    guideSet.add("getting-around");
  }

  return Array.from(guideSet);
}

/**
 * 장바구니 항목을 journeyCluster 별로 묶어서 반환한다.
 * 타임라인 UI에서 클러스터 단위로 카드를 그룹화할 때 사용.
 *
 * 반환 형태:
 * {
 *   "bts-busan-2026": [CartItem, ...],
 *   "bts-seoul-permanent": [CartItem, ...],
 *   "standalone": [CartItem, ...]   // journeyCluster가 null인 항목들
 * }
 */
export function getClusterGroups(): Record<string, CartItem[]> {
  const items = getCart();
  const groups: Record<string, CartItem[]> = {};

  for (const item of items) {
    const key = item.journeyCluster ?? "standalone";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

/**
 * 현재 장바구니에 담긴 총 예상 소요 시간 (분)
 * 타임라인 상단의 "총 N시간 N분" 표시에 사용한다.
 */
export function getTotalDurationMinutes(): number {
  return getCart().reduce(
    (total, item) => total + item.recommendedDurationMinutes,
    0
  );
}

// ─────────────────────────────────────────────
//  KoreaMate · Cart (localStorage)
//  사용자가 [Add to My Itinerary]를 눌렀을 때
//  선택한 이벤트들을 브라우저에 저장·관리한다.
// ─────────────────────────────────────────────

const STORAGE_KEY = "koreamate_cart";
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
  commerce: CommerceInfo;
  lat?: number;
  lng?: number;
}

/** 장바구니에 저장되는 항목 = EventItem + 장바구니 전용 필드 */
export interface CartItem extends EventItem {
  addedAt: number;   // Date.now() — 추가된 시각 (ms)
  sortOrder: number; // 타임라인에서의 순서 (드래그앤드롭용)
}

// ── 내부 헬퍼 ──────────────────────────────────

/** SSR(서버)에서는 localStorage가 없으므로 항상 빈 배열로 안전하게 처리 */
function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: CartItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
  const alreadyExists = items.some((item) => item.id === event.id);
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
export function removeFromCart(eventId: string): void {
  const filtered = readStorage().filter((item) => item.id !== eventId);
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
export function isInCart(eventId: string): boolean {
  return readStorage().some((item) => item.id === eventId);
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
  const updatedItems = orderedIds
    .map((id, index) => {
      const item = items.find((i) => i.id === id);
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

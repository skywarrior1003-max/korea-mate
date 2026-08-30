import { stripTripCommerceKeys, findTripCommerceKeys } from "@/config/commerce-surfaces";
import { getItemSourceKey, IDENTITY_STORAGE_KEYS } from "@/lib/place-identity";
import {
  dropCity, effectiveTripCity, forCity, isForCity, isUnresolvedCity, normalizeTripCity,
  unresolved as unresolvedItems,
} from "@/lib/cart-city/city-scope-core";
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

/**
 * 반드시 지켜야 하는 일정. 공연·약속·예약·교통처럼 시간이 이미 정해진 것들이다.
 *
 * `preferredTimeSlot`(가능하면 오전) 과는 다른 축이다. 그쪽은 취향이고
 * 이쪽은 사실이다 — 둘을 섞지 않는다.
 *
 * 종료시각은 저장하지 않는다. 사용자가 적은 소요시간으로만 계산한다.
 * 공연이 몇 시에 끝나는지 우리가 추정하지 않는다.
 */
export interface CartFixed {
  /** 여행 기간 안의 날짜. "YYYY-MM-DD". */
  date:            string;
  /** "HH:MM" 24시간. */
  startTime:       string;
  /** 사용자가 직접 적은 소요시간(분). 추천 체류시간으로 덮어쓰지 않는다. */
  durationMinutes: number;
}

/** 장바구니에 저장되는 항목 = EventItem + 장바구니 전용 필드 */
export interface CartItem extends EventItem {
  addedAt: number;   // Date.now() — 추가된 시각 (ms)
  sortOrder: number; // 타임라인에서의 순서 (드래그앤드롭용)
  /** 없으면 평범한 장소다. 있으면 그 날짜·시각이 hard constraint 가 된다. */
  fixed?: CartFixed | null;
  /**
   * 이 선택이 **어느 도시 여행**의 것인가.
   *
   * 장소가 어느 도시에 있는가와 다른 값이다 — 장소 원본의 city 는 건드리지
   * 않는다. 이 필드가 없던 시절 항목은 city-scope-core 가 장소의 실제 도시로
   * 읽어 주고, 그것으로도 알 수 없으면 사용자에게 물어본다.
   */
  tripCity?: string;
  /**
   * 여행 기간을 줄여 Day 에서 **미배정으로 돌아온** 항목의 시간 메타.
   * 삭제하지 않고 옮겼다는 사실과, 사용자가 정한 시각(timeSource "user")·체류시간을
   * 다시 배치할 때 되살리기 위해서만 둔다. 없으면 평범한 보관함 항목이다.
   */
  unplacedMeta?: { time: string | null; timeSource: "scheduler" | "user" | null; duration: string | null; fromDate: string } | null;
}

// ── 내부 헬퍼 ──────────────────────────────────

/**
 * 순서를 **도시별로** 0 부터 다시 매긴다.
 *
 * 예전에는 목록 전체가 하나였다. 이제 부산 목록과 서울 목록이 따로 있으므로
 * 한쪽에서 하나를 빼도 다른 쪽 순서가 밀리면 안 된다. 어느 여행 것인지 아직
 * 모르는 항목들도 저희끼리 순서를 지킨다.
 */
function reindexByCity(items: CartItem[]): CartItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const bucket = effectiveTripCity(item) ?? "";
    const n = seen.get(bucket) ?? 0;
    seen.set(bucket, n + 1);
    return { ...item, sortOrder: n };
  });
}

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

/** 지금 준비 중인 도시 여행에서 고른 장소만. 도시를 모르면 빈 목록이다. */
export function getCityCart(tripCity: string | null | undefined): CartItem[] {
  return forCity(getCart(), tripCity);
}

/**
 * 마지막으로 담은 항목의 도시 — 여행(TripDraft)이 아직 없을 때 This Trip 화면이
 * 이어받는 기본값이다 (PICKS-TO-TRIP-JOURNEY-RESTORE-V1). 목록 데이터는 주지
 * 않는다: 화면의 목록 읽기는 여전히 `getCityCart` 하나뿐이라 도시 스코프 계약이
 * 그대로 지켜진다.
 */
export function lastAddedTripCity(): string | null {
  const items = getCart();
  for (let i = items.length - 1; i >= 0; i--) {
    const c = normalizeTripCity(items[i]!.tripCity);
    if (c) return c;
  }
  return null;
}

/**
 * 어느 여행 것인지 아직 모르는 예전 선택.
 *
 * 지우지 않는다. 화면이 따로 보여 주고 사용자가 어느 여행 것인지 정해 준다.
 */
export function getUnresolvedCart(): CartItem[] {
  return unresolvedItems(getCart());
}

/**
 * 예전 선택 하나를 이 도시 여행에 연결한다.
 *
 * 새 항목을 만들지 않는다 — 담은 시각도, 순서도, 잡아 둔 약속도 그대로 두고
 * 어느 여행 것인지만 적는다. 이미 그 도시에 같은 장소가 있으면 이 항목은
 * 조용히 뺀다(중복을 만들지 않는다).
 */
export function attachCartItemToCity(sourceKey: string, tripCity: string): void {
  const want = normalizeTripCity(tripCity);
  if (!want) return;
  const items = readStorage();

  const target = items.find(i => getItemSourceKey(i) === sourceKey && isUnresolvedCity(i));
  if (!target) return;

  const clash = items.some(i =>
    i !== target && getItemSourceKey(i) === sourceKey && isForCity(i, want));
  const next = clash
    ? items.filter(i => i !== target)
    : items.map(i => (i === target ? { ...i, tripCity: want } : i));
  writeStorage(reindexByCity(next));
}

/** 장소 원본이 사라졌을 때 — 어느 도시 여행에 담겨 있든 전부 뺀다. */
export function removeFromAllCities(sourceKey: string): void {
  removeFromCart(sourceKey);
}

/**
 * 이벤트를 장바구니에 추가
 * 이미 담긴 항목이면 조용히 무시한다 (중복 방지).
 */
export function addToCart(event: EventItem, tripCity?: string): void {
  const items = readStorage();
  // id 가 아니라 sourceKey 로 비교한다. 서로 다른 소스의 두 장소가 같은
  // `local-<n>` id 를 갖는 경우가 실측 118/158 카드라, id 비교는 다른 장소를
  // 중복으로 오판해 추가 자체를 막는다.
  const key  = getItemSourceKey(event);
  const want = normalizeTripCity(tripCity);

  // 어느 목록에 들어가는가. 여행 도시를 받았으면 그 도시, 아니면 장소 자체의
  // 도시, 그것도 없으면 "아직 모름" 목록이다.
  const bucket = want ?? effectiveTripCity(event as { city?: string });

  // 같은 목록에 같은 장소를 두 번 담지 않는다. 다른 도시 여행에서 같은 장소를
  // 고르는 것은 중복이 아니다 — 여행이 다르면 선택도 다르다.
  const sameCity = items.filter(i => effectiveTripCity(i) === bucket);
  if (sameCity.some(i => getItemSourceKey(i) === key)) return;

  // 어느 여행 것인지 모르는 채로 남아 있던 같은 장소가 있으면 그것을 이 여행에
  // 연결한다. 새 항목을 하나 더 만들면 사용자가 예전에 정해 둔 순서와 시간이
  // 버려진 채 목록만 늘어난다.
  const orphan = items.find(i => getItemSourceKey(i) === key && isUnresolvedCity(i));
  if (orphan && want) {
    writeStorage(items.map(i => (i === orphan ? { ...i, tripCity: want } : i)));
    return;
  }

  const newItem: CartItem = {
    ...event,
    addedAt: Date.now(),
    sortOrder: sameCity.length,   // 그 도시 목록의 맨 뒤
    ...(want ? { tripCity: want } : {}),
  };

  writeStorage([...items, newItem]);
}

/**
 * 특정 이벤트를 장바구니에서 제거
 */
/**
 * 인자는 **sourceKey** 다. id 로 지우면 같은 id 의 다른 장소까지 사라진다.
 *
 * `tripCity` 를 주면 그 도시 여행의 선택만 뺀다. 같은 장소를 서울 여행에도
 * 담아 두었다면 그쪽은 그대로 남는다.
 *
 * 주지 않으면 예전처럼 그 장소의 선택을 전부 뺀다 — 장소 원본이 사라졌을 때
 * 쓰는 길이다.
 */
export function removeFromCart(sourceKey: string, tripCity?: string): void {
  const items = readStorage();
  const want  = normalizeTripCity(tripCity);
  const filtered = items.filter((item) => {
    if (getItemSourceKey(item) !== sourceKey) return true;
    return want !== null && !isForCity(item, want);
  });
  writeStorage(reindexByCity(filtered));
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
 * 장소 하나의 고정 일정을 설정하거나(값) 해제한다(null).
 *
 * 인자는 sourceKey 다. 값 검증은 호출부에서 끝낸 뒤 넘긴다 — 저장소는
 * 사용자가 정한 것을 그대로 보관할 뿐 시간을 만들어내지 않는다.
 */
export function setCartFixed(sourceKey: string, fixed: CartFixed | null, tripCity?: string): void {
  const items = readStorage();
  const want  = normalizeTripCity(tripCity);
  let changed = false;
  const next = items.map((item) => {
    if (getItemSourceKey(item) !== sourceKey) return item;
    // 약속은 그 여행의 것이다. 부산 여행에 잡아 둔 14시가 서울 여행 선택까지
    // 덮어쓰면 안 된다.
    if (want !== null && !isForCity(item, want)) return item;
    changed = true;
    if (fixed === null) {
      const { fixed: _drop, ...rest } = item;
      return rest as CartItem;
    }
    return { ...item, fixed };
  });
  if (changed) writeStorage(next);
}

/**
 * 담아 둔 장소의 **장소 정보만** 최신으로 바꾼다.
 *
 * 왜 필요한가
 *   My Places 에서 이름이나 좌표를 고쳐도 This Trip 에는 담을 때의 값이 그대로
 *   남았다. 같은 화면 두 탭이 같은 장소를 다른 이름으로 보여줬다.
 *
 * 무엇을 지키는가
 *   `addedAt`·`sortOrder`·`fixed` 는 장소의 속성이 아니라 **이번 여행에서 그
 *   장소를 쓰는 방식**이다. 이름이 바뀌었다고 사용자가 정한 순서와 약속 시각이
 *   흔들리면 안 된다.
 *
 * 왜 지웠다 다시 넣지 않는가
 *   remove 후 add 를 하면 맨 뒤로 밀려 순서가 바뀌고, 그 사이에 저장이 끊기면
 *   장소가 사라진다. 자리를 지킨 채 내용만 갈아 끼운다.
 *
 * 담겨 있지 않으면 아무것도 하지 않는다 — 이 함수는 새로 담지 않는다.
 */
export function updateCartPlace(sourceKey: string, place: EventItem): void {
  const items = readStorage();
  let changed = false;
  const next = items.map((item) => {
    if (getItemSourceKey(item) !== sourceKey) return item;
    changed = true;
    // place 를 통째로 얹는다. merge 가 아니라 교체다 — 좌표가 지워진 경우
    // 예전 lat/lng 가 살아남으면 안 된다.
    const merged: CartItem = {
      ...place,
      addedAt:   item.addedAt,
      sortOrder: item.sortOrder,
    };
    if (item.fixed)    merged.fixed    = item.fixed;
    // 어느 여행의 선택인지도 장소 정보가 아니다. 이름이 바뀌었다고 이 선택이
    // 어느 도시 것인지 잊어버리면 안 된다.
    if (item.tripCity) merged.tripCity = item.tripCity;
    return merged;
  });
  if (changed) writeStorage(next);
}

/**
 * 장바구니를 완전히 비운다
 */
export function clearCart(): void {
  writeStorage([]);
}

/**
 * 이 도시 여행의 선택만 비운다.
 *
 * My Trip 이 정상 저장되면 그 도시의 This Trip 은 할 일을 다 했다. 그렇다고
 * `clearCart()` 를 부르면 아직 짜지 않은 다른 도시 여행까지 사라진다 —
 * 서울 일정을 만들었는데 담아 두었던 부산 목록이 없어지는 식이다.
 *
 * 도시를 모르면 아무것도 지우지 않는다. 어느 여행 것인지 모르는 예전 선택도
 * 남긴다 — 그것이 이 도시 것이라는 근거가 없다.
 */
export function clearCityCart(tripCity: string | null | undefined): void {
  const items = readStorage();
  const kept  = dropCity(items, tripCity);
  if (kept.length === items.length) return;
  writeStorage(reindexByCity(kept));
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

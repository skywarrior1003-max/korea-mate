import type { EventItem } from "@/lib/cart";
import { stripTripCommerceKeys, findTripCommerceKeys } from "@/config/commerce-surfaces";
import { getItemSourceKey, IDENTITY_STORAGE_KEYS } from "@/lib/place-identity";

const FAVORITES_KEY = IDENTITY_STORAGE_KEYS.legacyFavs;
/**
 * sourceKey 기반 찜 목록 (신규).
 *
 * 왜 기존 koreamate_favorites 를 덮어쓰지 않는가
 *   기존 키는 `local-24` 같은 legacy id 배열이다. 이것을 sourceKey 로 치환하면
 *   이전 버전 코드로 롤백했을 때 하트가 전부 사라진다. 두 저장소를 함께
 *   기록해 어느 쪽 코드가 읽어도 상태가 유지되게 한다.
 *
 * 신규 코드는 이쪽을 우선 보고, 없으면 legacy id 로 fallback 한다.
 */
const FAVORITE_SOURCE_KEYS = IDENTITY_STORAGE_KEYS.favSources;
export const FAVORITES_EVENT = "koreamate-favorites-updated";

function readKeys(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** sourceKey 기반 찜 목록 */
export function getFavoriteSourceKeys(): string[] {
  return readKeys(FAVORITE_SOURCE_KEYS);
}

// ── 찜 ID 배열 관리 ────────────────────────────────────────────────

export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * sourceKey 가 주어지면 그것을 우선 본다. 아직 sourceKey 기록이 없는
 * 사용자에게는 기존 id 목록이 답을 준다.
 */
export function isFavorited(id: string, sourceKey?: string): boolean {
  if (sourceKey && getFavoriteSourceKeys().includes(sourceKey)) return true;
  return getFavorites().includes(id);
}

/**
 * 기존 id 목록과 신규 sourceKey 목록을 **함께** 갱신한다(이중 기록).
 * 롤백 호환을 위해 legacy 목록을 계속 유지한다.
 */
export function toggleFavorite(id: string, sourceKey?: string): boolean {
  const favs = getFavorites();
  const idx  = favs.indexOf(id);
  const next = idx < 0;
  if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));

  if (sourceKey) {
    const keys = getFavoriteSourceKeys();
    const ki   = keys.indexOf(sourceKey);
    if (next && ki < 0) keys.push(sourceKey);
    if (!next && ki >= 0) keys.splice(ki, 1);
    localStorage.setItem(FAVORITE_SOURCE_KEYS, JSON.stringify(keys));
  }

  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  return next;
}

// ── 전체 EventItem 데이터 캐시 (SavedSpotsPanel 표시용) ────────────
// ID 배열(koreamate_favorites)과 별도로 전체 이벤트 데이터를 저장해
// floating panel이 비동기 fetch 없이 즉시 렌더링할 수 있게 한다.

const SAVED_DATA_KEY = IDENTITY_STORAGE_KEYS.savedData;

// Trip-Flow Commerce (§14-1-A) — Cart 와 같은 정리 규칙.
// 상업 키가 실제로 발견된 경우에만 재저장한다 (idempotent).
export function getSavedSpotsData(): EventItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_DATA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EventItem[];
    if (findTripCommerceKeys(parsed).length === 0) return parsed;

    const cleaned = stripTripCommerceKeys(parsed);
    localStorage.setItem(SAVED_DATA_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

/** 찜 추가 시 전체 이벤트 데이터를 캐시에 저장 + 패널 갱신 알림 */
export function cacheSavedSpot(event: EventItem): void {
  if (typeof window === "undefined") return;
  try {
    const all = getSavedSpotsData();
    const key = getItemSourceKey(event);
    if (!all.some(e => getItemSourceKey(e) === key)) {
      localStorage.setItem(SAVED_DATA_KEY, JSON.stringify(stripTripCommerceKeys([...all, event])));
      window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
    }
  } catch { /* ignore */ }
}

/** 찜 해제 시 캐시에서 제거 + 패널 갱신 알림 */
export function uncacheSavedSpot(id: string, sourceKey?: string): void {
  if (typeof window === "undefined") return;
  try {
    // sourceKey 가 있으면 그것만 제거한다. id 로 지우면 같은 `local-24` 를
    // 가진 다른 장소까지 함께 사라진다.
    const filtered = sourceKey
      ? getSavedSpotsData().filter(e => getItemSourceKey(e) !== sourceKey)
      : getSavedSpotsData().filter(e => e.id !== id);
    localStorage.setItem(SAVED_DATA_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch { /* ignore */ }
}

/**
 * 패널 삭제 버튼 전용: id 목록 + 캐시 양쪽을 모두 제거한 후 이벤트를 1회만 발생시킨다.
 * toggleFavorite을 쓰면 캐시 갱신 전에 이벤트가 먼저 발생해 패널이 stale 상태가 되므로
 * 이 함수에서는 두 저장소를 먼저 업데이트하고 마지막에 이벤트를 한 번만 dispatch 한다.
 */
export function removeFavorite(id: string, sourceKey?: string): void {
  if (typeof window === "undefined") return;
  try {
    const remaining = sourceKey
      ? getSavedSpotsData().filter(e => getItemSourceKey(e) !== sourceKey)
      : getSavedSpotsData().filter(e => e.id !== id);
    localStorage.setItem(SAVED_DATA_KEY, JSON.stringify(remaining));
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(getFavorites().filter(f => f !== id)));
    if (sourceKey) {
      localStorage.setItem(FAVORITE_SOURCE_KEYS,
        JSON.stringify(getFavoriteSourceKeys().filter(k => k !== sourceKey)));
    }
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch { /* ignore */ }
}

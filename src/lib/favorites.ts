import type { EventItem } from "@/lib/cart";

const FAVORITES_KEY = "koreamate_favorites";
export const FAVORITES_EVENT = "koreamate-favorites-updated";

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

export function isFavorited(id: string): boolean {
  return getFavorites().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(id);
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  return idx < 0;
}

// ── 전체 EventItem 데이터 캐시 (SavedSpotsPanel 표시용) ────────────
// ID 배열(koreamate_favorites)과 별도로 전체 이벤트 데이터를 저장해
// floating panel이 비동기 fetch 없이 즉시 렌더링할 수 있게 한다.

const SAVED_DATA_KEY = "koreamate_saved_spots_data";

export function getSavedSpotsData(): EventItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_DATA_KEY);
    return raw ? (JSON.parse(raw) as EventItem[]) : [];
  } catch {
    return [];
  }
}

/** 찜 추가 시 전체 이벤트 데이터를 캐시에 저장 */
export function cacheSavedSpot(event: EventItem): void {
  try {
    const all = getSavedSpotsData();
    if (!all.some(e => e.id === event.id)) {
      localStorage.setItem(SAVED_DATA_KEY, JSON.stringify([...all, event]));
    }
  } catch { /* ignore */ }
}

/** 찜 해제 시 캐시에서 제거 */
export function uncacheSavedSpot(id: string): void {
  try {
    const filtered = getSavedSpotsData().filter(e => e.id !== id);
    localStorage.setItem(SAVED_DATA_KEY, JSON.stringify(filtered));
  } catch { /* ignore */ }
}

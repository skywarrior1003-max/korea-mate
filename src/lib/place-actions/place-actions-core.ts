// 장소에 대해 어느 화면에서나 같은 뜻이어야 하는 행동들.
//
// 카드 모양은 화면마다 달라도 된다 — Home 과 Explore 와 Picks 는 보여 주는
// 정보의 양이 다르다. 하지만 "저장했다", "이번 여행에 넣었다", "친구에게
// 보냈다" 는 어디서 눌러도 같은 일이어야 한다.
//
// 지금까지 저장은 네 곳에서 각자 `toggleFavorite` 과 `cacheSavedSpot` 을 짝지어
// 불렀다. 한 곳에서 짝을 놓치면 하트는 켜졌는데 목록에는 없는 장소가 생긴다.
//
// 여기에 화면 코드는 넣지 않는다. 버튼 모양도, 아이콘도, 문구도 각 화면의 몫이다.

import type { EventItem } from "../cart.ts";
import {
  addToCart, getCityCart, removeFromCart,
} from "../cart.ts";
import {
  cacheSavedSpot, getFavoriteSourceKeys, getFavorites, toggleFavorite, uncacheSavedSpot,
} from "../favorites.ts";
import { getItemSourceKey, parseCitySpotId } from "../place-identity.ts";
import { placeUrl } from "../place-detail/place-detail-core.ts";

// ── 저장 (Saved) ─────────────────────────────────────────────────────────────

export function isPlaceSaved(place: EventItem): boolean {
  const key = getItemSourceKey(place);
  if (getFavoriteSourceKeys().includes(key)) return true;
  // sourceKey 기록이 없던 시절 사용자는 id 목록이 답을 준다.
  return getFavorites().includes(place.id);
}

/**
 * 저장한다. 이미 저장돼 있으면 아무것도 하지 않는다.
 *
 * 하트와 표시용 정보를 **함께** 다룬다. 둘 중 하나만 하면 하트는 켜졌는데
 * Saved 목록에는 없는 장소가 생긴다.
 */
export function savePlace(place: EventItem): void {
  if (isPlaceSaved(place)) return;
  toggleFavorite(place.id, getItemSourceKey(place));
  cacheSavedSpot(place);
}

/** 저장을 푼다. This Trip 선택은 건드리지 않는다 — 다른 이야기다. */
export function unsavePlace(place: EventItem): void {
  if (!isPlaceSaved(place)) return;
  toggleFavorite(place.id, getItemSourceKey(place));
  uncacheSavedSpot(place.id, getItemSourceKey(place));
}

/** 눌렀을 때의 결과 상태를 돌려준다. */
export function togglePlaceSaved(place: EventItem): boolean {
  const next = !isPlaceSaved(place);
  if (next) savePlace(place); else unsavePlace(place);
  return next;
}

// ── 이번 도시 여행 (This Trip) ───────────────────────────────────────────────

/**
 * **지금 보고 있는 도시 여행**에 들어 있는가.
 *
 * 전체 목록을 보지 않는다. 부산 여행에 넣어 둔 장소가 서울 여행 화면에서
 * 이미 담긴 것처럼 보이면 안 된다.
 */
export function isInThisTrip(place: EventItem, tripCity: string | null | undefined): boolean {
  if (!tripCity) return false;
  const key = getItemSourceKey(place);
  return getCityCart(tripCity).some(i => getItemSourceKey(i) === key);
}

/**
 * 이번 도시 여행에 넣는다.
 *
 * 어느 여행에 넣는 것인지 모르면 넣지 않고 false 를 돌려준다 — 아무 도시나
 * 정해 주지 않는다. 화면이 무엇이 필요한지 알린다.
 */
export function addPlaceToThisTrip(place: EventItem, tripCity: string | null | undefined): boolean {
  if (!tripCity) return false;
  addToCart(place, tripCity);
  return true;
}

/**
 * 이번 도시 여행에서 뺀다.
 *
 * 장소를 지우는 것이 아니다. Saved 에 있으면 그대로 있고, 내가 등록한 장소면
 * 원본도 그대로다. 다른 도시 여행에 넣어 둔 같은 장소도 남는다.
 */
export function removePlaceFromThisTrip(place: EventItem, tripCity: string | null | undefined): void {
  if (!tripCity) return;
  removeFromCart(getItemSourceKey(place), tripCity);
}

// ── 공유 (Share) ─────────────────────────────────────────────────────────────

export interface PlaceShareContent {
  title: string;
  text:  string;
  url:   string;
}

/**
 * 공유할 수 있는 장소인가.
 *
 * 공개 페이지가 있는 장소만이다. 내가 등록한 장소에는 아직 공개 주소가 없고,
 * `user_spot:{uuid}` 를 주소로 내보내지 않는다 — 없는 링크를 만들어 보내면
 * 받은 사람은 빈 화면을 본다.
 */
export function canSharePlace(place: EventItem): boolean {
  return parseCitySpotId(getItemSourceKey(place)) !== null;
}

/**
 * 무엇을 보내는가 — 장소 하나다.
 *
 * 이번 여행의 다른 장소도, 날짜도, 약속도, 숙소도, 좌표도 넣지 않는다.
 * 장소 공유와 여행 공유는 다른 기능이다.
 */
export function placeShareContent(place: EventItem): PlaceShareContent | null {
  const id = parseCitySpotId(getItemSourceKey(place));
  if (!id) return null;
  const name = (place.shortName || place.name || "").trim();
  if (!name) return null;
  const city = (place.city || "").trim();
  const cityLabel = city ? city.charAt(0).toUpperCase() + city.slice(1) : "";
  return {
    title: cityLabel ? `${name} — ${cityLabel}` : name,
    text:  cityLabel ? `${name} · ${cityLabel} · gokoreamate` : `${name} · gokoreamate`,
    url:   placeUrl(id),
  };
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

/**
 * 기기가 가진 공유 기능을 먼저 쓰고, 없으면 링크를 복사한다.
 *
 * 사용자가 공유 창을 닫은 것은 실패가 아니다 — 조용히 끝낸다. 복사까지 막히면
 * 화면이 주소를 직접 보여 줄 수 있도록 알려 준다. 어느 경우에도 던지지 않는다.
 */
export async function sharePlace(content: PlaceShareContent): Promise<ShareOutcome> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  if (typeof nav?.share === "function") {
    try {
      await nav.share(content);
      return "shared";
    } catch (e) {
      // 사용자가 취소한 것과 실제 실패를 구분한다. 취소는 오류가 아니다.
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // 그 밖의 실패는 복사로 내려간다.
    }
  }

  // `?.` 로 건너뛰면 undefined 를 await 해서 성공한 것처럼 보인다. 복사할 수단이
  // 없는 것과 복사에 실패한 것은 둘 다 "복사되지 않았다" 여야 한다.
  if (typeof nav?.clipboard?.writeText !== "function") return "unavailable";
  try {
    await nav.clipboard.writeText(content.url);
    return "copied";
  } catch {
    return "unavailable";
  }
}

// Saved(하트) → 개인화 취향 신호.
//
// Saved 는 "이 여행에 반드시 넣어라" 가 아니다. "이런 걸 좋아한다" 다.
// 그래서 Selected 와 절대 섞지 않는다.
//   Selected → cart · score 999 · 반드시 일정에 들어감
//   Saved    → liked_place_ids · 후보들 사이의 순서에만 영향
//
// Saved 가 Selected 로 승격되는 경로는 이 파일에 없다. cart 를 건드리지 않는다.
//
// 무엇을 내보내나
//   place_id 와 category 뿐이다. 주소·좌표·가격·메모·개인정보는 보내지 않는다.
//   모델이 사실을 지어낼 재료를 주지 않고, 토큰도 아낀다.

import { parseCitySpotId, getItemSourceKey } from "../place-identity.ts";

/** provider 로 나가는 Saved 상한. prompt 크기와 비용을 여기서 자른다. */
export const MAX_LIKED_PLACES = 40;
/** category 문자열 상한 — 이상값이 prompt 를 부풀리지 못하게 한다 */
export const MAX_CATEGORY_CHARS = 32;

export interface SavedSpotLike {
  id?:        string;
  sourceKey?: string;
  city?:      string;
  type?:      string;
  category?:  string;
}

export interface LikedPlaceHint {
  place_id: string;
  category?: string;
}

export interface LikedSignals {
  liked_place_ids: string[];
  liked_places:    LikedPlaceHint[];
}

function normCity(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function cleanCategory(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (!s || s.length > MAX_CATEGORY_CHARS) return undefined;
  if (!/^[a-z0-9_-]+$/.test(s)) return undefined;   // 임의 문자열·문장 차단
  return s;
}

/**
 * 저장된 Saved 스냅샷 → provider 로 보낼 취향 신호.
 *
 * 걸러내는 것
 *   · city_spots 장소가 아닌 것 (local-*, user_spot 등은 DB 후보와 매칭되지 않는다)
 *   · 다른 도시의 Saved
 *   · 중복 (같은 place_id)
 *   · 상한 초과분
 *
 * 순서는 결정론적이다 — place_id 오름차순.
 */
export function collectLikedSignals(
  saved: readonly SavedSpotLike[],
  city: string,
  cap: number = MAX_LIKED_PLACES,
): LikedSignals {
  const wantCity = normCity(city);
  const byId = new Map<string, LikedPlaceHint>();

  for (const s of saved ?? []) {
    if (!s || typeof s !== "object") continue;

    // 다른 도시의 Saved 는 이번 여행의 취향 신호가 아니다.
    // city 를 기록하지 않은 예전 스냅샷은 통과시킨다 — 뒤에서 후보 매칭에 실패하면
    // 스코어러가 조용히 무시한다(buildLikedCategorySet 이 미매칭 id 를 건너뛴다).
    const savedCity = normCity(s.city);
    if (savedCity && wantCity && savedCity !== wantCity) continue;

    const key = s.sourceKey ?? (typeof s.id === "string" ? getItemSourceKey(s as never) : undefined);
    const dbId = parseCitySpotId(key);
    if (!dbId) continue;                       // city_spots 장소만 보낸다

    if (byId.has(dbId)) continue;              // 중복 제거
    const category = cleanCategory(s.type ?? s.category);
    byId.set(dbId, category ? { place_id: dbId, category } : { place_id: dbId });
  }

  const liked_places = [...byId.values()]
    .sort((a, b) => (a.place_id < b.place_id ? -1 : a.place_id > b.place_id ? 1 : 0))
    .slice(0, Math.max(0, cap));

  return { liked_places, liked_place_ids: liked_places.map(p => p.place_id) };
}

/**
 * Saved 와 Selected 를 합쳐 스코어러의 취향 신호를 만든다.
 *
 * 왜 합치나 — Selected 도 취향의 근거다(§4: preferred place 로 참고 가능).
 * 다만 **Saved 가 없을 때만 Selected 를 쓰던 기존 동작**은 Selected 를 Saved 로
 * 위장하는 것이었다. 이제는 둘 다 보내고, 라벨을 섞지 않는다.
 * Saved 가 0 개면 결과가 예전과 완전히 같다.
 */
export function mergePreferenceIds(
  likedIds: readonly string[],
  selectedIds: readonly string[],
  cap: number = MAX_LIKED_PLACES,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...likedIds, ...selectedIds]) {
    const s = String(id ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

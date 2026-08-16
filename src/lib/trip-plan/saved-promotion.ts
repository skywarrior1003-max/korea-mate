// Saved 에서 골라 일정에 넣은 곳은, 일정이 저장되면 더 이상 후보가 아니다.
//
// Saved 는 "갈지 말지 아직 모르는 곳" 이다. 그 장소가 실제 My Trip 에 들어가
// 저장된 순간 그 물음은 답이 났다 — 목록에 남겨 두면 사용자는 다음 여행을
// 짜면서 이미 다녀오기로 한 곳을 다시 고민한다.
//
// 무엇을 근거로 "Saved 에서 고른 것" 이라고 판단하나
//   cart 는 출처를 적어 두지 않는다. 그래서 출처가 아니라 **지금 상태** 로
//   판단한다 — 저장에 성공한 그 순간 같은 장소가 Saved 에도 있으면 그것이
//   Saved 에서 올라온 것이다. Explore 에서 하트 없이 바로 담은 곳은 Saved 에
//   없으니 자연히 아무 일도 일어나지 않는다.
//
// 새 provenance 모델을 만들지 않는 이유가 이것이다. 판단에 필요한 사실이 이미
// 두 저장소에 다 있다.

import { isUserSpotSource } from "../place-identity.ts";

export interface SelectedPick {
  /** legacy 찜 목록이 쓰는 id. 없을 수 있다. */
  id?:       string | null;
  /** identity SSOT. */
  sourceKey: string;
}

export interface SavedRelease {
  id:        string;
  sourceKey: string;
}

/**
 * 이번에 확정된 선택 중 Saved 에서도 내려야 할 것.
 *
 * 두 가지를 절대 건드리지 않는다.
 *   · My Places 원본(`user_spot:`) — 장기 보관소다. 일정에 썼다고 지우지 않는다.
 *   · Saved 에 없던 선택 — 지울 것이 없다.
 *
 * id 로만 맞히는 경로는 sourceKey 기록이 아예 없는 예전 사용자에게만 쓴다.
 * 지금 사용자에게까지 id 를 허용하면 같은 `local-24` 를 가진 **다른** 장소가
 * 함께 사라진다 — favorites 가 sourceKey 를 따로 두는 이유와 같다.
 */
export function savedSelectionsToRelease(
  picks:              readonly SelectedPick[] | null | undefined,
  favoriteSourceKeys: readonly string[] | null | undefined,
  favoriteIds:        readonly string[] | null | undefined,
): SavedRelease[] {
  const keys    = new Set((favoriteSourceKeys ?? []).filter(Boolean));
  const ids     = new Set((favoriteIds ?? []).filter(Boolean));
  const legacy  = keys.size === 0;          // sourceKey 기록이 하나도 없는 예전 상태
  const seen    = new Set<string>();
  const out: SavedRelease[] = [];

  for (const p of picks ?? []) {
    const sourceKey = (p?.sourceKey ?? "").trim();
    if (!sourceKey || seen.has(sourceKey)) continue;
    if (isUserSpotSource(sourceKey)) continue;          // My Places 원본은 남긴다

    const id = (p?.id ?? "").toString().trim();
    const inSaved = keys.has(sourceKey) || (legacy && id.length > 0 && ids.has(id));
    if (!inSaved) continue;

    seen.add(sourceKey);
    out.push({ id, sourceKey });
  }
  return out;
}

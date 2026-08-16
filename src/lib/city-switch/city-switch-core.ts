// 한 번에 한 지역만 계획한다 — 지역을 바꿀 때 무슨 일이 일어나는가.
//
// 여기 있는 것은 판단뿐이다. 지우는 일도, 화면을 띄우는 일도 하지 않는다.
// 그래야 "무엇을 지울지" 를 저장소 없이 검증할 수 있다.
//
// 도시가 열렸는지는 세지 않는다
//   장소 개수로 판단하면 수집이 잠깐 비었을 때 계획 도시가 아니게 되고, 몇 개
//   들어오면 갑자기 계획 도시가 된다. 그건 사람이 정하는 값이라 `CityConfig.
//   planningReady` 하나만 본다. 도시 이름을 코드에 적지 않는 이유도 같다.

import { normalizeTripCity } from "../cart-city/city-scope-core.ts";

export interface CityReadiness {
  /** 이 도시로 계획을 시작할 수 있는가 — 선언된 값 그대로. */
  planningReady: boolean;
}

export type CitySwitchAction =
  /** 아직 열리지 않은 도시다. 아무것도 바꾸지 않는다. */
  | "blocked"
  /** 같은 도시다. 할 일이 없다. */
  | "noop"
  /** 정리할 임시 상태가 없다. 바로 옮긴다. */
  | "switch"
  /** 지울 것이 있다. 먼저 묻는다. */
  | "confirm";

/**
 * 지역을 바꾸려 할 때 무엇을 할 것인가.
 *
 * 열리지 않은 도시를 고른 것은 실수도 오류도 아니다 — 그냥 아무 일도 일어나지
 * 않는다. 그때 계획 상태를 건드리면 사용자는 볼 것도 없는 도시로 옮겨 가면서
 * 모아 둔 것을 잃는다.
 */
export function citySwitchAction(v: {
  from:      string | null | undefined;
  to:        string | null | undefined;
  toCity:    CityReadiness | null | undefined;
  hasPlanningState: boolean;
}): CitySwitchAction {
  const to = normalizeTripCity(v.to);
  if (to === null) return "blocked";
  if (!v.toCity?.planningReady) return "blocked";

  const from = normalizeTripCity(v.from);
  if (from !== null && from === to) return "noop";

  return v.hasPlanningState ? "confirm" : "switch";
}

export interface SavedLike {
  id?:        string | null;
  sourceKey?: string | null;
  city?:      string | null;
}

export interface SavedRelease {
  id:        string;
  sourceKey: string;
}

/**
 * 이 도시 것이 **확실한** Saved 만 고른다.
 *
 * 도시를 적어 두지 않은 예전 항목은 건드리지 않는다. 좌표로 도시를 추정하지도
 * 않는다 — 부산과 경주는 70km 거리이고 잘못 찍으면 사용자가 모아 둔 것이
 * 엉뚱하게 사라진다. 모르면 남긴다.
 */
export function savedToReleaseForCity(
  saved: readonly SavedLike[] | null | undefined,
  city:  string | null | undefined,
): SavedRelease[] {
  const want = normalizeTripCity(city);
  if (want === null) return [];

  const seen = new Set<string>();
  const out: SavedRelease[] = [];
  for (const s of saved ?? []) {
    const sourceKey = (s?.sourceKey ?? "").trim();
    if (!sourceKey || seen.has(sourceKey)) continue;
    if (normalizeTripCity(s?.city) !== want) continue;   // 모르는 도시는 남긴다
    seen.add(sourceKey);
    out.push({ id: (s?.id ?? "").toString().trim(), sourceKey });
  }
  return out;
}

export interface PlanningStateProbe {
  savedForCity: number;
  cartForCity:  number;
}

/** 지울 것이 하나라도 있는가. 개수는 화면에 쓰지 않는다 — 있는지만 본다. */
export function hasPlanningState(v: PlanningStateProbe): boolean {
  return v.savedForCity > 0 || v.cartForCity > 0;
}

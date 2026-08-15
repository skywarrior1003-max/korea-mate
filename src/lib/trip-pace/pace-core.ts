// 어떤 속도로 여행할 것인가.
//
// 지금까지 이것을 사용자에게 물어본 적이 없다. 대신 "누구와 가는가"(Solo ·
// Couple · Family · Group)에서 몰래 유추했다 — 커플과 가족이면 체류시간이
// 1.3 배가 됐다. 사용자는 그런 것을 고른 적이 없고, 화면 어디에도 그렇게
// 적혀 있지 않다.
//
// 동행과 속도는 다른 질문이다. 가족이라고 느긋한 것도 아니고 혼자라고 바쁜
// 것도 아니다. 그래서 분리한다.
//
// 세 가지 뜻
//   relaxed   한 곳에 더 오래 머문다 (체류 1.3 배)
//   balanced  지금까지의 기본 그대로 (1.0)
//   active    같은 시간 안에서 **걷고 움직이는 곳을 더 고른다**
//
// `active` 가 무엇이 아닌지가 더 중요하다. 체류를 줄여 더 많이 밀어 넣는
// 모드가 아니다. 그건 기존 `packed`(0.8) 인데, 그렇게 하면 "활동적인 여행"이
// 아니라 "쉬는 시간 20% 삭감"이 된다. **active 의 체류는 balanced 와 같다.**
// 바뀌는 것은 자동으로 채우는 후보 중 무엇을 고르느냐뿐이다.

import type { TripPace } from "../scheduler/types.ts";

/** 사용자가 고르는 값. 엔진의 `TripPace` 와 이름이 겹치지 않게 한다. */
export type TripPaceChoice = "relaxed" | "balanced" | "active";

export const TRIP_PACE_CHOICES: readonly TripPaceChoice[] = ["relaxed", "balanced", "active"];

/**
 * 고르지 않았으면 `balanced` 다.
 *
 * 아무것도 건드리지 않은 여행이 지금까지의 일정과 똑같이 나와야 한다.
 * 예전 `travelStyle` 을 보고 기본값을 추론하지 않는다 — 그렇게 하면 커플·가족
 * 이 다시 몰래 relaxed 가 된다.
 */
export const DEFAULT_TRIP_PACE: TripPaceChoice = "balanced";

export function isTripPaceChoice(value: unknown): value is TripPaceChoice {
  return typeof value === "string" && (TRIP_PACE_CHOICES as readonly string[]).includes(value);
}

/** 모르는 값은 기본값으로 떨어뜨린다. 지어내지 않는다. */
export function normalizeTripPace(value: unknown): TripPaceChoice {
  return isTripPaceChoice(value) ? value : DEFAULT_TRIP_PACE;
}

/**
 * 체류시간 계약으로 바꾼다.
 *
 * `active` 가 `normal` 인 것이 이 함수의 핵심이다. 여기서 `packed` 를 돌려주면
 * 사용자가 고르지 않은 체류 축소가 일어난다. 그 줄은 존재하지 않는다.
 */
export function toSchedulerPace(choice: TripPaceChoice): TripPace {
  switch (choice) {
    case "relaxed": return "relaxed";
    case "active":  return "normal";
    default:        return "normal";
  }
}

/**
 * 걷고 움직이는 후보에 얹는 점수.
 *
 * `active` 일 때만, 그리고 구조적으로 `walking` 으로 분류된 후보에만 붙는다.
 * 장소 이름이나 설명을 읽지 않는다 — `city_spots.category = "nature"` 가
 * 기존 `CATEGORY_MAP` 을 거쳐 `walking` 이 되고, 그 값만 본다.
 *
 * 크기는 F5 선호(50)·F6 인접(25) 보다 작게 잡았다. 다른 요소를 밀어내지 않고
 * 비슷한 후보들 사이에서 순서를 바꾸는 정도를 노린다. 다만 총점은 여러 값의
 * 합이라 "절대 못 뒤집는다" 고 말할 수는 없다 — 실제 결과로 확인해야 한다.
 */
export const ACTIVE_WALKING_BONUS = 15;

export function paceBonus(choice: TripPaceChoice, category: string): number {
  return choice === "active" && category === "walking" ? ACTIVE_WALKING_BONUS : 0;
}

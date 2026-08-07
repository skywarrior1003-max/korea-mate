// AI 프로필 → 점수 보정. 순수 함수라 단위 테스트로 전부 고정할 수 있다.
//
// 어디에 얹히나
//   engine.ts 가 후보를 고르는 자리는 딱 한 곳이다.
//     adjusted_score = c.score + zoneBonus - consecutiveDistancePenalty(travelMin)
//   이 계산에 도달하기 전에 HC-3·HC-4·영업시간·선호 시간대·gap 길이 검사가 모두
//   끝나 있다(전부 `continue`). 즉 여기 들어오는 후보는 이미 "넣어도 되는" 것들이고,
//   보정은 그 안에서의 순서만 바꾼다. 규칙을 넘을 수 있는 경로가 없다.
//
// 왜 상한을 두나
//   기존 계약이 이렇다.
//     My Picks(Selected) score = 999, 최대 페널티 -90 → 바닥 909
//     NearMe 최대 ≈ 205
//   둘 사이 간격이 704 다. 보정을 ±30 으로 묶으면 NearMe 가 아무리 올라가도
//   235 라 Selected 를 넘지 못한다. Selected 보호 계약이 깨지지 않는다.
//
// 프로필이 없으면 항상 0 을 돌려준다 — 기존 결과와 완전히 같아야 한다.

import type {
  PersonalizationProfile, ProfileCategory, TimePreference,
} from "./ai/personalization-profile.ts";

/** 보정 절대 상한. 909 - 205 = 704 안에서 충분히 안전한 값 */
export const PROFILE_MAX_BONUS = 30;

const W_CATEGORY = 20;   // category_weights 0~1 → 0~20
const W_TIME     = 8;    // 선호 시간대와 실제 배치 시간대가 맞으면
const W_PREFERRED = 10;  // 사용자가 이미 고른 장소 목록에 있으면

/** gap 시작 시각(분) → 시간대 */
export function slotOfMinutes(startMinutes: number): Exclude<TimePreference, "flexible"> {
  const h = Math.floor(startMinutes / 60);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export interface BiasInput {
  place_id:      string;
  category?:     string;
  startMinutes:  number;
}

/**
 * 후보 하나에 대한 보정값. 항상 -PROFILE_MAX_BONUS ~ +PROFILE_MAX_BONUS 안이다.
 * 프로필이 없으면 0.
 */
export function profileBias(
  profile: PersonalizationProfile | null | undefined,
  input: BiasInput,
): number {
  if (!profile) return 0;

  let bonus = 0;

  const cat = (input.category ?? "").toLowerCase() as ProfileCategory;

  // 1) 카테고리 선호
  const w = profile.category_weights?.[cat];
  if (typeof w === "number") bonus += w * W_CATEGORY;

  // 2) 시간대 선호 — 이 카테고리를 언제 하고 싶은지와 지금 자리가 맞는가
  const want = profile.time_preferences?.[cat];
  if (want && want !== "flexible" && want === slotOfMinutes(input.startMinutes)) {
    bonus += W_TIME;
  }

  // 3) 사용자가 이미 고른 장소 — 검증기가 Selected/liked 안으로 이미 좁혀 두었다
  if (profile.preferred_place_ids?.includes(String(input.place_id))) {
    bonus += W_PREFERRED;
  }

  // 상한을 넘지 않게 자른다. 여기가 마지막 방어선이다.
  return Math.max(-PROFILE_MAX_BONUS, Math.min(PROFILE_MAX_BONUS, Math.round(bonus)));
}

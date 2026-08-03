// Page 1 판정.
//
// 규칙은 하나다: 사용자가 "이 여행을 마무리했다" 고 **직접** 말한 여행만
// Memory Synergy 로 간다. 날짜가 지났다고, Memory 가 생겼다고 자동으로
// 넘어가지 않는다 — 그건 사용자가 하지 않은 결정을 대신 내리는 것이다.
//
// 그래서 마무리 신호는 selector 밖에서 주입한다. 지금 저장소에는 그런 신호가
// 없어서 (finish / wrapUp / trip_end / createStory / story_created 검색 0건,
// itineraries 스키마에도 없음) 운영에서는 NO_FINISH_SIGNAL 을 쓴다.
// 신호 계약이 생기면 이 함수 하나만 갈아끼우면 된다.

import type {
  HomeExperienceInput, HomeExperienceState,
} from "./home-experience-types";

/** 운영 기본값. 마무리 신호 계약이 없으므로 Memory Synergy 는 켜지지 않는다. */
export const NO_FINISH_SIGNAL = (): boolean => false;

/** Memory 중 가장 늦은 captured_at. 없으면 "" (정렬에서 가장 뒤로 간다) */
function latestCapturedAt(moments: readonly { captured_at: string }[]): string {
  let latest = "";
  for (const m of moments) {
    if (m.captured_at > latest) latest = m.captured_at;
  }
  return latest;
}

/**
 * Page 1 상태를 고른다.
 *
 * 같은 입력이면 항상 같은 결과다 — 정렬 3단계 마지막이 id 라 동률이 남지 않는다.
 * 날짜 비교는 어디에도 없다. end_date 를 미래로 바꿔도 결과가 변하지 않는다.
 */
export function selectHomeExperience(input: HomeExperienceInput): HomeExperienceState {
  const { trips, momentsOf, finishSignalOf } = input;

  const candidates = trips
    .filter(t => t.id && finishSignalOf(t.id) && momentsOf(t.id).length > 0)
    .map(t => ({ trip: t, moments: momentsOf(t.id) }));

  if (candidates.length === 0) {
    return { page1: "storytelling", moments: [] };
  }

  candidates.sort((a, b) => {
    // 1순위: 기록이 가장 최근까지 이어진 여행
    const ca = latestCapturedAt(a.moments);
    const cb = latestCapturedAt(b.moments);
    if (ca !== cb) return ca < cb ? 1 : -1;
    // 2순위: 일정 자체를 마지막으로 손댄 순서
    const ua = a.trip.updated_at ?? "";
    const ub = b.trip.updated_at ?? "";
    if (ua !== ub) return ua < ub ? 1 : -1;
    // 3순위: 완전 결정론용
    return a.trip.id < b.trip.id ? -1 : 1;
  });

  const top = candidates[0];
  return {
    page1: "memory",
    trip: top.trip,
    // 타임라인은 오래된 것부터 읽는 편이 자연스럽다
    moments: [...top.moments].sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1)),
  };
}

// 신고가 가리키는 Story 가 지금 어떤 상태인가.
//
// 왜 필요한가
//   관리자 화면은 "내가 아까 눌렀던가" 를 기억으로 판단하고 있었다. 새로고침하면
//   그 기억이 사라져 무엇이 가려졌는지 알 수 없다. 눌렀는지가 아니라 **서버에
//   저장된 상태**가 정본이어야 한다.
//
// 왜 boolean 으로 줄이나
//   가려진 시각은 관리자 화면이 쓰지 않는다. 값을 그대로 내보내면 필요 없는
//   정보가 한 겹 더 나가고, 나중에 그 값을 다른 데 쓰기 시작한다. 필요한 것은
//   "가려졌는가" 하나다.
//
// 대상이 이미 사라진 신고
//   여행을 지워도 신고 기록은 남는다(#6·#7 이 그런 경우다). 그때 관리자에게
//   차단 버튼을 그대로 보여 주면, 눌러도 아무 일이 없는데 성공한 것처럼 보인다.
//   그래서 "대상이 있는가" 를 함께 알려 준다.

import { STORY_TARGET_TYPE, isModerationHidden } from "./story-moderation-core.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 관리자 화면이 카드 하나에서 쓰는 것 전부 */
export interface StoryTargetState {
  targetExists:     boolean;
  isPublic:         boolean;
  moderationHidden: boolean;
}

/** 없는 대상의 기본값. 차단 조작을 열어 주지 않는다. */
export const MISSING_TARGET: StoryTargetState = {
  targetExists: false, isPublic: false, moderationHidden: false,
};

/**
 * 상태를 물어봐야 할 여행 id 목록.
 *
 * Story 신고만 고른다 — 장소 신고의 `target_key` 는 city_spot 번호라 여행이 아니다.
 * 중복은 한 번만 담는다. **한 번의 조회로 끝내기 위한 목록**이다(신고마다 따로
 * 부르면 목록 100건에 조회가 100번 붙는다).
 */
export function storyTargetKeys(
  reports: ReadonlyArray<{ target_type?: unknown; target_key?: unknown }>,
): string[] {
  const seen = new Set<string>();
  for (const r of reports) {
    if (r.target_type !== STORY_TARGET_TYPE) continue;
    const k = typeof r.target_key === "string" ? r.target_key.trim() : "";
    if (UUID.test(k)) seen.add(k);
  }
  return [...seen];
}

/** 조회해 온 여행 행들을 id → 상태 표로 만든다 */
export function buildStoryStates(
  rows: ReadonlyArray<{ id?: unknown; is_public?: unknown; moderation_hidden_at?: unknown }>,
): Map<string, StoryTargetState> {
  const map = new Map<string, StoryTargetState>();
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    map.set(id, {
      targetExists:     true,
      isPublic:         row.is_public === true,
      moderationHidden: isModerationHidden({
        moderation_hidden_at: typeof row.moderation_hidden_at === "string" ? row.moderation_hidden_at : null,
      }),
    });
  }
  return map;
}

/**
 * 신고 목록에 상태를 붙인다.
 *
 * Story 신고에만 붙는다 — 기존 장소 신고 행은 모양이 그대로다. 새 필드를 더할
 * 뿐 기존 필드를 지우거나 바꾸지 않는다.
 */
export function attachStoryStates<T extends { target_type?: unknown; target_key?: unknown }>(
  reports: ReadonlyArray<T>,
  states:  ReadonlyMap<string, StoryTargetState>,
): Array<T & { story_state?: StoryTargetState }> {
  return reports.map(r => {
    if (r.target_type !== STORY_TARGET_TYPE) return { ...r };
    const key = typeof r.target_key === "string" ? r.target_key : "";
    return { ...r, story_state: states.get(key) ?? MISSING_TARGET };
  });
}

/**
 * 있으면 안 되는 조합인가.
 *
 * 가려졌는데 공개로 켜져 있다. 여기서 고치지 않는다 — 사람이 보고 정할 일이고,
 * 화면이 조용히 데이터를 바꾸기 시작하면 무엇이 왜 바뀌었는지 아무도 모른다.
 */
export function isContradictory(s: StoryTargetState | undefined): boolean {
  return !!s && s.targetExists && s.moderationHidden && s.isPublic;
}

/** 차단/해제를 눌러도 되는 대상인가 */
export function canModerate(s: StoryTargetState | undefined): boolean {
  return !!s && s.targetExists;
}

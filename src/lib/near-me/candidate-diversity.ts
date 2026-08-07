// 후보 목록(recall)을 자를 때 소수 카테고리가 통째로 사라지지 않게 한다.
//
// 이 파일이 정하는 것과 정하지 않는 것
//   정한다   — 스케줄러가 **볼 수 있는** 후보에 각 카테고리가 최소 몇 개는 남는가
//   정하지 않는다 — 최종 일정에 식당이 몇 개 들어가는가
//
//   `후보 풀 비율 ≠ 일정 비율` 이다. 최종 식음 배치는 meal-opportunity.ts 가
//   그날 실제 식사 기회로 결정한다. 여기에는 어떤 목표 비율도 없다.
//
// 왜 필요한가 (실측, 2026-08-07 부산)
//   restaurant 327 · attraction 48 · nature 37.
//   점수는 거리(0~100) + 카테고리 가중치(food 20 = attraction 20) 로 매겨지고
//   상위 N 만 스케줄러에게 넘긴다. 그러면 Gwangalli 반경 7km 에서
//   top30 이 food 28 · attraction 1 · walking 1 이 된다.
//   식당을 좋아해서가 아니라 DB 에 많아서다. 관광지가 후보에 아예 없으면
//   식사 기회를 제대로 다뤄도 하루를 채울 재료가 없다.
//
// 그래서 **비율이 아니라 절대 개수**로 바닥만 깐다.
//   각 카테고리 최소 MIN_RECALL_PER_CATEGORY 개, 나머지는 전부 점수 순.
//   이 값은 "일정의 몇 %" 가 아니라 "후보에 최소 몇 개" 다.

/** 자르기에 필요한 최소 형태. near-me·plan 양쪽 후보가 모두 만족한다. */
export interface DiversifiableCandidate {
  category: string;
  score:    number;
}

/**
 * 카테고리별 최소 recall 개수. **절대 개수이며 비율이 아니다.**
 * 하루 일정에 들어갈 수 있는 항목 수(HC-7)를 고려한 최소 재료량이다.
 */
export const MIN_RECALL_PER_CATEGORY = 5;

/**
 * 점수 순으로 limit 개를 고르되, 풀에 존재하는 각 카테고리가
 * 최소 MIN_RECALL_PER_CATEGORY 개는 남도록 보장한다.
 *
 * - 입력이 limit 이하면 정렬만 해서 그대로 돌려준다 (동작 변화 없음)
 * - 카테고리가 하나뿐이면 기존 `sort().slice()` 와 완전히 같다
 * - 최소치를 채우고 남은 자리는 **순수 점수 순** 이다 — 균등 분배하지 않는다
 * - 결정론적이다. 같은 입력이면 항상 같은 출력.
 */
export function diversifyByCategory<T extends DiversifiableCandidate>(
  candidates: readonly T[],
  limit: number,
  minPerCategory: number = MIN_RECALL_PER_CATEGORY,
): T[] {
  if (limit <= 0) return [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  if (sorted.length <= limit) return sorted;

  const byCategory = new Map<string, T[]>();
  for (const c of sorted) {
    const key = c.category ?? "";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(c);
  }
  if (byCategory.size === 1) return sorted.slice(0, limit);

  // ① 각 카테고리의 최소 recall 을 먼저 확보한다
  const picked = new Set<T>();
  for (const list of byCategory.values()) {
    for (const c of list.slice(0, Math.max(0, minPerCategory))) {
      if (picked.size >= limit) break;
      picked.add(c);
    }
  }

  // ② 남은 자리는 순수 점수 순으로 채운다 — 여기에 비율은 없다
  for (const c of sorted) {
    if (picked.size >= limit) break;
    picked.add(c);
  }

  return [...picked].sort((a, b) => b.score - a.score);
}

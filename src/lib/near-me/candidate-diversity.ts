// 후보 목록을 자를 때 **개수가 많은 카테고리가 저절로 이기지 않게** 한다.
//
// 무엇이 문제였나 (실측, 2026-08-07 부산)
//   부산 restaurant 327 · attraction 48 · nature 37.
//   점수는 거리(0~100) + 카테고리 가중치(food 20 = attraction 20)로 매겨지고,
//   그 뒤 상위 N 개만 스케줄러에게 넘긴다. 그러면 이렇게 된다.
//
//     Gwangalli  7km 풀 food 168 / attraction 21 / walking 9
//                → top30  food 28 · attraction 1 · walking 1   (food 93%)
//
//   사용자는 식당을 좋아한다고 말한 적이 없다. 그냥 DB 에 식당이 많을 뿐이다.
//   그런데 스케줄러에게는 식당만 도착하므로 하루가 식당으로 찬다.
//   `후보 수` 가 `취향` 으로 둔갑한 것이다.
//
// 어떻게 고치나
//   점수를 건드리지 않는다. **자르는 방식만** 바꾼다.
//   카테고리별로 점수 순서를 유지한 채 번갈아 뽑는다(라운드로빈).
//   한 카테고리가 떨어지면 남은 자리는 점수 순으로 채운다 — 후보가 줄지 않는다.
//
// 취향은 여전히 반영된다. 사용자가 실제로 식당을 좋아하면
//   · F5 liked 카테고리 +50 이 식당 후보의 점수를 올리고
//   · AI profileBias 가 배치 순서를 올린다
//   달라지는 건 "많으니까 이긴다" 가 사라지는 것뿐이다.

/** 자르기에 필요한 최소 형태. near-me·plan 양쪽 후보가 모두 만족한다. */
export interface DiversifiableCandidate {
  category: string;
  score:    number;
}

/**
 * 점수 내림차순을 유지하면서 카테고리를 번갈아 뽑아 limit 개로 자른다.
 *
 * - 입력이 limit 이하면 정렬만 해서 그대로 돌려준다 (동작 변화 없음)
 * - 카테고리가 하나뿐이면 기존 `sort().slice()` 와 완전히 같다
 * - 결정론적이다. 같은 입력이면 항상 같은 출력.
 */
export function diversifyByCategory<T extends DiversifiableCandidate>(
  candidates: readonly T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  if (sorted.length <= limit) return sorted;

  // 카테고리별 큐 — 각 큐 안에서는 점수 순서가 그대로 유지된다
  const queues = new Map<string, T[]>();
  const order: string[] = [];          // 첫 등장 순서 = 최고 점수 순서
  for (const c of sorted) {
    const key = c.category ?? "";
    if (!queues.has(key)) { queues.set(key, []); order.push(key); }
    queues.get(key)!.push(c);
  }
  if (order.length === 1) return sorted.slice(0, limit);

  const picked: T[] = [];
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const key of order) {
      if (picked.length >= limit) break;
      const q = queues.get(key)!;
      if (q.length === 0) continue;
      picked.push(q.shift()!);
      progressed = true;
    }
  }

  // 라운드로빈이 끝났는데 자리가 남으면(카테고리가 모두 소진) 점수 순으로 채운다
  if (picked.length < limit) {
    const taken = new Set(picked);
    for (const c of sorted) {
      if (picked.length >= limit) break;
      if (!taken.has(c)) picked.push(c);
    }
  }

  // 스케줄러는 점수 순서를 기대한다. 구성만 다양해지고 정렬은 유지한다.
  return picked.sort((a, b) => b.score - a.score);
}

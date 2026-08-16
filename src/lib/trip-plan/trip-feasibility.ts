// 여행 전체를 다 만들고 난 뒤에야 답할 수 있는 질문 하나 — 고른 곳이 다 들어갔나.
//
// 하루씩 만드는 구조라 하루짜리 결과만 봐서는 알 수 없다. Day 1 에 못 들어간
// 장소는 Day 3 에 들어갈 수 있고, 그건 결함이 아니라 정상이다. 그래서 판정은
// 날짜 루프가 전부 끝난 뒤 한 번만 한다.
//
// 남은 곳이 있다고 전부 "너무 많이 골랐다" 는 아니다. 이미 자기 이름으로 불리는
// 문제들이 있다.
//
//   좌표가 없다      → `skippedCartNames`. 애초에 후보가 되지 못해 여기 오지도 않는다.
//   고정 시각이 안 맞다 → `fixedOutOfWindowNames` · `conflictDays`.
//
// 그 둘을 "장소를 줄이세요" 로 바꿔 말하면 사용자는 지울 필요 없는 장소를 지운다.
// 여기서 걸러 내는 이유다.

export interface UnplacedPick {
  key:      string;
  name:     string;
  /** 사용자가 날짜·시각을 못 박아 둔 장소인가. */
  hasFixed: boolean;
}

export interface ReduciblePick {
  key:  string;
  name: string;
}

/**
 * 이 중 "선택을 줄이면 해결되는" 것만 남긴다.
 *
 * 고정 장소는 뺀다. 시간을 못 박아 둔 장소가 안 들어간 것은 개수 문제가 아니라
 * 그 시각 자체의 문제이고, 이미 별도 안내가 붙는다. 사용자가 일반 장소를 아무리
 * 지워도 해결되지 않는 종류다.
 */
export function reduciblePicks(
  unplaced:              UnplacedPick[] | null | undefined,
  fixedOutOfWindowNames: string[] | null | undefined,
): ReduciblePick[] {
  const outOfWindow = new Set((fixedOutOfWindowNames ?? []).map(n => n.trim()));
  return (unplaced ?? [])
    .filter(u => !u.hasFixed)
    .filter(u => !outOfWindow.has((u.name ?? "").trim()))
    .map(u => ({ key: u.key, name: u.name }));
}

/**
 * 이 결과를 My Trip 으로 확정해도 되는가.
 *
 * 안 되면 저장을 시작하지 않는다. 화면에 띄우지도 않는다 — 반쯤 만들어진
 * 일정을 보여 주면 사용자는 그게 완성본인 줄 안다.
 */
export function canFinalizeTrip(
  unplaced:              UnplacedPick[] | null | undefined,
  fixedOutOfWindowNames: string[] | null | undefined,
): boolean {
  return reduciblePicks(unplaced, fixedOutOfWindowNames).length === 0;
}

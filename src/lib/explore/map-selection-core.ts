// Explore 지도 선택 판정 — 마커 클릭이 어떤 결과로 이어지는가.
//
// 이 파일을 따로 둔 이유: Naver SDK 는 마커 클릭을 자체 이벤트 계층에서
// 처리해 브라우저 자동화가 도달하지 못한다(합성 클릭 6종 전부 실패, 실측).
// 그래서 "클릭이 들어왔을 때 무엇이 선택되는가"를 SDK 와 분리해 여기서
// 결정하고, 테스트는 SDK 를 흉내 낸 뒤 이 함수들을 통과시킨다.
//
// 화면(ExploreCity)과 테스트가 같은 함수를 쓴다 — 판정이 갈리지 않게.

export interface SelectableSpot {
  id:         number | string;
  sourceKey?: string;
  lat?:       number | null;
  lng?:       number | null;
}

/** 선택 상태를 보관할 키. sourceKey 가 없던 시절 항목은 id 로 떨어진다. */
export function selectionKey(spot: SelectableSpot): string {
  return spot.sourceKey ?? String(spot.id);
}

/**
 * 클릭된 마커를 현재 목록에서 되찾는다.
 *
 * 병합 목록에는 서로 다른 소스가 같은 숫자 id 를 쓰는 항목이 있다. id 만으로
 * 찾으면 마커를 눌렀을 때 엉뚱한 장소가 열린다 — 좌표까지 함께 대조하고,
 * 좌표가 없을 때만 id 로 떨어진다.
 */
export function resolveClickedSpot<T extends SelectableSpot>(
  spots: readonly T[],
  clicked: SelectableSpot,
): T | null {
  const exact = spots.find(
    s => s.id === clicked.id && s.lat === clicked.lat && s.lng === clicked.lng,
  );
  if (exact) return exact;
  return spots.find(s => s.id === clicked.id) ?? null;
}

/** 마커 클릭이 향할 곳. Map 모드는 하단 카드, 그 외(List·데스크톱 split)는 기존 상세 모달. */
export function clickTarget(viewMode: "list" | "map"): "card" | "modal" {
  return viewMode === "map" ? "card" : "modal";
}

/**
 * 현재 선택을 결과 목록에 비추어 되돌린다.
 *
 * 검색어나 카테고리가 바뀌어 선택한 장소가 결과에서 빠지면 하단 카드는 목록에
 * 없는 장소를 가리키게 된다. 상태를 지우는 effect 를 두는 대신 매 렌더에서
 * 파생시킨다 — 필터가 되돌아오면 선택도 자연히 살아난다.
 */
export function resolveSelection<T extends SelectableSpot>(
  spots: readonly T[],
  pickedKey: string | null,
): T | null {
  if (!pickedKey) return null;
  return spots.find(s => selectionKey(s) === pickedKey) ?? null;
}

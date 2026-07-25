// S2 — Visited 로컬 상태 키 (localStorage 전용, itinerary 저장 형식·DB 무변경)
//
// 격리 규칙:
// - 여행 간: storage key에 itineraryId 포함 (미저장 생성분은 "draft" 버킷)
// - 장소 간: place_id 최우선. 없으면 name 폴백 (접두사로 place_id 값과 충돌 방지)
// - 언어 간: 키는 저장된 데이터(place_id·name)만 사용 — UI locale 무관
//
// 알려진 한계: place_id 없는 동명 장소는 같은 키 (스케줄러 생성분은 place_id 미보유 —
// place_map 확장 승인 시 자연 해소)

export function visitedStorageKey(itineraryId: string | null | undefined): string {
  return `koreamate_visited_${itineraryId ?? "draft"}`;
}

export function visitedPlaceKey(
  dayNumber: number,
  place: { place_id?: string; name: string },
): string {
  return place.place_id
    ? `${dayNumber}:id:${place.place_id}`
    : `${dayNumber}:name:${place.name}`;
}

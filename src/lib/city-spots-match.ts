// 장소명 정규화 매칭 — 순수 함수 (supabase 의존 없음; node 테스트가 직접 읽는다)
//
// TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 — ambiguity-safe.
//   migration 057 이후 같은 도시에 같은 표시명이 둘 이상 있을 수 있다(진미반점 2지점 등). 이름만으로 찾는 이 legacy
//   fallback 은 후보가 **정확히 하나**일 때만 돌려준다. 둘 이상이면 null — 임의의 첫 행을 고르지 않는다.
//   (호출부는 null 이면 cartSnapshot/검색 URL 로 fallback 한다. 정체성은 place_id/sourceKey 가 담당한다.)
//   city-spots.ts 에 있던 구현을 그대로 옮겼다(동작 변경은 '유일할 때만' 규칙뿐).
import type { CitySpot } from "@/data/cities/types";

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣\s]/g, "").replace(/\s+/g, " ").trim();
}

function onlyOne<T>(arr: T[]): T | null {
  return arr.length === 1 ? arr[0]! : null;
}

export function matchCitySpot(placeName: string, spots: CitySpot[]): CitySpot | null {
  if (!placeName || spots.length === 0) return null;
  const needle = normName(placeName);

  // 1. Exact normalized match — 유일할 때만
  let hit = onlyOne(spots.filter(s => normName(s.name) === needle));
  if (hit) return hit;
  if (spots.some(s => normName(s.name) === needle)) return null;   // 동명 여러 개 → 모호

  // 2. One contains the other — 유일할 때만
  hit = onlyOne(spots.filter(s => {
    const hay = normName(s.name);
    return needle.includes(hay) || hay.includes(needle);
  }));
  if (hit) return hit;

  // 3. Any keyword from spot name (≥4 chars) found in needle — 유일할 때만
  return onlyOne(spots.filter(s =>
    normName(s.name).split(" ").filter(w => w.length >= 4).some(w => needle.includes(w))
  ));
}

// Curated trips — Owner 가 수집한 공식 추천 여행 코스의 런타임 노출.
//
// 출처: data/gyeongju-official-travel-content/gyeongju-official-courses-v2.jsonl
//       (경주 공식 여행 콘텐츠, repo 안의 검증된 수집물. 웹에서 새로 긁지 않았다)
// days/stops 는 gyeongju-official-course-place-links-final-v1.jsonl 의 실측
// (day 라벨·경유지 수)에서만 계산했다 — 링크가 없는 코스는 null 로 두고
// 화면에서 기간을 지어내지 않는다.
//
// 부산 등 다른 도시의 curated 코스는 아직 저장소에 없다. 없는 도시는 빈 배열을
// 반환하고, 화면은 "준비 중" 사실 문구를 보여 준다(가짜 목록 금지).
import raw from "./curated-trips.json" with { type: "json" };

export interface CuratedTrip {
  id: string;
  city: string;
  title: string;
  category: string | null;
  theme: string | null;
  days: number | null;
  stops: number | null;
}

export const CURATED_TRIPS: CuratedTrip[] = raw as CuratedTrip[];

export function curatedTripsForCity(slug: string): CuratedTrip[] {
  // 공식 콘텐츠에는 코스가 아닌 안내문("입장료안내" 등)이 섞여 있다.
  // 제목이 안내문인 행만 제외한다 — 버스 코스·둘레길·N선 모음은 전부 실제 코스다.
  return CURATED_TRIPS.filter(t => t.city === slug.toLowerCase() && !/안내$/.test(t.title.trim()));
}

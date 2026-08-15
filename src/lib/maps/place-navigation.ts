// 장소 하나를 지도에서 여는 주소.
//
// 여기 있는 규칙은 새로 만든 것이 아니다. 일정 화면이 쓰던 것을 그대로 옮겨
// 왔다 — 공유 화면도 같은 것을 써야 하기 때문이다. 두 곳이 각자 조립하면
// 한쪽에서만 조용히 다른 곳이 열린다.
//
// 좌표를 쓰지 않는다. 이름과 도시로 검색한다. 그래서 사용자가 직접 적어 넣은
// 숙소처럼 우리 장소 데이터에 없는 곳도 열리고, 동시에 그 사람이 어디서 자는지
// 정확한 지점이 공유 링크에 실리지 않는다.

// ── 영문명 → 네이버 한국어 키워드 매핑 ──────────────────────
export const NAVER_KEYWORD_MAP: Record<string, string> = {
  "haeundae beach":          "해운대해수욕장",
  "gamcheon culture village":"감천문화마을",
  "jagalchi fish market":    "자갈치시장",
  "jagalchi market":         "자갈치시장",
  "gwangalli beach":         "광안리해수욕장",
  "hwangnyeongsan":          "황령산전망대",
  "hwangnyeongsan night view trail": "황령산전망대",
  "jangsan mountain trail":  "장산등산로입구",
  "jangsan mountain":        "장산등산로입구",
  "igidae coastal walk":     "이기대해안산책로",
  "igidae":                  "이기대해안산책로",
  "haedong yonggungsa":      "해동용궁사",
  "oryukdo skywalk":         "오륙도스카이워크",
  "taejongdae":              "태종대",
  "busan tower":             "부산타워",
  "seomyeon":                "서면",
  "nampo-dong":              "남포동",
  "gyeongbokgung":           "경복궁",
  "namsan tower":            "남산타워",
  "n seoul tower":           "남산타워",
  "myeongdong":              "명동",
  "bukchon hanok village":   "북촌한옥마을",
  "dongdaemun":              "동대문",
  "hongdae":                 "홍대",
  "itaewon":                 "이태원",
  "insadong":                "인사동",
  "changdeokgung":           "창덕궁",
  "gwangjang market":        "광장시장",
  "noryangjin fish market":  "노량진수산시장",
};

// ── Naver Maps URL ────────────────────────────────────────────
export function naverPlaceSearchUrl(placeName: string, city: string): string {
  const norm = placeName.toLowerCase().trim();
  for (const [eng, kor] of Object.entries(NAVER_KEYWORD_MAP)) {
    if (norm.includes(eng) || eng.includes(norm)) {
      return `https://map.naver.com/v5/search/${encodeURIComponent(kor)}`;
    }
  }
  const korean = (placeName.match(/[가-힯ᄀ-ᇿ]+/g) ?? []).join("").trim();
  if (korean.length >= 2) return `https://map.naver.com/v5/search/${encodeURIComponent(korean)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${placeName} ${city} Korea`)}`;
}

/** 이름과 도시로 여는 Google 지도. 좌표를 넣지 않는다. */
export function googlePlaceSearchUrl(placeName: string, city: string): string {
  const parts = [placeName.trim(), city.trim(), "Korea"].filter(s => s.length > 0);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(" "))}`;
}

/**
 * 밖으로 내보내도 되는 주소인가.
 *
 * 사용자가 붙여넣은 문자열이 href 로 흘러드는 길을 막는다. `javascript:` 와
 * `data:` 는 링크가 아니라 실행이다. 우리가 아는 지도 주소만 통과한다.
 */
export function isSafeMapUrl(url: string): boolean {
  return /^https:\/\/(map\.naver\.com|www\.google\.com|maps\.google\.com)\//.test(url.trim());
}

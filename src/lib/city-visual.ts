// 도시 대표 비주얼 — 서비스 공용 resolver.
//
// 도시 사진이 필요한 화면(Home, City Entry, Planner 상세)이 각자 자기 맵을
// 들고 있었다. 도시가 늘 때마다 한 곳만 고치면 나머지가 조용히 어긋나고,
// 없는 도시를 다른 도시 사진으로 메우는 실수도 여기서 난다. 매핑을 한 곳으로
// 모은다.
//
// ── 자산 성격 ────────────────────────────────────────────────────────────────
// `gokoreamate 서비스용 기본 도시 대표 비주얼`이다. 다음이 **아니다**:
//   - 지자체가 공식 지정한 이미지
//   - 한국관광공사(KTO)가 제공한 공공 관광사진
//   - 사용자가 직접 찍은 여행 사진
//   - 특정 장소의 사실 기록사진
// 그래서 화면에 "공식"이라는 문구를 붙이지 않고, alt 도 도시 분위기 수준으로만
// 쓴다. KTO 자산(`src/lib/trip-cover/`)과는 파일도 코드도 완전히 분리한다 —
// 저쪽은 KOGL Type 1 라이선스와 tong.visitkorea.or.kr 호스트 허용목록이 보안
// 계약으로 걸려 있고, 여기 자산은 그 계약을 만족하지 않는다. 섞으면 허위 출처가
// 된다.
//
// ── 변환하지 않는 이유 ───────────────────────────────────────────────────────
// 원본은 1024x1024 PNG 다. 이미지 변환 패키지(sharp 등)를 이번 작업에 추가하지
// 않기로 했으므로 원본을 그대로 두고, 잘라내기는 브라우저 object-fit 으로
// 처리한다. 도시마다 주요 피사체 위치가 달라 objectPosition 을 각각 지정한다.

export interface CityVisual {
  src: string;
  /** 내재 크기 — layout shift 방지용. aspect-ratio 계산에 쓴다. */
  w: number;
  h: number;
  /** 가로로 얕게 자를 때 주요 피사체가 살아남는 위치 */
  objectPosition: string;
}

/**
 * 도시 slug → 대표 비주얼. 명시적 매핑만 둔다.
 *
 * 부산은 기존에 검증된 가로형 사진을 그대로 쓴다 — 이미 여러 화면에서 쓰던
 * 자산이라 바꿀 이유가 없다.
 */
const CITY_VISUALS: Readonly<Record<string, CityVisual>> = Object.freeze({
  busan: {
    src: "/images/home/city-busan-hero.jpg",
    w: 1408, h: 768,
    objectPosition: "center 45%",
  },
  seoul: {
    // N서울타워가 오른쪽 위에 있어 가로로 자르면 첨탑이 먼저 잘린다
    src: "/images/cities/city-seoul-v1.webp",
    w: 1024, h: 1024,
    objectPosition: "center 42%",
  },
  gyeongju: {
    // 누각과 수면 반영이 가운데 아래쪽에 몰려 있다
    src: "/images/cities/city-gyeongju-v1.webp",
    w: 1024, h: 1024,
    objectPosition: "center 52%",
  },
  jeju: {
    // 수평선과 현무암이 만나는 지점이 위쪽 1/3
    src: "/images/cities/city-jeju-v1.webp",
    w: 1024, h: 1024,
    objectPosition: "center 40%",
  },
  jeonju: {
    // 기와 지붕이 화면 아래 절반에 있다
    src: "/images/cities/city-jeonju-v1.webp",
    w: 1024, h: 1024,
    objectPosition: "center 58%",
  },
});

/** 대소문자·공백 차이를 흡수한다. 없는 도시는 null — 다른 도시 사진을 돌려주지 않는다. */
export function cityVisual(slug: string | null | undefined): CityVisual | null {
  if (typeof slug !== "string") return null;
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  return CITY_VISUALS[key] ?? null;
}

/** 대표 비주얼이 있는 도시 목록 — 테스트·감사용 */
export function citiesWithVisual(): readonly string[] {
  return Object.freeze(Object.keys(CITY_VISUALS).sort());
}

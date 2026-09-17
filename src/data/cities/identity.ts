// 5도시 city identity — 클라이언트와 Cloudflare Functions 가 공유하는 경량 SSOT
// (TRIP-CITY-CONTRACT-FINAL-CLOSEOUT-V1, 2026-09-17)
//
// 여기 있는 것만이 도시 식별 계약의 전부다:
//  · canonical slug 5개 (내부 저장·URL·기능 판정 — 화면 노출 금지)
//  · 4개 locale 의 공식 표시명 (UI 번역 tripForm.city_* 와 동일 값 — 가드 테스트가
//    두 곳의 드리프트를 막는다. 표시명의 원 출처는 이 모듈이고 번역 파일이 이를 따른다.)
//  · exact-match resolver (trim + 라틴 소문자 정규화만, fuzzy 0, unknown → null)
//
// 무거운 것(도시 config·staticSpots·전체 번역 번들)은 여기 두지 않는다 —
// Functions 번들에 그대로 올라가는 파일이다. import 의존성 0 을 유지한다.
//
// legacy alias: 2026-09-17 Production itineraries.city 전수 감사(86행) 결과
// 실측값은 Busan/busan/seoul/서울 뿐 — 전부 아래 표시명·slug 로 해석된다.
// 추가 별칭은 실사용 근거가 확인될 때에만 이 목록에 넣는다(발명 금지).

export const CITY_SLUGS = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;
export type CitySlug = typeof CITY_SLUGS[number];

export type CityLocale = "ko" | "en" | "ja" | "zh";

/** locale 별 공식 표시명 — tripForm.city_* 번역과 값이 같아야 한다(가드 테스트). */
export const CITY_DISPLAY_NAMES: Record<CitySlug, Record<CityLocale, string>> = {
  busan:    { ko: "부산",   en: "Busan",       ja: "釜山",   zh: "釜山" },
  seoul:    { ko: "서울",   en: "Seoul",       ja: "ソウル", zh: "首尔" },
  jeju:     { ko: "제주도", en: "Jeju Island", ja: "済州島", zh: "济州岛" },
  gyeongju: { ko: "경주",   en: "Gyeongju",    ja: "慶州",   zh: "庆州" },
  jeonju:   { ko: "전주",   en: "Jeonju",      ja: "全州",   zh: "全州" },
};

/** Production 실측으로 확인된 추가 별칭만 — 현재 0건(감사 2026-09-17). */
export const CITY_LEGACY_ALIASES: ReadonlyArray<readonly [string, CitySlug]> = [];

/** tripForm 네임스페이스의 도시 라벨 키 관례 — slug 입력형 */
export function cityLabelKey(slug: CitySlug): string {
  return `city_${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
}

function norm(v: string): string {
  return v.trim().toLowerCase();
}

const ALIAS: ReadonlyMap<string, CitySlug> = (() => {
  const m = new Map<string, CitySlug>();
  for (const slug of CITY_SLUGS) {
    m.set(norm(slug), slug);
    for (const name of Object.values(CITY_DISPLAY_NAMES[slug])) m.set(norm(name), slug);
  }
  for (const [alias, slug] of CITY_LEGACY_ALIASES) m.set(norm(alias), slug);
  return m;
})();

/** 저장값·입력값 → canonical slug. 완전 일치만, 미확인은 null(임의 기본 도시 금지). */
export function resolveCitySlug(input: string | null | undefined): CitySlug | null {
  if (typeof input !== "string") return null;
  const v = norm(input);
  if (!v) return null;
  return ALIAS.get(v) ?? null;
}

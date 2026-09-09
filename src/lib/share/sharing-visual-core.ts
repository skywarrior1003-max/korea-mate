// Sharing visual 공통 규칙 — 9:16 카드와 OG preview 가 같은 계약을 쓴다.
// (TASK-GOKOREAMATE-SHARING-VISUAL-PRODUCTION-V1)
//
// Owner 철학: **여행이 주인공, gokoreamate 는 조용한 보조.**
//   - 제목: 사용자의 실제 Trip title 이 최우선이다. 있는 제목을
//     "{N} Days in {City}" 류 generic 으로 덮어쓰지 않는다.
//   - 설명: 광고 문구 금지. 셀 수 있는 사실만 적는다.
//   - 이미지: 동의된 개인 cover → 대표 카탈로그(representativeCoverUrl 재사용)
//     → 승인된 도시 자산 → 브랜드 fallback. "임의 첫 장" 금지.

/** 여행이 없거나 비공개일 때의 브랜드 기본 메타 — 여행 정보가 없을 때만 쓴다. */
export const BRAND_OG = {
  title: "AI Korea Trip Planner — gokoreamate.com",
  description: "Plan, capture & share your Korea trip story.",
  image: "https://gokoreamate.com/opengraph-image.png",
} as const;

/**
 * 5도시 designed fallback — 이미 서비스가 쓰는 권리확인 자산만(같은 출처).
 * 새 인터넷 이미지 수집 금지 계약. busan 은 Hub/Home 히어로, 나머지는
 * Discovery 도시 비주얼(webp).
 */
export const CITY_SHARE_FALLBACK: Record<string, string> = {
  busan:    "/images/home/city-busan-hero.jpg",
  seoul:    "/images/cities/city-seoul-v1.webp",
  jeju:     "/images/cities/city-jeju-v1.webp",
  gyeongju: "/images/cities/city-gyeongju-v1.webp",
  jeonju:   "/images/cities/city-jeonju-v1.webp",
};

export function cityShareFallback(city: string): string | null {
  return CITY_SHARE_FALLBACK[(city ?? "").trim().toLowerCase()] ?? null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** 실제 Trip title 우선. 없을 때만 도시·일수 fallback — generic 으로 덮어쓰지 않는다. */
export function shareTitle(tripTitle: string | null | undefined, city: string, dayCount: number): string {
  const t = (tripTitle ?? "").trim();
  if (t !== "") return t;
  return `${dayCount}-Day ${cap((city ?? "").trim())} Trip`;
}

/** 실제 제목을 썼는가 — 카드가 도시명을 eyebrow 에 보충할지 정한다. */
export function isActualTitle(tripTitle: string | null | undefined): boolean {
  return (tripTitle ?? "").trim() !== "";
}

/**
 * OG description — 광고가 아니라 여행의 사실 요약.
 * `Busan · 2 days · 13 places · 2026-09-06 – 2026-09-08`
 */
export function shareDescription(o: {
  city: string; dayCount: number; placeCount: number;
  startDate?: string | null; endDate?: string | null;
}): string {
  const parts = [
    cap((o.city ?? "").trim()),
    `${o.dayCount} ${o.dayCount === 1 ? "day" : "days"}`,
    `${o.placeCount} ${o.placeCount === 1 ? "place" : "places"}`,
  ];
  const range = [o.startDate, o.endDate].filter((s): s is string => !!s && s.trim() !== "").join(" – ");
  if (range) parts.push(range);
  return parts.filter(Boolean).join(" · ");
}

/** 9:16 제목 폰트(390px 기준 px) — 긴 실제 제목은 generic 교체가 아니라 크기로 대응한다.
 *  CJK 글자는 라틴보다 ~2배 넓어 글자 수 그대로 재면 일본어/한국어 긴 제목이
 *  큰 폰트 티어에 잘못 들어가 잘린다(2026-09-09 실측) — 폭 가중치로 센다. */
export function cardTitleFontPx(title: string): { fontPx: number; maxLines: number } {
  let w = 0;
  for (const ch of title) {
    w += /[ᄀ-ᇿ⺀-鿿　-ヿ㄰-㆏가-힯豈-﫿＀-｠]/.test(ch) ? 1.9 : 1;
  }
  if (w > 56) return { fontPx: 28, maxLines: 5 };
  if (w > 32) return { fontPx: 36, maxLines: 4 };
  return { fontPx: 46, maxLines: 3 };
}

/** days JSON(배열 | __v:2) 에서 일수·장소 수를 센다 — Story summary 와 같은 셈법. */
export function countDaysPlaces(raw: unknown): { dayCount: number; placeCount: number } {
  let sched: unknown[] = [];
  if (Array.isArray(raw)) sched = raw;
  else if (raw && typeof raw === "object" && (raw as { __v?: unknown }).__v === 2) {
    const s = (raw as { scheduled?: unknown }).scheduled;
    if (Array.isArray(s)) sched = s;
  }
  let placeCount = 0;
  for (const d of sched) {
    const places = (d as { places?: unknown })?.places;
    if (Array.isArray(places)) placeCount += places.length;
  }
  return { dayCount: sched.length, placeCount };
}

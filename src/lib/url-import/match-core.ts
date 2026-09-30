// 가져온 장소 이름 → 서비스 장소(city_spots) 연결 (EXTERNAL-TRIP-IMPORT-V2)
//
// 원칙: 잘못된 기존 장소에 조용히 합치지 않는다.
//  · exact  — 원명·nameL10n(ko/en/ja/zh)과 정규화 후 정확히 같고, 그 도시 안에서 유일할 때만. 자동 연결.
//  · suggest — 결정적 표기 규칙(앞뒤에 붙은 지역·시설 수식어)만 다를 때. 유일할 때만 **제안**하고
//              사용자가 눌러야 연결한다. 기본은 연결하지 않는다(내 장소로 보존).
//  · 그 외 — 연결하지 않는다(내 장소로 보존).
// fuzzy/유사도 매칭은 쓰지 않는다.

export interface MatchableSpot {
  id: number | string;
  city: string;
  name: string;
  nameL10n?: Partial<Record<"ko" | "en" | "ja" | "zh", string>> | null;
}

export type MatchKind = "exact" | "suggest";
export interface MatchHit<S extends MatchableSpot> { spot: S; kind: MatchKind }

const KNOWN_CITIES = ["busan", "seoul", "jeju", "gyeongju", "jeonju"];
const CITY_PREFIX = ["경주", "서울", "부산", "제주", "전주", "busan", "seoul", "jeju", "gyeongju", "jeonju"];
/** 제안 규칙에 쓰는 이름은 너무 짧으면 안 된다(예: "공원" 같은 일반명사 오연결 방지) */
const MIN_SUGGEST_CHARS = 3;

export function normalizeMatchKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function buildPlaceMatcher<S extends MatchableSpot>(spots: readonly S[]) {
  const index = new Map<string, S[]>();
  const put = (key: string | undefined | null, s: S) => {
    const k = typeof key === "string" ? normalizeMatchKey(key) : "";
    if (k === "") return;
    const list = index.get(k) ?? [];
    if (!list.some(x => x.id === s.id)) { list.push(s); index.set(k, list); }
  };
  for (const s of spots) {
    put(s.name, s);
    if (s.nameL10n) for (const v of Object.values(s.nameL10n)) put(v ?? null, s);
  }
  const scope = (hits: readonly S[], city: string | null): S[] =>
    city && KNOWN_CITIES.includes(city) ? hits.filter(h => h.city.toLowerCase() === city) : [...hits];
  const unique = (hits: readonly S[]): S | null => {
    const ids = new Set(hits.map(h => String(h.id)));
    return ids.size === 1 ? hits[0]! : null;
  };
  const exactOf = (key: string, city: string | null): S | null => unique(scope(index.get(key) ?? [], city));

  return (name: string, city: string | null): MatchHit<S> | null => {
    const key = normalizeMatchKey(name);
    if (key.length < 2) return null;
    const direct = exactOf(key, city);
    if (direct) return { spot: direct, kind: "exact" };
    // 선행 도시명 제거 — 위키류 표기("경주 첨성대")와 정식명("첨성대")의 결정적 차이
    for (const p of CITY_PREFIX) {
      if (key.startsWith(p + " ")) {
        const hit = exactOf(key.slice(p.length + 1), city);
        if (hit) return { spot: hit, kind: "exact" };
      }
    }
    // 제안: 입력의 마지막 단어 묶음이 서비스 장소 이름과 같다("해운대블루라인파크 미포정거장" → "미포정거장"),
    //       또는 서비스 장소 이름의 마지막 단어 묶음이 입력과 같다("동백섬" → "해운대 동백섬").
    const cands: S[] = [];
    const words = key.split(" ");
    for (let i = 1; i < words.length; i++) {
      const tail = words.slice(i).join(" ");
      if (tail.length >= MIN_SUGGEST_CHARS) cands.push(...scope(index.get(tail) ?? [], city));
    }
    if (key.length >= MIN_SUGGEST_CHARS) {
      for (const [k, list] of index) {
        if (k.endsWith(" " + key)) cands.push(...scope(list, city));
      }
    }
    const sug = unique(cands);
    return sug ? { spot: sug, kind: "suggest" } : null;
  };
}

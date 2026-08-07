// 신규 candidate ↔ 기존 city_spots row 동일 장소 판정.
//
// 절대 규칙: **기존 manual 데이터가 우선이다.** 같은 장소로 보이면 신규를 넣지 않는다.
//
// 왜 이름 하나로 판단하면 안 되나
//   `Gwangalli Beach` 와 `Gwangalli Beach & Bridge` 는 이름이 다르지만 같은 장소다.
//   ON CONFLICT (city, name) 은 이걸 못 잡는다. DB 제약은 마지막 그물일 뿐이다.
//
// 왜 좌표 하나로 판단하면 안 되나
//   부산은 밀집도가 높다. 실제로 자갈치시장 48m 안에 전혀 다른 식당이 있다.
//   그리고 식당은 같은 상호의 다른 지점이 존재한다 — 이름이 같아도 멀면 다른 가게다.
//
// 그래서 이름과 거리를 **함께** 요구하고, 어느 한쪽만 맞으면 자동 확정하지 않는다.

import { haversineKm } from "../geo.ts";

export type MatchClass =
  | "MATCH_EXISTING_MANUAL_EXACT"
  | "MATCH_EXISTING_MANUAL_LIKELY"
  | "NEW_INSERT_SAFE"
  | "AMBIGUOUS_REVIEW"
  | "INVALID_SKIP";

export interface ExistingSpot {
  id:        number;
  name:      string;
  category:  string;
  district:  string | null;
  lat:       number | null;
  lng:       number | null;
  source_type: string | null;
  external_id: string | null;
}

export interface MatchCandidateInput {
  candidate_id: string;
  name_ko:  string;
  name_en:  string | null;
  district: string;
  address:  string;
  lat:      number;
  lng:      number;
}

export interface MatchResult {
  candidate_id: string;
  klass:        MatchClass;
  existing_id:  number | null;
  existing_name: string | null;
  distance_m:   number | null;
  reason:       string;
}

// ── 거리 임계값 ──────────────────────────────────────────────────────────────
// 어느 값도 단독으로 동일 판정을 하지 않는다. 이름 신호와 AND 로만 쓴다.
export const EXACT_MAX_M     = 150;   // 이름 동일 + 이 거리 안 → 같은 장소
export const LIKELY_MAX_M    = 400;   // 이름 변형 + 이 거리 안 → 같을 가능성 높음
export const SUSPICIOUS_M    = 40;    // 이름은 달라도 이만큼 가까우면 사람이 봐야 한다

// ── 구 이름 정규화 ───────────────────────────────────────────────────────────
// 기존 86건은 로마자(`Haeundae-gu`), enrichment 는 한글(`해운대구`) 이다.
// 둘을 같은 키로 접어야 district 신호를 쓸 수 있다.
export const DISTRICT_KO_TO_ROMAN: Record<string, string> = {
  "해운대구": "Haeundae-gu", "기장군": "Gijang-gun",  "수영구": "Suyeong-gu",
  "부산진구": "Busanjin-gu", "중구":   "Jung-gu",     "동구":   "Dong-gu",
  "금정구":   "Geumjeong-gu","영도구": "Yeongdo-gu",  "남구":   "Nam-gu",
  "강서구":   "Gangseo-gu",  "동래구": "Dongnae-gu",  "서구":   "Seo-gu",
  "사하구":   "Saha-gu",     "사상구": "Sasang-gu",   "북구":   "Buk-gu",
  "연제구":   "Yeonje-gu",
};

export function districtKey(v: string | null | undefined): string {
  if (!v) return "";
  const s = v.trim();
  const roman = DISTRICT_KO_TO_ROMAN[s] ?? s;
  return roman.toLowerCase().replace(/[\s-]+/g, "").replace(/(gu|gun)$/, "");
}

// ── 이름 정규화 ──────────────────────────────────────────────────────────────

const EN_STOPWORDS = new Set([
  "the", "and", "of", "at", "a", "an", "in", "on", "for", "to",
]);

/** 괄호 안 보조표기 제거 후 한글만 남긴다 */
export function normalizeKo(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/\([^)]*\)/g, " ").replace(/[^가-힣0-9]/g, "");
}

/** 소문자화 → 불용어 제거 → 토큰 집합 */
export function tokensEn(v: string | null | undefined): Set<string> {
  if (!v) return new Set();
  const cleaned = v.replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  return new Set(cleaned.split(/\s+/).filter(t => t.length > 1 && !EN_STOPWORDS.has(t)));
}

/** 두 토큰 집합의 겹침 비율 — 작은 쪽 기준(부분집합을 잡기 위함) */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.min(a.size, b.size);
}

/** 주소에서 동/로/길 토큰만 뽑는다 */
export function addressTokens(v: string | null | undefined): Set<string> {
  if (!v) return new Set();
  const out = new Set<string>();
  for (const m of v.matchAll(/([가-힣0-9]+(?:동|로|길|가))/g)) out.add(m[1]);
  return out;
}

export type NameSignal = "exact" | "variant" | "none";

/**
 * 이름 신호만 판정한다. 거리는 보지 않는다 — 호출자가 AND 로 결합한다.
 *   exact   : 한글명 완전 일치, 또는 영문 토큰 90% 이상 겹침
 *   variant : 영문 토큰 60% 이상 겹침, 또는 한글명 포함관계
 */
export function nameSignalBetween(
  aKo: string | null | undefined, aEn: string | null | undefined,
  bKo: string | null | undefined, bEn: string | null | undefined,
): NameSignal {
  const ak = normalizeKo(aKo);
  const bk = normalizeKo(bKo);
  if (ak && bk && ak === bk) return "exact";

  const ov = tokenOverlap(tokensEn(aEn), tokensEn(bEn));
  if (ov >= 0.9) return "exact";
  if (ov >= 0.6) return "variant";

  // `쌍둥이돼지국밥 본점` ⊃ `쌍둥이돼지국밥` 같은 본점/지점 표기 차이를 잡는다
  if (ak && bk && ak.length > 2 && bk.length > 2 && (ak.includes(bk) || bk.includes(ak))) {
    return "variant";
  }
  return "none";
}

export function nameSignal(cand: MatchCandidateInput, ex: ExistingSpot): NameSignal {
  // 기존 row 는 name 한 칸뿐이라 한글·영문 양쪽 자리에 같은 값을 넣고 비교한다
  return nameSignalBetween(cand.name_ko, cand.name_en, ex.name, ex.name);
}

/**
 * 한 candidate 를 기존 목록 전체와 대조해 하나의 등급으로 분류한다.
 *
 * 판정 순서가 곧 안전 순서다 — 애매하면 항상 **넣지 않는 쪽**으로 떨어뜨린다.
 */
export function classifyCandidate(
  cand: MatchCandidateInput,
  existing: readonly ExistingSpot[],
): MatchResult {
  // 0) 필수 필드 결손 → 넣지 않는다
  if (!cand.name_ko?.trim() || !Number.isFinite(cand.lat) || !Number.isFinite(cand.lng)) {
    return { candidate_id: cand.candidate_id, klass: "INVALID_SKIP", existing_id: null,
             existing_name: null, distance_m: null, reason: "필수 필드(name_ko/좌표) 결손" };
  }

  const cDist = districtKey(cand.district);
  const cAddr = addressTokens(cand.address);

  let best: { ex: ExistingSpot; d: number; sig: NameSignal } | null = null;
  let nearestAny: { ex: ExistingSpot; d: number } | null = null;

  for (const ex of existing) {
    if (ex.lat === null || ex.lng === null) continue;
    const d = haversineKm(cand.lat, cand.lng, ex.lat, ex.lng) * 1000;
    if (!nearestAny || d < nearestAny.d) nearestAny = { ex, d };

    const sig = nameSignal(cand, ex);
    if (sig === "none") continue;
    // 이름 신호가 있는 것 중 가장 가까운 것을 후보로 잡는다
    if (!best || d < best.d) best = { ex, d, sig };
  }

  if (best) {
    const sameDistrict = cDist !== "" && districtKey(best.ex.district) === cDist;
    const sameCategory = best.ex.category === "restaurant";
    const addrHit = [...cAddr].some(t => t.length > 1);

    // EXACT — 이름 동일 + 충분히 가까움 + 구 일치 + 카테고리 일치
    if (best.sig === "exact" && best.d <= EXACT_MAX_M && sameDistrict && sameCategory) {
      return { candidate_id: cand.candidate_id, klass: "MATCH_EXISTING_MANUAL_EXACT",
               existing_id: best.ex.id, existing_name: best.ex.name, distance_m: Math.round(best.d),
               reason: `이름 동일 · ${Math.round(best.d)}m · 구 일치 · category 일치${addrHit ? " · 주소토큰 보유" : ""}` };
    }

    // 이름은 같은데 카테고리가 다르면 자동 확정하지 않는다.
    // 기존 86건은 분류가 고르지 않다(음식거리가 restaurant 로 들어가 있는 등).
    if (best.sig === "exact" && best.d <= EXACT_MAX_M && sameDistrict && !sameCategory) {
      return { candidate_id: cand.candidate_id, klass: "AMBIGUOUS_REVIEW",
               existing_id: best.ex.id, existing_name: best.ex.name, distance_m: Math.round(best.d),
               reason: `이름·거리·구 일치하나 기존 category='${best.ex.category}' 불일치 — 자동 확정 금지` };
    }

    // LIKELY — 이름 변형 + 근접 + 구 일치
    if (best.d <= LIKELY_MAX_M && sameDistrict) {
      return { candidate_id: cand.candidate_id, klass: "MATCH_EXISTING_MANUAL_LIKELY",
               existing_id: best.ex.id, existing_name: best.ex.name, distance_m: Math.round(best.d),
               reason: `이름 ${best.sig === "exact" ? "동일" : "변형"} · ${Math.round(best.d)}m · 구 일치` };
    }

    // 이름은 겹치는데 멀다 → 같은 상호의 다른 지점일 수 있다. 자동 병합도, 자동 신규도 위험.
    if (best.d <= 2000) {
      return { candidate_id: cand.candidate_id, klass: "AMBIGUOUS_REVIEW",
               existing_id: best.ex.id, existing_name: best.ex.name, distance_m: Math.round(best.d),
               reason: `이름 신호 있으나 ${Math.round(best.d)}m 이격 — 동일 상호 다른 지점 가능성` };
    }
    // 2km 초과 + 이름만 겹침 → 명백히 다른 지점으로 본다 (아래 신규 판정으로 진행)
  }

  // 이름 신호가 전혀 없어도 극히 가까우면 사람이 본다
  if (nearestAny && nearestAny.d <= SUSPICIOUS_M && nearestAny.ex.category === "restaurant") {
    return { candidate_id: cand.candidate_id, klass: "AMBIGUOUS_REVIEW",
             existing_id: nearestAny.ex.id, existing_name: nearestAny.ex.name,
             distance_m: Math.round(nearestAny.d),
             reason: `이름은 다르나 ${Math.round(nearestAny.d)}m 로 매우 근접한 기존 restaurant 존재` };
  }

  return { candidate_id: cand.candidate_id, klass: "NEW_INSERT_SAFE",
           existing_id: null, existing_name: null,
           distance_m: nearestAny ? Math.round(nearestAny.d) : null,
           reason: nearestAny
             ? `기존 최근접 ${Math.round(nearestAny.d)}m, 이름 신호 없음`
             : "기존 비교 대상 없음" };
}

export function classifyAll(
  cands: readonly MatchCandidateInput[],
  existing: readonly ExistingSpot[],
): MatchResult[] {
  return cands.map(c => classifyCandidate(c, existing));
}

// ── 집합 내부 충돌 ───────────────────────────────────────────────────────────
//
// 기존 row 와의 대조만으로는 부족하다. P1 집합 **안에서** 서로 충돌하는 쌍이 실재한다.
//
// 두 종류가 확인됐다.
//   ① 같은 식당이 provider 두 곳(busan-F-* = 음식점 API, busan-VB-* = VisitBusan)에서
//      각각 candidate 로 살아남은 경우. 좌표가 소수점까지 동일하다.
//      release 단계의 duplicate adjudication(sibling 37건)은 이 교차 provider 쌍을 보지 않았다.
//   ② 같은 상호의 실제 다른 지점. 장소로는 별개가 맞지만 표시명이 같아
//      UNIQUE (city, name) 을 위반한다.
//
// 어느 쪽이든 자동으로 하나를 고를 근거가 없다. 둘 다 사람이 본다.

export const INTRA_SAME_PLACE_M = 50;

export interface IntraSetRow {
  candidate_id: string;
  display_name: string;
  name_ko: string;
  name_en: string | null;
  lat: number;
  lng: number;
}

export type IntraConflict = "DUPLICATE_SAME_PLACE" | "NAME_COLLISION_DIFFERENT_PLACE";

export interface IntraConflictInfo {
  conflict:   IntraConflict;
  with:       string[];
  distance_m: number;
}

/**
 * 집합 내부 충돌 검출.
 *
 * 두 가지만 충돌로 본다.
 *   ① 표시명이 같다 → 거리와 무관하게 UNIQUE (city, name) 위반이다. 반드시 잡는다.
 *   ② 이름 신호(동일·변형)가 있고 50m 안이다 → 같은 가게가 두 번 들어온 것이다.
 *      예: `쌍둥이돼지국밥 본점` 과 `쌍둥이돼지국밥` 이 같은 좌표에 있다.
 *
 * **좌표만 가까운 것은 충돌로 보지 않는다.** 한 건물에 MOZU·SUSHI IRUKA·MUG Dessert LAB
 * 이 함께 있는 사례가 실재한다. 좌표 단독으로 동일 장소를 판정하면 멀쩡한 가게를 지운다.
 * 그런 쌍은 coordinateClusters() 로 따로 보고만 한다.
 */
export function detectIntraSetConflicts(
  rows: readonly IntraSetRow[],
): Map<string, IntraConflictInfo> {
  const out = new Map<string, IntraConflictInfo>();
  const link = (a: IntraSetRow, b: IntraSetRow, conflict: IntraConflict, d: number) => {
    const prev = out.get(a.candidate_id);
    if (!prev) { out.set(a.candidate_id, { conflict, with: [b.candidate_id], distance_m: d }); return; }
    if (!prev.with.includes(b.candidate_id)) { prev.with.push(b.candidate_id); prev.with.sort(); }
    // 더 가까운 쪽 / 동일 장소 쪽을 우선 사유로 남긴다
    if (d < prev.distance_m) prev.distance_m = d;
    if (conflict === "DUPLICATE_SAME_PLACE") prev.conflict = conflict;
  };

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const d = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000);

      const sameDisplay =
        a.display_name.trim().toLowerCase() === b.display_name.trim().toLowerCase() &&
        a.display_name.trim() !== "";
      const sig = nameSignalBetween(a.name_ko, a.name_en, b.name_ko, b.name_en);
      const sameNearby = sig !== "none" && d <= INTRA_SAME_PLACE_M;

      if (!sameDisplay && !sameNearby) continue;
      const conflict: IntraConflict =
        (sameNearby || d <= INTRA_SAME_PLACE_M) ? "DUPLICATE_SAME_PLACE" : "NAME_COLLISION_DIFFERENT_PLACE";
      link(a, b, conflict, d);
      link(b, a, conflict, d);
    }
  }
  return out;
}

/**
 * 이름은 다르지만 좌표가 사실상 같은 묶음 — **분류에 쓰지 않고 보고만 한다.**
 * 대부분 한 건물·시장 안의 서로 다른 가게다.
 */
export function coordinateClusters(
  rows: readonly IntraSetRow[],
  conflicts: ReadonlyMap<string, IntraConflictInfo>,
): { candidate_id: string; with: string[]; distance_m: number }[] {
  const acc = new Map<string, { with: Set<string>; d: number }>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (conflicts.has(a.candidate_id) && conflicts.get(a.candidate_id)!.with.includes(b.candidate_id)) continue;
      const d = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000);
      if (d > INTRA_SAME_PLACE_M) continue;
      for (const [x, y] of [[a, b], [b, a]] as const) {
        const e = acc.get(x.candidate_id) ?? { with: new Set<string>(), d };
        e.with.add(y.candidate_id); e.d = Math.min(e.d, d);
        acc.set(x.candidate_id, e);
      }
    }
  }
  return [...acc.entries()]
    .map(([candidate_id, v]) => ({ candidate_id, with: [...v.with].sort(), distance_m: v.d }))
    .sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : 1));
}

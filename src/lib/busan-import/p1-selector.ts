// 부산 P1 restaurant 선별 — 순수 함수.
//
// P1 은 파이프라인이 붙인 status 가 아니다. TASK-...-DATA-LINEAGE-READONLY-AUDIT-V1
// 에서 release manifest + enriched candidate 를 조합해 정의한 **감사 등급**이다.
// 그래서 규칙을 여기에 코드로 고정한다 — 다음에 누가 재현하든 같은 집합이 나와야 한다.
//
// 입력은 두 개다.
//   busan-final-place-event-release-manifest.json  → release 1,533 (hold/exclude 는 이미 제외됨)
//   busan-enriched-candidates-v1.jsonl             → 필드 원본
//
// release manifest 에 없는 candidate 는 애초에 후보가 아니다. 즉 EXCLUDE_DUPLICATE_SIBLING(37),
// HOLD_STRUCTURAL_REVIEW(4), event hold(68) 는 여기까지 오지 않는다.

export interface ReleaseItem {
  candidate_id: string;
  category: string;
  release_class: string;
  title_ko?: string;
  title_en?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface EnrichedCandidate {
  candidate_id: string;
  category: string;
  title_ko?: string;
  proposed_values?: Record<string, unknown>;
  image_assessment?: Record<string, unknown>;
  source_summary?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  provenance?: unknown;
}

export type Grade = "P1" | "P2" | "P3" | "P4" | "EVENT";

/** 부산 좌표 유효 범위. 이 밖이면 identity 를 신뢰할 수 없다. */
export const BUSAN_BBOX = { latMin: 34.8, latMax: 35.5, lngMin: 128.7, lngMax: 129.4 } as const;

export function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

export function inBusan(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat > BUSAN_BBOX.latMin && lat < BUSAN_BBOX.latMax
      && lng > BUSAN_BBOX.lngMin && lng < BUSAN_BBOX.lngMax;
}

/**
 * 감사 등급 판정. 규칙은 lineage 감사와 **글자 그대로 동일**하다.
 *
 *   EVENT  category === "event"            (날짜 계약이 달라 장소와 합산하지 않는다)
 *   P4     좌표가 부산 밖이거나 없음         (identity 신뢰 불가)
 *   P1     RELEASE_READY_COMPLETE 이거나
 *          핵심(name_ko·address·district) + 보강(name_en·description_en·이미지) 전부 보유
 *   P2     핵심만 보유                       (스케줄러에는 충분, 표시 품질만 부족)
 *   P3     핵심도 미달
 */
export function gradeCandidate(item: ReleaseItem, enriched: EnrichedCandidate): Grade {
  if (item.category === "event") return "EVENT";

  const pv = (enriched.proposed_values ?? {}) as Record<string, unknown>;
  if (!inBusan(pv.lat, pv.lng)) return "P4";

  const core = isNonEmpty(pv.name_ko) && isNonEmpty(pv.address) && isNonEmpty(pv.district);
  const curated = Number((enriched.image_assessment as Record<string, unknown> | undefined)?.curated_count ?? 0);
  const rich = isNonEmpty(pv.name_en) && isNonEmpty(pv.description_en) && curated > 0;

  if (item.release_class === "RELEASE_READY_COMPLETE" || (core && rich)) return "P1";
  if (core) return "P2";
  return "P3";
}

export interface P1Restaurant {
  candidate_id: string;
  name_ko:      string;
  name_en:      string | null;
  description_ko: string | null;
  description_en: string | null;
  district:     string;
  address:      string;
  lat:          number;
  lng:          number;
  raw_hours:    string | null;
  image_status: string | null;
  image_rights: string | null;
  curated_count: number;
  confidence:   string | null;
  release_class: string;
  primary_source: string | null;
}

/**
 * release manifest × enriched → P1 restaurant 집합.
 * candidate_id 오름차순으로 정렬해 반환한다 — 순서까지 결정론적이어야 dry-run 비교가 성립한다.
 */
export function selectP1Restaurants(
  release: readonly ReleaseItem[],
  enriched: readonly EnrichedCandidate[],
): P1Restaurant[] {
  const byId = new Map<string, EnrichedCandidate>();
  for (const e of enriched) byId.set(e.candidate_id, e);

  const out: P1Restaurant[] = [];
  for (const item of release) {
    if (item.category !== "restaurant") continue;
    const e = byId.get(item.candidate_id);
    if (!e) continue;                                  // 원본 없음 — 선별 대상 아님
    if (gradeCandidate(item, e) !== "P1") continue;

    const pv = (e.proposed_values ?? {}) as Record<string, unknown>;
    const ia = (e.image_assessment ?? {}) as Record<string, unknown>;
    const ss = (e.source_summary ?? {}) as Record<string, unknown>;
    const va = (e.validation ?? {}) as Record<string, unknown>;

    out.push({
      candidate_id:   item.candidate_id,
      name_ko:        String(pv.name_ko ?? ""),
      name_en:        isNonEmpty(pv.name_en) ? String(pv.name_en) : null,
      description_ko: isNonEmpty(pv.description_ko) ? String(pv.description_ko) : null,
      description_en: isNonEmpty(pv.description_en) ? String(pv.description_en) : null,
      district:       String(pv.district ?? ""),
      address:        String(pv.address ?? ""),
      lat:            pv.lat as number,
      lng:            pv.lng as number,
      raw_hours:      isNonEmpty(pv.hours) ? String(pv.hours) : null,
      image_status:   isNonEmpty(ia.image_status) ? String(ia.image_status) : null,
      image_rights:   isNonEmpty(ia.rights_status) ? String(ia.rights_status) : null,
      curated_count:  Number(ia.curated_count ?? 0),
      confidence:     isNonEmpty(va.confidence) ? String(va.confidence) : null,
      release_class:  item.release_class,
      primary_source: isNonEmpty(ss.primary_source_type) ? String(ss.primary_source_type) : null,
    });
  }
  out.sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : a.candidate_id > b.candidate_id ? 1 : 0));
  return out;
}

/** candidate_id 중복 검출 — 있으면 dry-run 을 진행하지 않는다. */
export function findDuplicateIds(rows: readonly { candidate_id: string }[]): string[] {
  const seen = new Set<string>();
  const dup  = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.candidate_id)) dup.add(r.candidate_id);
    seen.add(r.candidate_id);
  }
  return [...dup].sort();
}

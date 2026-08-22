// 후속 locale supplement 계약 확인 (TASK-FIVE-CITY-CORE-MIGRATION-058-AND-WRITER-CORRECTION-V1 §6·§21)
//
// 향후 보조컴퓨터가 Owner 승인 공식 English supplement(예: 경주)를 주면:
//   canonical_id → 기존 entity(기존 numeric id) 를 찾아 **영어 필드만** UPDATE. 새 entity INSERT 0 · identity 재매칭 0 ·
//   ko/ja/zh 등 다른 locale 과 무관 필드 불변. l10n JSON 은 기존 값 위에 supplement locale 키만 merge 한다.
// 이것은 번역 플랫폼/크롤러가 아니다 — 현재 writer 계약(기존 id PATCH, 필드 단위 write)이 supplement 를 수용함을 보이는 최소 함수.

export interface LocaleSupplementRow { canonical_id: string; locale: "en" | "ja" | "zh"; title?: string | null; description?: string | null; }
export interface ExistingSpotForSupplement { id: number; name: string; name_l10n: Record<string, string> | null; description: string | null; desc_l10n: Record<string, string> | null; }

/** 기존 행 + supplement → PATCH payload(변경 필드만). 값이 없는 supplement 는 아무것도 쓰지 않는다(Main 이 채우지 않는다). */
export function planLocaleSupplementPatch(existing: ExistingSpotForSupplement, s: LocaleSupplementRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const title = (s.title ?? "").trim() || null;
  const desc = (s.description ?? "").trim() || null;
  if (title) {
    patch.name_l10n = { ...(existing.name_l10n ?? {}), [s.locale]: title };
    if (s.locale === "en") patch.name = title;            // Main `name` = 영문 대표명(계약 §4); en 이 생기면 한글 대체 표기를 교체
  }
  if (desc) {
    patch.desc_l10n = { ...(existing.desc_l10n ?? {}), [s.locale]: desc };
    if (s.locale === "en") patch.description = desc;      // Main `description` = 영문 요약
  }
  return patch;
}

/** supplement 행이 기존 canonical 에만 붙는지(INSERT 0) — canonical_id → 기존 id 매핑이 없으면 supplement 는 실패(새 entity 생성 금지) */
export function resolveSupplementTargets(rows: LocaleSupplementRow[], idByCanonical: ReadonlyMap<string, number>): { targets: Array<{ canonical_id: string; id: number }>; unresolved: string[] } {
  const targets: Array<{ canonical_id: string; id: number }> = []; const unresolved: string[] = [];
  for (const r of rows) { const id = idByCanonical.get(r.canonical_id); if (id === undefined) unresolved.push(r.canonical_id); else targets.push({ canonical_id: r.canonical_id, id }); }
  return { targets, unresolved };
}

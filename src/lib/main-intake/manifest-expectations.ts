// 기대값은 코드 상수가 아니라 현재 package 가 선언한 값에서 유도한다 (R1 §15~16)
//
//   "GoKoreaMate importer 는 항상 4,826" ❌   →   "이번 package 의 manifest/crosswalk summary 가 4,826 을 선언했으니 4,826 이어야 한다" ✅
//   다음 package(예: 대구 532) 도 같은 importer 가 같은 방식으로 읽는다.

export interface CrosswalkSummary {
  active_total: number;
  decisions_total: Record<string, number>;        // ACTIVE 결정: MATCH_REPLACE · NEW · CONFIRMED_TWIN · REVIEW_REQUIRED …
  per_city?: Record<string, Record<string, number>>; // EXCLUDED_IDENTITY_ONLY(비ACTIVE, identity 만 확정) 는 여기서 센다
  main_714_classification?: Record<string, number>;
}
export interface InputManifest {
  active_total: number;
  outputs: Record<string, { path: string; sha256: string; rows?: number }>;
  main_snapshot: { path: string; sha256: string; rows: number };
}

export interface ExpectedCounts {
  active_total: number;
  match_replace: number;
  new: number;
  confirmed_twin: number;
  review_required: number;
  excluded: number;
  main_rows: number;
  /** hide 대상 legacy 분류(EXCLUDED_FROM_SERVICE_REVIEW + DUPLICATE_REVIEW) — package 의 main classification 에서 유도 */
  hide_legacy: number;
}

export function deriveExpectedCounts(manifest: InputManifest, summary: CrosswalkSummary): ExpectedCounts {
  if (manifest.active_total !== summary.active_total) {
    throw new Error(`manifest.active_total ${manifest.active_total} != crosswalk summary active_total ${summary.active_total}`);
  }
  const d = summary.decisions_total;
  const n = (k: string) => d[k] ?? 0;
  const exp: ExpectedCounts = {
    active_total: summary.active_total,
    match_replace: n("MATCH_REPLACE"), new: n("NEW"), confirmed_twin: n("CONFIRMED_TWIN"), review_required: n("REVIEW_REQUIRED"),
    // 비ACTIVE skip = EXCLUDED(identity 만 확정) + RETIRED_FROM_SERVICE(old GJ08 Food 94, REINTEGRATION-PREP-V1: physical row 유지·PUBLISH hide)
    excluded: Object.values(summary.per_city ?? {}).reduce((a, c) => a + (c.EXCLUDED_IDENTITY_ONLY ?? 0) + (c.RETIRED_FROM_SERVICE ?? 0), 0),
    main_rows: manifest.main_snapshot.rows,
    hide_legacy: (summary.main_714_classification?.EXCLUDED_FROM_SERVICE_REVIEW ?? 0) + (summary.main_714_classification?.DUPLICATE_REVIEW ?? 0) + (summary.main_714_classification?.GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE ?? 0),
  };
  const sum = exp.match_replace + exp.new + exp.confirmed_twin + exp.review_required;
  if (sum !== exp.active_total) throw new Error(`crosswalk summary decisions ${sum} != active_total ${exp.active_total}`);
  return exp;
}

/** 계획(plan.counts)이 package 선언값과 일치하는지 — 불일치 목록을 돌려준다(빈 배열 = OK) */
export function assertPlanMatchesExpected(counts: { active_input: number; match_replace: number; new: number; confirmed_twin_skipped: number; review_required_skipped: number; excluded_skipped: number }, exp: ExpectedCounts): string[] {
  const diffs: string[] = [];
  const check = (label: string, got: number, want: number) => { if (got !== want) diffs.push(`${label}: plan ${got} != manifest ${want}`); };
  check("active", counts.active_input, exp.active_total);
  check("match_replace", counts.match_replace, exp.match_replace);
  check("new", counts.new, exp.new);
  check("confirmed_twin", counts.confirmed_twin_skipped, exp.confirmed_twin);
  check("review_required", counts.review_required_skipped, exp.review_required);
  check("excluded", counts.excluded_skipped, exp.excluded);
  return diffs;
}

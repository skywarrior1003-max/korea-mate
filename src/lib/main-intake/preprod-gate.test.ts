/**
 * TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 → 재정렬: TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1
 * Gate A(쌍둥이: artifact 근거만) · Gate B(노출 값) · Gate C(semantic category) · importer
 * Run: node --experimental-strip-types --test src/lib/main-intake/preprod-gate.test.ts
 *
 * 실제 intake package 를 읽는다. DB 접근 0 · Production write 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mapCategory, isSemanticRecoverable, semanticOf, SEMANTIC_CATEGORIES } from "./category-adapter.ts";
import { decideField, isWritePolicy } from "./null-policy.ts";
import { planImport, changeManifestRows, HIDE_CLASSES, type CrosswalkRow, type ImageRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow, type SourceRow } from "./importer-core.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "five-city-core-twin-resolution-v1.jsonl", ROOT));

interface TwinRow { city: string; member_canonical_id: string; representative_canonical_id: string | null; relation: string; decision_basis: string; reason: string; evidence: { shared_uc_seq: string[] }; deterministic_rule: string; runtime_write: boolean; }

// 확정 수치 (ARTIFACT TRUST 이후)
// FINAL-ARTIFACT-ALIGNMENT: 전주 identity_review 35 는 보류가 아니라 NEW → REVIEW_REQUIRED 0
const SOURCE_ACTIVE = 4826, ARTIFACT_TWIN = 170, REVIEW_REQUIRED = 0, ACTIVE_DISTINCT = 4656, MATCH = 462, NEW = 4194, WRITEABLE = 4656;

test("A1: twin resolution artifact — artifact 근거(부산 uc_seq)만 170, 전부 SAME_SOURCE_ENTITY, 휴리스틱 규칙 0", { skip: !pkgReady }, () => {
  const rows = readJsonl<TwinRow>("five-city-core-twin-resolution-v1.jsonl");
  assert.equal(rows.length, ARTIFACT_TWIN);
  assert.ok(rows.every(r => r.city === "busan" && r.relation === "SAME_SOURCE_ENTITY" && r.decision_basis === "ARTIFACT_SOURCE_LINEAGE"));
  assert.ok(rows.every(r => r.evidence.shared_uc_seq.length > 0 && r.representative_canonical_id && r.runtime_write === false));
  assert.ok(rows.every(r => !/name|address|coord|order|first/i.test(r.deterministic_rule)));
  // 옛 휴리스틱 판정(아미동 기사형 A-00109, 신세계 VB-548, 서울·제주·전주)은 없다
  for (const id of ["busan-A-00109", "busan-VB-548", "seoul-KOPokonim", "seoul-food-v1-0909", "KTO-147684", "KTO-129786"]) {
    assert.ok(!rows.some(r => r.member_canonical_id === id), `${id} must not be a heuristic twin`);
  }
});

test("A2: crosswalk 산술 — ACTIVE = MATCH + NEW + CONFIRMED_TWIN(artifact) + REVIEW_REQUIRED · decision_basis 에 휴리스틱 0", { skip: !pkgReady }, () => {
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl").filter(c => c.service_status === "ACTIVE");
  const n = (d: string) => xw.filter(c => c.decision === d).length;
  assert.equal(xw.length, SOURCE_ACTIVE);
  assert.equal(n("MATCH_REPLACE"), MATCH); assert.equal(n("NEW"), NEW);
  assert.equal(n("CONFIRMED_TWIN"), ARTIFACT_TWIN); assert.equal(n("REVIEW_REQUIRED"), REVIEW_REQUIRED);
  assert.equal(n("AMBIGUOUS") + n("TRUE_AMBIGUOUS"), 0);
  assert.equal(MATCH + NEW + ARTIFACT_TWIN + REVIEW_REQUIRED, SOURCE_ACTIVE);
  assert.equal(ACTIVE_DISTINCT, SOURCE_ACTIVE - ARTIFACT_TWIN);
  assert.equal(WRITEABLE, MATCH + NEW);
  assert.ok(xw.every(c => c.decision_basis && !/HEURISTIC/.test(c.decision_basis)));
  assert.ok(xw.filter(c => c.decision === "CONFIRMED_TWIN").every(c => c.decision_basis === "ARTIFACT_SOURCE_LINEAGE" && c.twin_of));
  const writable = new Set(xw.filter(c => c.decision === "MATCH_REPLACE" || c.decision === "NEW").map(c => c.canonical_id));
  for (const c of xw.filter(c => c.decision === "CONFIRMED_TWIN")) assert.ok(writable.has(c.twin_of!), `${c.canonical_id} 의 대표 ${c.twin_of} 가 write 대상이 아님`);
  // 옛 휴리스틱 쌍은 둘 다 그대로 레코드로 남는다
  for (const id of ["KTO-129786", "OFF-9756", "seoul-food-v1-0909", "seoul-food-v1-0816", "busan-A-00109", "busan-VB-548"]) assert.equal(xw.find(c => c.canonical_id === id)?.decision, "NEW", id);
});

test("C1: semantic category — shopping/culture/heritage/activity 가 (category, subcategory) 에서 복원되고 LOSSY=0", { skip: !pkgReady }, () => {
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  let lossy = 0;
  for (const r of intake) {
    assert.ok(r.semantic_category, r.canonical_id);
    if (!isSemanticRecoverable(r.category, r.subcategory, r.semantic_category!)) lossy += 1;
    assert.equal(semanticOf(r), r.semantic_category);
  }
  assert.equal(lossy, 0);
  const shopping = intake.filter(r => r.semantic_category === "shopping");
  assert.equal(shopping.length, 33);
  assert.ok(shopping.every(r => r.category === "attraction" && r.subcategory === "shopping"));
  assert.equal(intake.filter(r => r.semantic_category === "culture").length, 72);
  assert.equal(intake.filter(r => r.semantic_category === "heritage").length, 25);
  const deferred = readJsonl<{ canonical_id: string; field: string; value: string }>("five-city-core-deferred-fields-v1.jsonl").filter(d => d.field === "subcategory_raw");
  assert.ok(deferred.length >= 30 + 72 + 25 + 3);
  const contract = JSON.parse(readFileSync(new URL(PKG + "five-city-category-mapping-v1.json", ROOT), "utf8")) as { lossy_mapping_count: number; mappings: Array<{ lossy: boolean; mapping_type: string; semantic_category: string }> };
  assert.equal(contract.lossy_mapping_count, 0);
  assert.ok(contract.mappings.every(m => !m.lossy && (SEMANTIC_CATEGORIES as readonly string[]).includes(m.semantic_category)));
});

test("C2: TS 어댑터 — DIRECT/NORMALIZED 와 semantic 왕복", () => {
  assert.deepEqual(mapCategory("shopping", "쇼핑>백화점"), { category: "attraction", subcategory: "shopping", kind: "NORMALIZE_MAP", semantic: "shopping", subcategoryRawDeferred: "쇼핑>백화점" });
  assert.deepEqual(mapCategory("food"), { category: "restaurant", subcategory: null, kind: "NORMALIZE_MAP", semantic: "restaurant", subcategoryRawDeferred: null });
  assert.equal(mapCategory("SPECIALTY_INTEREST", "쇼핑").semantic, "shopping");
  assert.equal(mapCategory("PLACE_HERITAGE", "향토유산").subcategory, "heritage");
  for (const src of ["shopping", "PLACE_CULTURAL", "PLACE_HERITAGE", "ACTIVITY_EXPERIENCE", "food", "attraction"]) {
    const m = mapCategory(src, "raw");
    assert.ok(isSemanticRecoverable(m.category, m.subcategory, m.semantic), src);
  }
});

test("B1: is_published 는 VISIBILITY 소유 — 게이트 값으로 쓰인다", () => {
  const d = decideField("is_published", true, undefined);
  assert.equal(d.policy, "VISIBILITY_GATE"); assert.equal(d.value, true); assert.ok(isWritePolicy(d.policy));
  assert.deepEqual([...HIDE_CLASSES], ["EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW", "GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE"]);   // + old GJ08 Food retire (REINTEGRATION-PREP-V1); v1 package has 0 retired rows → 233 unchanged
});

test("I1: fixture — artifact twin SKIP · REVIEW_REQUIRED SKIP · publish true · 승인 legacy hide · LEGACY_ONLY_VALID/Owner override 유지 · DELETE 없음", () => {
  const base = { service_status: "ACTIVE", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, address: null, district: null, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null };
  const main: MainSnapshotRow[] = [
    { main_city_spot_id: 1, city: "busan", category: "attraction", canonical_title: "Haeundae Beach" },
    { main_city_spot_id: 2, city: "busan", category: "restaurant", canonical_title: "Historical Food", legacy_external_id: "busan-F-0001" },
    { main_city_spot_id: 3, city: "busan", category: "attraction", canonical_title: "Igidae Coastal Walk" },
    { main_city_spot_id: 4, city: "busan", category: "attraction", canonical_title: "Nampo dup" },
    { main_city_spot_id: 5, city: "busan", category: "attraction", canonical_title: "Oryukdo Skywalk" },
  ];
  const cls: MainClassificationRow[] = [
    { main_city_spot_id: 1, city: "busan", class: "ACTIVE_MATCHED" }, { main_city_spot_id: 2, city: "busan", class: "EXCLUDED_FROM_SERVICE_REVIEW" },
    { main_city_spot_id: 3, city: "busan", class: "LEGACY_ONLY_VALID" }, { main_city_spot_id: 4, city: "busan", class: "DUPLICATE_REVIEW" },
    { main_city_spot_id: 5, city: "busan", class: "OWNER_OVERRIDE_KEEP_PUBLISHED" },
  ];
  const intake: IntakeRow[] = [
    { ...base, canonical_id: "busan-A-1", city: "busan", category: "attraction", subcategory: null, name: "Haeundae Beach", lat: 35.1, lng: 129.1, semantic_category: "attraction" },
    { ...base, canonical_id: "busan-A-2", city: "busan", category: "attraction", subcategory: "shopping", name: "Shinsegae", lat: 35.2, lng: 129.2, semantic_category: "shopping" },
    { ...base, canonical_id: "busan-VB-1", city: "busan", category: "attraction", subcategory: null, name: "Haeundae Beach", lat: 35.1, lng: 129.1, semantic_category: "attraction" },
    { ...base, canonical_id: "OFF-1", city: "jeonju", category: "attraction", subcategory: null, name: "Review me", lat: 35.3, lng: 127.3, semantic_category: "attraction" },
    { ...base, canonical_id: "busan-A-4", city: "busan", category: "attraction", subcategory: null, name: "Children Museum", lat: 35.4, lng: 129.4, semantic_category: "attraction" },
  ];
  const crosswalk: CrosswalkRow[] = [
    { city: "busan", canonical_id: "busan-A-1", service_status: "ACTIVE", main_city_spot_id: 1, decision: "MATCH_REPLACE", decision_basis: "ARTIFACT_SOURCE_LINEAGE", tier: "TIER1" },
    { city: "busan", canonical_id: "busan-A-2", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" },
    { city: "busan", canonical_id: "busan-VB-1", service_status: "ACTIVE", main_city_spot_id: null, decision: "CONFIRMED_TWIN", decision_basis: "ARTIFACT_SOURCE_LINEAGE", tier: "SAME_SOURCE_ENTITY", twin_of: "busan-A-1" },
    { city: "jeonju", canonical_id: "OFF-1", service_status: "ACTIVE", main_city_spot_id: null, decision: "REVIEW_REQUIRED", decision_basis: "ARTIFACT_IDENTITY_RESOLUTION", tier: "ARTIFACT_IDENTITY_REVIEW" },
    { city: "busan", canonical_id: "busan-A-4", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" },
  ];
  const plan = planImport({ intake, sources: [] as SourceRow[], images: [] as ImageRow[], crosswalk, main, mainClassification: cls, expectedActiveTotal: 5 });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.counts.match_replace, 1); assert.equal(plan.counts.new, 2);
  assert.equal(plan.counts.confirmed_twin_skipped, 1); assert.equal(plan.counts.review_required_skipped, 1);
  assert.equal(plan.counts.active_distinct, 4); assert.equal(plan.counts.writeable_active, 3);
  assert.equal(plan.counts.heuristic_twin_auto_merge, 0); assert.equal(plan.counts.evidenceless_skip, 0); assert.equal(plan.counts.delete, 0);
  assert.equal(plan.updates[0]!.writes.is_published, true);
  assert.ok(plan.inserts.every(i => i.row.is_published === true));
  assert.deepEqual(plan.visibility_updates.map(v => [v.main_city_spot_id, v.writes.is_published]), [[2, false], [4, false]]);
  assert.deepEqual(plan.no_write.map(n => n.main_city_spot_id), [3, 5]);
  assert.equal(plan.visibility.preserved_visible_legacy, 1); assert.equal(plan.visibility.owner_override_published, 1);
  assert.deepEqual(plan.per_city.busan, { before: 5, updates: 1, inserts: 2, projected_after: 7, visible_after: 5, hidden_after: 2 });
  assert.ok(changeManifestRows(plan).every(r => r.action !== "DELETE"));
});

test("I2: 실제 package — dry-run 계획이 ARTIFACT TRUST 수치와 일치하고 결정적이다", { skip: !pkgReady }, () => {
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const sources = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl");
  const images = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const crosswalk = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const mainClassification = readJsonl<MainClassificationRow>("five-city-core-main-classification-v1.jsonl");
  const run = () => planImport({ intake, sources, images, crosswalk, main, mainClassification, expectedActiveTotal: SOURCE_ACTIVE });
  const plan = run();
  assert.deepEqual(plan.errors, []);
  assert.deepEqual({ m: plan.counts.match_replace, n: plan.counts.new, t: plan.counts.confirmed_twin_skipped, r: plan.counts.review_required_skipped, d: plan.counts.active_distinct, w: plan.counts.writeable_active },
    { m: MATCH, n: NEW, t: ARTIFACT_TWIN, r: REVIEW_REQUIRED, d: ACTIVE_DISTINCT, w: WRITEABLE });
  assert.equal(plan.counts.existing_id_preserved, MATCH); assert.equal(plan.counts.delete, 0); assert.equal(plan.counts.lossy_category, 0);
  assert.equal(plan.counts.heuristic_twin_auto_merge, 0); assert.equal(plan.counts.evidenceless_skip, 0);
  assert.ok(plan.updates.every(u => u.writes.is_published === true));
  assert.ok(plan.inserts.every(i => i.row.is_published === true));
  assert.equal(plan.visibility.hide_legacy, 233);              // EXCLUDED 230 + DUPLICATE_REVIEW 3
  assert.equal(plan.visibility.preserved_visible_legacy, 15);  // LEGACY_ONLY_VALID — 노출 유지(일괄 hide 없음)
  assert.equal(plan.visibility.owner_override_published, 4);   // #7 #28 #29 #42
  assert.equal(plan.visibility.untouched_other, 0);
  assert.equal(plan.visibility_updates.filter(v => v.city === "gyeongju").length, 3);
  const total = Object.values(plan.per_city).reduce((a, c) => a + c.projected_after, 0);
  const visible = Object.values(plan.per_city).reduce((a, c) => a + c.visible_after, 0);
  const hidden = Object.values(plan.per_city).reduce((a, c) => a + c.hidden_after, 0);
  assert.equal(total, 714 + NEW);                 // 4,908
  assert.equal(visible, MATCH + NEW + 15 + 4);    // 4,675
  assert.equal(hidden, 233);
  assert.equal(visible + hidden, total);
  const h = (p: ReturnType<typeof planImport>) => createHash("sha256").update(changeManifestRows(p).map(r => JSON.stringify(r)).join("\n")).digest("hex");
  assert.equal(h(plan), h(run()));
  const summary = JSON.parse(readFileSync(new URL(PKG + "dry-run/five-city-core-dry-run-summary-v1.json", ROOT), "utf8")) as { counts: typeof plan.counts; db_write_executed: boolean; change_manifest_sha256: string; artifact_trust: Record<string, unknown> };
  assert.equal(summary.db_write_executed, false);
  assert.equal(summary.counts.active_distinct, ACTIVE_DISTINCT);
  assert.equal(summary.artifact_trust.HEURISTIC_TWIN_AUTO_MERGE_COUNT, 0);
  const changeText = changeManifestRows(plan).map(r => JSON.stringify(r)).join("\n") + "\n";
  assert.equal(createHash("sha256").update(changeText).digest("hex"), summary.change_manifest_sha256);
});

test("I3: importer 스크립트 — 기본 dry-run · write 모드는 다중 가드(STAGE_REFUSED) 뒤 · DELETE 없음 · 사용자 테이블 없음", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  assert.match(src, /APPLY_REFUSED/); assert.match(src, /STAGE_REFUSED/);
  assert.ok(!/createClient|supabase-js|\.delete\(|method:\s*"DELETE"/.test(src), "DB client/DELETE 없음");
  assert.ok(!/itineraries|trip_moments|user_spots|place_reports/.test(src), "사용자 테이블 접근 없음");
  assert.match(src, /FIVE_CITY_CORE_APPLY !== "YES"/);
});

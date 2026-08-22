/**
 * TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 — Gate A(쌍둥이) · Gate B(노출 값) · Gate C(semantic category) · importer
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

interface TwinRow { city: string; member_canonical_id: string; representative_canonical_id: string | null; relation: string; reason: string; evidence: { distance_m: number; address_same: boolean }; confidence: string; deterministic_rule: string; runtime_write: boolean; }

// 확정 수치 (Gate A)
const SOURCE_ACTIVE = 4826, CONFIRMED_TWIN = 195, TRUE_AMBIGUOUS = 1, UNIQUE = 4631, MATCH = 461, NEW = 4169;

test("A1: twin resolution artifact — 197 구성원 = SAME 195 + TRUE_AMBIGUOUS 1 + DISTINCT 1쌍(2행), 규칙 명시", { skip: !pkgReady }, () => {
  const rows = readJsonl<TwinRow>("five-city-core-twin-resolution-v1.jsonl");
  const by = (rel: string) => rows.filter(r => r.relation === rel);
  assert.equal(by("SAME_ENTITY_TWIN").length, CONFIRMED_TWIN);
  assert.equal(by("TRUE_AMBIGUOUS").length, TRUE_AMBIGUOUS);
  assert.equal(by("DISTINCT_ENTITY").length, 2);
  assert.equal(rows.length, 198);
  // 도시별
  const city = (c: string, rel: string) => rows.filter(r => r.city === c && r.relation === rel).length;
  assert.equal(city("busan", "SAME_ENTITY_TWIN"), 169);
  assert.equal(city("seoul", "SAME_ENTITY_TWIN"), 16); assert.equal(city("seoul", "TRUE_AMBIGUOUS"), 1);
  assert.equal(city("jeju", "SAME_ENTITY_TWIN"), 1);
  assert.equal(city("jeonju", "SAME_ENTITY_TWIN"), 9); assert.equal(city("jeonju", "DISTINCT_ENTITY"), 2);
  assert.equal(city("gyeongju", "SAME_ENTITY_TWIN"), 0);
  // 모든 행에 근거·규칙이 있고, 배열/파일 순서 규칙은 없다
  for (const r of rows) {
    assert.ok(r.reason && r.deterministic_rule && !/order|index|first/i.test(r.deterministic_rule), r.member_canonical_id);
    assert.ok(typeof r.evidence.distance_m === "number");
    if (r.relation === "SAME_ENTITY_TWIN") {
      assert.ok(r.representative_canonical_id && r.runtime_write === false);
      assert.ok(r.evidence.address_same || r.evidence.distance_m <= 30 || r.deterministic_rule === "explicit_same_entity_table", `${r.member_canonical_id}: 자동 SAME 은 주소 동일 또는 ≤30m 만`);
    }
    if (r.relation === "DISTINCT_ENTITY") assert.ok(r.runtime_write === true && r.representative_canonical_id === null);
    if (r.relation === "TRUE_AMBIGUOUS") assert.ok(r.runtime_write === false && r.confidence === "LOW");
  }
  // 확정된 개별 판정
  assert.equal(rows.find(r => r.member_canonical_id === "seoul-food-v1-0909")?.relation, "TRUE_AMBIGUOUS");
  assert.equal(rows.find(r => r.member_canonical_id === "OFF-9756")?.relation, "DISTINCT_ENTITY");
  assert.equal(rows.find(r => r.member_canonical_id === "KTO-147684")?.relation, "SAME_ENTITY_TWIN");
  // 대표 선택 규칙: 아미동 비석마을 4건 → entity 레코드(A) + 깨끗한 이름(A-00029)이 대표, 기사형(A-00109)·page(VB)는 구성원
  const ami = rows.filter(r => ["busan-A-00109", "busan-VB-288", "busan-VB-876"].includes(r.member_canonical_id));
  assert.equal(ami.length, 3);
  assert.ok(ami.every(r => r.representative_canonical_id === "busan-A-00029"));
  // 괄호·슬로건이 있는 KOPokonim 이 아니라 깨끗한 이름 쪽이 대표
  assert.equal(rows.find(r => r.member_canonical_id === "seoul-KOPokonim")?.representative_canonical_id, "seoul-KOPtpyykt");
});

test("A2: crosswalk 산술 — ACTIVE = MATCH + NEW + CONFIRMED_TWIN + TRUE_AMBIGUOUS · UNIQUE = ACTIVE − CONFIRMED_TWIN", { skip: !pkgReady }, () => {
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl").filter(c => c.service_status === "ACTIVE");
  const n = (d: string) => xw.filter(c => c.decision === d).length;
  assert.equal(xw.length, SOURCE_ACTIVE);
  assert.equal(n("MATCH_REPLACE"), MATCH); assert.equal(n("NEW"), NEW);
  assert.equal(n("CONFIRMED_TWIN"), CONFIRMED_TWIN); assert.equal(n("TRUE_AMBIGUOUS"), TRUE_AMBIGUOUS);
  assert.equal(n("AMBIGUOUS"), 0, "옛 AMBIGUOUS decision 은 더 이상 없다");
  assert.equal(MATCH + NEW + CONFIRMED_TWIN + TRUE_AMBIGUOUS, SOURCE_ACTIVE);
  assert.equal(UNIQUE, MATCH + NEW + TRUE_AMBIGUOUS);
  assert.equal(SOURCE_ACTIVE, UNIQUE + CONFIRMED_TWIN);
  // 쌍둥이 대표는 반드시 write 되는 decision 이다
  const writable = new Set(xw.filter(c => c.decision === "MATCH_REPLACE" || c.decision === "NEW").map(c => c.canonical_id));
  for (const c of xw.filter(c => c.decision === "CONFIRMED_TWIN" || c.decision === "TRUE_AMBIGUOUS")) assert.ok(c.twin_of && writable.has(c.twin_of), `${c.canonical_id} 의 대표 ${c.twin_of} 가 write 대상이 아님`);
  // DISTINCT 로 풀린 두 행은 NEW
  assert.equal(xw.find(c => c.canonical_id === "KTO-129786")?.decision, "NEW");
  assert.equal(xw.find(c => c.canonical_id === "OFF-9756")?.decision, "NEW");
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
  assert.equal(shopping.length, 33);   // seoul 30 + jeonju SPECIALTY_INTEREST·쇼핑 3
  assert.ok(shopping.every(r => r.category === "attraction" && r.subcategory === "shopping"));
  assert.equal(intake.filter(r => r.semantic_category === "culture").length, 72);
  assert.equal(intake.filter(r => r.semantic_category === "heritage").length, 25);
  // 원본 세부 분류는 deferred 로 살아 있다 (서울 쇼핑 30 = '쇼핑>백화점' 등)
  const deferred = readJsonl<{ canonical_id: string; field: string; value: string }>("five-city-core-deferred-fields-v1.jsonl").filter(d => d.field === "subcategory_raw");
  assert.ok(deferred.length >= 30 + 72 + 25 + 3);
  assert.ok(shopping.filter(r => r.city === "seoul").every(r => deferred.some(d => d.canonical_id === r.canonical_id)));
  // 계약 artifact
  const contract = JSON.parse(readFileSync(new URL(PKG + "five-city-category-mapping-v1.json", ROOT), "utf8")) as { lossy_mapping_count: number; mappings: Array<{ lossy: boolean; mapping_type: string; semantic_category: string }>; contract: { semantic_vocabulary: string[] } };
  assert.equal(contract.lossy_mapping_count, 0);
  assert.ok(contract.mappings.every(m => !m.lossy && ["DIRECT", "NORMALIZED", "DEFERRED"].includes(m.mapping_type)));
  assert.ok(contract.mappings.every(m => (SEMANTIC_CATEGORIES as readonly string[]).includes(m.semantic_category)));
});

test("C2: TS 어댑터 — DIRECT/NORMALIZED 와 semantic 왕복", () => {
  assert.deepEqual(mapCategory("shopping", "쇼핑>백화점"), { category: "attraction", subcategory: "shopping", kind: "NORMALIZE_MAP", semantic: "shopping", subcategoryRawDeferred: "쇼핑>백화점" });
  assert.deepEqual(mapCategory("food"), { category: "restaurant", subcategory: null, kind: "NORMALIZE_MAP", semantic: "restaurant", subcategoryRawDeferred: null });
  assert.deepEqual(mapCategory("nature", "해변"), { category: "nature", subcategory: "해변", kind: "DIRECT_MAP", semantic: "nature", subcategoryRawDeferred: null });
  assert.equal(mapCategory("SPECIALTY_INTEREST", "쇼핑").semantic, "shopping");
  assert.equal(mapCategory("SPECIALTY_INTEREST", "공예").semantic, "specialty");
  assert.equal(mapCategory("PLACE_HERITAGE", "향토유산").subcategory, "heritage");
  for (const src of ["shopping", "PLACE_CULTURAL", "PLACE_HERITAGE", "ACTIVITY_EXPERIENCE", "food", "attraction"]) {
    const m = mapCategory(src, "raw");
    assert.ok(isSemanticRecoverable(m.category, m.subcategory, m.semantic), src);
    assert.equal(semanticOf({ category: m.category, subcategory: m.subcategory }), m.semantic, src);
  }
  assert.equal(mapCategory("theme_park").kind, "UNSUPPORTED_DEFER");
});

test("B1: is_published 는 VISIBILITY 소유 — null policy 가 아니라 게이트 값으로 쓰인다", () => {
  const d = decideField("is_published", true, undefined);
  assert.equal(d.policy, "VISIBILITY_GATE"); assert.equal(d.value, true); assert.ok(isWritePolicy(d.policy));
  assert.equal(decideField("is_published", false, true).value, false);
  assert.deepEqual([...HIDE_CLASSES], ["EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW"]);
});

test("I1: fixture — twin SKIP · true ambiguous SKIP · distinct INSERT · publish true · 승인 legacy hide · LEGACY_ONLY_VALID 유지 · DELETE 없음", () => {
  const base = { service_status: "ACTIVE", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, address: null, district: null, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null };
  const main: MainSnapshotRow[] = [
    { main_city_spot_id: 1, city: "busan", category: "attraction", canonical_title: "Haeundae Beach" },
    { main_city_spot_id: 2, city: "busan", category: "restaurant", canonical_title: "Historical Food", legacy_external_id: "busan-F-0001" },
    { main_city_spot_id: 3, city: "busan", category: "attraction", canonical_title: "Igidae Coastal Walk" },
    { main_city_spot_id: 4, city: "busan", category: "attraction", canonical_title: "Nampo dup" },
  ];
  const cls: MainClassificationRow[] = [
    { main_city_spot_id: 1, city: "busan", class: "ACTIVE_MATCHED" }, { main_city_spot_id: 2, city: "busan", class: "EXCLUDED_FROM_SERVICE_REVIEW" },
    { main_city_spot_id: 3, city: "busan", class: "LEGACY_ONLY_VALID" }, { main_city_spot_id: 4, city: "busan", class: "DUPLICATE_REVIEW" },
  ];
  const intake: IntakeRow[] = [
    { ...base, canonical_id: "busan-A-1", city: "busan", category: "attraction", subcategory: null, name: "Haeundae Beach", lat: 35.1, lng: 129.1, semantic_category: "attraction" },
    { ...base, canonical_id: "busan-A-2", city: "busan", category: "attraction", subcategory: "shopping", name: "Shinsegae", lat: 35.2, lng: 129.2, semantic_category: "shopping" },
    { ...base, canonical_id: "busan-VB-1", city: "busan", category: "attraction", subcategory: null, name: "Haeundae Beach", lat: 35.1, lng: 129.1, semantic_category: "attraction" },
    { ...base, canonical_id: "busan-A-3", city: "busan", category: "restaurant", subcategory: null, name: "Same Name Other Addr", lat: 35.3, lng: 129.3, semantic_category: "restaurant" },
    { ...base, canonical_id: "busan-A-4", city: "busan", category: "attraction", subcategory: null, name: "Children Museum", lat: 35.4, lng: 129.4, semantic_category: "attraction" },
  ];
  const crosswalk: CrosswalkRow[] = [
    { city: "busan", canonical_id: "busan-A-1", service_status: "ACTIVE", main_city_spot_id: 1, decision: "MATCH_REPLACE", tier: "TIER2" },
    { city: "busan", canonical_id: "busan-A-2", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", tier: "NEW" },
    { city: "busan", canonical_id: "busan-VB-1", service_status: "ACTIVE", main_city_spot_id: null, decision: "CONFIRMED_TWIN", tier: "SAME_ENTITY_TWIN", twin_of: "busan-A-1" },
    { city: "busan", canonical_id: "busan-A-3", service_status: "ACTIVE", main_city_spot_id: null, decision: "TRUE_AMBIGUOUS", tier: "TWIN_UNRESOLVED", twin_of: "busan-A-2" },
    { city: "busan", canonical_id: "busan-A-4", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", tier: "NEW" },
  ];
  const plan = planImport({ intake, sources: [] as SourceRow[], images: [] as ImageRow[], crosswalk, main, mainClassification: cls, expectedActiveTotal: 5 });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.counts.match_replace, 1); assert.equal(plan.counts.new, 2);
  assert.equal(plan.counts.confirmed_twin_skipped, 1); assert.equal(plan.counts.true_ambiguous_skipped, 1);
  assert.equal(plan.counts.unique_service_places, 4); assert.equal(plan.counts.lossy_category, 0); assert.equal(plan.counts.delete, 0);
  assert.equal(plan.updates[0]!.writes.is_published, true);
  assert.ok(plan.inserts.every(i => i.row.is_published === true));
  assert.deepEqual(plan.visibility_updates.map(v => [v.main_city_spot_id, v.writes.is_published]), [[2, false], [4, false]]);
  assert.deepEqual(plan.no_write.map(n => n.main_city_spot_id), [3]);
  assert.equal(plan.visibility.preserved_visible_legacy, 1);
  assert.deepEqual(plan.per_city.busan, { before: 4, updates: 1, inserts: 2, projected_after: 6, visible_after: 4, hidden_after: 2 });
  const rows = changeManifestRows(plan);
  assert.ok(rows.every(r => r.action !== "DELETE"));
  assert.equal(rows.filter(r => r.action === "VISIBILITY_UPDATE").length, 2);
  // lossy 는 오류로 센다
  const bad = planImport({ intake: [{ ...intake[1]!, subcategory: "백화점" }], sources: [], images: [], crosswalk: [crosswalk[1]!], main: [], mainClassification: [], expectedActiveTotal: 1 });
  assert.equal(bad.counts.lossy_category, 1); assert.equal(bad.errors.length, 1);
});

test("I2: 실제 package — dry-run 계획이 Gate A/B/C 수치와 일치하고 결정적이다", { skip: !pkgReady }, () => {
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const sources = readJsonl<SourceRow>("five-city-core-sources-v1.jsonl");
  const images = readJsonl<ImageRow>("five-city-core-images-v1.jsonl");
  const crosswalk = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const mainClassification = readJsonl<MainClassificationRow>("five-city-core-main-classification-v1.jsonl");
  const run = () => planImport({ intake, sources, images, crosswalk, main, mainClassification, expectedActiveTotal: SOURCE_ACTIVE });
  const plan = run();
  assert.deepEqual(plan.errors, []);
  assert.deepEqual({ m: plan.counts.match_replace, n: plan.counts.new, t: plan.counts.confirmed_twin_skipped, a: plan.counts.true_ambiguous_skipped, u: plan.counts.unique_service_places },
    { m: MATCH, n: NEW, t: CONFIRMED_TWIN, a: TRUE_AMBIGUOUS, u: UNIQUE });
  assert.equal(plan.counts.existing_id_preserved, 461); assert.equal(plan.counts.delete, 0); assert.equal(plan.counts.lossy_category, 0);
  // Gate B 값
  assert.ok(plan.updates.every(u => u.writes.is_published === true));
  assert.ok(plan.inserts.every(i => i.row.is_published === true));
  assert.equal(plan.visibility.hide_legacy, 234);              // EXCLUDED 231 + DUPLICATE_REVIEW 3
  assert.equal(plan.visibility.preserved_visible_legacy, 19);  // LEGACY_ONLY_VALID — 노출 유지(오너 결정)
  assert.equal(plan.visibility.untouched_other, 0);
  assert.equal(plan.visibility_updates.filter(v => v.city === "gyeongju").length, 3);
  assert.ok(plan.visibility_updates.every(v => !plan.updates.some(u => u.main_city_spot_id === v.main_city_spot_id)), "숨기는 행과 UPDATE 행은 겹치지 않는다");
  // projected
  const total = Object.values(plan.per_city).reduce((a, c) => a + c.projected_after, 0);
  const visible = Object.values(plan.per_city).reduce((a, c) => a + c.visible_after, 0);
  const hidden = Object.values(plan.per_city).reduce((a, c) => a + c.hidden_after, 0);
  assert.equal(total, 714 + NEW);             // 4,883
  assert.equal(visible, MATCH + NEW + 19);    // 4,649
  assert.equal(hidden, 234);
  assert.equal(visible + hidden, total);
  // 결정적
  const h = (p: ReturnType<typeof planImport>) => createHash("sha256").update(changeManifestRows(p).map(r => JSON.stringify(r)).join("\n")).digest("hex");
  assert.equal(h(plan), h(run()));
  // dry-run 산출과 일치
  const summary = JSON.parse(readFileSync(new URL(PKG + "dry-run/five-city-core-dry-run-summary-v1.json", ROOT), "utf8")) as { counts: typeof plan.counts; db_write_executed: boolean; change_manifest_sha256: string; gate_a: Record<string, number> };
  assert.equal(summary.db_write_executed, false);
  assert.equal(summary.counts.unique_service_places, UNIQUE);
  assert.equal(summary.gate_a.UNIQUE_SERVICE_PLACE_COUNT, UNIQUE);
  const changeText = changeManifestRows(plan).map(r => JSON.stringify(r)).join("\n") + "\n";
  assert.equal(createHash("sha256").update(changeText).digest("hex"), summary.change_manifest_sha256);
});

test("I3: importer 스크립트 — apply 는 여전히 비활성이고 DB 쓰기 코드가 없다", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  assert.match(src, /APPLY_DISABLED_IN_V1/);
  assert.match(src, /APPLY_REFUSED/);
  // createHash(...).update(buf) 는 해시이지 DB 가 아니다 — DB client/테이블 접근 문장만 본다
  assert.ok(!/createClient|supabase-js|\.from\(|\.upsert\(|\.insert\(|\.delete\(|rest\/v1/.test(src), "v1 importer 에는 DB client 가 없다");
});

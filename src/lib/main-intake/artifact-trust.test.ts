/**
 * TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 — identity trust 계약
 * Run: node --experimental-strip-types --test src/lib/main-intake/artifact-trust.test.ts
 *
 * FINAL VALIDATED ARTIFACT > MAIN HEURISTIC. 이 테스트는 Main 이 identity 를 만들지 않음을 기계적으로 잠근다.
 * DB 접근 0 · Production write 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { planImport, type CrosswalkRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow } from "./importer-core.ts";
import { SUPPORTED_DB_CATEGORIES } from "../near-me/types.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "jeonju-relation-identity-metadata-v1.jsonl", ROOT));

const base = { service_status: "ACTIVE", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, district: null, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null, subcategory: null, semantic_category: "restaurant", category: "restaurant" };

test("T1: identity trust — 관계 없는 같은 주소/전화/좌표는 auto merge 금지(둘 다 INSERT), 근거 없는 twin skip 은 오류, 휴리스틱 basis 는 거부", () => {
  const intake: IntakeRow[] = [
    { ...base, canonical_id: "x-1", city: "seoul", name: "Eid", address: "우사단로10길 15", lat: 37.53237, lng: 126.99918 },
    { ...base, canonical_id: "x-2", city: "seoul", name: "Eid", address: "우사단로10길 15", lat: 37.53237, lng: 126.99918 },
    { ...base, canonical_id: "x-3", city: "seoul", name: "Other", address: "a", lat: 37.5, lng: 127.0 },
  ];
  const xw = (decision: CrosswalkRow["decision"], basis: string | undefined, twin_of?: string): CrosswalkRow =>
    ({ city: "seoul", canonical_id: "x-2", service_status: "ACTIVE", main_city_spot_id: null, decision, decision_basis: basis, tier: "t", twin_of });
  const first: CrosswalkRow = { city: "seoul", canonical_id: "x-1", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" };
  const third: CrosswalkRow = { city: "seoul", canonical_id: "x-3", service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" };
  // 관계 필드 없음 → 둘 다 NEW, 병합 0, (city,name) 충돌은 blocker 로 보고되지 오류가 아니다
  const both = planImport({ intake, sources: [], images: [], crosswalk: [first, xw("NEW", "ARTIFACT_SERVICE_STATUS"), third], main: [], expectedActiveTotal: 3 });
  assert.deepEqual(both.errors, []); assert.equal(both.counts.new, 3); assert.equal(both.counts.confirmed_twin_skipped, 0);
  assert.deepEqual(both.constraint_blockers.city_name_collisions, [{ city: "seoul", name: "Eid", members: ["x-1", "x-2"] }]);
  assert.ok(both.inserts.every(i => ["Eid", "Other"].includes(String(i.row.name))), "표시명 변형 없음");
  // 근거 없는 CONFIRMED_TWIN → 오류 + evidenceless_skip
  const noBasis = planImport({ intake, sources: [], images: [], crosswalk: [first, xw("CONFIRMED_TWIN", undefined, "x-1"), third], main: [], expectedActiveTotal: 3 });
  assert.equal(noBasis.counts.evidenceless_skip, 1); assert.equal(noBasis.errors.length, 1); assert.equal(noBasis.counts.confirmed_twin_skipped, 0);
  // 휴리스틱 basis → 거부
  for (const b of ["NAME_HEURISTIC", "ADDRESS_HEURISTIC", "COORDINATE_HEURISTIC"]) {
    const p = planImport({ intake, sources: [], images: [], crosswalk: [first, xw("CONFIRMED_TWIN", b, "x-1"), third], main: [], expectedActiveTotal: 3 });
    assert.ok(p.errors.some(e => e.includes("forbidden heuristic")), b);
  }
  // artifact 근거 → skip 허용
  const ok = planImport({ intake, sources: [], images: [], crosswalk: [first, xw("CONFIRMED_TWIN", "ARTIFACT_SOURCE_LINEAGE", "x-1"), third], main: [], expectedActiveTotal: 3 });
  assert.deepEqual(ok.errors, []); assert.equal(ok.counts.confirmed_twin_skipped, 1); assert.equal(ok.counts.new, 2);
  // REVIEW_REQUIRED → 보류(skip), 삭제·병합 아님
  const rev = planImport({ intake, sources: [], images: [], crosswalk: [first, xw("REVIEW_REQUIRED", "ARTIFACT_IDENTITY_RESOLUTION"), third], main: [], expectedActiveTotal: 3 });
  assert.equal(rev.counts.review_required_skipped, 1); assert.equal(rev.counts.delete, 0); assert.equal(rev.counts.new, 2);
});

test("T2: 실제 crosswalk — 부산 uc_seq 근거 170 · 휴리스틱 해제 29 · G-00004→#287 · G-00144→#160 · 옛 TIER2(이름/주소) 폐기", { skip: !pkgReady }, () => {
  const xw = readJsonl<CrosswalkRow & { match_method: string; evidence: string }>("five-city-core-crosswalk-v1.jsonl");
  const by = new Map(xw.map(c => [c.canonical_id, c]));
  assert.equal(by.get("busan-G-00004")?.main_city_spot_id, 287);
  assert.equal(by.get("busan-G-00004")?.decision_basis, "ARTIFACT_SOURCE_LINEAGE");
  assert.match(by.get("busan-G-00004")!.evidence, /busan-F-00220/);
  assert.equal(by.get("busan-G-00144")?.main_city_spot_id, 160);
  assert.match(by.get("busan-G-00144")!.evidence, /busan-F-00076/);
  // 옛 TIER2 (address_tail+romanized_name) 는 더 이상 없다 → 슌사이쿠보 G-00164 는 NEW, #407 은 legacy 그대로
  assert.equal(by.get("busan-G-00164")?.decision, "NEW");
  assert.ok(xw.every(c => !/romanized|address_tail|ko_name\+coord/.test(c.match_method)));
  assert.ok(xw.every(c => c.decision !== "CONFIRMED_TWIN" || c.city === "busan"));
  // 부산 Food MATCH 는 전부 artifact lineage 근거 (97 TIER1 + 2)
  const food = xw.filter(c => c.canonical_id.startsWith("busan-G-") && c.decision === "MATCH_REPLACE");
  assert.equal(food.length, 99); assert.ok(food.every(c => c.decision_basis === "ARTIFACT_SOURCE_LINEAGE"));
  // 해제 기록
  const released = readJsonl<{ canonical_id: string; city: string; new_decision: string; previous_relation: string }>("five-city-core-heuristic-twin-release-v1.jsonl");
  assert.equal(released.length, 29);
  assert.deepEqual(Object.fromEntries(["busan", "seoul", "jeju", "jeonju"].map(c => [c, released.filter(r => r.city === c).length])), { busan: 2, seoul: 17, jeju: 1, jeonju: 9 });
  assert.ok(released.every(r => r.new_decision === "NEW"));
  for (const id of ["busan-VB-548", "busan-A-00109", "seoul-KOPokonim", "seoul-food-v1-0909", "jeju-CNTS_300000000014268", "KTO-147684"]) assert.ok(released.some(r => r.canonical_id === id), id);
  // Main 714 분류
  const cls = readJsonl<MainClassificationRow & { previous_class?: string }>("five-city-core-main-classification-v1.jsonl");
  const cnt = (k: string) => cls.filter(c => c.class === k).length;
  assert.equal(cnt("ACTIVE_MATCHED"), 462); assert.equal(cnt("EXCLUDED_FROM_SERVICE_REVIEW"), 230);
  assert.equal(cnt("LEGACY_ONLY_VALID"), 15); assert.equal(cnt("OWNER_OVERRIDE_KEEP_PUBLISHED"), 4); assert.equal(cnt("DUPLICATE_REVIEW"), 3);
  assert.equal(cls.find(c => c.main_city_spot_id === 287)?.class, "ACTIVE_MATCHED");
  assert.equal(cls.find(c => c.main_city_spot_id === 160)?.class, "ACTIVE_MATCHED");
  assert.equal(cls.find(c => c.main_city_spot_id === 208)?.class, "EXCLUDED_FROM_SERVICE_REVIEW", "톤쇼우 광안리 legacy 는 별도 지점으로 보존");
});

test("T3: 전주 field semantics — identity_review=True + ACTIVE_SERVICE 는 NEW(보류 0) · kto_cid 는 identity 가 아니다 · 관계 metadata 보존 · 드림랜드/동물원 4건 보존", { skip: !pkgReady }, () => {
  const xw = readJsonl<CrosswalkRow & { evidence: string; notes: string }>("five-city-core-crosswalk-v1.jsonl");
  assert.equal(xw.filter(c => c.decision === "REVIEW_REQUIRED").length, 0, "Main review hold 는 0");
  interface MetaRow { canonical_id: string; status: string; secondary_qa_request: boolean; main_decision: string; artifact_identity_review: boolean; artifact_phase1_bucket: string; artifact_final_status: string; proximity_kto_is_identity_assertion: boolean; proximity_kto_title: string | null; name: string; main_note: string | null; }
  const meta = readJsonl<MetaRow>("jeonju-relation-identity-metadata-v1.jsonl");
  assert.equal(meta.length, 35);
  assert.equal(meta.filter(m => m.artifact_identity_review === true).length, 33);
  assert.ok(meta.every(m => m.status === "RELATION_METADATA_REFERENCE_ONLY" && m.secondary_qa_request === false && m.main_decision === "NEW"));
  assert.ok(meta.every(m => m.artifact_phase1_bucket === "SERVICE_ENTITY" && m.artifact_final_status === "ACTIVE_SERVICE"));
  assert.ok(meta.every(m => m.proximity_kto_is_identity_assertion === false));
  // kto_cid 는 근접 후보: 제목이 다른 장소가 다수(≥26/34) — identity equality 로 쓰면 안 된다
  const differs = meta.filter(m => m.canonical_id.startsWith("OFF-") && String(m.name).replace(/\s/g, "") !== String(m.proximity_kto_title ?? "").replace(/\s/g, ""));
  assert.ok(differs.length >= 26, `proximity titles differ: ${differs.length}`);
  // 35건 전부 crosswalk NEW(basis ARTIFACT_SERVICE_STATUS), merge/skip/rename 0
  const by = new Map(xw.map(c => [c.canonical_id, c]));
  for (const m of meta) {
    const c = by.get(m.canonical_id)!;
    assert.equal(c.decision, "NEW", m.canonical_id); assert.equal(c.decision_basis, "ARTIFACT_SERVICE_STATUS"); assert.ok(!c.twin_of);
  }
  // 드림랜드(OFF-16676·KTO-2790515)·동물원(OFF-9784·KTO-126626) 4 레코드 전부 NEW — 같은 phone/좌표만으로 합치지 않는다
  for (const id of ["OFF-16676", "KTO-2790515", "OFF-9784", "KTO-126626"]) assert.equal(by.get(id)?.decision, "NEW", id);
  assert.ok(meta.some(m => m.canonical_id === "OFF-16676" && /동물원/.test(String(m.main_note))));
  // 관계 metadata 는 deferred content_meta.relation 으로도 보존된다
  const deferred = readJsonl<{ canonical_id: string; field: string; intended_future_destination: string }>("five-city-core-deferred-fields-v1.jsonl").filter(d => d.field === "relation");
  assert.equal(deferred.length, 35);
  assert.ok(deferred.every(d => d.intended_future_destination === "content_meta.relation"));
  // 실제 계획: 35건 INSERT, SKIP_REVIEW_REQUIRED 0
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const plan = planImport({ intake, sources: [], images: [], crosswalk: xw, main, mainClassification: [], expectedActiveTotal: 4826 });
  const ids = new Set(meta.map(m => m.canonical_id));
  assert.equal(plan.inserts.filter(i => ids.has(i.canonical_id)).length, 35);
  assert.equal(plan.skips.filter(s => s.reason.startsWith("SKIP_REVIEW_REQUIRED")).length, 0);
  // 옛 handoff 파일(보조컴퓨터 QA 요청 성격)은 더 이상 없다
  assert.ok(!existsSync(new URL(PKG + "jeonju-identity-review-handoff-v1.jsonl", ROOT)));
});

test("T4: Owner override 부산 legacy(#7 #28 #29 #42) — id 보존 · hide 안 함 · 좌표 있음 · 플래너 후보 category", { skip: !pkgReady }, () => {
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const cls = readJsonl<MainClassificationRow>("five-city-core-main-classification-v1.jsonl");
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const plan = planImport({ intake, sources: [], images: [], crosswalk: xw, main, mainClassification: cls, expectedActiveTotal: 4826 });
  for (const id of [7, 28, 29, 42]) {
    const m = main.find(r => r.main_city_spot_id === id)!;
    assert.equal(cls.find(c => c.main_city_spot_id === id)?.class, "OWNER_OVERRIDE_KEEP_PUBLISHED");
    assert.ok(typeof m.lat === "number" && typeof m.lng === "number", `#${id} 좌표`);
    assert.ok(SUPPORTED_DB_CATEGORIES.includes(m.category), `#${id} category ${m.category} 는 플래너 후보 category`);
    assert.ok(!plan.visibility_updates.some(v => v.main_city_spot_id === id), `#${id} 는 숨기지 않는다`);
    assert.ok(plan.no_write.some(n => n.main_city_spot_id === id));
    assert.ok(!plan.updates.some(u => u.main_city_spot_id === id));
  }
  assert.equal(plan.visibility.owner_override_published, 4);
  // LEGACY_ONLY_VALID 일괄 hide 없음
  assert.equal(plan.visibility.preserved_visible_legacy, 15);
});

test("T5: (city,name) 충돌은 표시명을 바꾸지 않고 blocker 로만 보고 — 알려진 6건 포함", { skip: !pkgReady }, () => {
  const summary = JSON.parse(readFileSync(new URL(PKG + "dry-run/five-city-core-dry-run-summary-v1.json", ROOT), "utf8")) as { constraint_blockers: { city_name_collision_count: number; city_name_collisions: Array<{ city: string; name: string; members: string[] }>; display_name_artificial_rename_count: number } };
  assert.equal(summary.constraint_blockers.display_name_artificial_rename_count, 0);
  const names = new Set(summary.constraint_blockers.city_name_collisions.map(c => `${c.city}|${c.name}`));
  for (const k of ["busan|Tonshou", "jeonju|진미반점", "seoul|Play with K", "seoul|Korea House", "seoul|Eid", "jeonju|전주드림랜드"]) assert.ok(names.has(k), k);
  assert.equal(summary.constraint_blockers.city_name_collision_count, 13);
  // INSERT 이름은 intake 의 공식 표시명 그대로 (suffix/괄호 창작 없음)
  const intake = new Map(readJsonl<IntakeRow>("five-city-core-active-v1.jsonl").map(r => [r.canonical_id, r.name]));
  const manifest = readJsonl<{ action: string; canonical_id?: string; name?: string }>("dry-run/five-city-core-change-manifest-v1.jsonl");
  for (const r of manifest.filter(m => m.action === "INSERT")) assert.equal(r.name, intake.get(r.canonical_id!), r.canonical_id);
});

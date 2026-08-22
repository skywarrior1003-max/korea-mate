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
const pkgReady = existsSync(new URL(PKG + "jeonju-identity-review-handoff-v1.jsonl", ROOT));

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
  assert.ok(released.every(r => r.new_decision === "NEW" || r.new_decision === "REVIEW_REQUIRED"));
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

test("T3: 전주 REVIEW_REQUIRED — artifact identity_review 33 + Main 보류 2 = 35, 병합 0, write 0, handoff artifact 완비", { skip: !pkgReady }, () => {
  const xw = readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl");
  const rev = xw.filter(c => c.decision === "REVIEW_REQUIRED");
  assert.equal(rev.length, 35);
  assert.equal(rev.filter(c => c.decision_basis === "ARTIFACT_IDENTITY_RESOLUTION").length, 33);
  assert.equal(rev.filter(c => c.decision_basis === "UNRESOLVED_AFTER_ARTIFACT_INSPECTION").length, 2);
  assert.ok(rev.every(c => c.city === "jeonju"));
  const handoff = readJsonl<Record<string, unknown>>("jeonju-identity-review-handoff-v1.jsonl");
  assert.equal(handoff.length, 35);
  assert.equal(handoff.filter(h => h.main_added_unresolved === false).length, 33);
  for (const id of ["OFF-10076", "OFF-9751", "OFF-9738", "OFF-16676", "KTO-2790515"]) assert.ok(handoff.some(h => h.canonical_id === id), id);
  for (const h of handoff) for (const k of ["canonical_id", "source", "source_id", "artifact_identity_review", "artifact_match_type", "current_service_status", "name", "category", "subcategory", "address", "lat", "lng", "unresolved_reason", "required_final_verdict_enum", "note"]) assert.ok(k in h, `${h.canonical_id} missing ${k}`);
  assert.ok(handoff.every(h => String(h.note).includes("재수집 아님")));
  // 보류 레코드는 INSERT/UPDATE 에 없다 — 실제 계획으로 확인
  const intake = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const main = readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl");
  const plan = planImport({ intake, sources: [], images: [], crosswalk: xw, main, mainClassification: [], expectedActiveTotal: 4826 });
  const held = new Set(rev.map(c => c.canonical_id));
  assert.ok(plan.inserts.every(i => !held.has(i.canonical_id)) && plan.updates.every(u => !held.has(u.canonical_id)));
  assert.equal(plan.skips.filter(s => s.reason.startsWith("SKIP_REVIEW_REQUIRED")).length, 35);
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
  for (const k of ["busan|Tonshou", "jeonju|진미반점", "seoul|Play with K", "seoul|Korea House", "seoul|Eid"]) assert.ok(names.has(k), k);
  assert.ok(!names.has("jeonju|전주드림랜드"), "드림랜드 2건은 REVIEW_REQUIRED 로 보류되어 write 에 없다");
  // INSERT 이름은 intake 의 공식 표시명 그대로 (suffix/괄호 창작 없음)
  const intake = new Map(readJsonl<IntakeRow>("five-city-core-active-v1.jsonl").map(r => [r.canonical_id, r.name]));
  const manifest = readJsonl<{ action: string; canonical_id?: string; name?: string }>("dry-run/five-city-core-change-manifest-v1.jsonl");
  for (const r of manifest.filter(m => m.action === "INSERT")) assert.equal(r.name, intake.get(r.canonical_id!), r.canonical_id);
});

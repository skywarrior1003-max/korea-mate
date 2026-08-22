/**
 * TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1 — importer/STAGE/PUBLISH 의 규모 독립성 + NEW identity
 * Run: node --experimental-strip-types --test src/lib/main-intake/scale-readiness.test.ts
 *
 * synthetic 10k/20k/50k 는 계획·chunk·SQL 생성 계층만 검증한다(실제 DB write 0 · 실제 페이지 빌드 0).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { planImport, type CrosswalkRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow, type ImportPlan } from "./importer-core.ts";
import { deriveExpectedCounts, assertPlanMatchesExpected } from "./manifest-expectations.ts";
import { buildStagePlan, remainingInsertChunks, validateStageReceipt, STAGE_INSERT_CHUNK, STAGE_UPDATE_CHUNK } from "./stage-plan.ts";
import { buildPublishCutoverSql } from "./publish-sql.ts";
import { CANONICAL_SOURCE_TYPE, canonicalExternalId, parseCanonicalExternalId } from "./identity.ts";
import { stageInsertChunkSafe, stageUpdateRow, type FetchLike } from "./stage-rest-writer.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "five-city-core-crosswalk-summary-v1.json", ROOT));
const base = { service_status: "ACTIVE", name_l10n: null, description: null, desc_l10n: null, why_it_matters: null, why_l10n: null, district: null, official_url: null, map_url: null, naver_map_url: null, opening_hours: null, tags: null, image_url: null, subcategory: null, semantic_category: "attraction", category: "attraction", address: null };

/** 임의 규모의 synthetic package: n NEW + m MATCH (Main 행 m) */
function synthetic(nNew: number, mMatch: number) {
  const intake: IntakeRow[] = []; const crosswalk: CrosswalkRow[] = []; const main: MainSnapshotRow[] = []; const cls: MainClassificationRow[] = [];
  for (let i = 0; i < mMatch; i++) {
    main.push({ main_city_spot_id: i + 1, city: "busan", category: "attraction", canonical_title: `Old ${i}` });
    cls.push({ main_city_spot_id: i + 1, city: "busan", class: "ACTIVE_MATCHED" });
    intake.push({ ...base, canonical_id: `busan-M-${i}`, city: "busan", name: `Match ${i}`, lat: 35, lng: 129 });
    crosswalk.push({ city: "busan", canonical_id: `busan-M-${i}`, service_status: "ACTIVE", main_city_spot_id: i + 1, decision: "MATCH_REPLACE", decision_basis: "ARTIFACT_SOURCE_LINEAGE", tier: "TIER1" });
  }
  for (let i = 0; i < nNew; i++) {
    const city = ["seoul", "jeju", "jeonju", "gyeonggi", "gangwon"][i % 5]!;
    intake.push({ ...base, canonical_id: `${city}-N-${i}`, city, name: `New ${i}`, lat: 37, lng: 127 });
    crosswalk.push({ city, canonical_id: `${city}-N-${i}`, service_status: "ACTIVE", main_city_spot_id: null, decision: "NEW", decision_basis: "ARTIFACT_SERVICE_STATUS", tier: "NEW" });
  }
  return { intake, crosswalk, main, cls };
}

test("S1: NEW identity — source_type=canonical · external_id=<city>:<canonical_id> · package 버전 비결합 · 집합 내 유일", () => {
  assert.equal(CANONICAL_SOURCE_TYPE, "canonical");
  assert.equal(canonicalExternalId("jeonju", "OFF-9751"), "jeonju:OFF-9751");
  assert.equal(canonicalExternalId("Busan", "busan-A-00029"), "busan:busan-A-00029");
  assert.deepEqual(parseCanonicalExternalId("jeonju:KTO-126626"), { city: "jeonju", canonicalId: "KTO-126626" });
  assert.throws(() => canonicalExternalId("a:b", "x"));
  assert.ok(!/five-city|v1/.test(CANONICAL_SOURCE_TYPE), "package run 이름을 identity 로 쓰지 않는다");
  const { intake, crosswalk, main, cls } = synthetic(3, 1);
  const plan = planImport({ intake, sources: [], images: [], crosswalk, main, mainClassification: cls, expectedActiveTotal: 4 });
  assert.deepEqual(plan.errors, []);
  assert.ok(plan.inserts.every(i => i.row.source_type === "canonical" && String(i.row.external_id).startsWith(`${i.city}:`)));
  assert.ok(plan.updates.every(u => !("source_type" in u.writes) && !("external_id" in u.writes)), "MATCH_REPLACE 는 reference 필드를 쓰지 않는다");
  // 같은 canonical 이 두 번 들어오면 identity 중복 오류
  const dup = planImport({ intake: [...intake, { ...intake[1]!, canonical_id: intake[1]!.canonical_id }], sources: [], images: [], crosswalk: [...crosswalk, crosswalk[1]!], main, mainClassification: cls, expectedActiveTotal: 5 });
  assert.ok(dup.errors.some(e => e.includes("duplicate identity")));
});

test("S2: 실제 package — 기대값은 manifest/summary 에서 유도되고 계획과 일치 · 하드코딩 상수 없음", { skip: !pkgReady }, () => {
  const manifest = JSON.parse(readFileSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT), "utf8"));
  const summary = JSON.parse(readFileSync(new URL(PKG + "five-city-core-crosswalk-summary-v1.json", ROOT), "utf8"));
  const exp = deriveExpectedCounts(manifest, summary);
  assert.equal(exp.active_total, 4826); assert.equal(exp.match_replace, 462); assert.equal(exp.new, 4194); assert.equal(exp.confirmed_twin, 170); assert.equal(exp.review_required, 0); assert.equal(exp.hide_legacy, 233);
  const plan = planImport({ intake: readJsonl("five-city-core-active-v1.jsonl"), sources: readJsonl("five-city-core-sources-v1.jsonl"), images: readJsonl("five-city-core-images-v1.jsonl"), crosswalk: readJsonl("five-city-core-crosswalk-v1.jsonl"), main: readJsonl("main-city-spots-snapshot-2026-08-22-v1.jsonl"), mainClassification: readJsonl("five-city-core-main-classification-v1.jsonl"), expectedActiveTotal: exp.active_total });
  assert.deepEqual(assertPlanMatchesExpected(plan.counts, exp), []);
  assert.equal(plan.visibility.hide_legacy, exp.hide_legacy);
  const script = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  assert.ok(!/=\s*4826\b|=\s*4194\b|=\s*462\b|=\s*170\b|=\s*233\b/.test(script), "importer 에 현재 package 숫자 상수 없음");
  assert.match(script, /deriveExpectedCounts\(manifest, summary\)/);
  // 다른 선언값이면 불일치로 잡힌다
  assert.ok(assertPlanMatchesExpected(plan.counts, { ...exp, new: 532 }).length === 1);
});

for (const n of [4194, 10000, 20000, 50000]) {
  test(`S3: synthetic ${n} NEW — plan · STAGE chunks · resume · receipt · PUBLISH SQL 이 규모와 무관하게 생성된다`, () => {
    const { intake, crosswalk, main, cls } = synthetic(n, 5);
    const plan = planImport({ intake, sources: [], images: [], crosswalk, main, mainClassification: cls, expectedActiveTotal: n + 5 });
    assert.deepEqual(plan.errors, []); assert.equal(plan.counts.new, n); assert.equal(plan.counts.match_replace, 5);
    const sp = buildStagePlan(plan, "0123456789abcdef", "a".repeat(64));
    assert.equal(sp.counts.inserts, n); assert.equal(sp.counts.insert_chunks, Math.ceil(n / STAGE_INSERT_CHUNK)); assert.equal(sp.counts.update_chunks, Math.ceil(5 / STAGE_UPDATE_CHUNK));
    assert.equal(sp.counts.legacy_hidden_in_stage, 0);
    const keys = sp.chunks.filter(c => c.kind === "INSERT").flatMap(c => c.keys);
    assert.equal(keys.length, n); assert.equal(new Set(keys).size, n, "chunk 경계에 중복/누락 없음");
    assert.equal(sp.chunks[0]!.kind, "UPDATE"); assert.equal(sp.chunks[sp.chunks.length - 1]!.kind, "INSERT");
    assert.equal(buildStagePlan(plan, "0123456789abcdef", "a".repeat(64)).plan_sha256, sp.plan_sha256, "결정적");
    // resume: 앞쪽 1/3 이 이미 DB 에 있으면 나머지만
    const done = new Set(keys.slice(0, Math.floor(n / 3)).map(String));
    const rest = remainingInsertChunks(sp, done);
    assert.equal(rest.flatMap(c => c.keys).length, n - done.size);
    // receipt invariant
    const ok = validateStageReceipt({ run_id: sp.run_id, manifest_sha256: sp.manifest_sha256, plan_sha256: sp.plan_sha256, release_sha: null, db_pre_count: 714, db_post_count: 714 + n, update_count: 5, insert_count: n, new_unpublished_count: n, mapping_rows: n, sources_writes: 0, images_writes: 0, error_count: 0, id_mapping_sha256: "x", legacy_newly_hidden: 0 }, sp);
    assert.deepEqual(ok, []);
    assert.ok(validateStageReceipt({ run_id: sp.run_id, manifest_sha256: sp.manifest_sha256, plan_sha256: sp.plan_sha256, release_sha: null, db_pre_count: 714, db_post_count: 714 + n - 1, update_count: 5, insert_count: n, new_unpublished_count: n, mapping_rows: n, sources_writes: 0, images_writes: 0, error_count: 0, id_mapping_sha256: "x", legacy_newly_hidden: 0 }, sp).length > 0);
    // PUBLISH: n actual ids + 233 hide + 19 keep
    const newIds = Array.from({ length: n }, (_, i) => 1000 + i * 2);
    const hideIds = Array.from({ length: 233 }, (_, i) => 1_000_000 + i);
    const keepIds = Array.from({ length: 19 }, (_, i) => 2_000_000 + i);
    const r = buildPublishCutoverSql({ run_id: "0123456789abcdef", manifest_sha256: "a".repeat(64), new_ids: newIds, hide_ids: hideIds, keep_ids: keepIds });
    assert.equal(r.new_count, n); assert.equal(r.hide_count, 233); assert.equal(r.keep_count, 19);
    assert.match(r.sql, /create temporary table publish_new_ids/); assert.match(r.sql, /^begin;/m); assert.match(r.sql, /^commit;/m);
    assert.ok(!/where\s+city\s*=|id\s*>=|id\s*between|like\s*'/i.test(r.sql), "broad update 없음");
    assert.match(r.sql, new RegExp(`n_new <> ${n} then raise exception`));
    assert.equal((r.sql.match(/\(\d+\)/g) ?? []).length, n + 233 + 19, "VALUES 행 수 = 대상 수");
    assert.ok(!/delete from public\./.test(r.sql) && !/delete from public\./.test(r.rollback_sql));
    assert.match(r.rollback_sql, /set is_published = false from publish_new_ids/);
  });
}

test("S4: PUBLISH target-set 거부 — 중복 id · new∩hide · keep∩hide · 비정수 · 잘못된 hash", () => {
  const ok = { run_id: "0123456789abcdef", manifest_sha256: "b".repeat(64) };
  assert.throws(() => buildPublishCutoverSql({ ...ok, new_ids: [1, 1], hide_ids: [], keep_ids: [] }), /duplicate/);
  assert.throws(() => buildPublishCutoverSql({ ...ok, new_ids: [1], hide_ids: [1], keep_ids: [] }), /both new and hide/);
  assert.throws(() => buildPublishCutoverSql({ ...ok, new_ids: [1], hide_ids: [2], keep_ids: [2] }), /hide and keep/);
  assert.throws(() => buildPublishCutoverSql({ ...ok, new_ids: [1.5], hide_ids: [], keep_ids: [] }), /invalid id/);
  assert.throws(() => buildPublishCutoverSql({ run_id: "zz", manifest_sha256: "b".repeat(64), new_ids: [1], hide_ids: [], keep_ids: [] }), /hex/);
});

test("S5: STAGE REST writer 계약 — on_conflict 미사용(partial unique index 비호환) · lookup-before-insert · INSERT 는 false 만 · UPDATE 는 is_published 미전송 · DELETE 없음", async () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fakeFetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    if (init.method === "GET") return { ok: true, status: 200, text: async () => "[]" };
    if (init.method === "POST") { const rows = JSON.parse(init.body!) as Array<{ external_id: string }>; return { ok: true, status: 201, text: async () => JSON.stringify(rows.map((r, i) => ({ id: 5000 + i, external_id: r.external_id }))) }; }
    return { ok: true, status: 204, text: async () => "" };
  };
  const t = { url: "https://example.supabase.co", serviceKey: "k" };
  const { intake, crosswalk, main, cls } = synthetic(3, 1);
  const plan: ImportPlan = planImport({ intake, sources: [], images: [], crosswalk, main, mainClassification: cls, expectedActiveTotal: 4 });
  const staged = plan.inserts.map(i => ({ ...i, row: { ...i.row, is_published: false } }));
  const res = await stageInsertChunkSafe(fakeFetch, t, staged);
  assert.equal(res.length, 3);
  assert.ok(calls.every(c => !/on_conflict=/.test(c.url)));
  assert.equal(calls[0]!.method, "GET", "lookup 먼저"); assert.equal(calls[1]!.method, "POST");
  await assert.rejects(stageInsertChunkSafe(fakeFetch, t, plan.inserts), /is_published=false/);
  await stageUpdateRow(fakeFetch, t, plan.updates[0]!);
  const patch = calls.find(c => c.method === "PATCH")!;
  assert.ok(!("is_published" in (patch.body as Record<string, unknown>)), "STAGE UPDATE 는 visibility 를 바꾸지 않는다");
  assert.ok(calls.every(c => c.method !== "DELETE"));
  const writer = readFileSync(new URL("src/lib/main-intake/stage-rest-writer.ts", ROOT), "utf8");
  assert.ok(!/method:\s*"DELETE"/.test(writer));
  assert.ok(!/itineraries|trip_moments|user_spots|place_reports/.test(writer), "사용자 테이블 접근 없음");
});

test("S6: importer 스크립트 — 실제 write 모드는 다중 가드 뒤에 있고 기본은 dry-run · DELETE 없음", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  for (const g of ["FIVE_CITY_CORE_APPLY", "--confirm-manifest-hash", "FIVE_CITY_CORE_TARGET_HOST", "--expected-db-count", "migration 056 not applied"]) assert.ok(src.includes(g), g);
  assert.ok(!/method:\s*"DELETE"|\.delete\(/.test(src));
  assert.match(src, /STAGE_REFUSED/); assert.match(src, /APPLY_REFUSED/);
});

// Busan+Gyeongju legacy retirement crosswalk v1 — artifact/SQL consistency guard
// 실행: node --experimental-strip-types src/lib/main-intake/legacy-retirement-crosswalk.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

interface Row { old_id: number; city: string; old_category: string; final_classification: string; production_status: string; action: string; prior_owner_decision: string | null; final_canonical_prod_id?: number | null; production: { published: boolean | null } }
interface Summary { classification: Record<string, number>; classification_by_city: Record<string, Record<string, number>>; subclass: Record<string, number>; SAFE_RETIRE_IDS: number[]; SAFE_RETIRE_TARGET_COUNT: number; sql: { sha256: string }; jangsan: { P4_SUPERSEDED_BY_COMPREHENSIVE_RETIREMENT: boolean } }

const A = path.join(process.cwd(), "data", "main-intake", "five-city-core-v3", "audits");
const art = JSON.parse(readFileSync(path.join(A, "busan-gyeongju-legacy-retirement-crosswalk-v1.json"), "utf8")) as { summary: Summary; rows: Row[] };
const CLASSES = ["FINAL_REPLACED_IN_PLACE", "FINAL_REPLACED_BY_OTHER_ID", "FINAL_RETIRED", "STRATEGIC_MISSING_FROM_FINAL", "IDENTITY_AMBIGUOUS_HOLD"];
const sql = readFileSync(path.join(A, "OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1.sql"), "utf8");
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

test("old Main universe: 714 unique ids, busan 412 + gyeongju 302, every row exactly one classification", () => {
  assert.equal(art.rows.length, 714);
  assert.equal(new Set(art.rows.map(r => r.old_id)).size, 714);
  assert.equal(art.rows.filter(r => r.city === "busan").length, 412);
  assert.equal(art.rows.filter(r => r.city === "gyeongju").length, 302);
  for (const r of art.rows) assert.ok(CLASSES.includes(r.final_classification), `row ${r.old_id}`);
  assert.equal(sum(art.summary.classification), 714);
  assert.equal(sum(art.summary.classification_by_city.busan), 412);
  assert.equal(sum(art.summary.classification_by_city.gyeongju), 302);
});

test("food is included and subclass sums reconcile", () => {
  assert.equal(art.rows.filter(r => r.old_category === "restaurant" && r.city === "busan").length, 327);
  assert.equal(art.rows.filter(r => r.old_category === "restaurant" && r.city === "gyeongju").length, 102);
  assert.equal(sum(art.summary.subclass), 714);
  for (const cls of CLASSES) {
    const n = art.rows.filter(r => r.final_classification === cls).length;
    const s = Object.entries(art.summary.subclass).filter(([k]) => k.startsWith(cls + "|")).reduce((a, [, v]) => a + v, 0);
    assert.equal(n, s, cls);
  }
});

test("SAFE_RETIRE set = published residue of REPLACED_BY_OTHER_ID/RETIRED minus strategic/hold/owner-pending; SQL ids match exactly; DELETE 0", () => {
  const expected = art.rows.filter(r => r.production_status === "PROD_RESIDUE_PUBLISHED" && ["FINAL_REPLACED_BY_OTHER_ID", "FINAL_RETIRED"].includes(r.final_classification) && !r.prior_owner_decision).map(r => r.old_id).sort((a, b) => a - b);
  assert.deepEqual(art.summary.SAFE_RETIRE_IDS, expected);
  assert.equal(art.summary.SAFE_RETIRE_TARGET_COUNT, expected.length);
  for (const r of art.rows) {
    if (art.summary.SAFE_RETIRE_IDS.includes(r.old_id)) { assert.equal(r.action, "UNPUBLISH"); assert.equal(r.production.published, true); assert.notEqual(r.final_classification, "STRATEGIC_MISSING_FROM_FINAL"); }
    if (r.final_classification === "STRATEGIC_MISSING_FROM_FINAL") assert.ok(!art.summary.SAFE_RETIRE_IDS.includes(r.old_id));
    if (r.production_status === "PROD_ALREADY_HIDDEN") assert.ok(!art.summary.SAFE_RETIRE_IDS.includes(r.old_id));
  }
  const sqlIds = [...sql.matchAll(/^\s+\((\d+), '(?:busan|gyeongju)', /gm)].map(m => Number(m[1])).sort((a, b) => a - b);
  assert.deepEqual(sqlIds, expected);
  assert.ok(sql.includes(`if v_cnt <> ${expected.length} then raise exception 'PRECONDITION FAILED`));
  assert.ok(sql.includes(`if v_cnt <> ${expected.length} then raise exception 'POSTCONDITION FAILED`));
  // temp table (`create temp table … on commit drop`) is the only DDL-looking statement; nothing else may delete/drop/alter
  const body = sql.replace(/--[^\n]*/g, "").replace(/create temp table[^\n]*on commit drop;/i, "");
  assert.ok(!/\b(delete|drop|alter|truncate)\b/i.test(body), "no delete/ddl");
  assert.ok(/set is_published = false, updated_at = now\(\)/.test(body));
  assert.equal(art.summary.sql.sha256, createHash("sha256").update(sql).digest("hex"));
});

test("known checkpoints: Jangsan 6 → 30 in SET A (P4 superseded), 93 in-place current, 94 strategic", () => {
  const r6 = art.rows.find(r => r.old_id === 6)!; assert.equal(r6.final_classification, "FINAL_REPLACED_BY_OTHER_ID"); assert.equal(r6.final_canonical_prod_id, 30); assert.ok(art.summary.SAFE_RETIRE_IDS.includes(6));
  assert.equal(art.summary.jangsan.P4_SUPERSEDED_BY_COMPREHENSIVE_RETIREMENT, true);
  const r93 = art.rows.find(r => r.old_id === 93)!; assert.equal(r93.final_classification, "FINAL_REPLACED_IN_PLACE"); assert.equal(r93.action, "NONE");
  const r94 = art.rows.find(r => r.old_id === 94)!; assert.equal(r94.final_classification, "STRATEGIC_MISSING_FROM_FINAL");
});

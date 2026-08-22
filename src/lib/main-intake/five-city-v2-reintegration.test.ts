/**
 * TASK-GYEONGJU-FOOD-105-FIVE-CITY-REINTEGRATION-PREP-V1 — v2 package contract (Gyeongju Food 105 + Seoul final-freeze)
 * Run: node --experimental-strip-types --test src/lib/main-intake/five-city-v2-reintegration.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { planImport, HIDE_CLASSES, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type ImageRow, type MainClassificationRow } from "./importer-core.ts";
import { deriveExpectedCounts, assertPlanMatchesExpected, type CrosswalkSummary, type InputManifest } from "./manifest-expectations.ts";
import { resolveRelationTargets, preflightRelations } from "./stage-relations.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v2/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(new URL(PKG + p, ROOT), "utf8")) as T;
const ready = existsSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT));
const KNOWN_MATCH: Record<string, number> = { "gyeongju-GJ08-405": 577, "gyeongju-GJ08-6917": 607, "gyeongju-GJ08-7128": 619, "gyeongju-GJ08-732": 633, "gyeongju-GJ08-733": 634, "gyeongju-GJ08-7510": 640, "gyeongju-GJ08-760": 644, "gyeongju-GJ08-87": 653 };

test("V2-1: hide classes include the Gyeongju Food retire class (publish hide, no delete)", () => {
  assert.ok((HIDE_CLASSES as readonly string[]).includes("GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE"));
  assert.deepEqual([...HIDE_CLASSES], ["EXCLUDED_FROM_SERVICE_REVIEW", "DUPLICATE_REVIEW", "GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE"]);
});

test("V2-2: active universe 4,829 — Gyeongju Attraction 197 + VG Food 105, old GJ08 absent, other cities frozen", { skip: !ready }, () => {
  const A = readJsonl<IntakeRow>("five-city-core-active-v1.jsonl");
  const per = new Map<string, number>(); for (const r of A) per.set(r.city, (per.get(r.city) ?? 0) + 1);
  assert.equal(A.length, 4829);
  assert.deepEqual(Object.fromEntries([...per].sort()), { busan: 958, gyeongju: 302, jeju: 1496, jeonju: 236, seoul: 1837 });
  const gj = A.filter(r => r.city === "gyeongju");
  assert.equal(gj.filter(r => r.canonical_id.startsWith("gyeongju-GJ08-")).length, 0, "old GJ08 Food 102 absent");
  assert.equal(gj.filter(r => r.canonical_id.startsWith("gyeongju-VG08-")).length, 105);
  assert.equal(gj.filter(r => !r.canonical_id.startsWith("gyeongju-VG08-")).length, 197, "Attraction 197 unchanged");
  const vg = gj.filter(r => r.canonical_id.startsWith("gyeongju-VG08-"));
  assert.ok(vg.every(r => r.category === "restaurant"));
  for (const loc of ["ko", "en", "ja", "zh"]) { assert.equal(vg.filter(r => (r.name_l10n as Record<string, string> | null)?.[loc]).length, 105, `name_l10n.${loc}`); assert.equal(vg.filter(r => (r.desc_l10n as Record<string, string> | null)?.[loc]).length, 105, `desc_l10n.${loc}`); }
  assert.ok(vg.every(r => !("zh-CN" in ((r.name_l10n ?? {}) as object)) && !("zh-CN" in ((r.desc_l10n ?? {}) as object))), "zh-CN → zh adapter");
  assert.equal(vg.filter(r => r.lat !== null && r.lat !== undefined).length, 8, "coordinates only where the package provides them (no centroid/guess)");
});

test("V2-3: crosswalk — MATCH 368 / NEW 4,291 / twin 170 / REVIEW 0; Gyeongju Food 8 preserve-id + 97 new + 94 retired; known 7 + Hwasu ids", { skip: !ready }, () => {
  const X = readJsonl<CrosswalkRow & { legacy_status?: string | null }>("five-city-core-crosswalk-v1.jsonl");
  const act = X.filter(c => c.service_status === "ACTIVE");
  const n = (d: string) => act.filter(c => c.decision === d).length;
  assert.equal(act.length, 4829); assert.equal(n("MATCH_REPLACE"), 368); assert.equal(n("NEW"), 4291); assert.equal(n("CONFIRMED_TWIN"), 170); assert.equal(n("REVIEW_REQUIRED"), 0);
  const vg = act.filter(c => c.canonical_id.startsWith("gyeongju-VG08-"));
  assert.equal(vg.filter(c => c.decision === "MATCH_REPLACE").length, 8); assert.equal(vg.filter(c => c.decision === "NEW").length, 97);
  const retired = X.filter(c => c.service_status === "RETIRED");
  assert.equal(retired.length, 94); assert.ok(retired.every(c => c.canonical_id.startsWith("gyeongju-GJ08-") && c.main_city_spot_id !== null && c.legacy_status === "GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE"));
  const ids = new Set<number>(); for (const c of act) if (c.decision === "MATCH_REPLACE") { assert.ok(!ids.has(c.main_city_spot_id!), `dup main id ${c.main_city_spot_id}`); ids.add(c.main_city_spot_id!); }
  const byMain = new Map(vg.filter(c => c.decision === "MATCH_REPLACE").map(c => [c.main_city_spot_id!, c]));
  for (const [old, id] of Object.entries(KNOWN_MATCH)) assert.ok(byMain.has(id), `${old} → #${id} preserved`);
  assert.equal(byMain.get(607)!.decision_basis, "OWNER_TARGETED_RESOLUTION", "Hwasu targeted resolution SAME");
  assert.equal(act.filter(c => c.city === "gyeongju" && c.decision === "MATCH_REPLACE").length, 205, "Attraction 197 + Food 8");
});

test("V2-4: main classification — 714 rows, retired 94 hide class, publish-hide union 327 (233 ∪ 94, overlap 0)", { skip: !ready }, () => {
  const M = readJsonl<MainClassificationRow>("five-city-core-main-classification-v1.jsonl");
  assert.equal(M.length, 714);
  const cnt = (cls: string) => M.filter(m => m.class === cls).length;
  assert.equal(cnt("GYEONGJU_FOOD_RETIRED_PUBLISH_HIDE"), 94); assert.equal(cnt("EXCLUDED_FROM_SERVICE_REVIEW"), 230); assert.equal(cnt("DUPLICATE_REVIEW"), 3); assert.equal(cnt("ACTIVE_MATCHED"), 368); assert.equal(cnt("OWNER_OVERRIDE_KEEP_PUBLISHED"), 4); assert.equal(cnt("LEGACY_ONLY_VALID"), 15);
  assert.ok(M.every(m => (m as unknown as { delete?: boolean }).delete === false));
  const u = readJson<{ old_legacy_hide_count: number; gyeongju_food_retire_count: number; overlap: number; final_publish_hide_unique_count: number; consistent: boolean }>("five-city-publish-hide-union-v1.json");
  assert.deepEqual([u.old_legacy_hide_count, u.gyeongju_food_retire_count, u.overlap, u.final_publish_hide_unique_count, u.consistent], [233, 94, 0, 327, true]);
});

test("V2-5: R2 Phase A reconcile — 462 rows: keep 360 · replace 8 · restore-then-hide 94 · review 0; restore plan snapshot-only, never Main-owned fields", { skip: !ready }, () => {
  const R = readJsonl<{ main_city_spot_id: number; action: string; city: string; previous_plan_canonical_id: string; new_final_canonical_id: string | null }>("five-city-r2-phase-a-reconcile-v1.jsonl");
  assert.equal(R.length, 462);
  const n = (a: string) => R.filter(r => r.action === a).length;
  assert.equal(n("KEEP_CURRENT_VALID"), 360); assert.equal(n("REPLACE_WITH_NEW_FINAL"), 8); assert.equal(n("RESTORE_PRE_R2_THEN_PUBLISH_HIDE"), 94); assert.equal(n("REVIEW_REQUIRED"), 0); assert.equal(n("NO_LONGER_ACTIVE_FINAL"), 0);
  assert.ok(R.filter(r => r.action === "REPLACE_WITH_NEW_FINAL").every(r => r.previous_plan_canonical_id.startsWith("gyeongju-GJ08-") && r.new_final_canonical_id!.startsWith("gyeongju-VG08-")));
  assert.equal(R.filter(r => r.city === "busan" && r.action === "KEEP_CURRENT_VALID").length, 163); assert.equal(R.filter(r => r.city === "gyeongju" && r.action === "KEEP_CURRENT_VALID").length, 197);
  const P = readJsonl<{ main_city_spot_id: number; restore_fields: string[]; before_values: Record<string, unknown>; source: { ops_commit: string; snapshot_sha256: string }; never_touch: string[]; hard_delete: boolean }>("five-city-r2-restore-plan-v1.jsonl");
  assert.equal(P.length, 94);
  for (const p of P) {
    assert.equal(p.source.ops_commit, "3622e26"); assert.equal(p.source.snapshot_sha256, "10240f4f404c95fae71dc20b6599b14f83bcf3812173bd155d388ec76d6c6207"); assert.equal(p.hard_delete, false);
    for (const f of p.restore_fields) { assert.ok(!["id", "source_type", "external_id", "is_published", "rating", "review_count"].includes(f), `never restore ${f}`); assert.ok(f in p.before_values); }
  }
  const retire = readJsonl<{ main_city_spot_id: number; hard_delete: boolean; publish_hide_candidate: boolean; r2_phase_a_applied: boolean }>("gyeongju-food-retire-from-service-v1.jsonl");
  assert.equal(retire.length, 94); assert.ok(retire.every(r => !r.hard_delete && r.publish_hide_candidate && r.r2_phase_a_applied));
  assert.deepEqual(new Set(retire.map(r => r.main_city_spot_id)), new Set(P.map(p => p.main_city_spot_id)));
});

test("V2-6: VG mapping 105 — preserve 8 / new 97 / review 0; locale ready 105/105 ×4; source bridge visitgyeongju unique; coords 8 ready / 97 geocoding", { skip: !ready }, () => {
  const M = readJsonl<{ vg_id: string; canonical_id: string; action: string; existing_numeric_id: number | null; official_locale_ready: Record<string, boolean>; coordinate_ready: boolean; geocoding_required: boolean; source_bridge: { source_type: string; source_key: string }; image_ready: boolean }>("gyeongju-food-105-main-intake-mapping-v1.jsonl");
  assert.equal(M.length, 105); assert.equal(new Set(M.map(m => m.vg_id)).size, 105);
  assert.equal(M.filter(m => m.action === "PRESERVE_ID_AND_REPLACE").length, 8); assert.equal(M.filter(m => m.action === "NEW_INSERT").length, 97); assert.equal(M.filter(m => m.action === "REVIEW_REQUIRED").length, 0);
  assert.ok(M.every(m => m.official_locale_ready.ko && m.official_locale_ready.en && m.official_locale_ready.ja && m.official_locale_ready.zh));
  assert.ok(M.every(m => m.source_bridge.source_type === "visitgyeongju" && m.source_bridge.source_key === m.vg_id));
  assert.equal(M.filter(m => m.coordinate_ready).length, 8); assert.equal(M.filter(m => m.geocoding_required).length, 97); assert.ok(M.every(m => !m.image_ready));
  assert.deepEqual(new Set(M.filter(m => m.action === "PRESERVE_ID_AND_REPLACE").map(m => m.existing_numeric_id)), new Set(Object.values(KNOWN_MATCH)));
});

test("V2-7: dry-run plan on v2 — expectations derived from manifest/summary; sources/images unresolved 0, conflicts 0", { skip: !ready }, () => {
  const manifest = readJson<InputManifest>("five-city-core-input-manifest-v1.json"); const summary = readJson<CrosswalkSummary>("five-city-core-crosswalk-summary-v1.json");
  const exp = deriveExpectedCounts(manifest, summary);
  assert.equal(exp.match_replace, 368); assert.equal(exp.new, 4291); assert.equal(exp.confirmed_twin, 170); assert.equal(exp.review_required, 0); assert.equal(exp.hide_legacy, 327);
  const plan = planImport({ intake: readJsonl<IntakeRow>("five-city-core-active-v1.jsonl"), sources: readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"), images: readJsonl<ImageRow>("five-city-core-images-v1.jsonl"), crosswalk: readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl"), main: readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl"), mainClassification: readJsonl<MainClassificationRow>("five-city-core-main-classification-v1.jsonl"), expectedActiveTotal: 4829 });
  assert.deepEqual(assertPlanMatchesExpected(plan.counts, exp), []);
  assert.equal(plan.updates.length, 368); assert.equal(plan.inserts.length, 4291); assert.deepEqual(plan.errors, []); assert.equal(plan.counts.lossy_category, 0);
  const ph = new Map(plan.inserts.map((i, idx) => [i.canonical_id, -(idx + 1)]));
  const r = resolveRelationTargets({ sources: readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"), images: readJsonl<ImageRow>("five-city-core-images-v1.jsonl"), crosswalk: readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl"), newIdByCanonical: ph });
  const p = preflightRelations(r);
  assert.equal(p.source_unresolved, 0); assert.equal(p.image_unresolved, 0); assert.deepEqual(p.source_conflicts, []); assert.deepEqual(p.image_conflicts, []); assert.deepEqual(p.rights_violations, []); assert.equal(p.source_primary_conflicts, 0); assert.equal(p.image_primary_conflicts, 0);
  assert.equal(r.sources.filter(s => s.source_type === "visitgyeongju").length, 105); assert.equal(new Set(r.sources.filter(s => s.source_type === "visitgyeongju").map(s => s.source_key)).size, 105);
  assert.equal(r.sources.filter(s => s.canonical_id.startsWith("gyeongju-GJ08-")).length, 0, "retired Food has no active Final source relation");
  console.log(`[V2-7] sources=${p.source_planned} images=${p.image_planned}`);
});

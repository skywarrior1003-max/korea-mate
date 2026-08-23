/**
 * TASK-FIVE-CITY-CORE-R3-FINAL-PLAN-REGENERATION-V1 — final v3 package contract
 * (Gyeongju Food 105 + final coordinates f428ef9 + official images 323142e + Seoul final-freeze; identity counts unchanged vs v2)
 * Run: node --experimental-strip-types --test src/lib/main-intake/five-city-v3-final.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { planImport, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type ImageRow, type MainClassificationRow } from "./importer-core.ts";
import { deriveExpectedCounts, assertPlanMatchesExpected, type CrosswalkSummary, type InputManifest } from "./manifest-expectations.ts";
import { resolveRelationTargets, preflightRelations } from "./stage-relations.ts";
import { validateRestorePlan, R2_OPS_COMMIT, R2_HISTORICAL_SNAPSHOT_SHA256, type RestorePlanRow } from "./stage-restore.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v3/"; const V2 = "data/main-intake/five-city-core-v2/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(new URL(p, ROOT), "utf8")) as T;
const ready = existsSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT));
const KNOWN_IDS = [577, 607, 619, 633, 634, 640, 644, 653];
const isVg = (c: string) => c.startsWith("gyeongju-VG08-");

test("V3-1: manifest pins — CORE a90fbed · images 323142e · final coords f428ef9 · package v3 · no coordinates-v1 input", { skip: !ready }, () => {
  const m = readJson<InputManifest & { inputs: Record<string, { sha: string; path: string; rows: number; branch: string }>; package: string }>(PKG + "five-city-core-input-manifest-v1.json");
  assert.equal(m.package, "five-city-core-v3");
  assert.equal(m.inputs.gyeongju_food_vg.sha, "a90fbed"); assert.equal(m.inputs.gyeongju_food_vg.rows, 105);
  assert.equal(m.inputs.gyeongju_food_vg_ml.rows, 420);
  assert.equal(m.inputs.gyeongju_food_vg_images.sha, "323142e"); assert.match(m.inputs.gyeongju_food_vg_images.path, /official-images-v1\.jsonl$/); assert.equal(m.inputs.gyeongju_food_vg_images.rows, 105);
  assert.equal(m.inputs.gyeongju_food_vg_coords.sha, "f428ef9"); assert.match(m.inputs.gyeongju_food_vg_coords.path, /coordinates-final-v1\/gyeongju-vg-food-105-coordinates-final-v2\.jsonl$/); assert.equal(m.inputs.gyeongju_food_vg_coords.rows, 105);
  assert.ok(!Object.values(m.inputs).some(i => /coordinates-v1\.jsonl$/.test(i.path)), "old coordinate V1 never an input");
  assert.equal(m.active_total, 4829);
});

test("V3-2: Gyeongju Food 105 runtime completeness — lat/lng 105 (Gyeongju range), NAV 105, EXACT 94 + ADDRESS 11, official image 105, 4-locale name/desc 105", { skip: !ready }, () => {
  const A = readJsonl<IntakeRow & { provenance: Record<string, unknown> }>(PKG + "five-city-core-active-v1.jsonl");
  const vg = A.filter(r => isVg(r.canonical_id)); assert.equal(vg.length, 105); assert.equal(A.length, 4829);
  assert.equal(vg.filter(r => typeof r.lat === "number" && typeof r.lng === "number" && r.lat! > 35.5 && r.lat! < 36.2 && r.lng! > 128.9 && r.lng! < 129.7).length, 105);
  assert.equal(vg.filter(r => r.provenance.nav_ready === true).length, 105);
  assert.equal(vg.filter(r => r.provenance.coordinate_quality === "ENTITY_EXACT").length, 94); assert.equal(vg.filter(r => r.provenance.coordinate_quality === "ADDRESS_NUMBER_LEVEL").length, 11);
  assert.ok(vg.every(r => r.provenance.coordinate_artifact === "gyeongju-vg-food-105-coordinates-final-v2"));
  assert.equal(vg.filter(r => typeof r.image_url === "string" && (r.image_url as string).startsWith("https://www.visitgyeongju.or.kr/")).length, 105, "city_spots.image_url cache = official primary image");
  for (const loc of ["ko", "en", "ja", "zh"]) { assert.equal(vg.filter(r => (r.name_l10n as Record<string, string>)?.[loc]).length, 105); assert.equal(vg.filter(r => (r.desc_l10n as Record<string, string>)?.[loc]).length, 105); }
});

test("V3-3: v2 → v3 Food content unchanged (title/description/l10n/address/identity); only lat/lng/image/provenance differ", { skip: !ready }, () => {
  const a2 = new Map(readJsonl<IntakeRow>(V2 + "five-city-core-active-v1.jsonl").map(r => [r.canonical_id, r])); const a3 = readJsonl<IntakeRow>(PKG + "five-city-core-active-v1.jsonl");
  const FROZEN = ["name", "name_l10n", "description", "desc_l10n", "address", "district", "category", "subcategory", "official_url", "opening_hours", "decision", "main_city_spot_id", "owned_fields"] as const;
  let gained = 0, matchedDelta = 0;
  for (const r of a3.filter(r => isVg(r.canonical_id))) {
    const o = a2.get(r.canonical_id)!;
    for (const f of FROZEN) assert.deepEqual((r as unknown as Record<string, unknown>)[f], (o as unknown as Record<string, unknown>)[f], `${r.canonical_id}.${f}`);
    if (o.lat === null || o.lat === undefined) gained += 1;
    else { const d = Math.max(Math.abs((r.lat as number) - (o.lat as number)), Math.abs((r.lng as number) - (o.lng as number))); assert.ok(d <= 5e-4, `${r.canonical_id} matched-row coordinate moved ${d}`); matchedDelta = Math.max(matchedDelta, d); }
  }
  assert.equal(gained, 97, "97 NEW rows gained final coordinates");
  assert.ok(matchedDelta <= 5e-4, "8 matched rows: final package ENTITY_EXACT (Kakao place) coordinates replace legacy gyeongju-city coordinates — observed max ≈2.6e-4 deg (≈27 m, 요석궁 #640), others ≤3.1e-5");
  console.log(`[V3-3] matched-row max coordinate delta = ${matchedDelta}`);
  assert.equal(new Set(a3.map(r => r.canonical_id)).size, new Set(a2.keys()).size);
});

test("V3-4: crosswalk identity unchanged — MATCH 368 / NEW 4,291 / twin 170 / REVIEW 0 · Food 8/97/94 · 8 numeric ids · retired 94", { skip: !ready }, () => {
  const X = readJsonl<CrosswalkRow>(PKG + "five-city-core-crosswalk-v1.jsonl"); const act = X.filter(c => c.service_status === "ACTIVE");
  const n = (d: string) => act.filter(c => c.decision === d).length;
  assert.deepEqual([act.length, n("MATCH_REPLACE"), n("NEW"), n("CONFIRMED_TWIN"), n("REVIEW_REQUIRED")], [4829, 368, 4291, 170, 0]);
  const vg = act.filter(c => isVg(c.canonical_id)); assert.deepEqual([vg.filter(c => c.decision === "MATCH_REPLACE").length, vg.filter(c => c.decision === "NEW").length], [8, 97]);
  assert.deepEqual(vg.filter(c => c.decision === "MATCH_REPLACE").map(c => c.main_city_spot_id).sort((a, b) => a! - b!), KNOWN_IDS);
  assert.equal(X.filter(c => c.service_status === "RETIRED").length, 94);
  const X2 = readJsonl<CrosswalkRow>(V2 + "five-city-core-crosswalk-v1.jsonl");
  assert.deepEqual(X.map(c => [c.canonical_id, c.decision, c.main_city_spot_id, c.service_status]), X2.map(c => [c.canonical_id, c.decision, c.main_city_spot_id, c.service_status]), "crosswalk decisions byte-identical to v2");
});

test("V3-5: reconcile 360/8/94/0 · restore plan 94 from R2 snapshot (3622e26) · publish-hide union 327 · retire 94", { skip: !ready }, () => {
  const R = readJsonl<{ action: string }>(PKG + "five-city-r2-phase-a-reconcile-v1.jsonl"); const n = (a: string) => R.filter(r => r.action === a).length;
  assert.deepEqual([R.length, n("KEEP_CURRENT_VALID"), n("REPLACE_WITH_NEW_FINAL"), n("RESTORE_PRE_R2_THEN_PUBLISH_HIDE"), n("REVIEW_REQUIRED")], [462, 360, 8, 94, 0]);
  const P = readJsonl<RestorePlanRow>(PKG + "five-city-r2-restore-plan-v1.jsonl"); const v = validateRestorePlan(P, { expectedRows: 94 });
  assert.deepEqual(v.errors, []); assert.ok(P.every(p => p.source.ops_commit === R2_OPS_COMMIT && p.source.snapshot_sha256 === R2_HISTORICAL_SNAPSHOT_SHA256));
  assert.deepEqual(readFileSync(new URL(PKG + "five-city-r2-restore-plan-v1.jsonl", ROOT), "utf8"), readFileSync(new URL(V2 + "five-city-r2-restore-plan-v1.jsonl", ROOT), "utf8"), "restore plan byte-identical to v2");
  const u = readJson<{ old_legacy_hide_count: number; gyeongju_food_retire_count: number; overlap: number; final_publish_hide_unique_count: number; consistent: boolean }>(PKG + "five-city-publish-hide-union-v1.json");
  assert.deepEqual([u.old_legacy_hide_count, u.gyeongju_food_retire_count, u.overlap, u.final_publish_hide_unique_count, u.consistent], [233, 94, 0, 327, true]);
  const M = readJsonl<{ action: string; coordinate_ready: boolean; nav_ready: boolean; image_ready: boolean; coordinate_quality: string; geocoding_required: boolean }>(PKG + "gyeongju-food-105-main-intake-mapping-v1.jsonl");
  assert.equal(M.length, 105); assert.equal(M.filter(m => m.coordinate_ready && m.nav_ready && m.image_ready && !m.geocoding_required).length, 105);
  assert.deepEqual([M.filter(m => m.action === "PRESERVE_ID_AND_REPLACE").length, M.filter(m => m.action === "NEW_INSERT").length, M.filter(m => m.action === "REVIEW_REQUIRED").length], [8, 97, 0]);
  assert.equal(M.filter(m => m.coordinate_quality === "ENTITY_EXACT").length, 94);
});

test("V3-6: source/image plans — VG source 105 (visitgyeongju, unique) · VG official image relations 105 (eligible, primary, no fallback) · preflight clean · dry-run expectations", { skip: !ready }, () => {
  const S = readJsonl<SourceRow>(PKG + "five-city-core-sources-v1.jsonl"); const I = readJsonl<ImageRow>(PKG + "five-city-core-images-v1.jsonl"); const X = readJsonl<CrosswalkRow>(PKG + "five-city-core-crosswalk-v1.jsonl");
  const plan = planImport({ intake: readJsonl<IntakeRow>(PKG + "five-city-core-active-v1.jsonl"), sources: S, images: I, crosswalk: X, main: readJsonl<MainSnapshotRow>(PKG + "main-city-spots-snapshot-2026-08-22-v1.jsonl"), mainClassification: readJsonl<MainClassificationRow>(PKG + "five-city-core-main-classification-v1.jsonl"), expectedActiveTotal: 4829 });
  const exp = deriveExpectedCounts(readJson<InputManifest>(PKG + "five-city-core-input-manifest-v1.json"), readJson<CrosswalkSummary>(PKG + "five-city-core-crosswalk-summary-v1.json"));
  assert.deepEqual(assertPlanMatchesExpected(plan.counts, exp), []); assert.deepEqual(plan.errors, []); assert.equal(exp.hide_legacy, 327);
  const ph = new Map(plan.inserts.map((i, idx) => [i.canonical_id, -(idx + 1)]));
  const r = resolveRelationTargets({ sources: S, images: I, crosswalk: X, newIdByCanonical: ph }); const p = preflightRelations(r);
  assert.equal(p.source_unresolved, 0); assert.equal(p.image_unresolved, 0); assert.deepEqual(p.source_conflicts, []); assert.deepEqual(p.image_conflicts, []); assert.deepEqual(p.rights_violations, []); assert.equal(p.source_primary_conflicts, 0); assert.equal(p.image_primary_conflicts, 0);
  const vgS = r.sources.filter(s => s.source_type === "visitgyeongju"); assert.equal(vgS.length, 105); assert.equal(new Set(vgS.map(s => s.source_key)).size, 105);
  const vgI = r.images.filter(i => i.canonical_id.startsWith("gyeongju-VG08-")); assert.equal(vgI.length, 105); assert.equal(new Set(vgI.map(i => i.canonical_id)).size, 105);
  assert.ok(vgI.every(i => i.display_eligible && i.is_primary && i.rights_status === "OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION" && i.image_url.startsWith("https://www.visitgyeongju.or.kr/")));
  assert.equal(r.images.filter(i => i.canonical_id.startsWith("gyeongju-GJ08-")).length, 0, "retired Food images are not in the Final plan");
  assert.equal(p.source_planned, 5505, "source plan unchanged vs v2"); assert.equal(p.image_planned, 4292 + 105, "image plan = v2 + 105 VG official images");
  const I2 = readJsonl<ImageRow>(V2 + "five-city-core-images-v1.jsonl"); assert.equal(I.length - I2.length, 105); assert.deepEqual(I.filter(i => !i.canonical_id.startsWith("gyeongju-VG08-")), I2, "non-VG image rows byte-identical to v2");
  console.log(`[V3-6] sources=${p.source_planned} images=${p.image_planned} match=${plan.updates.length} new=${plan.inserts.length}`);
});

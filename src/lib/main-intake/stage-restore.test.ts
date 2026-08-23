/**
 * TASK-FIVE-CITY-CORE-R3-RESTORE-WRITER-SUPPORT-V1 — Phase A3 RESTORE_PRE_R2 writer (REST-1..20) + synthetic A1→A2→A3→B simulation
 * Run: node --experimental-strip-types --test src/lib/main-intake/stage-restore.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { validateRestorePlan, crossCheckWithSnapshot, buildRestorePayloads, classifyRestoreState, stageRestoreChunk, restoreAllowsNextPhase, RESTORE_FORBIDDEN_FIELDS, R2_OPS_COMMIT, R2_HISTORICAL_SNAPSHOT_SHA256, R2_HISTORICAL_SNAPSHOT_FILE, type RestorePlanRow, type CurrentRow, type RestoreRowReceipt } from "./stage-restore.ts";
import { sameRestoreFieldValue, COORD_SERIALIZATION_EPSILON, COORD_FIELDS, sameValue } from "./stage-restore.ts";
import { stageInsertChunkSafe, StageRestError, type FetchLike } from "./stage-rest-writer.ts";
import { writeImmutableFile, R2_BEFORE_PHASE_A_SNAPSHOT } from "./stage-safety.ts";
import { planImport, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type ImageRow, type InsertAction } from "./importer-core.ts";

const ROOT = new URL("../../../", import.meta.url);
const V1 = "data/main-intake/five-city-core-v1/"; const V2 = "data/main-intake/five-city-core-v2/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const ready = existsSync(new URL(V2 + "five-city-r2-restore-plan-v1.jsonl", ROOT)) && existsSync(new URL(V1 + "five-city-core-input-manifest-v1.json", ROOT));
const T = { url: "https://x.supabase.co", serviceKey: "SECRET" };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function loadPlan(): RestorePlanRow[] { return readJsonl<RestorePlanRow>(V2 + "five-city-r2-restore-plan-v1.jsonl"); }
function loadSnapshot(): Array<{ city_spot_id: number; canonical_id: string; before: Record<string, unknown>; fields_to_write: string[] }> {
  const text = execFileSync("git", ["show", `${R2_OPS_COMMIT}:data/main-intake/five-city-core-v1/production-runs/f8abf0cf5f75e55f/${R2_HISTORICAL_SNAPSHOT_FILE}`], { cwd: new URL(ROOT).pathname.replace(/^\/([A-Za-z]:)/, "$1"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(sha(text), R2_HISTORICAL_SNAPSHOT_SHA256, "R2 historical snapshot sha");
  return text.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
}
/** R2 가 실제 쓴 값 = v1 plan writes */
function r2Expectations(): Map<number, Record<string, unknown>> {
  const plan = planImport({ intake: readJsonl<IntakeRow>(V1 + "five-city-core-active-v1.jsonl"), sources: readJsonl<SourceRow>(V1 + "five-city-core-sources-v1.jsonl"), images: readJsonl<ImageRow>(V1 + "five-city-core-images-v1.jsonl"), crosswalk: readJsonl<CrosswalkRow>(V1 + "five-city-core-crosswalk-v1.jsonl"), main: readJsonl<MainSnapshotRow>(V1 + "main-city-spots-snapshot-2026-08-22-v1.jsonl"), mainClassification: [], expectedActiveTotal: 4826 });
  return new Map(plan.updates.map(u => [u.main_city_spot_id, u.writes as Record<string, unknown>]));
}
/** fake PostgREST: city_spots rows (GET by id in-list, PATCH by id w/ representation), city_spot_sources bridge GET, POST refused/logged */
function fakeDb(rows: CurrentRow[], bridge: Array<{ source_type: string; source_key: string; city_spot_id: number }>, opts: { failPatchForId?: number; failStatus?: number } = {}) {
  const table = new Map(rows.map(r => [r.id, { ...r }])); const log: Array<{ m: string; url: string; body?: Record<string, unknown> }> = [];
  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url); const body = init.body ? JSON.parse(init.body) as Record<string, unknown> : undefined; log.push({ m: init.method, url, body });
    if (init.method === "GET" && u.pathname.endsWith("/city_spot_sources")) {
      const keys = decodeURIComponent(u.searchParams.get("source_key")!).slice(4, -1).split(",").map(s => s.replace(/^"|"$/g, "")); const st = u.searchParams.get("source_type")!.slice(3);
      return { ok: true, status: 200, text: async () => JSON.stringify(bridge.filter(b => b.source_type === st && keys.includes(b.source_key)).map(b => ({ city_spot_id: b.city_spot_id, source_key: b.source_key }))) };
    }
    if (init.method === "GET") { const ids = u.searchParams.get("id")!.slice(4, -1).split(",").map(Number); return { ok: true, status: 200, text: async () => JSON.stringify(ids.filter(i => table.has(i)).map(i => table.get(i))) }; }
    if (init.method === "PATCH") {
      const id = Number(u.searchParams.get("id")!.slice(3)); if (opts.failPatchForId === id) return { ok: false, status: opts.failStatus ?? 500, text: async () => JSON.stringify({ code: "XX000", message: "simulated", details: null, hint: null }) };
      const row = table.get(id)!; Object.assign(row, body); return { ok: true, status: 200, text: async () => JSON.stringify([row]) };
    }
    if (init.method === "POST") return { ok: true, status: 201, text: async () => JSON.stringify((body as unknown as Array<Record<string, unknown>>).map((r, i) => ({ id: 9000 + i, external_id: r.external_id }))) };
    return { ok: false, status: 405, text: async () => "" };
  };
  return { fetchLike, table, log, posts: () => log.filter(l => l.m === "POST").length, patches: () => log.filter(l => l.m === "PATCH") };
}
/** synthetic rows from the real plan + R2 expectations: state ∈ R2 (current == r2 writes) | BEFORE (current == snapshot) */
function rowsFor(plan: RestorePlanRow[], r2: Map<number, Record<string, unknown>>, state: (id: number) => "R2" | "BEFORE" | "THIRD"): CurrentRow[] {
  return plan.map(p => {
    const base: CurrentRow = { id: p.main_city_spot_id, source_type: "gyeongju-city", external_id: null, is_published: true };
    for (const f of p.restore_fields) { const s = state(p.main_city_spot_id); base[f] = s === "BEFORE" ? p.before_values[f] : s === "R2" ? (r2.get(p.main_city_spot_id)![f]) : "THIRD-PARTY-EDIT"; }
    return base;
  });
}
const bridgeFor = (plan: RestorePlanRow[]) => plan.map(p => ({ source_type: "gyeongju-city", source_key: p.old_canonical_id, city_spot_id: p.main_city_spot_id }));

test("REST-1/2/3/7: restore plan 94 rows · distinct ids 94 · snapshot exact match 94/94 (sha 10240f4f…) · fields = R2-changed source fields only", { skip: !ready }, () => {
  const plan = loadPlan(); const v = validateRestorePlan(plan, { expectedRows: 94 });
  assert.deepEqual(v.errors, []); assert.equal(v.rows, 94); assert.equal(v.distinct_ids, 94);
  assert.deepEqual(v.fields, ["address", "category", "desc_l10n", "description", "district", "image_url", "lat", "lng", "name", "name_l10n", "official_url", "subcategory"]);
  const snap = loadSnapshot(); assert.equal(snap.length, 462);
  const x = crossCheckWithSnapshot(plan, snap); assert.deepEqual([x.matched, x.missing, x.mismatched], [94, 0, []]);
  for (const p of plan) { const s = snap.find(r => r.city_spot_id === p.main_city_spot_id)!; assert.deepEqual([...p.restore_fields].sort(), [...s.fields_to_write].sort(), "only fields R2 actually wrote"); }
});

test("REST-4/5/6/13: payload has no forbidden/identity/is_published keys · deterministic payload + hash", { skip: !ready }, () => {
  const plan = loadPlan(); const a = buildRestorePayloads(plan); const b = buildRestorePayloads([...plan].reverse());
  assert.equal(a.plan_sha256, b.plan_sha256); assert.deepEqual(a.payloads.map(p => p.main_city_spot_id), b.payloads.map(p => p.main_city_spot_id));
  for (const p of a.payloads) { for (const k of Object.keys(p.body)) { assert.ok(!RESTORE_FORBIDDEN_FIELDS.has(k)); assert.ok(!["id", "source_type", "external_id", "is_published"].includes(k)); } assert.deepEqual(Object.keys(p.body), [...Object.keys(p.body)].sort()); }
  assert.ok(RESTORE_FORBIDDEN_FIELDS.has("is_published") && RESTORE_FORBIDDEN_FIELDS.has("id") && RESTORE_FORBIDDEN_FIELDS.has("source_type") && RESTORE_FORBIDDEN_FIELDS.has("external_id") && RESTORE_FORBIDDEN_FIELDS.has("rating"));
  const bad: RestorePlanRow = { ...plan[0]!, restore_fields: [...plan[0]!.restore_fields, "is_published"], before_values: { ...plan[0]!.before_values, is_published: false } };
  assert.ok(validateRestorePlan([bad]).errors.some(e => /forbidden field is_published/.test(e)));
  assert.throws(() => buildRestorePayloads([bad]), /forbidden/);
});

test("REST-8/9/10/11/12: classification — R2 state → NEEDS_RESTORE · snapshot state → ALREADY_RESTORED · third → DRIFT · bridge/id mismatch → IDENTITY_MISMATCH · no R2 expectation → SNAPSHOT_MISSING", { skip: !ready }, () => {
  const plan = loadPlan(); const r2 = r2Expectations(); const p = plan[0]!; const e = r2.get(p.main_city_spot_id)!;
  const r2row = rowsFor([p], r2, () => "R2")[0]!; const beforeRow = rowsFor([p], r2, () => "BEFORE")[0]!; const third = rowsFor([p], r2, () => "THIRD")[0]!;
  assert.equal(classifyRestoreState(p, r2row, p.main_city_spot_id, e).state, "NEEDS_RESTORE");
  assert.equal(classifyRestoreState(p, beforeRow, p.main_city_spot_id, e).state, "ALREADY_RESTORED");
  assert.equal(classifyRestoreState(p, third, p.main_city_spot_id, e).state, "DRIFT_DETECTED");
  assert.equal(classifyRestoreState(p, r2row, 999, e).state, "IDENTITY_MISMATCH");
  assert.equal(classifyRestoreState(p, undefined, p.main_city_spot_id, e).state, "IDENTITY_MISMATCH");
  assert.equal(classifyRestoreState(p, { ...r2row, source_type: "canonical" }, p.main_city_spot_id, e).state, "IDENTITY_MISMATCH");
  assert.equal(classifyRestoreState(p, r2row, p.main_city_spot_id, undefined).state, "SNAPSHOT_MISSING");
  // mixed: some fields already restored, rest at R2 → NEEDS_RESTORE for the R2 fields only
  const mixed = { ...r2row, name: p.before_values.name, address: p.before_values.address } as CurrentRow;
  const c = classifyRestoreState(p, mixed, p.main_city_spot_id, e); assert.equal(c.state, "NEEDS_RESTORE"); assert.ok(!c.fields_to_patch.includes("name") && !c.fields_to_patch.includes("address"));
});

test("REST-14/16: writer — 94 rows at R2 state → restored 94 (PATCH only allowlist, is_published untouched); second run → already_restored 94, PATCH 0; INSERT/DELETE 0", { skip: !ready }, async () => {
  const plan = loadPlan(); const r2 = r2Expectations(); const db = fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan));
  const receipts: RestoreRowReceipt[] = [];
  const r1 = await stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2, onRow: x => { receipts.push(x); } });
  assert.deepEqual([r1.planned, r1.restored, r1.already_restored, r1.drift, r1.identity_mismatch, r1.snapshot_missing, r1.failed], [94, 94, 0, 0, 0, 0, 0]);
  assert.ok(restoreAllowsNextPhase(r1)); assert.equal(db.patches().length, 94); assert.equal(db.posts(), 0);
  for (const p of db.patches()) { for (const k of Object.keys(p.body!)) assert.ok(!RESTORE_FORBIDDEN_FIELDS.has(k), `forbidden ${k}`); assert.ok(!("is_published" in p.body!)); }
  for (const p of plan) { const row = db.table.get(p.main_city_spot_id)!; assert.equal(row.is_published, true); for (const f of p.restore_fields) assert.ok(sameRestoreFieldValue(f, row[f], p.before_values[f]), `${p.main_city_spot_id}.${f}`); assert.equal(row.source_type, "gyeongju-city"); }   // lat/lng: R2 value ≈ before (serialization-equivalent) stays as-is
  assert.equal(receipts.length, 94); assert.ok(receipts.every(x => x.state === "NEEDS_RESTORE" && x.updated === 1 && /^[0-9a-f]{64}$/.test(x.payload_sha256)));
  const r2run = await stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2 });
  assert.deepEqual([r2run.restored, r2run.already_restored, r2run.failed], [0, 94, 0]); assert.equal(db.patches().length, 94, "second run PATCH 0"); assert.equal(db.table.size, 94);
});

test("REST-10/11 (writer): drift row and identity mismatch → no write for that row, result blocks Phase B", { skip: !ready }, async () => {
  const plan = loadPlan().slice(0, 5); const r2 = r2Expectations();
  const driftId = plan[2]!.main_city_spot_id; const db = fakeDb(rowsFor(plan, r2, id => (id === driftId ? "THIRD" : "R2")), bridgeFor(plan));
  const r = await stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2 });
  assert.deepEqual([r.restored, r.drift, r.failed], [4, 1, 0]); assert.ok(!restoreAllowsNextPhase(r)); assert.ok(!db.patches().some(p => p.url.includes(`id=eq.${driftId}`)));
  const db2 = fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan).map(b => (b.city_spot_id === plan[0]!.main_city_spot_id ? { ...b, city_spot_id: 1 } : b)));
  const r2r = await stageRestoreChunk(db2.fetchLike, T, plan, { expectedR2ByRow: r2 });
  assert.equal(r2r.identity_mismatch, 1); assert.ok(!restoreAllowsNextPhase(r2r)); assert.ok(!db2.patches().some(p => p.url.includes(`id=eq.${plan[0]!.main_city_spot_id}`)));
  const r3 = await stageRestoreChunk(fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan)).fetchLike, T, plan, { expectedR2ByRow: new Map() });
  assert.equal(r3.snapshot_missing, 5); assert.ok(!restoreAllowsNextPhase(r3));
});

test("REST-15/16/18/19(writer): partial failure — 30 restored then HTTP 500: row receipts durable, StageRestError with id/status/code, no next phase; retry reuses 30 ALREADY_RESTORED and writes the rest", { skip: !ready }, async () => {
  const plan = loadPlan(); const r2 = r2Expectations(); const sorted = [...plan].sort((a, b) => a.main_city_spot_id - b.main_city_spot_id); const failId = sorted[30]!.main_city_spot_id;
  const db = fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan), { failPatchForId: failId }); const receipts: RestoreRowReceipt[] = [];
  await assert.rejects(stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2, onRow: x => { receipts.push(x); } }), (e: unknown) => {
    assert.ok(e instanceof StageRestError); assert.equal(e.where.phase, "RESTORE_PRE_R2"); assert.equal(e.where.subgroup_index, failId); assert.equal(e.info.http_status, 500); assert.equal(e.info.code, "XX000"); assert.ok(!e.message.includes("SECRET")); return true;
  });
  assert.equal(receipts.filter(x => x.updated === 1).length, 30); assert.equal(receipts.filter(x => x.failed === 1).length, 1); assert.equal(receipts[30]!.main_city_spot_id, failId); assert.equal(db.posts(), 0, "Phase B not entered");
  const db2 = fakeDb([...db.table.values()], bridgeFor(plan));   // same DB state, transport healthy
  const r = await stageRestoreChunk(db2.fetchLike, T, plan, { expectedR2ByRow: r2 });
  assert.deepEqual([r.restored, r.already_restored, r.failed], [64, 30, 0]); assert.ok(restoreAllowsNextPhase(r)); assert.equal(db2.patches().length, 64);
});

test("REST-17: A2 (VisitGyeongju preserved ids, v2 MATCH) and A3 (restore) targets overlap 0; A1 360 + A2 8 = v2 MATCH 368; A3 94 not counted as MATCH", { skip: !ready }, () => {
  const plan = loadPlan(); const xw = readJsonl<CrosswalkRow>(V2 + "five-city-core-crosswalk-v1.jsonl");
  const match = xw.filter(c => c.service_status === "ACTIVE" && c.decision === "MATCH_REPLACE"); const matchIds = new Set(match.map(c => c.main_city_spot_id));
  assert.equal(match.length, 368); assert.equal(plan.filter(p => matchIds.has(p.main_city_spot_id)).length, 0);
  const a2 = match.filter(c => c.canonical_id.startsWith("gyeongju-VG08-")); assert.equal(a2.length, 8); assert.equal(match.length - a2.length, 360);
  const rec = readJsonl<{ action: string }>(V2 + "five-city-r2-phase-a-reconcile-v1.jsonl");
  assert.equal(rec.filter(r => r.action === "KEEP_CURRENT_VALID").length, 360); assert.equal(rec.filter(r => r.action === "REPLACE_WITH_NEW_FINAL").length, 8); assert.equal(rec.filter(r => r.action === "RESTORE_PRE_R2_THEN_PUBLISH_HIDE").length, 94);
});

test("REST-18 (importer wiring): Phase A3 runs after MATCH and before NEW; drift/failed blocks Phase B; restore source is the plan (R2 snapshot), never the attempt snapshot; R2 file never written", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8"); const stage = src.slice(src.indexOf('if (mode === "stage")'));
  const iA = stage.indexOf("Phase A — MATCH"), iA3 = stage.indexOf("Phase A3 — RESTORE_PRE_R2"), iB = stage.indexOf("Phase B — NEW");
  assert.ok(iA > 0 && iA3 > iA && iB > iA3, "order A → A3 → B");
  assert.match(stage, /restoreAllowsNextPhase\(r\)/); assert.match(stage, /RESTORE_PRE_R2 blocked Phase B/); assert.match(stage, /restore targets overlap MATCH targets/);
  assert.match(stage, /five-city-r2-restore-plan-v1\.jsonl/); assert.match(stage, /expectedR2ByRow: expectedR2/); assert.match(src, /r2AppliedExpectations\(\)/);
  assert.ok(!/stageRestoreChunk\([^)]*snap\b/.test(stage), "fresh attempt snapshot is not passed to the restore writer");
  assert.match(stage, /restore_source: false/); assert.ok(!src.includes("r2-before-phaseA"), "importer never references/writes the R2 historical file");
  assert.match(stage, /failureReceipt\("RESTORE_PRE_R2"/);
});

test("REST-19/20: R2 historical snapshot cannot be overwritten (wx) · restore source constants pinned to ops 3622e26 / sha 10240f4f…", () => {
  const dir = mkdtempSync(join(tmpdir(), "rest19-")); const p = join(dir, R2_BEFORE_PHASE_A_SNAPSHOT);
  writeImmutableFile(p, "historical\n"); assert.throws(() => writeImmutableFile(p, "overwrite\n"), /EEXIST/); assert.equal(readFileSync(p, "utf8"), "historical\n"); rmSync(dir, { recursive: true, force: true });
  assert.equal(R2_HISTORICAL_SNAPSHOT_FILE, R2_BEFORE_PHASE_A_SNAPSHOT); assert.equal(R2_OPS_COMMIT, "3622e26"); assert.equal(R2_HISTORICAL_SNAPSHOT_SHA256, "10240f4f404c95fae71dc20b6599b14f83bcf3812173bd155d388ec76d6c6207");
  const plan = ready ? loadPlan() : []; assert.ok(plan.every(r => r.source.snapshot_sha256 === R2_HISTORICAL_SNAPSHOT_SHA256 && r.source.ops_commit === R2_OPS_COMMIT));
});

test("SIM: synthetic A1→A2→A3→B — A3 94 restored then B inserts; with an A3 failure, B requests = 0", { skip: !ready }, async () => {
  const plan = loadPlan(); const r2 = r2Expectations();
  const newRows: InsertAction[] = [1, 2, 3].map(i => ({ canonical_id: `gyeongju-VG08-9${i}`, city: "gyeongju", row: { city: "gyeongju", name: `n${i}`, category: "restaurant", source_type: "canonical", external_id: `gyeongju:gyeongju-VG08-9${i}`, is_published: false } } as unknown as InsertAction));
  const run = async (db: ReturnType<typeof fakeDb>) => {
    // A1/A2 (MATCH PATCH) simulated as already done; A3:
    const r = await stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2 });
    if (!restoreAllowsNextPhase(r)) throw new Error("blocked");
    const fetchB: FetchLike = async (url, init) => init.method === "GET" ? { ok: true, status: 200, text: async () => "[]" } : db.fetchLike(url, init);
    return stageInsertChunkSafe(fetchB, T, newRows);
  };
  const ok = fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan)); const ins = await run(ok); assert.equal(ins.length, 3); assert.equal(ok.posts(), 1);
  const bad = fakeDb(rowsFor(plan, r2, () => "R2"), bridgeFor(plan), { failPatchForId: plan[5]!.main_city_spot_id });
  await assert.rejects(run(bad)); assert.equal(bad.posts(), 0, "B requests = 0 after A3 failure");
  const drift = fakeDb(rowsFor(plan, r2, id => (id === plan[7]!.main_city_spot_id ? "THIRD" : "R2")), bridgeFor(plan));
  await assert.rejects(run(drift), /blocked/); assert.equal(drift.posts(), 0);
});

// ── R3-RESTORE-NUMERIC-TOLERANCE-FIX-V1: lat/lng serialization tolerance (REST-NUM-1..8 + SIM A/B) ──────────────────

// real Production false positives (#629 불난숯불갈비, #630 호성식육식당): R2 write value vs PostgREST 15-significant-digit read
const P629 = { lat: [35.80870976566988, 35.8087097656699], lng: [129.50019882758608, 129.500198827586] } as const;
const P630 = { lat: [35.80495516124354, 35.8049551612435], lng: [129.5021965778247, 129.502196577825] } as const;

test("REST-NUM-1/2/6: PostgREST lat/lng precision round-trip → same (real #629/#630 fixtures) · epsilon 1e-10 · scope lat/lng only", () => {
  assert.equal(COORD_SERIALIZATION_EPSILON, 1e-10); assert.deepEqual([...COORD_FIELDS].sort(), ["lat", "lng"]);
  for (const [f, [exp, cur]] of [...Object.entries(P629), ...Object.entries(P630)] as Array<[string, readonly [number, number]]>) {
    assert.ok(sameRestoreFieldValue(f, cur, exp), `${f} ${cur} ~ ${exp}`); assert.ok(!sameValue(cur, exp), "exact compare still differs (that was the false positive)");
  }
  assert.ok(sameRestoreFieldValue("lat", 35.8087097656699, 35.8087097656699 + 4.9e-13), "max observed Production delta 4.8e-13 is inside epsilon");
});

test("REST-NUM-3: meaningful coordinate delta (1e-7, 1e-6) → not same → DRIFT", () => {
  assert.ok(!sameRestoreFieldValue("lat", 35.80870986566988, 35.80870976566988), "1e-7 deg is drift");
  assert.ok(!sameRestoreFieldValue("lng", 129.50019982758608, 129.50019882758608), "1e-6 deg is drift");
  assert.ok(!sameRestoreFieldValue("lat", 35.82, 35.81));
});

test("REST-NUM-4/5: non-coordinate numeric tiny delta stays exact · null/type mismatches stay strict · NaN/Infinity never same", () => {
  assert.ok(!sameRestoreFieldValue("rating", 4.5, 4.5 + 1e-13)); assert.ok(!sameRestoreFieldValue("review_count", 607, 607.00000000001)); assert.ok(sameRestoreFieldValue("review_count", 607, 607));
  assert.ok(!sameRestoreFieldValue("lat", null, 0)); assert.ok(!sameRestoreFieldValue("lat", "35.8", 35.8)); assert.ok(!sameRestoreFieldValue("lng", null, 129.2)); assert.ok(sameRestoreFieldValue("lat", null, null));
  assert.ok(!sameRestoreFieldValue("lat", NaN, NaN)); assert.ok(!sameRestoreFieldValue("lat", Infinity, Infinity)); assert.ok(!sameRestoreFieldValue("lng", -Infinity, 129));
  assert.ok(sameRestoreFieldValue("name_l10n", { ko: "a", en: "b" }, { en: "b", ko: "a" }) && !sameRestoreFieldValue("name", "a", "a "));
});

test("REST-NUM-7: epsilon boundary deterministic — Δ = ε same · Δ just above ε not same · symmetric", () => {
  const a = 35.8; assert.ok(sameRestoreFieldValue("lat", a, a + 5e-11)); assert.ok(sameRestoreFieldValue("lat", a + 5e-11, a));   // Δ = ε/2 (exact-ε is not representable in binary floating point)
  assert.ok(!sameRestoreFieldValue("lat", a, a + 2e-10)); assert.ok(!sameRestoreFieldValue("lat", a + 2e-10, a));
  for (let i = 0; i < 3; i++) assert.equal(sameRestoreFieldValue("lng", 129.5, 129.5 + 5e-11), true);
});

test("REST-NUM-6/8 (classifier+writer): #629/#630 shape → NEEDS_RESTORE (lat/lng patched back to snapshot) · second run idempotent · real drift row blocks", { skip: !ready }, async () => {
  const plan = loadPlan(); const r2 = r2Expectations();
  const p629 = plan.find(p => p.main_city_spot_id === 629)!; const p630 = plan.find(p => p.main_city_spot_id === 630)!;
  const rows = rowsFor([p629, p630], r2, () => "R2").map(r => ({ ...r, lat: r.id === 629 ? P629.lat[1] : P630.lat[1], lng: r.id === 629 ? P629.lng[1] : P630.lng[1] }));   // PostgREST-rounded R2 values
  assert.equal(classifyRestoreState(p629, rows[0]!, 629, r2.get(629)!).state, "NEEDS_RESTORE"); assert.ok(classifyRestoreState(p629, rows[0]!, 629, r2.get(629)!).fields_to_patch.includes("lat"));
  const db = fakeDb(rows, bridgeFor([p629, p630]));
  const r = await stageRestoreChunk(db.fetchLike, T, [p629, p630], { expectedR2ByRow: r2 });
  assert.deepEqual([r.restored, r.drift, r.failed], [2, 0, 0]); assert.equal(db.table.get(629)!.lat, p629.before_values.lat); assert.equal(db.table.get(630)!.lng, p630.before_values.lng);
  const again = await stageRestoreChunk(db.fetchLike, T, [p629, p630], { expectedR2ByRow: r2 }); assert.deepEqual([again.restored, again.already_restored], [0, 2]);
  // SIM B: one row with a meaningful lat change (1e-6) → DRIFT, no PATCH for it, Phase B blocked
  const driftRows = rowsFor([p629, p630], r2, () => "R2").map(r => (r.id === 630 ? { ...r, lat: (r.lat as number) + 1e-6 } : r));
  const db2 = fakeDb(driftRows, bridgeFor([p629, p630])); const r2r = await stageRestoreChunk(db2.fetchLike, T, [p629, p630], { expectedR2ByRow: r2 });
  assert.deepEqual([r2r.restored, r2r.drift], [1, 1]); assert.ok(!restoreAllowsNextPhase(r2r)); assert.ok(!db2.patches().some(p => p.url.includes("id=eq.630"))); assert.equal(db2.posts(), 0);
});

test("SIM-A: 94 rows at R2 state with PostgREST-rounded coordinates (15 significant digits) → NEEDS_RESTORE 94 · DRIFT 0 · PATCH eligible 94", { skip: !ready }, async () => {
  const plan = loadPlan(); const r2 = r2Expectations();
  const round15 = (x: unknown) => (typeof x === "number" ? Number(x.toPrecision(15)) : x);
  const rows = rowsFor(plan, r2, () => "R2").map(r => ({ ...r, lat: round15(r.lat), lng: round15(r.lng) }));
  const db = fakeDb(rows, bridgeFor(plan)); const r = await stageRestoreChunk(db.fetchLike, T, plan, { expectedR2ByRow: r2 });
  assert.deepEqual([r.planned, r.restored, r.drift, r.identity_mismatch, r.failed], [94, 94, 0, 0, 0]); assert.ok(restoreAllowsNextPhase(r)); assert.equal(db.patches().length, 94);
});

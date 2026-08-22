/**
 * import-five-city-core-v1 — 5도시 core intake 의 ID-보존 importer
 * (… → TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1: sources/images writer · pre-stage snapshot · chunk receipt · user-count guard · NEW false 사후검증)
 *
 * Run
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --dry-run                 (기본 · DB 0)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --stage-plan              (STAGE chunk 계획 + relation preflight · DB 0)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --publish-sql --mapping <production-id-mapping.jsonl> --out <dir>   (SQL 생성만 · DB 0)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --pre-stage-snapshot --expected-db-count <n>                         (Production READ-ONLY)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --stage --confirm-manifest-hash <sha256> --expected-db-count <n>      (Production write — 가드 전부 통과 시에만)
 *
 * OWNER DATA TRUST (STAGE-WRITER-COMPLETION-V1): FINAL VALIDATED ARTIFACT > LEGACY · 기존 numeric id 보존 ≠ legacy 콘텐츠 보존.
 *   Final 값 → UPDATE · INTENTIONALLY_CLEAR → null · NO_SOURCE_VALUE → payload 제외(no-op, legacy 승인 아님) — null-policy.ts 그대로.
 *   Final 에 없는 legacy source 는 is_primary=false, legacy image 는 display_eligible=false/is_primary=false 로 보존·비노출. DELETE 0.
 *
 * 기대값은 package 선언값(input manifest + crosswalk summary)에서 유도한다. 실제 write 는 (1) env FIVE_CITY_CORE_APPLY=YES (2) --confirm-manifest-hash
 * (3) env FIVE_CITY_CORE_TARGET_HOST == Supabase host (4) SUPABASE_SERVICE_ROLE_KEY (5) --expected-db-count == 사전 READ (6) is_published 컬럼 (7) dry-run OK
 * (8) repo runtime contract DISCOVERY_VISIBILITY_GATE_ENABLED === true (9) pre-stage snapshot 은 STAGE 직전 항상 새로 생성(462 = MATCH 전체, stale 재사용 없음)
 * 057/058(index 존재/부재)은 PostgREST 로 introspection 불가 → importer 가드가 아니라 runbook §6-1a 의 READ-ONLY PRECHECK(SQL Editor/Management API SELECT)로 STAGE 직전 사람이 확인한다.
 * (8) relation preflight 충돌 0 — 전부 맞아야 한다. DELETE 기능 없음. 사용자 테이블은 count 만 읽는다. secrets 출력 없음.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planImport, changeManifestRows, HIDE_CLASSES, OWNER_OVERRIDE_CLASS, type CrosswalkRow, type ImageRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow, type SourceRow } from "../src/lib/main-intake/importer-core.ts";
import { deriveExpectedCounts, assertPlanMatchesExpected, type CrosswalkSummary, type InputManifest } from "../src/lib/main-intake/manifest-expectations.ts";
import { buildStagePlan } from "../src/lib/main-intake/stage-plan.ts";
import { buildPublishCutoverSql } from "../src/lib/main-intake/publish-sql.ts";
import { stageInsertChunkSafe, stageUpdateRow, type FetchLike } from "../src/lib/main-intake/stage-rest-writer.ts";
import { resolveRelationTargets, preflightRelations, syncSourcesChunk, syncImagesChunk } from "../src/lib/main-intake/stage-relations.ts";
import { buildPreStageSnapshot, assertSnapshotComplete, chunkReceipt, receiptsSha, readUserTableCounts, userCountsDiff, verifyNewUnpublished, type ChunkReceipt } from "../src/lib/main-intake/stage-safety.ts";
import { DISCOVERY_VISIBILITY_GATE_ENABLED } from "../src/lib/city-spots-visibility.ts";
import { chunk } from "../src/lib/city-spots-paging.ts";

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
const pkg = resolve(arg("--package") ?? "data/main-intake/five-city-core-v1");
const mode = flags.has("--stage") ? "stage" : flags.has("--pre-stage-snapshot") ? "pre-stage-snapshot" : flags.has("--publish-sql") ? "publish-sql" : flags.has("--stage-plan") ? "stage-plan" : flags.has("--apply") ? "apply-legacy" : "dry-run";

function sha256(buf: Buffer | string): string { return createHash("sha256").update(buf).digest("hex"); }
function readJsonl<T>(p: string): T[] { return readFileSync(p, "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T); }

// ── 1. manifest 검증 ───────────────────────────────────────────────────────
const manifestPath = join(pkg, "five-city-core-input-manifest-v1.json");
if (!existsSync(manifestPath)) { console.error(`manifest not found: ${manifestPath}`); process.exit(2); }
const manifestRaw = readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString("utf8")) as InputManifest;
const manifestHash = sha256(manifestRaw);
const mismatches: string[] = [];
for (const [k, o] of Object.entries(manifest.outputs)) {
  const p = join(pkg, o.path);
  if (!existsSync(p)) { mismatches.push(`${k}: missing ${o.path}`); continue; }
  if (sha256(readFileSync(p)) !== o.sha256) mismatches.push(`${k}: sha256 mismatch (${o.path})`);
}
{
  const p = join(pkg, manifest.main_snapshot.path);
  if (!existsSync(p) || sha256(readFileSync(p)) !== manifest.main_snapshot.sha256) mismatches.push("main_snapshot: sha256 mismatch");
}
if (mismatches.length > 0) { console.error("INPUT_MANIFEST_MISMATCH\n" + mismatches.join("\n")); process.exit(3); }
if (mode === "apply-legacy") { console.error("APPLY_REFUSED: --apply is retired; use --stage-plan / --publish-sql (write modes are guarded separately)."); process.exit(4); }

// ── 2. 입력 + package 선언값 ──────────────────────────────────────────────
const intake = readJsonl<IntakeRow>(join(pkg, manifest.outputs.active.path));
const sources = readJsonl<SourceRow>(join(pkg, manifest.outputs.sources.path));
const images = readJsonl<ImageRow>(join(pkg, manifest.outputs.images.path));
const crosswalk = readJsonl<CrosswalkRow>(join(pkg, manifest.outputs.crosswalk.path));
const main = readJsonl<MainSnapshotRow>(join(pkg, manifest.main_snapshot.path));
const mainClassification = readJsonl<MainClassificationRow>(join(pkg, manifest.outputs.main_classification.path));
const summary = JSON.parse(readFileSync(join(pkg, "five-city-core-crosswalk-summary-v1.json"), "utf8")) as CrosswalkSummary;
const expected = deriveExpectedCounts(manifest, summary);

// ── 3. 계획 ────────────────────────────────────────────────────────────────
const plan = planImport({ intake, sources, images, crosswalk, main, mainClassification, expectedActiveTotal: expected.active_total });
const diffs = assertPlanMatchesExpected(plan.counts, expected);
const projectedTotal = Object.values(plan.per_city).reduce((a, c) => a + c.projected_after, 0);
const projectedVisible = Object.values(plan.per_city).reduce((a, c) => a + c.visible_after, 0);
const projectedHidden = Object.values(plan.per_city).reduce((a, c) => a + c.hidden_after, 0);
// relation preflight (NEW 는 placeholder 음수 id 로 구조 검사 — 실제 id 는 STAGE 에서 확정)
const placeholderIds = new Map(plan.inserts.map((i, idx) => [i.canonical_id, -(idx + 1)]));
const relPlan = resolveRelationTargets({ sources, images, crosswalk, newIdByCanonical: placeholderIds });
const relPre = preflightRelations(relPlan);
const relationOk = relPre.source_unresolved === 0 && relPre.image_unresolved === 0 && relPre.source_conflicts.length === 0 && relPre.image_conflicts.length === 0 && relPre.rights_violations.length === 0 && relPre.source_primary_conflicts === 0 && relPre.image_primary_conflicts === 0;
const arithmeticOk = diffs.length === 0
  && plan.counts.match_replace + plan.counts.new + plan.counts.confirmed_twin_skipped + plan.counts.review_required_skipped === plan.counts.active_input
  && plan.counts.heuristic_twin_auto_merge === 0 && plan.counts.evidenceless_skip === 0
  && plan.visibility.hide_legacy === expected.hide_legacy && relationOk;

// ── 4. dry-run 산출 (결정적) ───────────────────────────────────────────────
const outDir = join(pkg, "dry-run");
mkdirSync(outDir, { recursive: true });
const manifestRows = changeManifestRows(plan);
const changeText = manifestRows.map(r => JSON.stringify(r)).join("\n") + "\n";
const runId = sha256(manifestHash + changeText).slice(0, 16);
writeFileSync(join(outDir, "five-city-core-change-manifest-v1.jsonl"), changeText, "utf8");
const idMap = [
  ...plan.updates.map(u => ({ canonical_id: u.canonical_id, city: u.city, main_city_spot_id: u.main_city_spot_id, action: "UPDATE" })),
  ...plan.inserts.map(i => ({ canonical_id: i.canonical_id, city: i.city, main_city_spot_id: i.placeholder_id, external_id: i.row.external_id, action: "INSERT" })),
].sort((a, b) => (a.canonical_id < b.canonical_id ? -1 : 1));
writeFileSync(join(outDir, "five-city-core-id-mapping-v1.jsonl"), idMap.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-skipped-v1.jsonl"), plan.skips.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-errors-v1.json"), JSON.stringify([...plan.errors, ...diffs, ...relPre.source_conflicts, ...relPre.image_conflicts, ...relPre.rights_violations], null, 1) + "\n", "utf8");
const stagePlan = buildStagePlan(plan, runId, manifestHash);
const dryRunSummary = {
  task: "TASK-FIVE-CITY-CORE-STAGE-WRITER-COMPLETION-V1",
  mode,
  input_manifest_sha256: manifestHash,
  run_id: runId,
  expected_from_manifest: expected,
  manifest_assertion_diffs: diffs,
  counts: plan.counts,
  arithmetic_ok: arithmeticOk,
  artifact_trust: {
    SOURCE_ACTIVE_RECORD_COUNT: plan.counts.active_input, ARTIFACT_CONFIRMED_SAME_ENTITY_SKIP_COUNT: plan.counts.confirmed_twin_skipped, REVIEW_REQUIRED_COUNT: plan.counts.review_required_skipped,
    ACTIVE_DISTINCT_COUNT: plan.counts.active_distinct, WRITEABLE_ACTIVE_COUNT: plan.counts.writeable_active, HEURISTIC_TWIN_AUTO_MERGE_COUNT: plan.counts.heuristic_twin_auto_merge, ARTIFACT_EVIDENCELESS_SKIP_COUNT: plan.counts.evidenceless_skip,
    decision_basis: crosswalk.filter(c => c.service_status === "ACTIVE").reduce<Record<string, number>>((a, c) => { const k = c.decision_basis ?? "none"; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  },
  data_trust_policy: { final_over_legacy: true, legacy_numeric_id_preserved: true, no_source_value: "payload 제외(no-op; legacy 승인 아님)", intentionally_clear: "null", legacy_image_fallback: false, legacy_source_auto_carry: false, delete: 0 },
  identity: { new_row_strategy: "lookup-before-insert on city_spots.(source_type, external_id) partial UNIQUE + conflict re-lookup", source_type: "canonical", external_id_format: "<city>:<canonical_id>", package_version_coupled: false },
  stage_plan: { chunks: stagePlan.chunks.length, update_chunks: stagePlan.counts.update_chunks, insert_chunks: stagePlan.counts.insert_chunks, new_staged_unpublished: stagePlan.counts.new_staged_unpublished, legacy_hidden_in_stage: 0, plan_sha256: stagePlan.plan_sha256 },
  relation_preflight: { ...relPre, skipped_not_written_rows: relPlan.skipped_not_written, source_conflict_count: relPre.source_conflicts.length, image_conflict_count: relPre.image_conflicts.length, rights_violation_count: relPre.rights_violations.length },
  constraint_blockers: {
    current_schema: "uq_city_spots_city_name removed by 057 (applied 2026-08-22) — collisions below are informational only",
    city_name_collision_count: plan.constraint_blockers.city_name_collisions.length, city_name_collisions: plan.constraint_blockers.city_name_collisions, display_name_artificial_rename_count: 0,
  },
  gate_b_visibility: { ...plan.visibility, projected_visible_rows: projectedVisible, projected_hidden_rows: projectedHidden, gate_column: "is_published", migration: "056 applied 2026-08-22" },
  gate_c_category: { lossy_mapping_count: plan.counts.lossy_category },
  per_city: plan.per_city,
  projected_total_city_spots: projectedTotal,
  null_policy_counts: plan.null_policy_counts,
  sources_upserts: relPre.source_planned,
  images_upserts: relPre.image_planned,
  change_manifest_sha256: sha256(changeText),
  errors: plan.errors.length + diffs.length + relPre.source_conflicts.length + relPre.image_conflicts.length + relPre.rights_violations.length,
  delete_actions: 0,
  db_write_executed: false,
};
writeFileSync(join(outDir, "five-city-core-dry-run-summary-v1.json"), JSON.stringify(dryRunSummary, null, 1) + "\n", "utf8");
if (mode === "dry-run") { console.log(JSON.stringify(dryRunSummary, null, 1)); if (!arithmeticOk || plan.errors.length > 0) process.exit(1); }

// ── 5. --stage-plan ────────────────────────────────────────────────────────
if (mode === "stage-plan") {
  writeFileSync(join(outDir, "five-city-core-stage-plan-v1.json"), JSON.stringify({ ...stagePlan, insert_keys: undefined, chunks: stagePlan.chunks.map(c => ({ index: c.index, kind: c.kind, count: c.keys.length, sha256: c.sha256 })), relation_preflight: dryRunSummary.relation_preflight }, null, 1) + "\n", "utf8");
  console.log(JSON.stringify({ mode, run_id: runId, ...stagePlan.counts, sources_planned: relPre.source_planned, images_planned: relPre.image_planned, relation_ok: relationOk, plan_sha256: stagePlan.plan_sha256, db_write_executed: false }, null, 1));
  if (!arithmeticOk) process.exit(1);
}

// ── 6. --publish-sql ───────────────────────────────────────────────────────
if (mode === "publish-sql") {
  const mappingPath = arg("--mapping"); const out = arg("--out");
  if (!mappingPath || !out) { console.error("--publish-sql requires --mapping <production-id-mapping.jsonl> --out <dir>"); process.exit(2); }
  const mapping = readJsonl<{ canonical_id: string; actual_city_spot_id: number; operation: string; run_id: string }>(mappingPath);
  const newIds = mapping.filter(m => m.operation === "INSERT").map(m => m.actual_city_spot_id);
  const expectedNew = new Set(plan.inserts.map(i => i.canonical_id));
  const mapped = new Set(mapping.filter(m => m.operation === "INSERT").map(m => m.canonical_id));
  if (mapped.size !== expectedNew.size || [...expectedNew].some(c => !mapped.has(c))) { console.error(`mapping INSERT set (${mapped.size}) != plan NEW set (${expectedNew.size})`); process.exit(1); }
  const hideIds = mainClassification.filter(m => (HIDE_CLASSES as readonly string[]).includes(m.class)).map(m => m.main_city_spot_id);
  const keepIds = mainClassification.filter(m => m.class === "LEGACY_ONLY_VALID" || m.class === OWNER_OVERRIDE_CLASS).map(m => m.main_city_spot_id);
  const r = buildPublishCutoverSql({ run_id: runId, manifest_sha256: manifestHash, new_ids: newIds, hide_ids: hideIds, keep_ids: keepIds });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `publish-cutover-${runId}.sql`), r.sql, "utf8");
  writeFileSync(join(out, `publish-rollback-${runId}.sql`), r.rollback_sql, "utf8");
  console.log(JSON.stringify({ mode, run_id: runId, new_count: r.new_count, hide_count: r.hide_count, keep_count: r.keep_count, sql_sha256: sha256(r.sql), db_write_executed: false }, null, 1));
}

// ── 7. Production target (READ/WRITE 모드 공통 가드) ────────────────────────
function productionTarget(requireApply: boolean): { url: string; serviceKey: string; runDir: string } {
  const confirm = arg("--confirm-manifest-hash");
  const host = process.env.FIVE_CITY_CORE_TARGET_HOST ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const refuse = (why: string): never => { console.error(`${requireApply ? "STAGE" : "SNAPSHOT"}_REFUSED: ${why}`); process.exit(4); };
  if (requireApply && process.env.FIVE_CITY_CORE_APPLY !== "YES") refuse("env FIVE_CITY_CORE_APPLY=YES required");
  if (requireApply && confirm !== manifestHash) refuse("--confirm-manifest-hash must equal sha256(input manifest)");
  if (requireApply && DISCOVERY_VISIBILITY_GATE_ENABLED !== true) refuse("DISCOVERY_VISIBILITY_GATE_ENABLED must be true in the approved runtime contract (NEW rows would be discoverable)");
  if (!arithmeticOk || plan.errors.length > 0) refuse("plan arithmetic/errors/relation preflight");
  if (!url || !key) refuse("target url / service key missing");
  if (!host || new URL(url).host !== host) refuse("FIVE_CITY_CORE_TARGET_HOST must equal the Supabase host (explicit Production target)");
  const runDir = join(pkg, "production-runs", runId);
  mkdirSync(runDir, { recursive: true });
  return { url, serviceKey: key, runDir };
}
const fetchLike: FetchLike = (u, init) => fetch(u, init);
async function readCount(url: string, key: string, table = "city_spots"): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" } });
  return Number((res.headers.get("content-range") ?? "/NaN").split("/")[1]);
}

// ── 8. --pre-stage-snapshot (Production READ-ONLY) ─────────────────────────
if (mode === "pre-stage-snapshot") {
  const t = productionTarget(false);
  (async () => {
    const expectedDb = Number(arg("--expected-db-count") ?? "NaN");
    const pre = await readCount(t.url, t.serviceKey);
    if (Number.isInteger(expectedDb) && pre !== expectedDb) { console.error(`SNAPSHOT_REFUSED: db count ${pre} != expected ${expectedDb}`); process.exit(4); }
    const snap = await buildPreStageSnapshot(fetchLike, t, plan.updates, manifestHash, new Date().toISOString());
    writeFileSync(join(t.runDir, "pre-stage-match-snapshot-v1.jsonl"), snap.text, "utf8");
    const userPre = await readUserTableCounts(fetchLike, t);
    writeFileSync(join(t.runDir, "user-table-counts-pre-v1.json"), JSON.stringify({ run_id: runId, counts: userPre }, null, 1) + "\n", "utf8");
    console.log(JSON.stringify({ mode, run_id: runId, db_count: pre, snapshot_rows: snap.rows.length, snapshot_sha256: snap.sha256, user_counts: userPre, db_write_executed: false }, null, 1));
  })().catch(e => { console.error("SNAPSHOT_FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
}

// ── 9. --stage (Production write — 이 TASK 에서는 실행하지 않는다) ──────────
if (mode === "stage") {
  const t = productionTarget(true);
  const expectedDb = Number(arg("--expected-db-count") ?? "NaN");
  if (!Number.isInteger(expectedDb)) { console.error("STAGE_REFUSED: --expected-db-count <n> required (pre-stage READ)"); process.exit(4); }
  (async () => {
    const receipts: ChunkReceipt[] = [];
    const now = () => new Date().toISOString();
    const preCount = await readCount(t.url, t.serviceKey);
    if (preCount !== expectedDb) { console.error(`STAGE_REFUSED: pre-stage count ${preCount} != expected ${expectedDb}`); process.exit(4); }
    const col = await fetch(`${t.url}/rest/v1/city_spots?select=is_published&limit=1`, { headers: { apikey: t.serviceKey, Authorization: `Bearer ${t.serviceKey}` } });
    if (col.status !== 200) { console.error("STAGE_REFUSED: is_published column absent — migration 056 not applied"); process.exit(4); }
    // snapshot + user counts (pre) — STAGE 직전 상태여야 하므로 기존 파일이 있어도 항상 새로 생성(stale 재사용 0). MATCH 전체(462)가 아니면 쓰기 전 거부.
    const snapPath = join(t.runDir, "pre-stage-match-snapshot-v1.jsonl");
    const snap = await buildPreStageSnapshot(fetchLike, t, plan.updates, manifestHash, now());
    assertSnapshotComplete(snap.rows, plan.updates.map(u => u.main_city_spot_id));
    writeFileSync(snapPath, snap.text, "utf8");
    const userPre = await readUserTableCounts(fetchLike, t);
    writeFileSync(join(t.runDir, "user-table-counts-pre-v1.json"), JSON.stringify({ run_id: runId, counts: userPre, captured_at: now() }, null, 1) + "\n", "utf8");
    // Phase A — MATCH UPDATE (기존 id · source-owned 필드만 · is_published/source_type/external_id 미전송)
    let updated = 0;
    for (const [ci, part] of chunk(plan.updates, 100).entries()) {
      for (const u of part) { await stageUpdateRow(fetchLike, t, u); updated += 1; }
      receipts.push(chunkReceipt({ phase: "MATCH_CITY_SPOTS", chunk_index: ci, expected: part.length, looked_up: 0, reused: 0, updated: part.length, inserted: 0, unchanged: 0, suppressed: 0, failed: 0, retry_count: 0, timestamp: now() }, part.map(u => u.main_city_spot_id)));
    }
    // Phase B — NEW lookup-before-insert (is_published=false)
    const mapping: string[] = []; const newIdByCanonical = new Map<string, number>(); let inserted = 0, reused = 0;
    const byExt = new Map(plan.inserts.map(i => [String(i.row.external_id), i]));
    for (const c of stagePlan.chunks.filter(c => c.kind === "INSERT")) {
      const rows = c.keys.map(k => { const i = byExt.get(String(k)); if (!i) throw new Error(`chunk key ${String(k)} not in plan`); return { ...i, row: { ...i.row, is_published: false } }; });
      const res = await stageInsertChunkSafe(fetchLike, t, rows);
      for (const r of res) { const i = byExt.get(r.external_id)!; newIdByCanonical.set(i.canonical_id, r.id); if (r.reused_existing) reused += 1; else inserted += 1;
        mapping.push(JSON.stringify({ run_id: runId, canonical_id: i.canonical_id, city: i.city, source_type: "canonical", external_id: r.external_id, actual_city_spot_id: r.id, operation: "INSERT", reused_existing: r.reused_existing, is_published: false, manifest_hash: manifestHash, staged_at: now() })); }
      writeFileSync(join(t.runDir, "production-id-mapping-v1.jsonl"), mapping.join("\n") + "\n", "utf8");
      receipts.push(chunkReceipt({ phase: "NEW_CITY_SPOTS", chunk_index: c.index, expected: c.keys.length, looked_up: c.keys.length, reused: res.filter(x => x.reused_existing).length, updated: 0, inserted: res.filter(x => !x.reused_existing).length, unchanged: 0, suppressed: 0, failed: 0, retry_count: 0, timestamp: now() }, c.keys));
    }
    // Phase C/D — relations with actual ids
    const rel = resolveRelationTargets({ sources, images, crosswalk, newIdByCanonical });
    const pre2 = preflightRelations(rel);
    if (rel.unresolved.length > 0 || pre2.source_conflicts.length || pre2.image_conflicts.length || pre2.rights_violations.length) throw new Error(`relation preflight failed after mapping: unresolved=${rel.unresolved.length}`);
    const srcTotals = { planned: rel.sources.length, reused_exact: 0, updated_to_final: 0, inserted: 0, unchanged: 0, legacy_demoted: 0, failed: 0 };
    const sourceIdByKey = new Map<string, number>();
    const bySpot = new Map<number, typeof rel.sources>();
    for (const s of rel.sources) bySpot.set(s.city_spot_id, [...(bySpot.get(s.city_spot_id) ?? []), s]);
    for (const [ci, spots] of chunk([...bySpot.keys()].sort((a, b) => a - b), 50).entries()) {
      const finals = spots.flatMap(id => bySpot.get(id)!);
      const r = await syncSourcesChunk(fetchLike, t, finals);
      for (const k of ["reused_exact", "updated_to_final", "inserted", "unchanged", "legacy_demoted", "failed"] as const) srcTotals[k] += r[k];
      for (const [k, v] of r.sourceIdByKey) sourceIdByKey.set(k, v);
      receipts.push(chunkReceipt({ phase: "SOURCES", chunk_index: ci, expected: finals.length, looked_up: finals.length, reused: r.reused_exact, updated: r.updated_to_final, inserted: r.inserted, unchanged: r.unchanged, suppressed: r.legacy_demoted, failed: r.failed, retry_count: 0, timestamp: now() }, finals.map(s => `${s.source_type}|${s.source_key}`)));
    }
    const primarySourceKey = new Map<string, string>();
    for (const s of rel.sources) if (s.is_primary) primarySourceKey.set(s.canonical_id, `${s.source_type}|${s.source_key}`);
    const sourceIdForCanonical = (cid: string) => { const k = primarySourceKey.get(cid); return k ? (sourceIdByKey.get(k) ?? null) : null; };
    const imgTotals = { planned: rel.images.length, reused_exact: 0, updated_to_final: 0, inserted: 0, unchanged: 0, legacy_suppressed: 0, failed: 0 };
    const imgBySpot = new Map<number, typeof rel.images>();
    for (const i of rel.images) imgBySpot.set(i.city_spot_id, [...(imgBySpot.get(i.city_spot_id) ?? []), i]);
    // MATCH spot 중 Final image 가 없는 spot 도 범위에 넣어 legacy image 를 비노출한다
    const matchSpots = plan.updates.map(u => u.main_city_spot_id);
    const imageScope = [...new Set([...imgBySpot.keys(), ...matchSpots])].sort((a, b) => a - b);
    for (const [ci, spots] of chunk(imageScope, 50).entries()) {
      const finals = spots.flatMap(id => imgBySpot.get(id) ?? []);
      const r = await syncImagesChunk(fetchLike, t, finals, sourceIdForCanonical, spots);
      for (const k of ["reused_exact", "updated_to_final", "inserted", "unchanged", "legacy_suppressed", "failed"] as const) imgTotals[k] += r[k];
      receipts.push(chunkReceipt({ phase: "IMAGES", chunk_index: ci, expected: finals.length, looked_up: spots.length, reused: r.reused_exact, updated: r.updated_to_final, inserted: r.inserted, unchanged: r.unchanged, suppressed: r.legacy_suppressed, failed: r.failed, retry_count: 0, timestamp: now() }, finals.map(i => `${i.city_spot_id}|${i.image_url}`)));
    }
    // Phase E — verify
    const postCount = await readCount(t.url, t.serviceKey);
    const unpub = await verifyNewUnpublished(fetchLike, t, [...newIdByCanonical.values()]);
    const userPost = await readUserTableCounts(fetchLike, t);
    const userDiff = userCountsDiff(userPre, userPost);
    receipts.push(chunkReceipt({ phase: "VERIFY", chunk_index: 0, expected: plan.inserts.length, looked_up: unpub.checked, reused: 0, updated: 0, inserted: 0, unchanged: 0, suppressed: 0, failed: unpub.published_true + unpub.missing + userDiff.length, retry_count: 0, timestamp: now() }, [postCount, unpub.published_true, unpub.missing]));
    writeFileSync(join(t.runDir, "stage-chunk-receipts-v1.jsonl"), receipts.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
    const receipt = {
      run_id: runId, production_source_commit: process.env.RELEASE_SHA ?? null, input_manifest_sha256: manifestHash, change_manifest_sha256: dryRunSummary.change_manifest_sha256, stage_plan_sha256: stagePlan.plan_sha256,
      db_pre_count: preCount, db_post_count: postCount, pre_stage_snapshot: { rows: snap.rows.length, sha256: snap.sha256, fresh: true }, match_planned: plan.updates.length, match_completed: updated, new_planned: plan.inserts.length, new_inserted: inserted, new_reused_existing: reused, new_staged_total: newIdByCanonical.size,
      same_source_skipped: plan.counts.confirmed_twin_skipped, sources: srcTotals, images: imgTotals, mapping_rows: mapping.length,
      new_unpublished_check: unpub, user_table_counts: { pre: userPre, post: userPost, diff: userDiff }, delete_count: 0, error_count: unpub.published_true + unpub.missing + userDiff.length,
      id_mapping_sha256: sha256(mapping.join("\n") + "\n"), chunk_receipts_sha256: receiptsSha(receipts), legacy_newly_hidden: 0,
    };
    writeFileSync(join(t.runDir, "stage-receipt-v1.json"), JSON.stringify(receipt, null, 1) + "\n", "utf8");
    console.log(JSON.stringify(receipt, null, 1));
    if (receipt.error_count > 0 || postCount !== preCount + inserted) process.exit(1);
  })().catch(e => { console.error("STAGE_FAILED (PUBLISH forbidden; NEW rows stay unpublished; rerun resumes by lookup):", e instanceof Error ? e.message : String(e)); process.exit(1); });
}

/**
 * import-five-city-core-v1 — 5도시 core intake 의 ID-보존 importer
 * (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 → PREPROD-GATE → ARTIFACT-TRUST → FINAL-ALIGNMENT
 *  → TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1: manifest-derived counts · STAGE plan · PUBLISH SQL generator)
 *
 * Run
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --dry-run                 (기본)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --stage-plan              (STAGE chunk 계획만 — DB 0)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --publish-sql --mapping <production-id-mapping.jsonl> --out <dir>
 *                                                                                                 (cutover SQL 생성만 — DB 0)
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --stage --confirm-manifest-hash <sha256> --expected-db-count <n>
 *                                                                                                 (Production write — 이 TASK 에서는 실행 금지)
 *
 * 기대값은 코드 상수가 아니라 package 가 선언한 값(input manifest + crosswalk summary)에서 유도한다(R1 §15~16).
 *   → 5도시(4,826)든 다음 package(532)든 같은 importer. 선언값과 계획이 다르면 exit 1.
 *
 * 안전 장치
 *   · NEW 행 identity: lookup-before-insert(source_type=canonical, external_id=<city>:<canonical_id>) + unique 충돌 재조회 복구.
 *     PostgREST on_conflict 는 partial unique index(idx_city_spots_source_external WHERE external_id IS NOT NULL)를 추론하지 못한다(42P10 실측).
 *   · --stage 는 (1) env FIVE_CITY_CORE_APPLY=YES (2) --confirm-manifest-hash (3) env FIVE_CITY_CORE_TARGET_HOST 가 실제 Supabase
 *     host 와 일치 (4) SUPABASE_SERVICE_ROLE_KEY 존재 (5) --expected-db-count 가 사전 READ 와 일치 (6) is_published 컬럼 존재(056)
 *     — 전부 맞아야 write 한다. 이 TASK(R1) 시점에는 056 미적용이라 구조적으로 거부된다.
 *   · DELETE/RETIRE 기능 없음. 사용자 테이블 접근 없음. secrets 출력 없음.
 *   · PUBLISH 는 SQL 스크립트 생성만(사람이 SQL Editor 에서 단일 트랜잭션으로 실행).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planImport, changeManifestRows, HIDE_CLASSES, OWNER_OVERRIDE_CLASS, type CrosswalkRow, type ImageRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow, type SourceRow } from "../src/lib/main-intake/importer-core.ts";
import { deriveExpectedCounts, assertPlanMatchesExpected, type CrosswalkSummary, type InputManifest } from "../src/lib/main-intake/manifest-expectations.ts";
import { buildStagePlan } from "../src/lib/main-intake/stage-plan.ts";
import { buildPublishCutoverSql } from "../src/lib/main-intake/publish-sql.ts";
import { stageInsertChunkSafe, stageUpdateRow, type FetchLike } from "../src/lib/main-intake/stage-rest-writer.ts";

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
const pkg = resolve(arg("--package") ?? "data/main-intake/five-city-core-v1");
const mode = flags.has("--stage") ? "stage" : flags.has("--publish-sql") ? "publish-sql" : flags.has("--stage-plan") ? "stage-plan" : flags.has("--apply") ? "apply-legacy" : "dry-run";

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
const arithmeticOk = diffs.length === 0
  && plan.counts.match_replace + plan.counts.new + plan.counts.confirmed_twin_skipped + plan.counts.review_required_skipped === plan.counts.active_input
  && plan.counts.heuristic_twin_auto_merge === 0 && plan.counts.evidenceless_skip === 0
  && plan.visibility.hide_legacy === expected.hide_legacy;

// ── 4. dry-run 산출 (결정적: 시각 없음, 정렬 고정) ─────────────────────────
const outDir = join(pkg, "dry-run");
mkdirSync(outDir, { recursive: true });
const manifestRows = changeManifestRows(plan);
const changeText = manifestRows.map(r => JSON.stringify(r)).join("\n") + "\n";
const runId = sha256(manifestHash + changeText).slice(0, 16);   // 입력+계획의 해시 — 같은 입력이면 같은 run id
writeFileSync(join(outDir, "five-city-core-change-manifest-v1.jsonl"), changeText, "utf8");
const idMap = [
  ...plan.updates.map(u => ({ canonical_id: u.canonical_id, city: u.city, main_city_spot_id: u.main_city_spot_id, action: "UPDATE" })),
  ...plan.inserts.map(i => ({ canonical_id: i.canonical_id, city: i.city, main_city_spot_id: i.placeholder_id, external_id: i.row.external_id, action: "INSERT" })),
].sort((a, b) => (a.canonical_id < b.canonical_id ? -1 : 1));
writeFileSync(join(outDir, "five-city-core-id-mapping-v1.jsonl"), idMap.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-skipped-v1.jsonl"), plan.skips.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-errors-v1.json"), JSON.stringify([...plan.errors, ...diffs], null, 1) + "\n", "utf8");
const stagePlan = buildStagePlan(plan, runId, manifestHash);
const dryRunSummary = {
  task: "TASK-FIVE-CITY-CORE-RELEASE-PREREQUISITES-V1-R1",
  mode,
  input_manifest_sha256: manifestHash,
  run_id: runId,
  expected_from_manifest: expected,
  manifest_assertion_diffs: diffs,
  counts: plan.counts,
  arithmetic_ok: arithmeticOk,
  artifact_trust: {
    SOURCE_ACTIVE_RECORD_COUNT: plan.counts.active_input,
    ARTIFACT_CONFIRMED_SAME_ENTITY_SKIP_COUNT: plan.counts.confirmed_twin_skipped,
    REVIEW_REQUIRED_COUNT: plan.counts.review_required_skipped,
    ACTIVE_DISTINCT_COUNT: plan.counts.active_distinct,
    WRITEABLE_ACTIVE_COUNT: plan.counts.writeable_active,
    HEURISTIC_TWIN_AUTO_MERGE_COUNT: plan.counts.heuristic_twin_auto_merge,
    ARTIFACT_EVIDENCELESS_SKIP_COUNT: plan.counts.evidenceless_skip,
    decision_basis: crosswalk.filter(c => c.service_status === "ACTIVE").reduce<Record<string, number>>((a, c) => { const k = c.decision_basis ?? "none"; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  },
  identity: { new_row_strategy: "city_spots.(source_type, external_id) UNIQUE idx_city_spots_source_external", source_type: "canonical", external_id_format: "<city>:<canonical_id>", package_version_coupled: false },
  stage_plan: { chunks: stagePlan.chunks.length, update_chunks: stagePlan.counts.update_chunks, insert_chunks: stagePlan.counts.insert_chunks, new_staged_unpublished: stagePlan.counts.new_staged_unpublished, legacy_hidden_in_stage: 0, plan_sha256: stagePlan.plan_sha256 },
  constraint_blockers: {
    current_schema: "uq_city_spots_city_name (013) — migration 057 적용 전까지 아래 충돌은 INSERT/UPDATE blocker",
    city_name_collision_count: plan.constraint_blockers.city_name_collisions.length,
    city_name_collisions: plan.constraint_blockers.city_name_collisions,
    display_name_artificial_rename_count: 0,
  },
  gate_b_visibility: { ...plan.visibility, projected_visible_rows: projectedVisible, projected_hidden_rows: projectedHidden, gate_column: "is_published", migration: "056_city_spots_is_published.sql (created, NOT applied)" },
  gate_c_category: { lossy_mapping_count: plan.counts.lossy_category },
  per_city: plan.per_city,
  projected_total_city_spots: projectedTotal,
  null_policy_counts: plan.null_policy_counts,
  sources_upserts: plan.updates.reduce((a, u) => a + u.sources_upsert, 0) + plan.inserts.reduce((a, i) => a + i.sources_upsert, 0),
  images_upserts: plan.updates.reduce((a, u) => a + u.images_upsert, 0) + plan.inserts.reduce((a, i) => a + i.images_upsert, 0),
  change_manifest_sha256: sha256(changeText),
  errors: plan.errors.length + diffs.length,
  delete_actions: 0,
  db_write_executed: false,
};
writeFileSync(join(outDir, "five-city-core-dry-run-summary-v1.json"), JSON.stringify(dryRunSummary, null, 1) + "\n", "utf8");
if (mode === "dry-run") { console.log(JSON.stringify(dryRunSummary, null, 1)); if (!arithmeticOk || plan.errors.length > 0) process.exit(1); }

// ── 5. --stage-plan: chunk 계획 artifact (DB 0) ────────────────────────────
if (mode === "stage-plan") {
  writeFileSync(join(outDir, "five-city-core-stage-plan-v1.json"), JSON.stringify({ ...stagePlan, insert_keys: undefined, chunks: stagePlan.chunks.map(c => ({ index: c.index, kind: c.kind, count: c.keys.length, sha256: c.sha256 })) }, null, 1) + "\n", "utf8");
  console.log(JSON.stringify({ mode, run_id: runId, ...stagePlan.counts, plan_sha256: stagePlan.plan_sha256, db_write_executed: false }, null, 1));
  if (!arithmeticOk) process.exit(1);
}

// ── 6. --publish-sql: cutover 스크립트 생성 (DB 0) ──────────────────────────
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

// ── 7. --stage: Production write (가드 전부 통과 시에만; 이 TASK 에서는 실행하지 않는다) ──
if (mode === "stage") {
  const confirm = arg("--confirm-manifest-hash");
  const host = process.env.FIVE_CITY_CORE_TARGET_HOST ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const expectedDb = Number(arg("--expected-db-count") ?? "NaN");
  const refuse = (why: string): never => { console.error(`STAGE_REFUSED: ${why}`); process.exit(4); };
  if (process.env.FIVE_CITY_CORE_APPLY !== "YES") refuse("env FIVE_CITY_CORE_APPLY=YES required");
  if (confirm !== manifestHash) refuse("--confirm-manifest-hash must equal sha256(input manifest)");
  if (!arithmeticOk || plan.errors.length > 0) refuse("plan arithmetic/errors");
  if (!url || !key) refuse("target url / service key missing");
  if (!host || new URL(url).host !== host) refuse("FIVE_CITY_CORE_TARGET_HOST must equal the Supabase host (explicit Production target)");
  if (!Number.isInteger(expectedDb)) refuse("--expected-db-count <n> required (pre-stage READ)");
  const fetchLike: FetchLike = (u, init) => fetch(u, init);
  const target = { url, serviceKey: key };
  (async () => {
    const h = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };
    const pre = await fetch(`${url}/rest/v1/city_spots?select=id&limit=1`, { headers: h });
    const preCount = Number((pre.headers.get("content-range") ?? "/NaN").split("/")[1]);
    if (preCount !== expectedDb) refuse(`pre-stage count ${preCount} != expected ${expectedDb}`);
    const col = await fetch(`${url}/rest/v1/city_spots?select=is_published&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (col.status !== 200) refuse("is_published column absent — migration 056 not applied");
    const runDir = join(pkg, "production-runs", runId);
    mkdirSync(runDir, { recursive: true });
    const mapping: string[] = [];
    let inserted = 0, updated = 0;
    for (const u of plan.updates) { await stageUpdateRow(fetchLike, target, u); updated += 1; }
    const byExt = new Map(plan.inserts.map(i => [String(i.row.external_id), i]));
    for (const c of stagePlan.chunks.filter(c => c.kind === "INSERT")) {
      const rows = c.keys.map(k => { const i = byExt.get(String(k)); if (!i) throw new Error(`chunk key ${String(k)} not in plan`); return { ...i, row: { ...i.row, is_published: false } }; });
      // lookup-before-insert + unique-conflict recovery (PostgREST on_conflict 는 partial unique index 와 비호환 — stage-rest-writer 주석)
      const res = await stageInsertChunkSafe(fetchLike, target, rows);
      for (const r of res) { mapping.push(JSON.stringify({ run_id: runId, canonical_id: r.canonical_id, city: byExt.get(r.external_id)!.city, actual_city_spot_id: r.id, operation: "INSERT", reused_existing: r.reused_existing, staged_is_published: false, manifest_hash: manifestHash })); inserted += 1; }
      writeFileSync(join(runDir, "production-id-mapping-v1.jsonl"), mapping.join("\n") + "\n", "utf8");   // chunk 마다 저장 — resume 자료
    }
    const post = await fetch(`${url}/rest/v1/city_spots?select=id&limit=1`, { headers: h });
    const postCount = Number((post.headers.get("content-range") ?? "/NaN").split("/")[1]);
    const receipt = { run_id: runId, manifest_sha256: manifestHash, plan_sha256: stagePlan.plan_sha256, release_sha: process.env.RELEASE_SHA ?? null, db_pre_count: preCount, db_post_count: postCount, update_count: updated, insert_count: inserted, new_unpublished_count: inserted, mapping_rows: mapping.length, sources_writes: 0, images_writes: 0, error_count: 0, id_mapping_sha256: sha256(mapping.join("\n") + "\n"), legacy_newly_hidden: 0 as const };
    writeFileSync(join(runDir, "stage-receipt-v1.json"), JSON.stringify(receipt, null, 1) + "\n", "utf8");
    console.log(JSON.stringify({ mode, run_id: runId, db_pre_count: preCount, db_post_count: postCount, updated, inserted }, null, 1));
  })().catch(e => { console.error("STAGE_FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
}

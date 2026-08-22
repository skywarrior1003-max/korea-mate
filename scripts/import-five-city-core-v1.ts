/**
 * import-five-city-core-v1 — 5도시 core intake 의 ID-보존 importer (v1 = dry-run 전용)
 * (TASK-MAIN-FIVE-CITY-CORE-INTEGRATION-PREP-AND-DRY-RUN-V1 → Gate A/B/C: TASK-FIVE-CITY-CORE-PREPROD-GATE-V1)
 *
 * Run:
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --dry-run
 *   node --experimental-strip-types scripts/import-five-city-core-v1.ts --dry-run --package data/main-intake/five-city-core-v1
 *
 * 안전 장치
 *   · 기본 모드 = dry-run. `--apply` 는 (1) env FIVE_CITY_CORE_APPLY=YES (2) --confirm-manifest-hash <sha256>
 *     가 모두 맞아야 진입하며, **v1 에는 DB 쓰기 코드가 없다** — 진입해도 APPLY_DISABLED_IN_V1 로 멈춘다.
 *     실제 write 는 별도 승인 TASK 에서 이 가드 위에 구현한다.
 *   · DELETE/RETIRE 기능 없음.
 *   · 입력 manifest 의 sha256 과 실제 파일이 다르면 멈춘다(입력이 바뀐 채 계획을 만들지 않는다).
 *   · Main 스냅샷은 파일(비사용자 컬럼)에서 읽는다. DB 를 읽는 모드는 v1 에 없다.
 *   · secrets 출력 없음 · 사용자 데이터 없음.
 *
 * 출력 (package/dry-run/)
 *   five-city-core-dry-run-summary-v1.json · five-city-core-change-manifest-v1.jsonl
 *   five-city-core-id-mapping-v1.jsonl · five-city-core-skipped-v1.jsonl · five-city-core-errors-v1.json
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planImport, changeManifestRows, type CrosswalkRow, type ImageRow, type IntakeRow, type MainClassificationRow, type MainSnapshotRow, type SourceRow } from "../src/lib/main-intake/importer-core.ts";

const EXPECTED_ACTIVE_TOTAL = 4826;       // SOURCE_ACTIVE_RECORD_COUNT
// ARTIFACT TRUST: 같은 source entity skip 은 artifact 근거(부산 uc_seq)로만 — 170. ACTIVE_DISTINCT = 4,826 − 170 = 4,656
const EXPECTED_ARTIFACT_SAME_ENTITY_SKIPS = 170;
const EXPECTED_ACTIVE_DISTINCT = EXPECTED_ACTIVE_TOTAL - EXPECTED_ARTIFACT_SAME_ENTITY_SKIPS;
// FINAL-ARTIFACT-ALIGNMENT: 전주 identity_review 는 보류가 아니다 → Main review hold 는 0 이어야 한다
const EXPECTED_REVIEW_HOLD = 0;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
const pkg = resolve(arg("--package") ?? "data/main-intake/five-city-core-v1");
const dryRun = !flags.has("--apply");

function sha256(buf: Buffer | string): string { return createHash("sha256").update(buf).digest("hex"); }
function readJsonl<T>(p: string): T[] { return readFileSync(p, "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T); }

// ── 1. manifest 검증 ───────────────────────────────────────────────────────
const manifestPath = join(pkg, "five-city-core-input-manifest-v1.json");
if (!existsSync(manifestPath)) { console.error(`manifest not found: ${manifestPath}`); process.exit(2); }
const manifestRaw = readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString("utf8")) as { outputs: Record<string, { path: string; sha256: string; rows?: number }>; main_snapshot: { path: string; sha256: string; rows: number }; active_total: number };
const manifestHash = sha256(manifestRaw);
const mismatches: string[] = [];
for (const [k, o] of Object.entries(manifest.outputs)) {
  const p = join(pkg, o.path);
  if (!existsSync(p)) { mismatches.push(`${k}: missing ${o.path}`); continue; }
  const h = sha256(readFileSync(p));
  if (h !== o.sha256) mismatches.push(`${k}: sha256 mismatch (${o.path})`);
}
{
  const p = join(pkg, manifest.main_snapshot.path);
  if (!existsSync(p) || sha256(readFileSync(p)) !== manifest.main_snapshot.sha256) mismatches.push("main_snapshot: sha256 mismatch");
}
if (mismatches.length > 0) { console.error("INPUT_MANIFEST_MISMATCH\n" + mismatches.join("\n")); process.exit(3); }

// ── 2. apply 가드 (v1: DB 쓰기 코드 없음) ───────────────────────────────────
if (!dryRun) {
  const confirm = arg("--confirm-manifest-hash");
  if (process.env.FIVE_CITY_CORE_APPLY !== "YES" || confirm !== manifestHash) {
    console.error("APPLY_REFUSED: env FIVE_CITY_CORE_APPLY=YES and --confirm-manifest-hash <sha256(manifest)> are both required.");
    process.exit(4);
  }
  console.error("APPLY_DISABLED_IN_V1: this importer version computes plans only. No DB write path exists.");
  process.exit(5);
}

// ── 3. 입력 로드 ───────────────────────────────────────────────────────────
const intake = readJsonl<IntakeRow>(join(pkg, manifest.outputs.active.path));
const sources = readJsonl<SourceRow>(join(pkg, manifest.outputs.sources.path));
const images = readJsonl<ImageRow>(join(pkg, manifest.outputs.images.path));
const crosswalk = readJsonl<CrosswalkRow>(join(pkg, manifest.outputs.crosswalk.path));
const main = readJsonl<MainSnapshotRow>(join(pkg, manifest.main_snapshot.path));
const mainClassification = readJsonl<MainClassificationRow>(join(pkg, manifest.outputs.main_classification.path));

// ── 4. 계획 ────────────────────────────────────────────────────────────────
const plan = planImport({ intake, sources, images, crosswalk, main, mainClassification, expectedActiveTotal: EXPECTED_ACTIVE_TOTAL });
const projectedTotal = Object.values(plan.per_city).reduce((a, c) => a + c.projected_after, 0);
const projectedVisible = Object.values(plan.per_city).reduce((a, c) => a + c.visible_after, 0);
const projectedHidden = Object.values(plan.per_city).reduce((a, c) => a + c.hidden_after, 0);
const expectedUniverse = { active_total: EXPECTED_ACTIVE_TOTAL, active_distinct: EXPECTED_ACTIVE_DISTINCT, writes: plan.counts.match_replace + plan.counts.new,
  skipped: plan.counts.confirmed_twin_skipped + plan.counts.review_required_skipped + plan.counts.excluded_skipped };
// ARTIFACT TRUST 산술: ACTIVE = MATCH + NEW + CONFIRMED_TWIN(artifact) + REVIEW_REQUIRED · ACTIVE_DISTINCT = ACTIVE − CONFIRMED_TWIN
const arithmeticOk =
  plan.counts.match_replace + plan.counts.new + plan.counts.confirmed_twin_skipped + plan.counts.review_required_skipped === plan.counts.active_input
  && plan.counts.confirmed_twin_skipped === EXPECTED_ARTIFACT_SAME_ENTITY_SKIPS
  && plan.counts.active_distinct === EXPECTED_ACTIVE_DISTINCT
  && plan.counts.heuristic_twin_auto_merge === 0 && plan.counts.evidenceless_skip === 0
  && plan.counts.review_required_skipped === EXPECTED_REVIEW_HOLD;

// ── 5. 출력 (결정적: 시각 없음, 정렬 고정) ───────────────────────────────────
const outDir = join(pkg, "dry-run");
mkdirSync(outDir, { recursive: true });
const manifestRows = changeManifestRows(plan);
const changeText = manifestRows.map(r => JSON.stringify(r)).join("\n") + "\n";
writeFileSync(join(outDir, "five-city-core-change-manifest-v1.jsonl"), changeText, "utf8");
const idMap = [
  ...plan.updates.map(u => ({ canonical_id: u.canonical_id, city: u.city, main_city_spot_id: u.main_city_spot_id, action: "UPDATE" })),
  ...plan.inserts.map(i => ({ canonical_id: i.canonical_id, city: i.city, main_city_spot_id: i.placeholder_id, action: "INSERT" })),
].sort((a, b) => (a.canonical_id < b.canonical_id ? -1 : 1));
writeFileSync(join(outDir, "five-city-core-id-mapping-v1.jsonl"), idMap.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-skipped-v1.jsonl"), plan.skips.map(r => JSON.stringify(r)).join("\n") + "\n", "utf8");
writeFileSync(join(outDir, "five-city-core-errors-v1.json"), JSON.stringify(plan.errors, null, 1) + "\n", "utf8");
const summary = {
  task: "TASK-FIVE-CITY-CORE-FINAL-ARTIFACT-ALIGNMENT-V1",
  mode: "dry-run",
  input_manifest_sha256: manifestHash,
  run_id: sha256(manifestHash + changeText).slice(0, 16),   // 입력+계획의 해시 — 같은 입력이면 같은 run id
  counts: plan.counts,
  arithmetic_ok: arithmeticOk,
  expected_universe: expectedUniverse,
  artifact_trust: {
    SOURCE_ACTIVE_RECORD_COUNT: plan.counts.active_input,
    ARTIFACT_CONFIRMED_SAME_ENTITY_SKIP_COUNT: plan.counts.confirmed_twin_skipped,
    REVIEW_REQUIRED_COUNT: plan.counts.review_required_skipped,
    ACTIVE_DISTINCT_COUNT: plan.counts.active_distinct,
    WRITEABLE_ACTIVE_COUNT: plan.counts.writeable_active,
    HEURISTIC_TWIN_AUTO_MERGE_COUNT: plan.counts.heuristic_twin_auto_merge,
    ARTIFACT_EVIDENCELESS_SKIP_COUNT: plan.counts.evidenceless_skip,
    decision_basis: crosswalk.filter(c => c.service_status === "ACTIVE").reduce<Record<string, number>>((a, c) => { const k = c.decision_basis ?? "none"; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
    provisional_until_review_gate: plan.counts.review_required_skipped > 0,
  },
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
  errors: plan.errors.length,
  delete_actions: 0,
  db_write_executed: false,
};
writeFileSync(join(outDir, "five-city-core-dry-run-summary-v1.json"), JSON.stringify(summary, null, 1) + "\n", "utf8");
console.log(JSON.stringify(summary, null, 1));
if (!arithmeticOk || plan.errors.length > 0) process.exit(1);

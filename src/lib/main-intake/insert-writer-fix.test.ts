/**
 * TASK-FIVE-CITY-CORE-STAGE-INSERT-WRITER-FIX-V1 — NEW bulk INSERT key-set subgrouping (PGRST102) · error observability ·
 * subgroup receipts · retry safety · immutable snapshot / append-only receipts (IW-1~18)
 * Run: node --experimental-strip-types --test src/lib/main-intake/insert-writer-fix.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageInsertChunkSafe, groupByKeySet, keySignature, orderedBody, parsePostgrestError, StageRestError, StageIdentityError, type FetchLike, type InsertSubgroupReceipt } from "./stage-rest-writer.ts";
import { syncSourcesChunk, type ResolvedSource } from "./stage-relations.ts";
import { appendReceiptLine, attemptId, snapshotAttemptFilename, writeImmutableFile, R2_BEFORE_PHASE_A_SNAPSHOT, chunkReceipt } from "./stage-safety.ts";
import { planImport, type InsertAction, type CrosswalkRow, type IntakeRow, type MainSnapshotRow, type SourceRow, type ImageRow } from "./importer-core.ts";
import { buildStagePlan } from "./stage-plan.ts";

const ROOT = new URL("../../../", import.meta.url);
const PKG = "data/main-intake/five-city-core-v1/";
const readJsonl = <T,>(p: string): T[] => readFileSync(new URL(PKG + p, ROOT), "utf8").split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as T);
const pkgReady = existsSync(new URL(PKG + "five-city-core-input-manifest-v1.json", ROOT));
const T = { url: "https://x.supabase.co", serviceKey: "SECRET-KEY" };

/** 실제 PostgREST 계약의 city_spots fake: GET lookup · POST = 한 트랜잭션, key-set 불일치 → 400 PGRST102, partial unique 충돌 → 409 23505. */
function fakePostgrest(opts: { failPostIndex?: number; failStatus?: number; failBody?: string; raceOnInsert?: Set<string> } = {}) {
  const table: Array<Record<string, unknown> & { id: number }> = []; let next = 5000; let posts = 0;
  const log: Array<{ method: string; body?: unknown; url: string }> = [];
  const fetchLike: FetchLike = async (url, init) => {
    log.push({ method: init.method, body: init.body ? JSON.parse(init.body) : undefined, url });
    if (init.method === "GET") {
      const m = url.match(/external_id=in\.\((.*)\)$/); const ids = m ? decodeURIComponent(m[1]!).split(",").map(s => s.replace(/^"|"$/g, "")) : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(table.filter(r => r.source_type === "canonical" && ids.includes(String(r.external_id))).map(r => ({ id: r.id, external_id: r.external_id }))) };
    }
    if (init.method === "POST") {
      const rows = JSON.parse(init.body!) as Array<Record<string, unknown>>;
      const sigs = new Set(rows.map(r => Object.keys(r).sort().join(",")));
      if (sigs.size > 1) return { ok: false, status: 400, text: async () => JSON.stringify({ code: "PGRST102", message: "All object keys must match", details: null, hint: null }) };
      const idx = posts++;
      if (opts.failPostIndex === idx) return { ok: false, status: opts.failStatus ?? 500, text: async () => opts.failBody ?? JSON.stringify({ code: "XX000", message: "simulated failure", details: "d", hint: "h" }) };
      for (const r of rows) if (opts.raceOnInsert?.has(String(r.external_id)) && !table.some(t => t.external_id === r.external_id)) table.push({ ...r, id: next++, name: "raced" });
      if (rows.some(r => table.some(t => t.source_type === r.source_type && t.external_id === r.external_id))) return { ok: false, status: 409, text: async () => JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"idx_city_spots_source_external\"" }) };
      const out = rows.map(r => { const row = { ...r, id: next++ } as Record<string, unknown> & { id: number }; table.push(row); return { id: row.id, external_id: row.external_id }; });
      return { ok: true, status: 201, text: async () => JSON.stringify(out) };
    }
    return { ok: false, status: 405, text: async () => "" };
  };
  return { fetchLike, table, log, posts: () => posts };
}
const ins = (cid: string, row: Record<string, unknown>): InsertAction => ({ canonical_id: cid, city: "busan", row: { city: "busan", name: cid, category: "attraction", source_type: "canonical", external_id: `busan:${cid}`, is_published: false, ...row } } as unknown as InsertAction);
/** 5행 · 3 key-set (R2 Production 과 같은 heterogeneous chunk) */
const HETERO = [ins("a1", { lat: 1, lng: 2 }), ins("a2", { description: "d2", tags: ["x"] }), ins("a3", { lat: 3, lng: 4 }), ins("a4", { description: "d4", tags: [] }), ins("a5", { district: "Haeundae" })];

test("IW-1: 옛 경로(heterogeneous 2행을 한 bulk 로 POST) → fake 가 400 PGRST102 'All object keys must match' (R2 재현)", async () => {
  const f = fakePostgrest();
  const res = await f.fetchLike(`${T.url}/rest/v1/city_spots`, { method: "POST", headers: {}, body: JSON.stringify([HETERO[0]!.row, HETERO[1]!.row]) });
  assert.equal(res.status, 400); const info = parsePostgrestError(res.status, await res.text());
  assert.equal(info.code, "PGRST102"); assert.equal(info.message, "All object keys must match"); assert.equal(f.table.length, 0, "write 0");
});

test("IW-2/3/6/7: key-set 별 subgroup — 각 group key 동일 · 없는 키를 null 로 만들지 않음 · signature 정렬로 입력 순서와 무관하게 결정적", () => {
  const g1 = groupByKeySet(HETERO); const g2 = groupByKeySet([...HETERO].reverse());
  assert.equal(g1.length, 3);
  assert.deepEqual(g1.map(g => g.signature), g2.map(g => g.signature), "group 순서 = signature 정렬(입력 순서 무관)");
  assert.deepEqual(g1.map(g => g.rows.map(r => r.canonical_id)), [["a2", "a4"], ["a5"], ["a1", "a3"]]);
  for (const g of g1) for (const r of g.rows) { assert.equal(keySignature(r.row), g.signature); assert.ok(!Object.values(r.row).includes(null), "null 주입 0"); }
  assert.deepEqual(Object.keys(orderedBody({ z: 1, a: 2, m: 3 })), ["a", "m", "z"], "payload column 순서 결정적"); assert.deepEqual(orderedBody(HETERO[1]!.row), { ...HETERO[1]!.row }, "값 불변");
});

test("IW-4/5/8: writer 가 heterogeneous chunk 전부 INSERT — row 수 보존 · 값 변경 0 · 요청마다 key 동일 · subgroup receipt 합 = planned", async () => {
  const f = fakePostgrest(); const receipts: InsertSubgroupReceipt[] = [];
  const out = await stageInsertChunkSafe(f.fetchLike, T, HETERO, { chunkIndex: 7, onSubgroup: r => { receipts.push(r); } });
  assert.equal(out.length, 5); assert.deepEqual(out.map(o => o.canonical_id), ["a1", "a2", "a3", "a4", "a5"], "반환 순서 = 입력 순서");
  assert.equal(f.table.length, 5); assert.equal(f.posts(), 3, "subgroup 3 → POST 3");
  for (const p of f.log.filter(l => l.method === "POST")) { const rows = p.body as Array<Record<string, unknown>>; assert.equal(new Set(rows.map(r => Object.keys(r).sort().join(","))).size, 1, "요청 내 key uniform"); }
  for (const a of HETERO) { const row = f.table.find(r => r.external_id === a.row.external_id)!; const { id: _id, ...rest } = row; void _id; assert.deepEqual(rest, a.row, `값 변경 0 (${a.canonical_id})`); }
  assert.equal(receipts.reduce((s, r) => s + r.inserted, 0), 5); assert.deepEqual(receipts.map(r => [r.chunk_index, r.subgroup_index, r.request_rows, r.http_status, r.failed]), [[7, 0, 2, 201, 0], [7, 1, 1, 201, 0], [7, 2, 2, 201, 0]]);
  assert.ok(receipts.every(r => /^[0-9a-f]{64}$/.test(r.key_signature_sha256)));
});

test("IW-9/10/18: 두 번째 subgroup 실패 → 첫 subgroup 은 DB/receipt 에 남고 실패 receipt 에 chunk/subgroup/HTTP/code/message/details/hint · secret 누출 0", async () => {
  const f = fakePostgrest({ failPostIndex: 1, failStatus: 500 }); const receipts: InsertSubgroupReceipt[] = [];
  await assert.rejects(stageInsertChunkSafe(f.fetchLike, T, HETERO, { chunkIndex: 3, onSubgroup: r => { receipts.push(r); } }), (e: unknown) => {
    assert.ok(e instanceof StageRestError && e instanceof StageIdentityError);
    assert.deepEqual(e.where, { phase: "NEW_CITY_SPOTS", chunk_index: 3, subgroup_index: 1, request_rows: 1 });
    assert.deepEqual(e.info, { http_status: 500, code: "XX000", message: "simulated failure", details: "d", hint: "h", snippet: null });
    assert.ok(!e.message.includes("SECRET-KEY") && !JSON.stringify(e.info).includes("SECRET-KEY") && !e.message.includes("Bearer"));
    return true;
  });
  assert.equal(f.table.length, 2, "첫 subgroup(2행)만 DB 에 존재");
  assert.deepEqual(receipts.map(r => [r.subgroup_index, r.inserted, r.failed, r.http_status, r.error_code]), [[0, 2, 0, 201, null], [1, 0, 1, 500, "XX000"]]);
});

test("IW-11/12: 실패 후 같은 chunk 재실행 → lookup-first 로 기존 2행 재사용 · 나머지 3행만 INSERT · 중복 0 · 총 5", async () => {
  const f = fakePostgrest({ failPostIndex: 1 });
  await assert.rejects(stageInsertChunkSafe(f.fetchLike, T, HETERO));
  const out = await stageInsertChunkSafe(f.fetchLike, T, HETERO);
  assert.equal(out.filter(o => o.reused_existing).length, 2); assert.equal(out.filter(o => !o.reused_existing).length, 3);
  assert.equal(f.table.length, 5); assert.equal(new Set(f.table.map(r => r.external_id)).size, 5, "중복 0");
  const out2 = await stageInsertChunkSafe(f.fetchLike, T, HETERO); assert.equal(out2.filter(o => !o.reused_existing).length, 0, "세 번째 실행 INSERT 0"); assert.equal(f.table.length, 5);
});

test("IW-13: subgroup 안 unique race → 재조회로 race 행 재사용 + 나머지 1회 재INSERT (기존 계약) · receipt 에 reused_after_conflict/retry_count", async () => {
  const f = fakePostgrest({ raceOnInsert: new Set(["busan:a1"]) }); const receipts: InsertSubgroupReceipt[] = [];
  const out = await stageInsertChunkSafe(f.fetchLike, T, HETERO, { onSubgroup: r => { receipts.push(r); } });
  assert.equal(out.find(o => o.canonical_id === "a1")!.reused_existing, true); assert.equal(f.table.length, 5);
  const g = receipts.find(r => r.key_signature.includes("lat"))!; assert.deepEqual([g.reused_after_conflict, g.retry_count, g.inserted, g.failed], [1, 1, 1, 0]);
  assert.equal(f.table.filter(r => r.external_id === "busan:a1").length, 1);
});

test("IW-14: source writer 회귀 — syncSourcesChunk 의 POST body 는 고정 key-set(uniform) 이라 PGRST102 fake 를 통과한다", async () => {
  const table: Array<Record<string, unknown> & { id: number }> = []; let next = 1; const posts: Array<Array<Record<string, unknown>>> = [];
  const fetchLike: FetchLike = async (url, init) => {
    if (init.method === "GET") return { ok: true, status: 200, text: async () => "[]" };
    if (init.method === "POST") { const rows = JSON.parse(init.body!) as Array<Record<string, unknown>>; posts.push(rows); if (new Set(rows.map(r => Object.keys(r).sort().join(","))).size > 1) return { ok: false, status: 400, text: async () => JSON.stringify({ code: "PGRST102", message: "All object keys must match" }) }; const out = rows.map(r => { const row = { ...r, id: next++ }; table.push(row); return row; }); return { ok: true, status: 201, text: async () => JSON.stringify(out) }; }
    return { ok: false, status: 405, text: async () => "" };
  };
  const src = (k: string, extra: Partial<ResolvedSource>): ResolvedSource => ({ canonical_id: "c", city_spot_id: 287, source_type: "fs", source_key: k, candidate_id: null, source_url: null, source_tier: "OFFICIAL_API", is_primary: false, as_of: null, ...extra });
  const r = await syncSourcesChunk(fetchLike, T, [src("1", { source_url: "https://a" }), src("2", { candidate_id: "cand" }), src("3", { is_primary: true, as_of: "2026-08-18" })]);
  assert.equal(r.inserted, 3); assert.equal(posts.length, 1); assert.equal(new Set(posts[0]!.map(x => Object.keys(x).sort().join(","))).size, 1);
});

test("IW-15: 실제 old plan(4,194 NEW) synthetic shaping — 21 logical chunk → subgroup 후 모든 요청 uniform · 행 4,194 보존 · dropped 0 · dup 0 · 값 변경 0 · null 주입 0 · fake 전부 INSERT", { skip: !pkgReady }, async () => {
  const plan = planImport({ intake: readJsonl<IntakeRow>("five-city-core-active-v1.jsonl"), sources: readJsonl<SourceRow>("five-city-core-sources-v1.jsonl"), images: readJsonl<ImageRow>("five-city-core-images-v1.jsonl"), crosswalk: readJsonl<CrosswalkRow>("five-city-core-crosswalk-v1.jsonl"), main: readJsonl<MainSnapshotRow>("main-city-spots-snapshot-2026-08-22-v1.jsonl"), mainClassification: [], expectedActiveTotal: 4826 });
  const sp = buildStagePlan(plan, "f8abf0cf5f75e55f", "fixture");
  const byExt = new Map(plan.inserts.map(i => [String(i.row.external_id), i]));
  const chunks = sp.chunks.filter(c => c.kind === "INSERT");
  assert.equal(plan.inserts.length, 4194); assert.equal(chunks.length, 21);
  let subgroups = 0, heteroBefore = 0, rowsOut = 0;
  for (const c of chunks) {
    const rows = c.keys.map(k => byExt.get(String(k))!);
    if (new Set(rows.map(r => keySignature(r.row))).size > 1) heteroBefore += 1;
    const groups = groupByKeySet(rows); subgroups += groups.length;
    for (const g of groups) { rowsOut += g.rows.length; assert.equal(new Set(g.rows.map(r => keySignature(r.row))).size, 1); for (const r of g.rows) assert.deepEqual(orderedBody(r.row), Object.fromEntries(Object.entries(r.row).sort(([a], [b]) => (a < b ? -1 : 1)))); }
    const ids = groups.flatMap(g => g.rows.map(r => r.canonical_id)); assert.equal(new Set(ids).size, rows.length, "dup 0"); assert.equal(ids.length, rows.length, "dropped 0");
  }
  assert.equal(rowsOut, 4194); assert.equal(heteroBefore, 19, "R2 보고와 동일: 21 중 19 chunk 가 heterogeneous");
  // end-to-end through the PGRST102-enforcing fake
  const f = fakePostgrest(); const receipts: InsertSubgroupReceipt[] = []; let staged = 0;
  for (const c of chunks) { const rows = c.keys.map(k => ({ ...byExt.get(String(k))!, row: { ...byExt.get(String(k))!.row, is_published: false } })); const out = await stageInsertChunkSafe(f.fetchLike, T, rows, { chunkIndex: c.index, onSubgroup: r => { receipts.push(r); } }); staged += out.length; }
  assert.equal(staged, 4194); assert.equal(f.table.length, 4194); assert.equal(new Set(f.table.map(r => r.external_id)).size, 4194);
  assert.equal(f.posts(), subgroups); assert.equal(receipts.filter(r => r.failed > 0).length, 0); assert.equal(receipts.reduce((s, r) => s + r.inserted, 0), 4194);
  const nullInjected = f.table.filter(r => Object.values(r).includes(null)).length; assert.equal(nullInjected, 0, "원본 plan 에 null 값이 없으므로 DB 행에도 null 주입 0");
  for (const p of f.log.filter(l => l.method === "POST")) assert.equal(new Set((p.body as Array<Record<string, unknown>>).map(r => Object.keys(r).sort().join(","))).size, 1, "POST-FIX heterogeneous request 0");
  console.log(`[IW-15] subgroups=${subgroups} posts=${f.posts()} hetero_chunks_before=${heteroBefore}`);
});

test("IW-16: parsePostgrestError — JSON 은 code/message/details/hint, 비 JSON 은 2KB snippet, 긴 message 는 잘림", () => {
  assert.deepEqual(parsePostgrestError(400, JSON.stringify({ code: "PGRST102", message: "All object keys must match", details: null, hint: null })), { http_status: 400, code: "PGRST102", message: "All object keys must match", details: null, hint: null, snippet: null });
  const s = parsePostgrestError(502, "<html>bad gateway</html>"); assert.equal(s.code, null); assert.equal(s.snippet, "<html>bad gateway</html>");
  const big = parsePostgrestError(500, "x".repeat(5000)); assert.ok(big.snippet!.length <= 2049);
  const bigMsg = parsePostgrestError(400, JSON.stringify({ message: "m".repeat(5000) })); assert.ok(bigMsg.message!.length <= 2049);
});

test("IW-17: immutable snapshot — attempt 파일명 · wx 쓰기는 기존 파일을 절대 덮어쓰지 않음 · R2 before-Phase-A 상수 · importer 는 generic 파일명으로 쓰지 않는다", () => {
  assert.equal(attemptId("2026-08-22T11:58:04.707Z"), "20260822T115804Z"); assert.equal(snapshotAttemptFilename("20260822T115804Z"), "pre-stage-match-snapshot-v1.20260822T115804Z.jsonl");
  const dir = mkdtempSync(join(tmpdir(), "iw17-")); const p = join(dir, R2_BEFORE_PHASE_A_SNAPSHOT);
  writeImmutableFile(p, "original\n"); assert.throws(() => writeImmutableFile(p, "overwrite\n"), /EEXIST/); assert.equal(readFileSync(p, "utf8"), "original\n");
  rmSync(dir, { recursive: true, force: true });
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8"); const stage = src.slice(src.indexOf('if (mode === "stage")')); const snapMode = src.slice(src.indexOf('if (mode === "pre-stage-snapshot")'), src.indexOf('if (mode === "stage")'));
  for (const block of [stage, snapMode]) { assert.ok(!/"pre-stage-match-snapshot-v1\.jsonl"/.test(block), "generic 파일명 쓰기 0"); assert.match(block, /writeImmutableFile\(snapPath, snap\.text\)/); assert.match(block, /snapshotAttemptFilename\(attempt\)/); }
  assert.ok(!src.includes("r2-before-phaseA"), "importer 는 R2 evidence 파일을 참조/쓰기하지 않는다");
});

test("IW-18: receipts — append-only JSONL 즉시 기록 · importer 는 chunk/subgroup 마다 emit 하고 실패 시 failure receipt + stage-failure 파일", () => {
  const dir = mkdtempSync(join(tmpdir(), "iw18-")); const p = join(dir, "r.jsonl");
  const base = { expected: 1, looked_up: 0, reused: 0, updated: 0, inserted: 1, unchanged: 0, suppressed: 0, failed: 0, retry_count: 0, timestamp: "t" } as const;
  appendReceiptLine(p, chunkReceipt({ phase: "NEW_CITY_SPOTS", chunk_index: 0, ...base, attempt: "A", subgroup_index: 0, key_signature_sha256: "x", request_rows: 1, http_status: 201, error_code: null, error_message: null }, [0]));
  appendReceiptLine(p, chunkReceipt({ phase: "NEW_CITY_SPOTS", chunk_index: 0, ...base, inserted: 0, failed: 1, subgroup_index: 1, http_status: 400, error_code: "PGRST102", error_message: "All object keys must match" }, [1]));
  const lines = readFileSync(p, "utf8").trim().split("\n").map(l => JSON.parse(l)); assert.equal(lines.length, 2); assert.equal(lines[1].error_code, "PGRST102"); assert.equal(lines[0].attempt, "A");
  rmSync(dir, { recursive: true, force: true });
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8"); const stage = src.slice(src.indexOf('if (mode === "stage")'));
  assert.equal((stage.match(/receipts\.push\(/g) ?? []).length, 1, "receipts.push 는 emit(append) 안에서만 1회"); assert.ok((stage.match(/emit\(chunkReceipt\(/g) ?? []).length >= 6);
  assert.match(stage, /onSubgroup: sg => emit\(/); assert.equal((stage.match(/failureReceipt\(/g) ?? []).length, 5, "MATCH/RESTORE_PRE_R2(×2: throw·blocked)/SOURCES/IMAGES 실패 receipt(NEW 은 writer 의 onSubgroup 이 실패 receipt 를 emit)");
  assert.match(stage, /stage-chunk-receipts-v1\.\$\{attempt\}\.jsonl/); assert.match(stage, /stage-failure-v1\./); assert.match(stage, /e instanceof StageRestError \? \{ name: e\.name, where: e\.where, info: e\.info \}/);
  assert.ok(!/stage-chunk-receipts-v1\.jsonl"/.test(stage), "마지막에만 쓰는 단일 receipt 파일 0");
});

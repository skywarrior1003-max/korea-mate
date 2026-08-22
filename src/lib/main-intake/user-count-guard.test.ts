/**
 * TASK-FIVE-CITY-CORE-USER-COUNT-GUARD-FIX-V1 — 사용자 테이블 count guard (UCG-1~12) · snapshot freshness · gate prerequisite wiring
 * Run: node --experimental-strip-types --test src/lib/main-intake/user-count-guard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { USER_TABLES, USER_TABLE_PK, userCountRequestPath, parseContentRangeCount, readUserTableCounts, userCountsDiff, assertSnapshotComplete } from "./stage-safety.ts";
import type { FetchLike } from "./stage-rest-writer.ts";

const ROOT = new URL("../../../", import.meta.url);
const T = { url: "https://x.supabase.co", serviceKey: "k" };
/** Production 실측 schema(2026-08-22): trip_moments 만 PK 가 moment_id. 존재하지 않는 컬럼 select → 400 42703. limit=0 → `* /N` + body []. */
function fakeUserTables(counts: Record<string, number>, opts: { contentRange?: (n: number) => string | null; status?: number } = {}) {
  const PK: Record<string, string> = { itineraries: "id", trip_moments: "moment_id", user_spots: "id", place_reports: "id" };
  const calls: Array<{ method: string; table: string; select: string | null; limit: string | null; prefer: string | undefined }> = [];
  let bodiesWithRows = 0;
  const fetchLike: FetchLike = async (url, init) => {
    const u = new URL(url); const table = u.pathname.split("/").pop()!; const qs = u.searchParams;
    calls.push({ method: init.method ?? "GET", table, select: qs.get("select"), limit: qs.get("limit"), prefer: (init.headers as Record<string, string> | undefined)?.Prefer });
    if (init.method !== "GET") return { ok: false, status: 405, text: async () => "write refused" } as never;
    const sel = qs.get("select") ?? "*";
    if (sel !== PK[table]) return { ok: false, status: 400, headers: { get: () => null }, text: async () => JSON.stringify({ code: "42703", message: `column ${table}.${sel} does not exist` }) } as never;
    const n = counts[table]!;
    if (opts.status) return { ok: opts.status < 300, status: opts.status, headers: { get: () => null }, text: async () => "" } as never;
    const cr = opts.contentRange ? opts.contentRange(n) : (qs.get("limit") === "0" ? `*/${n}` : `0-0/${n}`);
    const body = qs.get("limit") === "0" ? [] : [{ [PK[table]!]: "x" }];
    if (body.length) bodiesWithRows += 1;
    return { ok: true, status: n > 0 ? 206 : 200, headers: { get: (k: string) => (k === "content-range" ? cr : null) }, text: async () => JSON.stringify(body) } as never;
  };
  return { fetchLike, calls, rowsRead: () => bodiesWithRows };
}
const PROD = { itineraries: 68, trip_moments: 0, user_spots: 4, place_reports: 9 };

test("UCG-1/2: 테이블별 PK map 이 실측 schema 와 같다 · trip_moments 는 moment_id", () => {
  assert.deepEqual(USER_TABLES, ["itineraries", "trip_moments", "user_spots", "place_reports"]);
  assert.deepEqual(USER_TABLE_PK, { itineraries: "id", trip_moments: "moment_id", user_spots: "id", place_reports: "id" });
  assert.equal(userCountRequestPath("trip_moments"), "trip_moments?select=moment_id&limit=0");
});

test("UCG-3/4/12: 모든 count 요청은 GET · select=<pk> · limit=0 · count=exact — row body 0 · 쓰기 호출 0 · 정확한 count", async () => {
  const f = fakeUserTables(PROD);
  const pre = await readUserTableCounts(f.fetchLike, T);
  assert.deepEqual(pre, PROD);
  assert.equal(f.calls.length, 4);
  assert.ok(f.calls.every(c => c.method === "GET" && c.limit === "0" && c.prefer === "count=exact"));
  assert.deepEqual(f.calls.map(c => [c.table, c.select]), [["itineraries", "id"], ["trip_moments", "moment_id"], ["user_spots", "id"], ["place_reports", "id"]]);
  assert.equal(f.rowsRead(), 0, "사용자 row 내용 0");
});

test("UCG-2(neg): 옛 패턴(select=id) 은 trip_moments 에서 400 42703 — fake 가 실제 schema 를 모델링한다", async () => {
  const f = fakeUserTables(PROD);
  const res = await f.fetchLike(`${T.url}/rest/v1/trip_moments?select=id&limit=1`, { method: "GET", headers: {} });
  assert.equal(res.status, 400); assert.match(await res.text(), /42703/);
});

test("UCG-5: Content-Range 파서 — `*/N` · `a-b/N` 정확, 그 외 null(조용한 0 없음)", () => {
  assert.equal(parseContentRangeCount("*/68"), 68); assert.equal(parseContentRangeCount("*/0"), 0); assert.equal(parseContentRangeCount("0-0/9"), 9);
  for (const bad of [null, undefined, "", "*/", "*/abc", "68", "*/-1", "bytes 0-1/2", "*/1.5"]) assert.equal(parseContentRangeCount(bad as string), null, String(bad));
});

test("UCG-6: Content-Range 누락/파싱 불가 → 실패(0 fallback 금지)", async () => {
  await assert.rejects(readUserTableCounts(fakeUserTables(PROD, { contentRange: () => null }).fetchLike, T), /count unreadable: itineraries \(content-range=missing\)/);
  await assert.rejects(readUserTableCounts(fakeUserTables(PROD, { contentRange: () => "*/" }).fetchLike, T), /count unreadable/);
});

test("UCG-7: HTTP non-2xx → 실패", async () => {
  await assert.rejects(readUserTableCounts(fakeUserTables(PROD, { status: 500 }).fetchLike, T), /count failed: itineraries HTTP 500/);
  await assert.rejects(readUserTableCounts(fakeUserTables(PROD, { status: 401 }).fetchLike, T), /HTTP 401/);
});

test("UCG-8/9: pre == post → diff 0 · 하나라도 다르면 diff 에 표기(STAGE CLOSED 금지 근거)", async () => {
  const pre = await readUserTableCounts(fakeUserTables(PROD).fetchLike, T);
  const post = await readUserTableCounts(fakeUserTables(PROD).fetchLike, T);
  assert.deepEqual(userCountsDiff(pre, post), []);
  assert.deepEqual(userCountsDiff(pre, { ...post, trip_moments: 1 }), ["trip_moments: 0 → 1"]);
  assert.deepEqual(userCountsDiff(pre, { ...post, itineraries: 67, place_reports: 10 }), ["itineraries: 68 → 67", "place_reports: 9 → 10"]);
});

test("UCG-10: --stage 는 기존 snapshot 파일을 재사용하지 않고 항상 새로 생성하고 user pre counts 를 기록한다(importer 배선)", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  const stage = src.slice(src.indexOf('if (mode === "stage")'));
  assert.ok(!/existsSync\(snapPath\)/.test(stage), "stale snapshot 재사용 분기 제거");
  assert.ok(!/existsSync/.test(stage), "stage 블록에서 existsSync 사용 0 (manifest 검사의 existsSync 는 dry-run 공통, 무관)");
  assert.match(stage, /const snap = await buildPreStageSnapshot\(fetchLike, t, plan\.updates, manifestHash, now\(\)\);\s*assertSnapshotComplete\(snap\.rows, plan\.updates\.map\(u => u\.main_city_spot_id\)\);\s*writeFileSync\(snapPath, snap\.text, "utf8"\);/);
  assert.ok(stage.indexOf("assertSnapshotComplete(") < stage.indexOf("Phase A"), "snapshot 완전성 검사는 Phase A(첫 write) 이전");
  assert.ok(stage.indexOf("user-table-counts-pre-v1.json") < stage.indexOf("Phase A"), "user pre counts 기록은 Phase A 이전");
  assert.match(stage, /pre_stage_snapshot: \{ rows: snap\.rows\.length, sha256: snap\.sha256, fresh: true \}/);
});

test("UCG-11: snapshot 완전성 계약 — MATCH 전체(예: 462)와 정확히 일치해야 통과, 부족/중복/초과는 실패", () => {
  const ids = Array.from({ length: 462 }, (_, i) => 1000 + i);
  assertSnapshotComplete(ids.map(id => ({ city_spot_id: id })), ids);
  assert.throws(() => assertSnapshotComplete(ids.slice(1).map(id => ({ city_spot_id: id })), ids), /incomplete: rows=461/);
  assert.throws(() => assertSnapshotComplete([...ids, 1000].map(id => ({ city_spot_id: id })), ids), /incomplete: rows=463/);
  assert.throws(() => assertSnapshotComplete([...ids.slice(1), 1001].map(id => ({ city_spot_id: id })), ids), /incomplete/);
});

test("GATE-G: --stage 는 repo runtime contract DISCOVERY_VISIBILITY_GATE_ENABLED === true 를 요구한다 · 057/058 은 importer 가드가 아니라 문서화된 PRECHECK", () => {
  const src = readFileSync(new URL("scripts/import-five-city-core-v1.ts", ROOT), "utf8");
  assert.match(src, /import \{ DISCOVERY_VISIBILITY_GATE_ENABLED \} from "\.\.\/src\/lib\/city-spots-visibility\.ts"/);
  assert.match(src, /if \(requireApply && DISCOVERY_VISIBILITY_GATE_ENABLED !== true\) refuse\(/);
  const vis = readFileSync(new URL("src/lib/city-spots-visibility.ts", ROOT), "utf8");
  assert.match(vis, /export const DISCOVERY_VISIBILITY_GATE_ENABLED = true;/);
  assert.ok(!/^import /m.test(vis), "visibility 모듈은 import 0 → importer 가 안전하게 import");
  assert.match(src, /057\/058.*PostgREST 로 introspection 불가/);
  assert.ok(!/api\.supabase\.com|SUPABASE_ACCESS_TOKEN/.test(src), "Management API 토큰을 writer 프로세스에 두지 않는다");
});

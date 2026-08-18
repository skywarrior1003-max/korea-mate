/**
 * Unit tests for Storage-first deletion helpers
 * Run: node --experimental-strip-types src/lib/photo-delete.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectStoragePaths,
  checkRemoveResult,
  removeMomentStorage,
  removeItineraryStorage,
} from "./photo-delete.ts";

// ── collectStoragePaths ───────────────────────────────────────────────────────

test("사진 없는 moment: NULL 경로 필터", () => {
  const result = collectStoragePaths([
    { storage_path: "a/b/c.jpg" },
    { storage_path: null },
    { storage_path: "d/e/f.jpg" },
  ]);
  assert.deepStrictEqual(result, ["a/b/c.jpg", "d/e/f.jpg"]);
});

test("중복·NULL 경로 처리: 중복 제거", () => {
  const result = collectStoragePaths([
    { storage_path: "a/b/c.jpg" },
    { storage_path: "a/b/c.jpg" },
    { storage_path: "d/e/f.jpg" },
    { storage_path: null },
  ]);
  assert.deepStrictEqual(result, ["a/b/c.jpg", "d/e/f.jpg"]);
});

test("사진 없는 itinerary: 빈 배열 → 빈 배열", () => {
  assert.deepStrictEqual(collectStoragePaths([]), []);
});

test("전체 NULL → 빈 배열", () => {
  assert.deepStrictEqual(
    collectStoragePaths([{ storage_path: null }, { storage_path: null }]),
    [],
  );
});

test("빈 문자열 필터", () => {
  assert.deepStrictEqual(
    collectStoragePaths([{ storage_path: "" }, { storage_path: "a/b.jpg" }]),
    ["a/b.jpg"],
  );
});

// ── checkRemoveResult ─────────────────────────────────────────────────────────

test("전체 성공: null 반환", () => {
  assert.strictEqual(checkRemoveResult(2, [{}, {}], null), null);
});

test("Storage 실패: 오류 메시지 반환 (DB 유지 신호)", () => {
  const result = checkRemoveResult(1, null, { message: "permission denied" });
  assert.match(result!, /permission denied/);
});

test("error 없이 data=null → 오류 문자열", () => {
  const result = checkRemoveResult(1, null, null);
  assert.ok(typeof result === "string" && result.length > 0);
});

test("Storage 일부 실패: partial 오류 문자열 (DB 유지 신호)", () => {
  const result = checkRemoveResult(3, [{}, {}], null);
  assert.match(result!, /partial/);
});

// ── removeMomentStorage ───────────────────────────────────────────────────────

function mockOkStorage() {
  return {
    from: (_bucket: string) => ({
      remove: async (paths: string[]) => ({
        data: paths.map(p => ({ name: p })),
        error: null,
      }),
    }),
  };
}

function mockErrStorage(msg: string) {
  return {
    from: (_bucket: string) => ({
      remove: async (_paths: string[]) => ({ data: null, error: { message: msg } }),
    }),
  };
}

test("사진 있는 moment: Storage 성공 → null 반환", async () => {
  const result = await removeMomentStorage(mockOkStorage(), "itin/mom/abc.jpg");
  assert.strictEqual(result, null);
});

test("Storage 실패 시 DB 유지 — 오류 문자열 반환", async () => {
  const result = await removeMomentStorage(mockErrStorage("network error"), "itin/mom/abc.jpg");
  assert.match(result!, /network error/);
});

// ── removeItineraryStorage ────────────────────────────────────────────────────

test("사진 없는 itinerary: 빈 배열 → null (Storage 미호출)", async () => {
  let called = false;
  const storage = {
    from: (_bucket: string) => ({
      remove: async (_paths: string[]) => {
        called = true;
        return { data: [], error: null };
      },
    }),
  };
  const result = await removeItineraryStorage(storage, []);
  assert.strictEqual(result, null);
  assert.strictEqual(called, false);
});

test("여러 사진 itinerary: 전체 삭제 성공 → null", async () => {
  const paths = ["a/b/1.jpg", "a/b/2.jpg", "a/b/3.jpg"];
  const result = await removeItineraryStorage(mockOkStorage(), paths);
  assert.strictEqual(result, null);
});

test("Storage 일부 실패 시 DB 유지 — partial 오류 문자열", async () => {
  const paths = ["a/b/1.jpg", "a/b/2.jpg"];
  const partialStorage = {
    from: (_bucket: string) => ({
      remove: async (ps: string[]) => ({ data: [{ name: ps[0] }], error: null }),
    }),
  };
  const result = await removeItineraryStorage(partialStorage, paths);
  assert.match(result!, /partial/);
});

// ── 여행 통째 삭제: 첫 장 + 자식 사진을 모두 모으는가 ────────────────────────
//
// 자식 행은 FK CASCADE 로 사라지므로, 지우기 전에 경로를 챙기지 못하면
// 그 파일은 아무도 가리키지 않는 채 Storage 에 남는다.

import { readFileSync } from "node:fs";
import { collectItineraryPhotoPaths, type ItineraryPhotoReader } from "./photo-delete.ts";

const rows = (...ps: (string | null)[]) => ps.map(storage_path => ({ storage_path }));
function fakeReader(
  legacy: (string | null)[], child: (string | null)[],
  fail?: "legacy" | "child",
): { read: ItineraryPhotoReader; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    read: {
      legacy: async (id) => { seen.push(`legacy:${id}`); return { ok: fail !== "legacy", rows: rows(...legacy) }; },
      child:  async (id) => { seen.push(`child:${id}`);  return { ok: fail !== "child",  rows: rows(...child)  }; },
    },
  };
}

test("P1 첫 장과 자식 사진을 모두 모은다 (사진 2장 이상)", async () => {
  const f = fakeReader(["m1/first.jpg"], ["m1/second.jpg", "m1/third.jpg"]);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.paths.sort(), ["m1/first.jpg", "m1/second.jpg", "m1/third.jpg"]);
});

test("P2 Memory 가 여럿이어도 전부 모은다", async () => {
  const f = fakeReader(["m1/a.jpg", "m2/a.jpg"], ["m1/b.jpg", "m2/b.jpg"]);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.strictEqual(r.paths.length, 4);
});

test("P3 중복 경로는 한 번만 담는다", async () => {
  const f = fakeReader(["dup.jpg"], ["dup.jpg", "other.jpg"]);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.paths.sort(), ["dup.jpg", "other.jpg"]);
});

test("P4 null·빈 경로는 버린다", async () => {
  const f = fakeReader([null, ""], [null, "real.jpg"]);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.paths, ["real.jpg"]);
});

test("P5 사진이 하나도 없으면 빈 목록 (기존 동작 회귀 없음)", async () => {
  const f = fakeReader([], []);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.paths, []);
});

test("P6 사진 1장만 있던 기존 경우도 그대로 동작한다", async () => {
  const f = fakeReader(["only.jpg"], []);
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, true);
  if (!r.ok) return;
  assert.deepStrictEqual(r.paths, ["only.jpg"]);
});

test("P7 자식 조회가 실패하면 진행하지 않는다 — 조용히 넘기지 않는다", async () => {
  const f = fakeReader(["first.jpg"], [], "child");
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.stage, "child");
});

test("P8 첫 장 조회가 실패해도 진행하지 않는다", async () => {
  const f = fakeReader([], ["c.jpg"], "legacy");
  const r = await collectItineraryPhotoPaths(f.read, "itin");
  assert.strictEqual(r.ok, false);
  if (r.ok) return;
  assert.strictEqual(r.stage, "legacy");
});

test("P9 두 조회 모두 같은 여행 id 로 나간다", async () => {
  const f = fakeReader(["a.jpg"], ["b.jpg"]);
  await collectItineraryPhotoPaths(f.read, "itin-42");
  assert.deepStrictEqual(f.seen.sort(), ["child:itin-42", "legacy:itin-42"]);
});

// ── 삭제 순서 계약: Storage 가 먼저, 실패하면 DB 로 넘어가지 않는다 ──────────

test("P10 itinerary DELETE 는 경로 수집 실패 시 DB 삭제로 넘어가지 않는다", () => {
  const src = readFileSync("functions/api/itinerary/[id].ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const del = src.slice(src.indexOf("export async function onRequestDelete"));

  const collect = del.indexOf("collectItineraryPhotoPaths(");
  const guard   = del.indexOf("if (!collected.ok)");
  const storage = del.indexOf("removeItineraryStorage(");
  const dbDel   = del.indexOf(".delete()");
  assert.ok(collect > 0 && guard > collect, "수집 실패 검사가 없다");
  assert.ok(storage > guard,  "Storage 삭제가 검사보다 먼저다");
  assert.ok(dbDel   > storage, "DB 삭제가 Storage 삭제보다 먼저다");

  // 자식 테이블을 실제로 읽는다
  assert.match(del, /trip_moment_photos/);
  // 경로 자체를 로그에 남기지 않는다. 개수(`.length`)는 값이 아니라 세기다.
  for (const l of del.match(/console\.error\([^)]*\)/g) ?? []) {
    const withoutCounts = l.replace(/\b\w+\.length\b/g, "COUNT");
    assert.ok(!/storagePaths|storage_path|collected\.paths/.test(withoutCounts),
      `로그에 경로가 실린다: ${l}`);
  }
});

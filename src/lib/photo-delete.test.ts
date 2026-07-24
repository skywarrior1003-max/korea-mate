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

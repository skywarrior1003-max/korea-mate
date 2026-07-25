/**
 * Unit tests for signed URL helper
 * Run: node --experimental-strip-types src/lib/photo-url.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMomentSignedUrl, PHOTO_URL_EXPIRES_IN } from "./photo-url.ts";

// ── mock 헬퍼 ─────────────────────────────────────────────────────────────────

function mockStorageOk(signedUrl: string) {
  return {
    from: (_bucket: string) => ({
      createSignedUrl: async (_path: string, _exp: number) => ({
        data: { signedUrl },
        error: null,
      }),
    }),
  };
}

function mockStorageFail(msg: string) {
  return {
    from: (_bucket: string) => ({
      createSignedUrl: async () => ({ data: null, error: { message: msg } }),
    }),
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

test("정상 소유자: signed URL 생성 성공", async () => {
  const url = "https://example.supabase.co/storage/v1/object/sign/moments/a/b/c.jpg?token=xxx";
  const result = await createMomentSignedUrl(mockStorageOk(url), "a/b/c.jpg");
  assert.ok(typeof result !== "string", `expected object, got: ${result}`);
  assert.strictEqual(result.signedUrl, url);
});

test("expiresAt: 현재 + 600초 ±2초 범위", async () => {
  const before = Date.now();
  const result = await createMomentSignedUrl(mockStorageOk("https://x.com/img.jpg"), "a.jpg");
  const after = Date.now();
  assert.ok(typeof result !== "string");
  const exp = new Date(result.expiresAt).getTime();
  assert.ok(exp >= before + PHOTO_URL_EXPIRES_IN * 1000 - 2000,
    `expiresAt too early: ${result.expiresAt}`);
  assert.ok(exp <= after + PHOTO_URL_EXPIRES_IN * 1000 + 2000,
    `expiresAt too late: ${result.expiresAt}`);
});

test("응답 내 storage_path 비포함", async () => {
  const result = await createMomentSignedUrl(mockStorageOk("https://x.com/img.jpg"), "secret/path/file.jpg");
  assert.ok(typeof result !== "string");
  assert.ok(!("storagePath" in result));
  assert.ok(!("storage_path" in result));
  assert.ok(!("path" in result));
  assert.deepStrictEqual(Object.keys(result).sort(), ["expiresAt", "signedUrl"]);
});

test("Storage signed URL 실패 → 오류 문자열 반환", async () => {
  const result = await createMomentSignedUrl(mockStorageFail("permission denied"), "a/b.jpg");
  assert.ok(typeof result === "string");
  assert.match(result, /permission denied/);
});

test("data=null, error=null → 오류 문자열 반환", async () => {
  const storage = {
    from: (_bucket: string) => ({
      createSignedUrl: async () => ({ data: null, error: null }),
    }),
  };
  const result = await createMomentSignedUrl(storage, "a.jpg");
  assert.ok(typeof result === "string" && result.length > 0);
});

test("빈 signedUrl → 오류 문자열 반환", async () => {
  const storage = {
    from: (_bucket: string) => ({
      createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
    }),
  };
  const result = await createMomentSignedUrl(storage, "a.jpg");
  assert.ok(typeof result === "string" && result.length > 0);
});

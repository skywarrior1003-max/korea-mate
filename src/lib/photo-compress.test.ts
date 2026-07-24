/**
 * Unit tests for upload-grade photo compression logic (runCompressSteps, calcResizeDimensions)
 * Run: node --experimental-strip-types src/lib/photo-compress.test.ts
 *
 * Canvas API는 Node.js에 없음 → runCompressSteps(injectable encoder)로 로직 검증.
 * compressPhotoBlob 자체는 브라우저 E2E 검증으로 커버.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcResizeDimensions, runCompressSteps } from "./trip-moments/storage.ts";

const MB = 1_048_576;

// ── calcResizeDimensions ──────────────────────────────────────────────────────

test("landscape: 긴 변 1920px 제한", () => {
  const r = calcResizeDimensions(4000, 3000);
  assert.equal(r.w, 1920);
  assert.equal(r.h, 1440);
});

test("portrait: 긴 변 1920px 제한", () => {
  const r = calcResizeDimensions(3000, 4000);
  assert.equal(r.w, 1440);
  assert.equal(r.h, 1920);
});

test("정방형: 긴 변 1920px 제한", () => {
  const r = calcResizeDimensions(2048, 2048);
  assert.equal(r.w, 1920);
  assert.equal(r.h, 1920);
});

test("원본 < 1920px: 확대 없음", () => {
  const r = calcResizeDimensions(800, 600);
  assert.equal(r.w, 800);
  assert.equal(r.h, 600);
});

test("원본 정확히 1920px: 그대로 통과", () => {
  const r = calcResizeDimensions(1920, 1080);
  assert.equal(r.w, 1920);
  assert.equal(r.h, 1080);
});

test("비율 유지 (4K 16:9 → 1920×1080)", () => {
  const r = calcResizeDimensions(3840, 2160);
  assert.equal(r.w, 1920);
  assert.equal(r.h, 1080);
});

test("비율 유지: src비율과 dst비율의 차이 < 0.01", () => {
  const srcW = 3000, srcH = 4000;
  const { w, h } = calcResizeDimensions(srcW, srcH);
  const srcRatio = srcW / srcH;
  const dstRatio = w / h;
  assert.ok(Math.abs(srcRatio - dstRatio) < 0.01, `ratio mismatch: ${srcRatio} vs ${dstRatio}`);
});

test("maxLong 오버라이드 (1600px)", () => {
  const r = calcResizeDimensions(4000, 3000, 1600);
  assert.equal(r.w, 1600);
  assert.equal(r.h, 1200);
});

// ── runCompressSteps ──────────────────────────────────────────────────────────

test("1MB 이하 즉시 통과 — 첫 품질(0.82) 한 번만 호출", async () => {
  const calls: { w: number; h: number; quality: number }[] = [];
  const blob = await runCompressSteps(4000, 3000, async (w, h, quality) => {
    calls.push({ w, h, quality });
    return new Blob([new Uint8Array(600_000)]); // 600 KB
  });
  assert.equal(blob.size, 600_000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].quality, 0.82);
  assert.equal(calls[0].w, 1920);
});

test("품질 단계 하향: 0.82 → 0.77 → 0.72", async () => {
  const qualities: number[] = [];
  await runCompressSteps(4000, 3000, async (_w, _h, quality) => {
    qualities.push(quality);
    // 0.72에서만 1MB 미만으로 성공
    const size = quality < 0.73 ? 700_000 : 1_100_000;
    return new Blob([new Uint8Array(size)]);
  });
  assert.deepStrictEqual(qualities.slice(0, 3), [0.82, 0.77, 0.72]);
});

test("1600px 재축소: 1920px 전 품질 실패 후 1600px 성공", async () => {
  const calls: { w: number; h: number; quality: number }[] = [];
  const blob = await runCompressSteps(4000, 3000, async (w, h, quality) => {
    calls.push({ w, h, quality });
    // 1920px 전부 실패, 1600px에서 첫 시도에 성공
    const isAt1920 = Math.max(w, h) > 1600;
    return new Blob([new Uint8Array(isAt1920 ? 1_200_000 : 700_000)]);
  });
  assert.ok(blob.size <= MB);
  // 처음 3 호출은 w=1920
  const at1920 = calls.filter(c => Math.max(c.w, c.h) > 1600);
  assert.equal(at1920.length, 3);
  // 4번째 이후 호출은 w=1600 범주
  const at1600 = calls.filter(c => Math.max(c.w, c.h) <= 1600);
  assert.ok(at1600.length >= 1);
  assert.equal(Math.max(at1600[0].w, at1600[0].h), 1600);
});

test("최종 1MB 초과 오류: 모든 단계 실패 시 throw", async () => {
  await assert.rejects(
    () => runCompressSteps(4000, 3000, async () => new Blob([new Uint8Array(1_100_000)])),
    /cannot compress|1 mb|limit/i,
  );
});

test("원본 < 1920px + 1MB 이하: 리사이즈 없이 즉시 통과", async () => {
  const calls: { w: number; h: number }[] = [];
  await runCompressSteps(800, 600, async (w, h) => {
    calls.push({ w, h });
    return new Blob([new Uint8Array(400_000)]);
  });
  assert.equal(calls[0].w, 800);
  assert.equal(calls[0].h, 600);
});

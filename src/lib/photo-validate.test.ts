/**
 * Unit tests for photo-validate.ts
 * Run: node --experimental-strip-types src/lib/photo-validate.test.ts
 *
 * Integration scenarios (DB ownership, count limits, Storage rollback) require
 * a live DB + Storage environment and are covered by manual E2E testing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_BYTES,
  DEVICE_PHOTO_LIMIT,
  ITINERARY_PHOTO_LIMIT,
  validateMimeType,
  validatePhotoSize,
  hasJpegSoi,
  makeStoragePath,
} from "./photo-validate.ts";
import { stripJpegApp1 } from "./jpeg-strip-exif.ts";

// ── Fixture helpers (subset of jpeg-strip-exif.test.ts) ────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function seg(markerId: number, payload: number[]): Uint8Array {
  const len = 2 + payload.length;
  return new Uint8Array([0xff, markerId, (len >> 8) & 0xff, len & 0xff, ...payload]);
}

const SOI  = new Uint8Array([0xff, 0xd8]);
const EOI  = new Uint8Array([0xff, 0xd9]);
const APP1 = seg(0xe1, [0x45, 0x78, 0x69, 0x66]); // "Exif"

function sos(data: number[] = [0xaa, 0xbb, 0xcc]): Uint8Array {
  const hdr = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  return concat(hdr, new Uint8Array(data), EOI);
}

function minimalJpeg(): Uint8Array { return concat(SOI, sos()); }
function jpegWithApp1(): Uint8Array { return concat(SOI, APP1, sos()); }

// ── validateMimeType ───────────────────────────────────────────────────────────

test("validateMimeType: image/jpeg accepted", () => {
  const r = validateMimeType("image/jpeg");
  assert.equal(r.ok, true);
});

test("validateMimeType: image/png rejected", () => {
  const r = validateMimeType("image/png");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.match(r.error, /jpeg/i);
  }
});

test("validateMimeType: image/jpeg; charset=utf-8 rejected (exact match)", () => {
  const r = validateMimeType("image/jpeg; charset=utf-8");
  assert.equal(r.ok, false);
});

test("validateMimeType: empty string rejected", () => {
  const r = validateMimeType("");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("validateMimeType: spoofed image/jpeg uppercase rejected", () => {
  // MIME types are case-insensitive in HTTP but we enforce lowercase to prevent bypass
  const r = validateMimeType("image/JPEG");
  assert.equal(r.ok, false);
});

// ── validatePhotoSize ──────────────────────────────────────────────────────────

test("validatePhotoSize: 0 bytes accepted", () => {
  assert.equal(validatePhotoSize(0).ok, true);
});

test("validatePhotoSize: exactly 1 MB accepted", () => {
  assert.equal(validatePhotoSize(MAX_PHOTO_BYTES).ok, true);
});

test("validatePhotoSize: 1 MB + 1 byte rejected", () => {
  const r = validatePhotoSize(MAX_PHOTO_BYTES + 1);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 413);
});

test("validatePhotoSize: 2 MB rejected", () => {
  const r = validatePhotoSize(2 * 1024 * 1024);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 413);
});

// ── hasJpegSoi ────────────────────────────────────────────────────────────────

test("hasJpegSoi: valid JPEG SOI detected", () => {
  assert.equal(hasJpegSoi(new Uint8Array([0xff, 0xd8, 0x00])), true);
});

test("hasJpegSoi: PNG header rejected", () => {
  assert.equal(hasJpegSoi(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
});

test("hasJpegSoi: empty bytes rejected", () => {
  assert.equal(hasJpegSoi(new Uint8Array([])), false);
});

test("hasJpegSoi: 1 byte rejected", () => {
  assert.equal(hasJpegSoi(new Uint8Array([0xff])), false);
});

test("hasJpegSoi: FF 00 (not FF D8) rejected", () => {
  assert.equal(hasJpegSoi(new Uint8Array([0xff, 0x00])), false);
});

// ── makeStoragePath ───────────────────────────────────────────────────────────

test("makeStoragePath: correct format", () => {
  const path = makeStoragePath("itin-1", "mom-1", "ver-1");
  assert.equal(path, "itin-1/mom-1/ver-1.jpg");
});

test("makeStoragePath: ends with .jpg", () => {
  const path = makeStoragePath("a", "b", "c");
  assert.ok(path.endsWith(".jpg"));
});

test("makeStoragePath: three segments separated by /", () => {
  const path = makeStoragePath("x", "y", "z");
  const parts = path.split("/");
  assert.equal(parts.length, 3);
  assert.equal(parts[2], "z.jpg");
});

// ── Constants sanity ──────────────────────────────────────────────────────────

test("MAX_PHOTO_BYTES is exactly 1 MB", () => {
  assert.equal(MAX_PHOTO_BYTES, 1024 * 1024);
});

test("DEVICE_PHOTO_LIMIT is 100", () => {
  assert.equal(DEVICE_PHOTO_LIMIT, 100);
});

test("ITINERARY_PHOTO_LIMIT is 30", () => {
  assert.equal(ITINERARY_PHOTO_LIMIT, 30);
});

// ── JPEG structural tests (via stripJpegApp1) ─────────────────────────────────
// 잘린 JPEG, EOI 없는 JPEG — these errors surface through stripJpegApp1

test("JPEG with APP1: stripJpegApp1 removes it, output starts with SOI", () => {
  const input = jpegWithApp1();
  const result = stripJpegApp1(input);
  assert.equal(result[0], 0xff);
  assert.equal(result[1], 0xd8);
  // APP1 bytes should not appear in result
  const resultHex = Buffer.from(result).toString("hex");
  const app1Hex   = Buffer.from(APP1).toString("hex").slice(0, 8); // FF E1 marker
  assert.ok(!resultHex.includes("ffe1"), "APP1 marker should be removed");
});

test("JPEG without APP1: stripJpegApp1 returns identical bytes", () => {
  const input = minimalJpeg();
  const result = stripJpegApp1(input);
  assert.deepStrictEqual(result, input);
});

test("truncated JPEG: stripJpegApp1 throws (잘린 JPEG)", () => {
  const truncated = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // abrupt end
  assert.throws(() => stripJpegApp1(truncated), /truncated|invalid|end/i);
});

test("missing EOI: stripJpegApp1 throws (EOI 없는 JPEG)", () => {
  const noEoi = concat(SOI, sos([0xaa]));
  // Corrupt EOI
  const corrupted = noEoi.slice(0, noEoi.length - 2);
  assert.throws(() => stripJpegApp1(corrupted), /EOI|missing|end/i);
});

test("non-JPEG bytes: hasJpegSoi returns false before stripJpegApp1 is called", () => {
  const notJpeg = new Uint8Array([0x47, 0x49, 0x46]); // GIF header
  assert.equal(hasJpegSoi(notJpeg), false);
});

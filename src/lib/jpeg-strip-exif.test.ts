/**
 * Unit tests for jpeg-strip-exif.ts
 * Run: node --experimental-strip-types src/lib/jpeg-strip-exif.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripJpegApp1 } from "./jpeg-strip-exif.ts";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** Build a standard JPEG segment: FF <id> <len_hi> <len_lo> <payload...>
 *  Length field = 2 + payload.length (includes itself per JPEG spec). */
function seg(markerId: number, payload: number[]): Uint8Array {
  const lenVal = 2 + payload.length;
  return new Uint8Array([0xff, markerId, (lenVal >> 8) & 0xff, lenVal & 0xff, ...payload]);
}

const SOI = new Uint8Array([0xff, 0xd8]);
const EOI = new Uint8Array([0xff, 0xd9]);

/** Minimal SOS segment + simulated compressed data + EOI */
function sos(compressedData: number[] = [0xaa, 0xbb, 0xcc]): Uint8Array {
  // SOS header: Ns=1, Cs=1, Td/Ta=0, Ss=0, Se=63, Ah/Al=0  →  total header=8
  const hdr = new Uint8Array([
    0xff, 0xda, 0x00, 0x08,
    0x01,
    0x01, 0x00,
    0x00, 0x3f, 0x00,
  ]);
  return concat(hdr, new Uint8Array(compressedData), EOI);
}

// Minimal APP0 payload (JFIF-like, 4 dummy bytes)
const APP0 = seg(0xe0, [0x4a, 0x46, 0x49, 0x46]);
// Sample APP1 payloads
const APP1_A = seg(0xe1, [0x45, 0x78, 0x69, 0x66]);  // "Exif" 4 bytes
const APP1_B = seg(0xe1, [0x68, 0x74, 0x74, 0x70]);  // "http" 4 bytes (XMP-like)
// COM segment
const COM = seg(0xfe, [0x74, 0x65, 0x73, 0x74]);
// APP2 segment (ICC color profile stub)
const APP2 = seg(0xe2, [0x49, 0x43, 0x43, 0x5f]); // "ICC_" 4 bytes

// ── Tests ─────────────────────────────────────────────────────────────────────

test("no APP1: output equals input", () => {
  const input = concat(SOI, APP0, sos());
  const result = stripJpegApp1(input);
  assert.deepStrictEqual(result, input, "should return identical bytes when no APP1 present");
});

test("single APP1: removed from output", () => {
  const input = concat(SOI, APP0, APP1_A, sos());
  const result = stripJpegApp1(input);

  // Must not contain APP1 marker (0xFF E1) in segment position
  let foundApp1 = false;
  let pos = 2;
  while (pos + 1 < result.length) {
    if (result[pos] === 0xff) {
      const id = result[pos + 1];
      if (id === 0xe1) { foundApp1 = true; break; }
      if (id === 0xda) break; // SOS — stop
      const lenHi = result[pos + 2] ?? 0;
      const lenLo = result[pos + 3] ?? 0;
      const segLen = (lenHi << 8) | lenLo;
      pos += 2 + segLen;
    } else {
      pos++;
    }
  }
  assert.ok(!foundApp1, "APP1 segment should be absent from result");
  assert.ok(result.length < input.length, "result should be shorter than input");
  assert.equal(result[0], 0xff, "result must start with 0xFF");
  assert.equal(result[1], 0xd8, "result must start with 0xD8 (SOI)");
});

test("multiple APP1: all removed", () => {
  const input = concat(SOI, APP1_A, APP0, APP1_B, sos());
  const result = stripJpegApp1(input);

  // Count APP1 markers in segment positions
  let app1Count = 0;
  let pos = 2;
  while (pos + 1 < result.length) {
    if (result[pos] !== 0xff) { pos++; continue; }
    const id = result[pos + 1];
    if (id === 0xe1) app1Count++;
    if (id === 0xda) break;
    if (pos + 3 >= result.length) break;
    const lenHi = result[pos + 2];
    const lenLo = result[pos + 3];
    const segLen = (lenHi << 8) | lenLo;
    if (segLen < 2) break;
    pos += 2 + segLen;
  }
  assert.equal(app1Count, 0, "all APP1 segments must be removed");
  // APP0 and SOS+EOI still present → result must contain 0xFF E0
  const hasApp0 = Array.from(result).some((b, i, arr) =>
    b === 0xff && arr[i + 1] === 0xe0
  );
  assert.ok(hasApp0, "APP0 must be preserved");
});

test("APP1 between COM and SOS: other segments preserved", () => {
  const input = concat(SOI, COM, APP1_A, sos());
  const result = stripJpegApp1(input);

  const hasCom = Array.from(result).some((b, i, arr) =>
    b === 0xff && arr[i + 1] === 0xfe
  );
  assert.ok(hasCom, "COM segment must be preserved");
});

test("SOS compressed data preserved verbatim", () => {
  const compData = [0x11, 0x22, 0xff, 0x00, 0x33]; // 0xFF 00 = escape inside scan
  const input = concat(SOI, sos(compData));
  const result = stripJpegApp1(input);

  // Find SOS in result and check bytes after SOS header (10 bytes from SOI)
  // SOI(2) + FF DA(2) + SOS header(8) = 12 bytes → compressed data starts at 12
  const sosPos = 2; // SOI is 2 bytes, SOS starts immediately
  const scanDataStart = sosPos + 10; // FF DA(2) + length(2) + header(6)
  const actualScanData = Array.from(result.slice(scanDataStart, scanDataStart + compData.length));
  assert.deepStrictEqual(actualScanData, compData, "compressed scan data must be copied verbatim");
});

test("error: input too small", () => {
  assert.throws(
    () => stripJpegApp1(new Uint8Array([0xff, 0xd8])),
    /too small/i
  );
});

test("error: missing SOI marker", () => {
  assert.throws(
    () => stripJpegApp1(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])),
    /not a jpeg|missing SOI/i
  );
});

test("error: segment length < 2", () => {
  // SOI + FF E0 + 00 01 (length=1, invalid)
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xaa]);
  assert.throws(
    () => stripJpegApp1(buf),
    /invalid.*length|length.*invalid/i
  );
});

test("error: segment length exceeds buffer (overflow)", () => {
  // SOI + FF E0 + FF FF (length=65535, far beyond buffer)
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0xaa, 0xbb]);
  assert.throws(
    () => stripJpegApp1(buf),
    /exceeds|beyond|remain/i
  );
});

test("error: truncated JPEG — length field cut off", () => {
  // SOI + FF E0 (only 1 byte of length field)
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  assert.throws(
    () => stripJpegApp1(buf),
    /truncated|end of input|unexpected end/i
  );
});

test("error: APP1 segment length exceeds buffer", () => {
  // SOI + FF E1 + 01 00 (length=256, only 2 bytes available)
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x01, 0x00, 0xaa, 0xbb]);
  assert.throws(
    () => stripJpegApp1(buf),
    /exceeds|beyond|remain/i
  );
});

test("result always starts with FF D8", () => {
  const cases = [
    concat(SOI, sos()),
    concat(SOI, APP0, sos()),
    concat(SOI, APP1_A, sos()),
    concat(SOI, APP0, APP1_A, APP1_B, sos()),
  ];
  for (const input of cases) {
    const result = stripJpegApp1(input);
    assert.equal(result[0], 0xff);
    assert.equal(result[1], 0xd8);
  }
});

test("error: EOI missing (no FF D9 at end)", () => {
  // SOI + APP0 + SOS header + compressed data — no EOI
  const sosSeg = new Uint8Array([
    0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00,
    0x00, 0x3f, 0x00,
    0xaa, 0xbb, 0xcc,  // compressed data, no EOI
  ]);
  const input = concat(SOI, APP0, sosSeg);
  assert.throws(
    () => stripJpegApp1(input),
    /missing EOI|FF D9|end/i
  );
});

test("APP2 segment preserved", () => {
  const input = concat(SOI, APP2, APP1_A, sos());
  const result = stripJpegApp1(input);

  const hasApp2 = Array.from(result).some((b, i, arr) =>
    b === 0xff && arr[i + 1] === 0xe2
  );
  assert.ok(hasApp2, "APP2 (ICC) segment must be preserved");

  const hasApp1 = Array.from(result).some((b, i, arr) =>
    b === 0xff && arr[i + 1] === 0xe1
  );
  assert.ok(!hasApp1, "APP1 must be removed even when APP2 is present");
});

test("~1MB input: processed without error", () => {
  // Build ~1MB JPEG: SOI + multiple COM segments (~60KB each) + SOS + EOI
  const CHUNK = 60000;
  const TARGET = 1024 * 1024;
  const parts: Uint8Array[] = [SOI];

  let built = 2; // SOI
  while (built < TARGET - 200) {
    const lenVal = 2 + CHUNK;
    const s = new Uint8Array(2 + 2 + CHUNK);
    s[0] = 0xff; s[1] = 0xfe; // COM marker
    s[2] = (lenVal >> 8) & 0xff;
    s[3] = lenVal & 0xff;
    parts.push(s);
    built += s.length;
  }
  parts.push(sos());
  const input = concat(...parts);

  assert.ok(input.length >= TARGET, `input must be >= 1MB, got ${input.length}`);
  const result = stripJpegApp1(input);
  assert.equal(result[0], 0xff);
  assert.equal(result[1], 0xd8);
  // All COM segments preserved → result nearly same size
  assert.ok(result.length >= TARGET - 100, "COM segments must be intact");
});

console.log("All tests passed ✓");

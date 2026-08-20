/**
 * asset-proxy — 승인 자산 upstream fetch 코어 (TASK-SHARE-OG-PREVIEW-FIX-01)
 * Run: node --experimental-strip-types --test src/lib/trip-cover/asset-proxy.test.ts
 * fetch 를 주입해 네트워크 없이 V1A SECURITY CONTRACT 를 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchApprovedAssetBytes,
  ASSET_MAX_BYTES,
} from "./asset-proxy.ts";

const GOOD_URL = "https://tong.visitkorea.or.kr/cms2/website/18/3494918.jpg";

interface UpstreamOpts {
  ok?:          boolean;
  url?:         string;
  contentType?: string | null;
  length?:      string | null;
  bytes?:       number;
}

/** 실제 Response 대신 필요한 표면만 흉내낸다 — 생성된 Response 는 url 을 못 정한다 */
function stubFetch(opts: UpstreamOpts, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    calls.push(String(input));
    const headers = new Headers();
    if (opts.contentType !== null) headers.set("Content-Type", opts.contentType ?? "image/jpeg");
    if (opts.length != null) headers.set("Content-Length", opts.length);
    return {
      ok:          opts.ok ?? true,
      url:         opts.url ?? GOOD_URL,
      headers,
      arrayBuffer: async () => new ArrayBuffer(opts.bytes ?? 1024),
    } as unknown as Response;
  }) as typeof fetch;
}

test("P1: 정상 JPEG 는 ok + bytes + Content-Type 을 돌려준다", async () => {
  const r = await fetchApprovedAssetBytes(GOOD_URL, stubFetch({}));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.contentType, "image/jpeg");
    assert.equal(r.buf.byteLength, 1024);
  }
});

test("P2: 비표준 image/jpg 는 image/jpeg 로 정규화된다", async () => {
  const r = await fetchApprovedAssetBytes(GOOD_URL, stubFetch({ contentType: "image/jpg" }));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.contentType, "image/jpeg");
});

test("P3: https 가 아니면 fetch 자체를 하지 않는다", async () => {
  const calls: string[] = [];
  const r = await fetchApprovedAssetBytes(
    "http://tong.visitkorea.or.kr/a.jpg", stubFetch({}, calls));
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("P4: 허용 목록 밖 호스트는 fetch 자체를 하지 않는다", async () => {
  const calls: string[] = [];
  const r = await fetchApprovedAssetBytes("https://evil.example.com/a.jpg", stubFetch({}, calls));
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("P5: redirect 최종 호스트가 허용 목록 밖이면 거부한다", async () => {
  const r = await fetchApprovedAssetBytes(
    GOOD_URL, stubFetch({ url: "https://evil.example.com/a.jpg" }));
  assert.equal(r.ok, false);
});

test("P6: upstream 이 ok 가 아니면 거부한다", async () => {
  const r = await fetchApprovedAssetBytes(GOOD_URL, stubFetch({ ok: false }));
  assert.equal(r.ok, false);
});

test("P7: 이미지가 아닌 MIME(text/html)은 거부한다", async () => {
  const r = await fetchApprovedAssetBytes(GOOD_URL, stubFetch({ contentType: "text/html" }));
  assert.equal(r.ok, false);
});

test("P8: 선언된 Content-Length 가 상한 초과면 거부한다", async () => {
  const r = await fetchApprovedAssetBytes(
    GOOD_URL, stubFetch({ length: String(ASSET_MAX_BYTES + 1) }));
  assert.equal(r.ok, false);
});

test("P9: Content-Length 없이 실제 본문이 상한 초과여도 거부한다", async () => {
  const r = await fetchApprovedAssetBytes(
    GOOD_URL, stubFetch({ bytes: ASSET_MAX_BYTES + 1 }));
  assert.equal(r.ok, false);
});

test("P10: fetch 가 throw 하면 { ok:false } 로 수렴한다", async () => {
  const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
  const r = await fetchApprovedAssetBytes(GOOD_URL, boom);
  assert.equal(r.ok, false);
});

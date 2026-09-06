// Home URL 자동 감지 단위 테스트
// 실행: node --experimental-strip-types src/lib/home-url-detect.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPastedUrl } from "./home-url-detect.ts";

test("일반 검색어는 URL 이 아니다", () => {
  for (const q of ["부산", "해운대", "경복궁", "busan beach", "seoul.food 맛집", ""]) {
    assert.equal(detectPastedUrl(q), null, q);
  }
});

test("자기 공유 링크 → internal/shared, canonical path 보존", () => {
  const d = detectPastedUrl("https://gokoreamate.com/shared/abc123?d=1");
  assert.deepEqual(d, { kind: "internal", path: "/shared/abc123?d=1", shared: true });
  const noScheme = detectPastedUrl("gokoreamate.com/shared/abc123");
  assert.equal(noScheme?.kind, "internal");
  assert.equal((noScheme as { shared: boolean }).shared, true);
});

test("자기 링크(비공유 경로) → internal", () => {
  const d = detectPastedUrl("https://www.gokoreamate.com/place/439/");
  assert.deepEqual(d, { kind: "internal", path: "/place/439/", shared: false });
});

test("외부 URL → external (엔진 없음 — 분류만)", () => {
  const d = detectPastedUrl("https://blog.example.com/my-trip");
  assert.equal(d?.kind, "external");
  assert.equal(detectPastedUrl("https://visitbusan.net/a")?.kind, "external");
});

test("URL 비슷한 쓰레기 입력은 검색어로 남는다", () => {
  assert.equal(detectPastedUrl("https://"), null);
  assert.equal(detectPastedUrl("http://nohost"), null);
});

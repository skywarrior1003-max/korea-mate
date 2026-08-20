/**
 * TASK-OG-FALLBACK-404-FIX-01 — 기본 OG fallback 이미지 전달 계약 가드
 * Run: node --experimental-strip-types --test src/lib/og-fallback-asset-guard.test.ts
 *
 * 결함: Next 정적 export 는 opengraph-image 를 확장자 없이 내보내는데
 * (1) 수동 metadata·shared fallback 은 .png 를 참조 → Production 404
 * (2) 확장자 없는 경로는 application/octet-stream 으로 서빙됐다
 *     (_headers 의 Content-Type 지정은 Pages 가 무시 — wrangler 실측).
 * 계약: build 가 .png 별칭을 만들고(1), 확장자 없는 경로는 얇은 Pages Function
 * 이 Content-Type 을 실제 형식(PNG)으로 교정한다(2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { withPngContentType } from "./og-asset-mime.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8").replace(/\r\n/g, "\n");

const buildScript = read("scripts/build-static.mjs");
const sharedFn    = read("functions/shared/[id].ts");

test("F1: build 스크립트가 OG .png 별칭을 만들고 PNG 서명을 검증한다", () => {
  assert.ok(buildScript.includes("aliasOgPng"), "별칭 생성 함수가 있어야 한다");
  assert.ok(buildScript.includes("opengraph-image"));
  assert.ok(buildScript.includes("0x89, 0x50, 0x4e, 0x47"), "PNG 서명 검증이 있어야 한다");
  assert.ok(buildScript.includes("copyFileSync(src, `${src}.png`)"), ".png 복사가 있어야 한다");
});

test("F2: 확장자 없는 OG 경로는 MIME 교정 함수가 감싼다", () => {
  for (const fn of ["functions/opengraph-image.ts", "functions/og/[city]/opengraph-image.ts"]) {
    const src = read(fn);
    assert.ok(src.includes("withPngContentType"), `${fn} 이 공용 교정 함수를 써야 한다`);
    assert.ok(src.includes("env.ASSETS.fetch"), `${fn} 은 정적 산출물을 그대로 서빙해야 한다`);
  }
});

test("F3: src/app/og 의 모든 도시에 opengraph-image.tsx 가 있다 ([city] 함수가 커버)", () => {
  const ogDir = new URL("src/app/og/", ROOT);
  const cities = readdirSync(ogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(cities.length > 0, "도시 OG route 가 있어야 한다");
  for (const city of cities) {
    assert.ok(
      existsSync(new URL(`src/app/og/${city}/opengraph-image.tsx`, ROOT)),
      `og/${city} 에 opengraph-image.tsx 가 있어야 한다`,
    );
  }
});

test("F4: shared fallback OG URL 은 build 가 별칭을 만드는 .png 경로다", () => {
  assert.ok(sharedFn.includes("https://gokoreamate.com/opengraph-image.png"));
});

test("F5: 루트 OG 렌더러 선언 규격은 1200x630 image/png 다 (치수·형식 원천)", () => {
  const og = read("src/app/opengraph-image.tsx");
  assert.match(og, /width:\s*1200/);
  assert.match(og, /height:\s*630/);
  assert.match(og, /contentType\s*=\s*"image\/png"/);
});

// ── withPngContentType 단위 테스트 ───────────────────────────────────────────

test("M1: octet-stream 200 응답은 image/png 로 교정된다 (body 유지)", async () => {
  const res = withPngContentType(new Response("PNGBYTES", {
    status: 200,
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-cache" },
  }));
  assert.equal(res.headers.get("Content-Type"), "image/png");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("Cache-Control"), "no-cache", "기존 헤더는 유지된다");
  assert.equal(await res.text(), "PNGBYTES", "body 는 그대로여야 한다");
});

test("M2: 404 는 교정하지 않고 그대로 통과한다", () => {
  const notFound = new Response("nf", { status: 404, headers: { "Content-Type": "application/octet-stream" } });
  assert.equal(withPngContentType(notFound), notFound);
});

test("M3: HTML(SPA fallback) 응답은 건드리지 않는다 — HTML 에 image/png 금지", () => {
  const html = new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  assert.equal(withPngContentType(html), html);
});

test("M4: 이미 image/png 인 응답은 그대로 통과한다", () => {
  const png = new Response("x", { status: 200, headers: { "Content-Type": "image/png" } });
  assert.equal(withPngContentType(png), png);
});

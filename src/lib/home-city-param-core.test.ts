// Home ?city= 파라미터 해석 테스트
// 실행: node --experimental-strip-types src/lib/home-city-param-core.test.ts
//
// 실제 도시 config 를 그대로 불러 검증한다 — mock 을 두면 "목록에 jeonju 가
// 빠져 있었다" 같은 계약 어긋남을 테스트가 놓친다. 원래 결함이 정확히
// 그것이었다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCityParam, stripCityParam } from "./home-city-param-core.ts";

// ── 플래너 지원 도시 4개 — 기존 동작 보존 ───────────────────────────────────
test("busan query keeps the Busan planner context", () => {
  assert.deepEqual(resolveCityParam("busan"), { kind: "planner", city: "Busan" });
});

// 아직 열지 않은 도시는 주소로도 플래너에 들어가지 않는다.
//
// 예전에는 진입 화면이 들고 있던 `plannerReady` 가 판단했고, 그 값이
// `CityConfig.planningReady` 와 어긋나 있었다. 버튼에는 "준비 중" 이라고
// 적혀 있는데 `?city=seoul` 로는 들어가졌다 — 그 도시에는 장소가 한 곳도
// 없어서 빈 일정이 나온다.
test("seoul query goes to its city entry — 아직 열지 않았다", () => {
  assert.deepEqual(resolveCityParam("seoul"), { kind: "redirect", href: "/seoul/" });
});

test("jeju query keeps the Jeju planner context — JEJU ACTIVATION 으로 열렸다", () => {
  assert.deepEqual(resolveCityParam("jeju"), { kind: "planner", city: "Jeju" });
});

test("gyeongju query keeps the Gyeongju planner context", () => {
  assert.deepEqual(resolveCityParam("gyeongju"), { kind: "planner", city: "Gyeongju" });
});

// 클론 링크는 이미 대문자 도시명을 넘긴다. 같은 경로로 계속 통해야 한다.
test("capitalised city names from clone links still resolve", () => {
  assert.deepEqual(resolveCityParam("Busan"),    { kind: "planner", city: "Busan" });
  assert.deepEqual(resolveCityParam("Gyeongju"), { kind: "planner", city: "Gyeongju" });
  // 대소문자·공백 처리는 그대로다. 열려 있지 않은 도시는 진입 화면으로 간다.
  assert.deepEqual(resolveCityParam("  jEjU  "), { kind: "planner", city: "Jeju" });
});

// ── 미지원 도시 — 진입 화면으로 ─────────────────────────────────────────────
test("jeonju redirects to its own city entry, not the planner", () => {
  assert.deepEqual(resolveCityParam("jeonju"), { kind: "redirect", href: "/jeonju/" });
});

test("jeonju never falls back to Busan", () => {
  const r = resolveCityParam("jeonju");
  assert.notEqual(r.kind, "planner");
  assert.equal(JSON.stringify(r).includes("Busan"), false);
});

// redirect 목적지가 다시 ?city= 를 달고 있으면 루프가 된다.
test("redirect target carries no city query, so it cannot loop", () => {
  const r = resolveCityParam("jeonju");
  assert.equal(r.kind, "redirect");
  if (r.kind !== "redirect") return;
  assert.equal(r.href.includes("?"), false);
  assert.equal(r.href, "/jeonju/");
  // 목적지 경로에는 city 파라미터가 없으므로 두 번째 판정은 none 이다.
  assert.deepEqual(resolveCityParam(new URLSearchParams("").get("city")), { kind: "none" });
});

// ── 잘못된 slug ─────────────────────────────────────────────────────────────
test("unknown slug is not a city and is not routed anywhere", () => {
  const r = resolveCityParam("unknown-city");
  assert.deepEqual(r, { kind: "ignore" });
});

test("unknown slug is never read as Busan", () => {
  for (const bad of ["unknown-city", "tokyo", "busan-x", "../busan", "1", "%20"]) {
    const r = resolveCityParam(bad);
    assert.equal(r.kind, "ignore", `${bad} should be ignored`);
  }
});

// ── 파라미터 없음 — 기존 Home 유지 ──────────────────────────────────────────
test("no city param leaves Home untouched", () => {
  assert.deepEqual(resolveCityParam(null),      { kind: "none" });
  assert.deepEqual(resolveCityParam(undefined), { kind: "none" });
  assert.deepEqual(resolveCityParam(""),        { kind: "none" });
  assert.deepEqual(resolveCityParam("   "),     { kind: "none" });
});

// ── 잘못된 query 정리 ───────────────────────────────────────────────────────
test("stripCityParam removes only the city key", () => {
  assert.equal(stripCityParam("/", "?city=unknown-city"), "/");
  assert.equal(stripCityParam("/", "?city=unknown&ref=clone"), "/?ref=clone");
  assert.equal(stripCityParam("/", ""), "/");
});

test("stripped url no longer resolves to a city", () => {
  const next = stripCityParam("/", "?city=unknown-city");
  const q = next.includes("?") ? next.slice(next.indexOf("?")) : "";
  assert.deepEqual(resolveCityParam(new URLSearchParams(q).get("city")), { kind: "none" });
});

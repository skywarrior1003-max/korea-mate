/**
 * TASK-MY-TRIP-CONNECT-FIX-V1 — Explore 링크는 현재 여행 도시를 가리킨다.
 * Run: node --experimental-strip-types --test src/lib/explore-href.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exploreHrefFor, DEFAULT_EXPLORE_HREF } from "./explore-href.ts";
import { cityPresetOptions, CITY_ARRIVAL_OPTIONS } from "../data/city-presets.ts";
import { stayAreaOptions, findStayArea } from "./trip-stay/stay-core.ts";

test("★5도시 모두 자기 Explore 로 간다 — 표기 대소문자 무관", () => {
  for (const c of ["Busan", "Gyeongju", "Seoul", "Jeju", "Jeonju"]) {
    assert.equal(exploreHrefFor(c), `/explore/${c.toLowerCase()}/`);
    assert.equal(exploreHrefFor(c.toLowerCase()), `/explore/${c.toLowerCase()}/`);
    assert.equal(exploreHrefFor(` ${c.toUpperCase()} `), `/explore/${c.toLowerCase()}/`);
  }
});

test("★도시가 없거나 모르는 도시면 기존 기본값(부산) — 라우트를 지어내지 않는다", () => {
  assert.equal(exploreHrefFor(null), DEFAULT_EXPLORE_HREF);
  assert.equal(exploreHrefFor(""), DEFAULT_EXPLORE_HREF);
  assert.equal(exploreHrefFor("daegu"), DEFAULT_EXPLORE_HREF);
});

test("★Picks 에 /explore/busan/ 하드코딩이 남아 있지 않다", () => {
  const src = readFileSync(new URL("../app/picks/PicksClient.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes('href="/explore/busan/"'), "PicksClient 에 고정 부산 링크");
  assert.ok(src.includes("exploreHrefFor("), "exploreHrefFor 를 쓴다");
});

test("★숙박 지역 옵션은 소문자 도시로도 5도시 전부 나온다 — 데이터는 그대로", () => {
  for (const key of Object.keys(CITY_ARRIVAL_OPTIONS)) {
    const upper = stayAreaOptions(key);
    const lower = stayAreaOptions(key.toLowerCase());
    assert.ok(upper.length > 0, `${key}: 숙박 지역 프리셋 0`);
    assert.deepEqual(lower, upper, `${key}: 소문자 조회 불일치`);
    assert.equal(findStayArea(key.toLowerCase(), upper[0]!.value)?.value, upper[0]!.value);
  }
  assert.deepEqual(cityPresetOptions("nowhere"), []);
  assert.deepEqual(cityPresetOptions(null), []);
});

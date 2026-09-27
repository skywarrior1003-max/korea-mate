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

test("★라벨·별칭도 자기 도시로 간다 — SSOT resolver 재사용 (CITY-ROUTING-RECOVERY)", () => {
  // Owner 재현: 도시 값이 라벨("전주"·"제주도")이면 부산으로 떨어지던 결함 고정
  const cases: Array<[string, string]> = [
    ["서울", "seoul"], ["전주", "jeonju"], ["제주도", "jeju"],
    ["경주", "gyeongju"], ["부산", "busan"], ["JEONJU", "jeonju"],
  ];
  for (const [input, slug] of cases) assert.equal(exploreHrefFor(input), `/explore/${slug}/`, input);
});

test("★nav 둘러보기 — 하드코딩 부산 리터럴 금지·현재 여행 도시 배선 (CITY-ROUTING-RECOVERY)", () => {
  for (const rel of ["../components/ui/BottomNav.tsx", "../components/ui/TopNav.tsx"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.ok(src.includes("exploreHrefFor(readTripDraft()?.city"), rel + ": draft 도시 배선 필요");
    assert.ok(!/href="\/explore\/busan\/?"/.test(src.replace(/\/\/.*$/gm, "").replace(/href: "\/explore\/busan"/, "")),
      rel + ": 렌더 href 부산 리터럴 금지");
  }
  const picks = readFileSync(new URL("../app/picks/PicksClient.tsx", import.meta.url), "utf8");
  assert.ok(picks.includes("starterPreviewCity"), "시작 전 선택 도시도 링크에 반영");
  assert.equal((picks.match(/exploreHrefFor\(tripCity \|\| starterPreviewCity\)/g) ?? []).length >= 2, true);
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

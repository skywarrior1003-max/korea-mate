// 눌러도 아무 일이 없는 버튼은 고장 난 버튼으로 읽힌다.
//
// 지역 전환은 `planningReady` 로 이미 막혀 있었지만, 화면은 활성 도시와 똑같이
// 생긴 채 반응만 없었다. 왜 안 되는지 말해 준다 — 막는 것과 알리는 것은 다른 일이다.
//
// 도시 이름은 여기서도 코드가 알지 않는다. 값이 true 로 바뀌면 표시가 사라지고
// 선택이 열려야 하며, 그때 이 파일은 손대지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

// 플래너 화면(도시 목록·coming-soon 표시)은 /planner 의 PlannerClient 다.
const HOME = read("src", "app", "planner", "PlannerClient.tsx");
const CODE = strip(HOME);

/** 도시 목록 블록만 — 이 화면의 다른 곳까지 끌어와 판단하지 않는다. */
const cityBlock = (() => {
  const s = CODE.indexOf('{tf("cityLabel")}');
  const e = CODE.indexOf('href={`/explore/${city.toLowerCase()}`}', s);
  return CODE.slice(s, e);
})();

test("★준비 중 여부는 planningReady 하나로 정한다", () => {
  assert.ok(cityBlock.length > 0, "도시 목록 블록을 못 찾았다");
  // 설정을 한 번 읽어 그림과 준비 여부를 같은 곳에서 가져온다.
  assert.match(cityBlock, /const conf\s*=\s*CITY_CONFIGS\[slug\]!;/);
  assert.match(cityBlock, /const ready\s*=\s*conf\.planningReady;/);
});

test("★도시가 하나의 목록으로 돈다 — 특정 도시만 따로 두지 않는다", () => {
  // Busan 만 떼어 둔 별도 버튼이 남아 있으면 값 하나로 열고 닫을 수 없다
  assert.doesNotMatch(cityBlock, /requestCitySwitch\("Busan"\)/);
  assert.match(cityBlock, /CITY_SLUGS\.map/, "목록이 SSOT 에서 오지 않는다");
  assert.equal((cityBlock.match(/<button/g) ?? []).length, 1, "도시 버튼이 하나의 map 이 아니다");
  assert.equal((cityBlock.match(/requestCitySwitch\(/g) ?? []).length, 1);
});

test("★준비 중 도시는 선택이 실행되지 않는다", () => {
  assert.match(cityBlock, /onClick=\{\(\) => \{ if \(ready\) requestCitySwitch\(c\.value\); \}\}/);
  assert.match(cityBlock, /aria-disabled=\{!ready\}/);
});

test("★준비 중이라고 말해 준다", () => {
  assert.match(cityBlock, /\{!ready && <span[^>]*>\{tf\("cityComingSoon"\)\}<\/span>\}/);
  // 준비 중인 도시에 "선택됨" 이 함께 뜨지 않는다
  assert.match(cityBlock, /\{ready && city === c\.value &&/);
});

test("★준비 중 버튼은 누를 수 있는 것처럼 보이지 않는다", () => {
  assert.match(cityBlock, /cursor-not-allowed/);
  // 활성일 때만 커서가 손가락이다
  assert.doesNotMatch(cityBlock, /text-base font-semibold transition-colors cursor-pointer/);
});

test("★도시 이름으로 준비 여부를 판단하지 않는다", () => {
  // 목록에 이름이 있는 것은 표시용이다. 판단에 쓰이면 값만 바꿔서 열 수 없다.
  for (const name of ["Busan", "Seoul", "Jeju", "Gyeongju"]) {
    assert.doesNotMatch(cityBlock, new RegExp(`ready[^\\n]*${name}|${name}[^\\n]*ready`), name);
  }
  assert.doesNotMatch(cityBlock, /staticSpots|spots\.length|\.length === 0/);
});

test("★값을 true 로 바꾸면 이 파일을 고치지 않아도 열린다", () => {
  // 표시·비활성·선택 가능 여부가 전부 같은 `ready` 하나에서 갈린다
  const readyUses = (cityBlock.match(/\bready\b/g) ?? []).length;
  assert.ok(readyUses >= 5, `ready 가 화면 곳곳에 연결돼 있지 않다 (${readyUses})`);
});

test("★네 언어 모두 문구가 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const tf = JSON.parse(read("src", "messages", `${locale}.json`)).tripForm;
    assert.equal(typeof tf?.cityComingSoon, "string", `${locale}.tripForm.cityComingSoon`);
    assert.ok(tf.cityComingSoon.trim().length > 0, `${locale} 가 비었다`);
  }
});

test("★지역 전환 로직은 이번에 건드리지 않았다", () => {
  // 표시를 더했을 뿐 정리·확인 흐름은 그대로다
  assert.match(CODE, /function applyCitySwitch/);
  assert.match(CODE, /function requestCitySwitch/);
  assert.match(CODE, /savedToReleaseForCity\(getSavedSpotsData\(\), city\)/);
  assert.match(CODE, /clearCityCart\(city\)/);
  assert.match(CODE, /clearTripDraft\(\)/);
});

test("★Home 에는 플래너 폼이 다시 생기지 않는다 — 진입은 /planner 뿐", () => {
  const home = read("src", "app", "HomeClient.tsx");
  assert.doesNotMatch(home, /id="planner"/);
  assert.doesNotMatch(home, /requestCitySwitch|planningReady/);
  assert.match(home, /href="\/planner"/);
});


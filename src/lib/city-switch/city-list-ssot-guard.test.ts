// 도시 목록은 한 곳에서만 관리한다.
//
// 화면마다 배열을 들고 있으면 도시를 하나 더할 때 여러 곳을 고쳐야 하고, 하나를
// 잊으면 조용히 갈라진다 — 실제로 홈 카드에는 전주가 빠져 있었고 제주 그림도
// 플래너는 🏝️, 카드는 🌋 로 서로 달랐다.
//
// `planningReady` 와 링크 노출은 다른 물음이다
//   전자는 "이 도시로 일정을 만들 수 있는가", 후자는 "이 도시 페이지가 있는가".
//   준비 중이라고 도시 페이지 링크까지 감추면 사용자는 그 도시가 없는 줄 안다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const QUICK = read("src", "components", "CityQuickLinks.tsx");
const ENTRY = read("src", "components", "CityEntry.tsx");
const HOME  = read("src", "app", "HomeClient.tsx");
const TYPES = read("src", "data", "cities", "types.ts");
const SLUGS = ["busan", "seoul", "jeju", "gyeongju", "jeonju"];

// ── 목록은 하나뿐 ────────────────────────────────────────────────────────────
test("★홈 도시 카드가 CITY_CONFIGS 를 쓴다", () => {
  assert.match(QUICK, /import \{ CITY_CONFIGS, CITY_SLUGS \} from "@\/data\/cities"/);
  assert.match(QUICK, /const CITIES = CITY_SLUGS\.map\(slug => CITY_CONFIGS\[slug\]!\);/);
});

test("★City Entry 의 다른 도시 목록도 CITY_CONFIGS 를 쓴다", () => {
  assert.match(ENTRY, /import \{ CITY_CONFIGS, CITY_SLUGS, type CityConfig \} from "@\/data\/cities"/);
  assert.match(ENTRY, /CITY_SLUGS\.filter\(s => s !== city\.slug\)/);
  assert.match(ENTRY, /\{CITY_CONFIGS\[slug\]!\.name\}/);
});

test("★두 화면 어디에도 자체 도시 배열이 남아 있지 않다", () => {
  for (const [name, src] of [["CityQuickLinks", QUICK], ["CityEntry", ENTRY]] as const) {
    const s = strip(src);
    assert.doesNotMatch(s, /OTHER_CITIES/,  `${name}: 자체 목록`);
    assert.doesNotMatch(s, /CITY_LABEL/,    `${name}: 자체 이름표`);
    // 도시 이름·slug 를 늘어놓은 리터럴 배열이 없다
    assert.doesNotMatch(s, /\[\s*"busan"[\s\S]{0,80}"jeonju"\s*\]/i, `${name}: slug 배열`);
    assert.doesNotMatch(s, /name:\s*"Seoul"/, `${name}: 이름 리터럴`);
  }
});

test("★그림도 설정에서 온다 — 화면마다 다른 그림을 들지 않는다", () => {
  assert.match(TYPES, /emoji:\s*string;/);
  const dir = join(ROOT, "src", "data", "cities");
  for (const f of readdirSync(dir).filter(f => SLUGS.includes(f.replace(/\.ts$/, "")))) {
    assert.match(readFileSync(join(dir, f), "utf8"), /emoji:\s*"[^"]+",/, f);
  }
  // 플래너도 같은 값을 본다
  assert.match(strip(HOME), /const c\s*=\s*\{ value, emoji: conf\?\.emoji \?\? "" \}/);
  assert.doesNotMatch(strip(HOME), /emoji:\s*"🌊"/, "플래너가 그림을 따로 들고 있다");
  assert.doesNotMatch(strip(QUICK), /emoji:\s*"/, "카드가 그림을 따로 들고 있다");
});

// ── 링크 동작은 그대로 ───────────────────────────────────────────────────────
test("★홈 카드 링크 목적지가 그대로다", () => {
  assert.match(QUICK, /href=\{`\/explore\/\$\{city\.slug\}`\}/);
});

test("★City Entry 링크 목적지가 그대로다", () => {
  assert.match(ENTRY, /href=\{`\/\$\{slug\}\/`\}/);
});

test("★다섯 도시 모두 소개 문구가 4개 언어에 있다", () => {
  const names = ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"];
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const cl = JSON.parse(read("src", "messages", `${locale}.json`)).cityLinks;
    for (const n of names) {
      assert.equal(typeof cl?.[`desc${n}`], "string", `${locale}.cityLinks.desc${n}`);
      assert.ok(cl[`desc${n}`].trim().length > 0, `${locale} desc${n} 가 비었다`);
    }
  }
});

// ── planningReady 는 링크 노출과 다른 물음이다 ───────────────────────────────
test("★준비 중이라고 도시 링크를 감추거나 막지 않는다", () => {
  for (const [name, src] of [["CityQuickLinks", QUICK], ["CityEntry", ENTRY]] as const) {
    assert.doesNotMatch(strip(src), /planningReady/, `${name}: 링크가 planningReady 를 본다`);
  }
});

test("★일정 계획 가능 여부는 플래너에서만 쓴다", () => {
  assert.match(strip(HOME), /conf\?\.planningReady === true/);
  assert.match(strip(HOME), /aria-disabled=\{!ready\}/);
  assert.match(strip(HOME), /\{tf\("cityComingSoon"\)\}/);
});

test("★도시 이름으로 조건을 걸지 않는다", () => {
  const s = strip(QUICK) + strip(ENTRY);
  for (const n of ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]) {
    assert.doesNotMatch(s, new RegExp(`if\\s*\\([^)]*${n}`), n);
    assert.doesNotMatch(s, new RegExp(`===\\s*"${n}"`), n);
  }
});

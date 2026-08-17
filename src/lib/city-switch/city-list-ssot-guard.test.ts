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
  assert.match(QUICK, /import \{ CITY_CONFIGS, CITY_SLUGS, cityLabelKey \} from "@\/data\/cities"/);
  assert.match(QUICK, /const CITIES = CITY_SLUGS\.map\(slug => CITY_CONFIGS\[slug\]!\);/);
});

test("★City Entry 의 다른 도시 목록도 CITY_CONFIGS 를 쓴다", () => {
  assert.match(ENTRY, /import \{ CITY_CONFIGS, CITY_SLUGS, cityLabelKey, type CityConfig \} from "@\/data\/cities"/);
  assert.match(ENTRY, /CITY_SLUGS\.filter\(s => s !== city\.slug\)/);
  assert.match(ENTRY, /\{tCity\(cityLabelKey\(CITY_CONFIGS\[slug\]!\)\)\}/);
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
  assert.match(strip(HOME), /const c\s*=\s*\{ value: conf\.name, emoji: conf\.emoji \}/);
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
  // 홈 카드는 순수 링크라 readiness 를 볼 이유가 없다.
  assert.doesNotMatch(strip(QUICK), /planningReady/, "CityQuickLinks: 링크가 readiness 를 본다");

  // City Entry 는 **플래너 CTA 에만** readiness 를 본다. 페이지 자체와 "다른 도시"
  // 링크는 준비 중인 도시에도 열려 있어야 한다 — 감추면 그 도시가 없는 줄 안다.
  const e = strip(ENTRY);
  assert.equal((e.match(/planningReady/g) ?? []).length, 1, "CityEntry: readiness 를 여러 곳에서 본다");
  assert.match(e, /const plannerOpen = CITY_CONFIGS\[city\.slug\]\?\.planningReady === true;/);
  const nav = e.slice(e.indexOf('aria-label={t("otherCities")}'));
  assert.doesNotMatch(nav, /plannerOpen|planningReady/, "다른 도시 링크가 readiness 로 막힌다");
});

test("★플래너 CTA 만 readiness 를 본다", () => {
  const e = strip(ENTRY);
  assert.equal((e.match(/plannerOpen/g) ?? []).length, 4);   // 정의 1 + CTA 3
  // 진입 화면이 자체 플래그를 다시 들지 않는다
  assert.doesNotMatch(e, /content\.plannerReady/);
  assert.doesNotMatch(read("src", "data", "cities", "entry-content.ts"), /plannerReady/);
});

test("★일정 계획 가능 여부는 플래너에서만 쓴다", () => {
  assert.match(strip(HOME), /const ready\s*=\s*conf\.planningReady;/);
  assert.match(strip(HOME), /aria-disabled=\{!ready\}/);
  assert.match(strip(HOME), /\{tf\("cityComingSoon"\)\}/);
});

test("★플래너 목록도 CITY_CONFIGS 에서 온다", () => {
  const h = strip(HOME);
  assert.match(h, /CITY_SLUGS\.map\(\(slug\) => \{/);
  assert.match(h, /const conf\s*=\s*CITY_CONFIGS\[slug\]!;/);
  // 도시 이름을 늘어놓은 배열이 남아 있으면 도시를 더할 때 여기도 고쳐야 한다
  assert.doesNotMatch(h, /\["Busan", "Seoul", "Jeju", "Gyeongju"\]/);
});

test("★도시 이름은 세 화면 모두 같은 번역 키를 쓴다", () => {
  assert.match(read("src", "data", "cities", "index.ts"), /export function cityLabelKey/);
  for (const [name, src] of [["Planner", HOME], ["QuickLinks", QUICK], ["CityEntry", ENTRY]] as const) {
    assert.match(strip(src), /cityLabelKey\(/, `${name}: 이름을 따로 찍는다`);
  }
  // 영문 이름을 그대로 화면에 찍지 않는다.
  // `desc${city.name}` 처럼 **번역 키를 만드는** 쓰임은 화면 표기가 아니므로
  // 제외한다 — JSX 자식으로 홀로 놓인 경우만 잡는다.
  assert.doesNotMatch(strip(QUICK), /^\s*\{city\.name\}\s*$/m);
  assert.doesNotMatch(strip(ENTRY), /^\s*\{CITY_CONFIGS\[slug\]!\.name\}\s*$/m);
});

test("★다섯 도시 이름이 4개 언어에 모두 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const tf = JSON.parse(read("src", "messages", `${locale}.json`)).tripForm;
    for (const n of ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]) {
      assert.equal(typeof tf?.[`city_${n}`], "string", `${locale}.tripForm.city_${n}`);
      assert.ok(tf[`city_${n}`].trim().length > 0, `${locale} city_${n} 가 비었다`);
    }
  }
});

test("★도시 이름으로 조건을 걸지 않는다", () => {
  const s = strip(QUICK) + strip(ENTRY);
  for (const n of ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]) {
    assert.doesNotMatch(s, new RegExp(`if\\s*\\([^)]*${n}`), n);
    assert.doesNotMatch(s, new RegExp(`===\\s*"${n}"`), n);
  }
});

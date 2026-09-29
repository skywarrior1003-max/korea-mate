// Guided Journey 계약 가드 (GOKOREAMATE-GUIDED-JOURNEY-TUTORIAL-V1)
// 실행: node --experimental-strip-types --test src/lib/guided-journey/journey-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  PATH_STEPS, MERGE_STEPS, JOURNEY_KEY, LEGACY_GUIDE_KEY,
  defaultJourney, readJourney, startJourney, completeStep, skipStep, pauseJourney, resumeJourney,
  switchToPlacesAt, endJourney, progressOf, type JourneyPath, type JourneyStep, type JourneyState,
} from "./journey-core.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const PATHS = Object.keys(PATH_STEPS) as JourneyPath[];
const ALL_STEPS = [...new Set(PATHS.flatMap(p => [...PATH_STEPS[p]]))] as JourneyStep[];

test("모든 경로는 My Trip 공통 단계로 합류하고 finish 로 끝난다", () => {
  for (const p of PATHS) {
    const list = PATH_STEPS[p] as readonly string[];
    assert.deepEqual(list.slice(list.length - MERGE_STEPS.length), [...MERGE_STEPS], p);
    assert.equal(list[list.length - 1], "finish");
  }
});

test("완료는 현재 단계에만 — 늦게 온 신호로 앞 단계를 건너뛰지 않는다", () => {
  let s = startJourney(defaultJourney(), "course");
  assert.equal(s.step, "pickCity");
  const same = completeStep(s, "adoptDates");
  assert.equal(same, s);
  s = completeStep(s, "pickCity");
  assert.equal(s.step, "pickCourse");
  assert.deepEqual(s.done, ["pickCity"]);
});

test("건너뛰기는 완료와 따로 기록된다", () => {
  let s = startJourney(defaultJourney(), "places");
  s = skipStep(s);
  assert.equal(s.step, "pickPlace");
  assert.deepEqual(s.skipped, ["pickCity"]);
  assert.deepEqual(s.done, []);
});

test("사진 단계 멈춤 → 같은 단계부터 이어하기", () => {
  let s: JourneyState = { ...startJourney(defaultJourney(), "mytrip"), step: "addRecord" };
  s = pauseJourney(s);
  assert.equal(s.status, "paused");
  assert.equal(completeStep(s, "addRecord"), s, "멈춘 동안에는 진행하지 않는다");
  s = resumeJourney(s);
  assert.equal(s.status, "active");
  assert.equal(s.step, "addRecord");
});

test("경로 끝까지 가면 done, finish 이후 단계 없음", () => {
  let s = startJourney(defaultJourney(), "mytrip");
  for (const st of PATH_STEPS.mytrip) s = completeStep(s, st as JourneyStep);
  assert.equal(s.status, "done");
  assert.equal(s.step, null);
  assert.equal(s.done.length, PATH_STEPS.mytrip.length);
});

test("가져오기 실패·This Trip 도착 시 장소 경로로 전환", () => {
  const s = startJourney(defaultJourney(), "import");
  const t = switchToPlacesAt(s, "openThisTrip");
  assert.equal(t.path, "places");
  assert.equal(t.step, "openThisTrip");
  assert.equal(switchToPlacesAt(s, "openImport" as JourneyStep), s, "장소 경로에 없는 단계로는 가지 않는다");
});

test("진행 표시는 합류 전/후를 나눠 센다", () => {
  const s = startJourney(defaultJourney(), "places");
  assert.deepEqual(progressOf(s), { phase: "start", index: 1, total: 7 });
  assert.deepEqual(progressOf({ ...s, step: "checkDates" }), { phase: "mytrip", index: 2, total: MERGE_STEPS.length });
});

test("저장 상태: 이전 안내를 꺼 둔 사용자는 꺼진 채로, 깨진 값은 기본값으로", () => {
  assert.equal(readJourney(mem({ [LEGACY_GUIDE_KEY]: JSON.stringify({ enabled: false }) })).status, "off");
  assert.equal(readJourney(mem({ [LEGACY_GUIDE_KEY]: JSON.stringify({ enabled: true }) })).status, "idle");
  assert.equal(readJourney(mem({ [JOURNEY_KEY]: "{broken" })).status, "idle");
  const bad = readJourney(mem({ [JOURNEY_KEY]: JSON.stringify({ status: "active", path: "course", step: "buildTrip", done: ["x", "pickCity"] }) }));
  assert.equal(bad.step, null, "경로에 없는 단계는 버린다");
  assert.deepEqual(bad.done, ["pickCity"]);
  assert.equal(endJourney(startJourney(defaultJourney(), "course"), "later").step, "pickCity", "끝내기는 단계를 기억한다");
});

test("4개 locale 에 모든 단계 문장·이동·확인 문구가 있다", () => {
  const src = read("src", "components", "guided-journey", "GuidedJourney.tsx");
  const gotoSteps = [...src.matchAll(/^\s+(\w+): \{ on:[^\n]*goto: "/gm)].map(m => m[1]);
  const confirmSteps = [...src.matchAll(/^\s+(\w+): \{ on:[^\n]*confirm: true/gm)].map(m => m[1]);
  assert.ok(gotoSteps.length >= 15 && confirmSteps.length === 2);
  const flat = (o: Record<string, unknown>, pre = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));
  const keysOf = (lc: string) => new Set(flat((JSON.parse(read("src", "messages", `${lc}.json`)) as { journey: Record<string, unknown> }).journey));
  const ko = keysOf("ko");
  for (const st of ALL_STEPS) { assert.ok(ko.has(`steps.${st}.say`), st); assert.ok(ko.has(`steps.${st}.name`), st); }
  for (const st of gotoSteps) assert.ok(ko.has(`goto.${st}`), `goto.${st}`);
  for (const st of confirmSteps) assert.ok(ko.has(`confirm.${st}`), `confirm.${st}`);
  // 컴포넌트가 쓰는 최상위 키
  for (const f of ["GuidedJourney.tsx", "JourneyStartChooser.tsx", "JourneyEntry.tsx"]) {
    const s = read("src", "components", "guided-journey", f);
    for (const m of s.matchAll(/\bt\("([A-Za-z]+)"/g)) assert.ok(ko.has(m[1]), `${f}: ${m[1]}`);
  }
  for (const lc of ["en", "ja", "zh"]) assert.deepEqual([...keysOf(lc)].sort(), [...ko].sort(), lc);
});

test("가리키는 대상(data-tut)은 실제 화면 코드에 있다", () => {
  const src = read("src", "components", "guided-journey", "GuidedJourney.tsx");
  const wanted = new Set([...src.matchAll(/data-tut="(tut-[\w-]+)"/g)].map(m => m[1]));
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".tsx") && !p.includes("guided-journey")) files.push(p); } };
  walk(path.join(ROOT, "src"));
  const all = files.map(f => readFileSync(f, "utf8")).join("\n");
  for (const w of wanted) {
    const dyn = w.startsWith("tut-menu-") && all.includes("data-tut={`tut-menu-${it.key}`}") && all.includes(`key: "${w.slice(9)}"`);
    const inline = all.split(/\r?\n/).some(l => l.includes("data-tut") && l.includes(`"${w}"`));
    assert.ok(inline || dyn, w);
  }
});

test("예전 안내는 제거됐고, 안내는 공개·공유·업로드·AI 를 대신 실행하지 않는다", () => {
  assert.equal(existsSync(path.join(ROOT, "src", "components", "JourneyCoach.tsx")), false);
  assert.equal(existsSync(path.join(ROOT, "src", "lib", "journey-guide")), false);
  for (const f of ["GuidedJourney.tsx", "JourneyStartChooser.tsx", "JourneyEntry.tsx"]) {
    const s = read("src", "components", "guided-journey", f);
    assert.doesNotMatch(s, /\.click\(\)|navigator\.share|fetch\(|supabase|\/api\//, f);
  }
  const core = read("src", "lib", "guided-journey", "journey-core.ts");
  assert.doesNotMatch(core, /fetch\(|supabase|\/api\//);
  const ko = JSON.parse(read("src", "messages", "ko.json")) as Record<string, unknown>;
  assert.equal("guide" in ko, false);
});

test("움직임: 한 번만 짧게, 움직임 줄이기면 없음 — 반복 애니메이션 없음", () => {
  const s = read("src", "components", "guided-journey", "GuidedJourney.tsx");
  assert.match(s, /animation: gkmJourneyIn 180ms ease-out 1;/);
  assert.match(s, /prefers-reduced-motion: reduce\) \{ \.gkm-journey-in \{ animation: none; \}/);
  assert.doesNotMatch(s, /infinite|animate-pulse|animate-bounce|animate-ping/);
});

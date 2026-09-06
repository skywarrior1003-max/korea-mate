// First Trip Journey Guide 상태 기계 테스트
// 실행: node --experimental-strip-types src/lib/journey-guide/guide-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GUIDE_STEPS, defaultGuideState, readGuideState, shouldShowStep,
  markStepSeen, setGuideEnabled, resetGuideSeen, type GuideState,
} from "./guide-core.ts";

test("첫 사용자: finale 를 제외한 모든 스텝이 자동 후보다", () => {
  const s = defaultGuideState();
  for (const step of GUIDE_STEPS) {
    assert.equal(shouldShowStep(s, step), step !== "finale", step);
  }
});

test("본 스텝은 자동 반복되지 않는다", () => {
  let s = defaultGuideState();
  s = markStepSeen(s, "save");
  assert.equal(shouldShowStep(s, "save"), false);
  assert.equal(shouldShowStep(s, "thisTrip"), true);
});

test("finale 는 핵심 여정(저장→플래너→편집→사진→스토리)을 돈 뒤에만 — 그리고 한 번뿐", () => {
  let s = defaultGuideState();
  for (const step of ["save", "planner", "myTripEdit", "photo", "story"] as const) s = markStepSeen(s, step);
  assert.equal(shouldShowStep(s, "finale"), true);
  s = markStepSeen(s, "finale");
  assert.equal(shouldShowStep(s, "finale"), false);
});

test("tips OFF 면 아무것도 보이지 않고, 다시 보기는 seen 만 지운다", () => {
  let s: GuideState = markStepSeen(defaultGuideState(), "save");
  s = setGuideEnabled(s, false);
  for (const step of GUIDE_STEPS) assert.equal(shouldShowStep(s, step), false, step);
  s = resetGuideSeen(s);
  assert.equal(s.enabled, false);           // 다시 보기 자체는 More 에서 enabled 도 켠다(호출부 책임)
  assert.deepEqual(s.seen, {});
  assert.equal(shouldShowStep(setGuideEnabled(s, true), "save"), true);
});

test("깨진 저장값은 기본 상태로 — 안내 폭탄이 되지 않는다", () => {
  const fake = { getItem: () => "not-json{{{" };
  const s = readGuideState(fake);
  assert.equal(s.enabled, true);
  assert.deepEqual(s.seen, {});
});

test("모든 스텝에 4개 locale 의 guide 문구가 존재한다", () => {
  const ROOT = process.cwd();
  for (const l of ["ko", "en", "ja", "zh"]) {
    const g = JSON.parse(readFileSync(path.join(ROOT, "src", "messages", `${l}.json`), "utf8")).guide;
    assert.ok(g, l);
    for (const step of GUIDE_STEPS) assert.ok(typeof g[step] === "string" && g[step].length > 0, `${l}:${step}`);
    assert.ok(g.gotIt, `${l}:gotIt`);
  }
});

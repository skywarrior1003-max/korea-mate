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

test("finale 는 Chapter C 직전 단계(story·share)를 끝낸 뒤에만 — 그리고 한 번뿐 (V4)", () => {
  let s = defaultGuideState();
  s = markStepSeen(s, "story");
  assert.equal(shouldShowStep(s, "finale"), false, "share 전에는 안 뜬다");
  s = markStepSeen(s, "share");
  assert.equal(shouldShowStep(s, "finale"), true);
  // V4 실측 경로 — 다시 보기 후 기존 여행에서 B/C 만 재진행(save·planner 없음)해도 뜬다
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

// ── TUTORIAL-V1 — Chapter·문맥·건너뛰기·계측 상태 ───────────────────────────
test("V1: Chapter 매핑·진행 표시(discover 포함, myPlaces 는 장 밖)", async () => {
  const { chapterOf, stepProgress, GUIDE_CHAPTERS } = await import("./guide-core.ts");
  assert.equal(chapterOf("discover"), "A");
  assert.equal(chapterOf("photo"), "B");
  assert.equal(chapterOf("share"), "C");
  assert.equal(chapterOf("myPlaces"), null);
  assert.deepEqual(stepProgress("save"), { chapter: "A", index: 2, total: GUIDE_CHAPTERS.A.length });
});

test("V1: 문맥 gating — 여행이 있으면 A 숨김·기록 전엔 story/share 숨김(photo 는 안내)", async () => {
  const { defaultGuideState, shouldShowStep } = await import("./guide-core.ts");
  const s = defaultGuideState();
  assert.equal(shouldShowStep(s, "discover", { hasTrip: true }), false);
  assert.equal(shouldShowStep(s, "discover", { hasTrip: false }), true);
  assert.equal(shouldShowStep(s, "story", { hasMoment: false }), false);
  assert.equal(shouldShowStep(s, "share", { hasMoment: false }), false);
  assert.equal(shouldShowStep(s, "photo", { hasMoment: false }), true); // "여기서 남길 수 있어요"
  assert.equal(shouldShowStep(s, "story", { hasMoment: true }), true);
  // 문맥 미전달 = 기존 동작(하위호환)
  assert.equal(shouldShowStep(s, "story"), true);
});

test("V1: 건너뛰기는 그 Chapter 전체를 seen 처리하고 다른 장은 남긴다", async () => {
  const { defaultGuideState, skipChapter, shouldShowStep, chapterCompleted } = await import("./guide-core.ts");
  const s = skipChapter(defaultGuideState(), "save");
  for (const st of ["discover", "save", "thisTrip", "planner"] as const) assert.equal(shouldShowStep(s, st), false, st);
  assert.equal(shouldShowStep(s, "myTripEdit"), true);
  assert.equal(chapterCompleted(s, "A"), true);
  assert.equal(chapterCompleted(s, "B"), false);
});

test("V1: 상태 version — write 는 v2 를 기록하고 v1(필드 없음) 데이터도 그대로 읽힌다", async () => {
  const { readGuideState, writeGuideState, GUIDE_STATE_VERSION, GUIDE_STORAGE_KEY, defaultGuideState } = await import("./guide-core.ts");
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  mem.set(GUIDE_STORAGE_KEY, JSON.stringify({ enabled: true, seen: { save: true } })); // v1 형태
  const s1 = readGuideState(storage);
  assert.equal(s1.seen.save, true);
  writeGuideState({ ...defaultGuideState(), started: true }, storage);
  const written = JSON.parse(mem.get(GUIDE_STORAGE_KEY)!);
  assert.equal(written.version, GUIDE_STATE_VERSION);
  assert.equal(readGuideState(storage).started, true);
});

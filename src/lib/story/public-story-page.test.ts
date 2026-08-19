// 공개 Story 화면이 실제로 무엇을 그리는가.
//
// 지키는 것
//   1. 적지 않은 글 자리에 빈 따옴표를 남기지 않는다.
//   2. 한 화면에 영어와 한국어가 섞이지 않는다.
//   3. 화면의 원천은 공개 projection 하나뿐이다.
//   4. 공개 Memory 가 없는 예전 분기를 건드리지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PAGE    = code(readFileSync("src/app/shared/page.tsx", "utf8"));
const JOURNAL = code(readFileSync("src/components/story/StoryJournal.tsx", "utf8"));
const FOCUS   = code(readFileSync("src/components/story/StoryMemoryFocus.tsx", "utf8"));

// ── M: 빈 글 ────────────────────────────────────────────────────────────────

test("M1 Journal 은 적은 글이 없으면 인용 줄을 그리지 않는다", () => {
  assert.match(JOURNAL, /const hasMemo = memory\.memo\.trim\(\) !== ""/);
  assert.match(JOURNAL, /\{\(hasMemo \|\| onSave\) && \(/);
  // 따옴표는 hasMemo 가 참일 때만 붙는다
  const quote = JOURNAL.indexOf("“${memory.memo}”");
  assert.ok(quote > 0);
  assert.match(JOURNAL.slice(quote - 260, quote), /\{hasMemo \? \(/);
});

test("M2 Focus 도 같은 규칙이다", () => {
  assert.match(FOCUS, /\{memory\.memo\.trim\(\) !== "" && \(/);
});

test("M3 글이 없을 때 alt 로 빈 조각을 넣지 않는다", () => {
  assert.match(JOURNAL, /hasMemo \? memory\.memo\.slice\(0, 40\) : ""/);
  assert.ok(!/memory\.placeName \?\? memory\.memo\.slice\(0, 40\)/.test(FOCUS));
});

// ── L: 언어 ─────────────────────────────────────────────────────────────────

test("L1 공개 Story 분기의 버튼 문구가 locale 을 쓴다", () => {
  const story = PAGE.slice(PAGE.indexOf("hasPublicMemories(apiStory)"), PAGE.indexOf("<StoryReport"));
  assert.match(story, /copyLabel=\{isCopying \? tStory\("copying"\) : tStory\("copyTrip"\)\}/);
  assert.match(story, /shareLabel=\{tStory\("share"\)\}/);
  assert.ok(!/"Copy This Trip"|"Copying Trip…"|shareLabel="Share"/.test(story),
    "공개 화면에 영어를 박아 두면 신고 문구만 한국어로 남아 언어가 섞인다");
});

test("L2 네 언어가 같은 키를 갖는다", () => {
  const need = ["share", "copying", "copyTrip", "reportStory"];
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    for (const k of need) assert.ok(typeof m.story[k] === "string" && m.story[k].trim() !== "", `${L}.story.${k}`);
  }
});

// ── S: 원천 ─────────────────────────────────────────────────────────────────

test("S1 화면이 소유자 비공개 원천을 읽지 않는다", () => {
  for (const bad of ["loadMoments", "photo_data", "koreamate_moments_", "TripMoment"]) {
    assert.ok(!PAGE.includes(bad), `공개 화면이 ${bad} 를 읽고 있다`);
  }
});

test("S2 Memory 는 공개 projection 에서만 온다", () => {
  assert.match(PAGE, /toStoryDays\(apiStory\)/);
  assert.match(PAGE, /toStoryCardMoments\(apiStory\)/);
  assert.match(PAGE, /fetchSharedItinerary/);
});

test("S3 Share 는 정본 렌더러를 연다 — 중복 CTA 없음", () => {
  const story = PAGE.slice(PAGE.indexOf("hasPublicMemories(apiStory)"), PAGE.indexOf("return (\n    <div className=\"min-h-screen\""));
  assert.match(story, /onShare=\{\(\) => setStoryExportOpen\(true\)\}/);
  assert.equal((story.match(/<TripStoryExport/g) ?? []).length, 1);
  assert.ok(!/renderShareCard/.test(story), "공개 Story 에 예전 렌더러를 붙이지 않는다");
});

// ── Z: 예전 분기 ────────────────────────────────────────────────────────────

test("Z1 공개 Memory 0 건 분기는 그대로다", () => {
  assert.match(PAGE, /moments=\{\[\]\}/);
  assert.match(PAGE, /if \(hasPublicMemories\(apiStory\)\)/);
});

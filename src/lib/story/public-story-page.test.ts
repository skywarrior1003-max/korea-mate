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

// ── Y: 예전 분기의 Copy 버튼 ─────────────────────────────────────────────────
//
// 같은 동작(`handleCopyTrip`)을 부르는 버튼이 한 화면에 둘 있었다. 하나는
// 흐름 안의 주황 CTA, 하나는 아래 고정 바(파랑)였다. 390px 에서 둘 다 동시에
// 보였고 문구도 "Copy This Trip" / "Copy this trip" 으로 거의 같았다.

test("Y1 Copy 를 부르는 버튼이 화면에 하나뿐이다", () => {
  const handlers = (PAGE.match(/onClick=\{handleCopyTrip\}/g) ?? []).length;
  assert.equal(handlers, 1, `handleCopyTrip 버튼이 ${handlers}개다`);
  // Story 분기는 StorySummary 의 onCopy 한 곳으로 따로 간다
  assert.match(PAGE, /onCopy=\{\(\) => void handleCopyTrip\(\)\}/);
});

test("Y2 고정 Copy 바를 남겨 두지 않았다", () => {
  assert.ok(!/fixed left-0 right-0 z-50[\s\S]{0,400}handleCopyTrip/.test(PAGE),
    "아래 고정 바가 아직 Copy 를 그린다");
  assert.ok(!/Copy this trip"/.test(PAGE));
});

test("Y3 남긴 CTA 는 locale 을 쓴다", () => {
  assert.match(PAGE, /isCopying \? tStory\("copying"\) : `📋 \$\{tStory\("copyTrip"\)\}`/);
  assert.ok(!/"📋 Copy This Trip"|"Copying Trip…"/.test(PAGE));
});

test("Y4 BottomNav 여백은 남는다 — 빼면 푸터가 메뉴에 가린다", () => {
  assert.match(PAGE, /<div className="h-16 md:hidden" \/>/);
});

test("Y5 Copy 동작 자체는 그대로다", () => {
  // 소유권·공개 검사는 서버(copy.ts)가 한다. 화면은 share id 만 넘긴다.
  assert.match(PAGE, /apiCopyItinerary\(shareId, getDeviceId\(\)\)/);
  assert.ok(!PAGE.includes("photo_data"), "복사 경로가 비공개 사진을 만지면 안 된다");
});

// ── R: 남아 있던 영어 ───────────────────────────────────────────────────────
//
// 한 화면에 영어와 한국어가 섞여 있으면 보는 사람은 무엇이 자기 언어인지 알 수
// 없다. Share/Memory 흐름에서 사용자가 실제로 보는 문구만 옮긴다.

const ITIN = code(readFileSync("src/app/itinerary/page.tsx", "utf8"));

test("R1 소유자 화면의 공유 카드 CTA 가 locale 을 쓴다", () => {
  assert.ok(!ITIN.includes("Create Story Card"), "영어가 박혀 있다");
  assert.match(ITIN, /🎴 \{tPublish\("openStoryCard"\)\}/);
});

test("R2 소유자 화면과 공유 화면이 같은 키를 쓴다 — 같은 곳으로 가는 버튼이다", () => {
  for (const src of [ITIN, PAGE]) assert.ok(src.includes('tPublish("openStoryCard")'));
  // 같은 뜻의 키를 새로 만들지 않았다
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    assert.ok(!("makeShareCard" in m.story), `${L}: 중복 키가 생겼다`);
  }
});

test("R3 예전 공유 화면의 산문이 locale 을 쓴다", () => {
  for (const gone of ["Plan Your Own", "AI builds an itinerary", "No sign-up",
                      "editable copy", "Plan a Similar Trip", "Create Share Card for This",
                      "Start from Scratch", "generated by the gokoreamate"]) {
    assert.ok(!PAGE.includes(gone), `영어가 남아 있다: ${gone}`);
  }
  for (const k of ["planOwnTitle", "planOwnLine1", "planOwnLine2", "copyHint", "planSimilar", "startScratch", "generatedBy"]) {
    assert.ok(PAGE.includes(`tStory("${k}"`), `locale key 미사용: ${k}`);
  }
});

test("R4 네 언어가 새 문구를 모두 갖는다 — 영어를 복사해 두지 않았다", () => {
  const need = ["planOwnTitle", "planOwnLine1", "planOwnLine2", "copyHint", "planSimilar", "startScratch", "generatedBy"];
  const en = JSON.parse(readFileSync("src/messages/en.json", "utf8")) as { story: Record<string, string> };
  for (const L of ["ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    for (const k of need) {
      assert.ok(typeof m.story[k] === "string" && m.story[k].trim() !== "", `${L}.story.${k}`);
      assert.notEqual(m.story[k], en.story[k], `${L}.story.${k} 가 영어 그대로다`);
    }
  }
  // 도시 이름 자리는 네 언어 모두 유지
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    assert.ok(m.story.planOwnTitle!.includes("{city}"), `${L}.planOwnTitle`);
  }
});

test("R5 Copy CTA 는 여전히 하나다 — i18n 정리로 버튼이 늘지 않았다", () => {
  assert.equal((PAGE.match(/onClick=\{handleCopyTrip\}/g) ?? []).length, 1);
});

// 9:16 카드가 무엇을 먹는가.
//
// 지키는 것
//   1. 카드 입력은 공개 Story 가 내보낸 것뿐이다. 소유자 목록이 아니다.
//   2. 공유되는 주소는 그 여행의 공개 Story 주소다. 홈페이지가 아니다.
//   3. 공개 payload 에 없는 값(category)을 지어내지 않는다.
//   4. 사진 한 장이 실패해도 나머지로 계속하고, 전부 실패하면 멈춘다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toStoryCardMoments, publicStoryUrl, type ApiStory } from "./story-adapter.ts";

const ID = "11111111-2222-3333-4444-555555555555";
const story = (memories: ApiStory["memories"]): ApiStory => ({
  id: ID, city: "busan", start_date: "2026-08-01", end_date: "2026-08-03",
  trip_title: "t", days: [], memories,
});

// ── A: 어댑터 ────────────────────────────────────────────────────────────────

test("A1 사진 ref 는 같은 출처의 공개 프록시 주소가 된다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: "p", placeId: null, photos: [{ ref: "r1" }] }]));
  assert.equal(out.length, 1);
  assert.equal(out[0]!.photoSrc, `/img/memory/${ID}/r1`);
  assert.ok(out[0]!.photoSrc!.startsWith("/"), "절대 URL 이면 다른 출처가 될 수 있다");
});

test("A2 category 를 지어내지 않는다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: null, placeId: null, photos: [{ ref: "r" }] }]));
  assert.equal(out[0]!.category, undefined);
});

test("A3 한 Memory 의 사진 여러 장을 모두 펼친다", () => {
  const out = toStoryCardMoments(story([
    { dayNumber: 1, memo: "m", placeName: null, placeId: null, photos: [{ ref: "a" }, { ref: "b" }] },
  ]));
  assert.deepEqual(out.map(o => o.photoSrc), [`/img/memory/${ID}/a`, `/img/memory/${ID}/b`]);
});

test("A4 사진 없는 Memory 는 메모가 있을 때만 남는다", () => {
  assert.equal(toStoryCardMoments(story([
    { dayNumber: 1, memo: "적어 둔 것", placeName: null, placeId: null, photos: [] },
  ])).length, 1);
  assert.equal(toStoryCardMoments(story([
    { dayNumber: 1, memo: "   ", placeName: null, placeId: null, photos: [] },
  ])).length, 0);
});

test("A5 공개 Memory 가 없으면 빈 목록 — 오류가 아니다", () => {
  assert.deepEqual(toStoryCardMoments(story([])), []);
  assert.deepEqual(toStoryCardMoments(story(undefined)), []);
});

test("A6 좌표·저장경로·내부 id 는 입력 모양에 자리가 없다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: "p", placeId: "9", photos: [{ ref: "r" }] }]));
  assert.deepEqual(Object.keys(out[0]!).sort(), ["memo", "photoSrc"]);
});

// ── U: 주소 ──────────────────────────────────────────────────────────────────

test("U1 그 여행의 공개 Story 주소를 만든다", () => {
  assert.equal(publicStoryUrl("https://gokoreamate.com", ID), `https://gokoreamate.com/shared/${ID}`);
});

test("U2 끝의 슬래시가 겹치지 않는다", () => {
  assert.equal(publicStoryUrl("https://gokoreamate.com/", ID), `https://gokoreamate.com/shared/${ID}`);
});

// ── R: 렌더러 계약 ───────────────────────────────────────────────────────────

const RAW  = readFileSync("src/components/TripStoryExport.tsx", "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CARD = code(RAW);
const PAGE = code(readFileSync("src/app/itinerary/page.tsx", "utf8"));
const SHARED = code(readFileSync("src/app/shared/page.tsx", "utf8"));

test("R1 소유자 도메인 타입에 의존하지 않는다", () => {
  assert.ok(!/TripMoment/.test(CARD), "TripMoment 를 다시 받으면 비공개 필드가 카드까지 온다");
  assert.ok(!/photo_data/.test(CARD));
});

test("R2 공유 주소는 반드시 받는다 — 홈페이지 폴백이 다시 생길 수 없다", () => {
  assert.match(CARD, /shareUrl:\s*string;/);
  assert.ok(!/shareUrl\?:/.test(CARD), "선택 prop 이면 없을 때 폴백이 생긴다");
  assert.ok(!/"https:\/\/gokoreamate\.com"/.test(CARD), "홈페이지 하드코딩이 남아 있다");
});

test("R3 사진은 한 장씩 따로 처리한다", () => {
  assert.match(CARD, /allSettled/);
  assert.ok(!/Promise\.all\(/.test(CARD), "묶음 실패는 사진 있는 카드를 조용히 비운다");
});

test("R4 사진이 있는데 전부 실패하면 카드를 완성하지 않는다", () => {
  const blk = CARD.slice(CARD.indexOf("allSettled"), CARD.indexOf("allSettled") + 600);
  assert.match(blk, /imgs\.length === 0/);
  assert.match(blk, /setPhotoError\(true\)/);
  assert.match(blk, /setRendered\(false\)/);
  assert.match(blk, /return;/);
});

test("R5 사진이 원래 0 장이면 정상 진행한다", () => {
  // 실패 차단은 `srcs.length > 0` 안에만 있다
  const guard = CARD.slice(CARD.indexOf("if (srcs.length > 0)"), CARD.indexOf("setPhotoError(false)"));
  assert.match(guard, /imgs\.length === 0/);
  assert.ok(CARD.includes("setPhotoError(false)"), "사진이 없으면 오류 상태가 아니다");
});

test("R6 오류 문구는 locale 을 쓴다 — 영어를 박아 넣지 않는다", () => {
  assert.match(CARD, /t\("photoLoadFailed"\)/);
});

// ── W: 배선 ──────────────────────────────────────────────────────────────────

test("W1 소유자 화면이 자기 moments 를 카드에 직접 넘기지 않는다", () => {
  const call = PAGE.slice(PAGE.indexOf("<TripStoryExport"), PAGE.indexOf("<TripStoryExport") + 500);
  assert.match(call, /moments=\{storyCardMoments\}/);
  assert.ok(!/moments=\{moments\}/.test(call), "비공개 Memory 가 카드로 들어간다");
});

test("W2 카드 입력은 공개 Story 응답에서만 만든다", () => {
  assert.match(PAGE, /\/api\/shared\/\$\{encodeURIComponent\(itinId\)\}\/story/);
  assert.match(PAGE, /toStoryCardMoments\(api\)/);
});

test("W3 비공개 여행은 카드가 아니라 공개 절차로 간다", () => {
  assert.match(PAGE, /if \(isPublic\) void openStoryCard\(\); else setPublishPreviewOpen\(true\)/);
});

test("W4 Public Story 분기의 기존 Share 자리를 쓴다 — 새 버튼을 만들지 않는다", () => {
  assert.match(SHARED, /onShare=\{\(\) => setStoryExportOpen\(true\)\}/);
  const summary = SHARED.slice(SHARED.indexOf("<StorySummary"), SHARED.indexOf("</StorySummary>") + 1 || SHARED.indexOf("onShare=") + 200);
  assert.ok(summary.includes("onShare="), "Share 는 StorySummary 안에 있어야 한다");
});

test("W5 legacy 분기는 그대로 빈 목록이다 — 회귀 없음", () => {
  assert.match(SHARED, /moments=\{\[\]\}/);
});

test("W6 두 분기 모두 정확한 공개 Story 주소를 넘긴다", () => {
  assert.equal((SHARED.match(/shareUrl=\{publicStoryUrl\(window\.location\.origin, trip\.id\)\}/g) ?? []).length, 2);
  assert.match(PAGE, /shareUrl=\{publicStoryUrl\(window\.location\.origin, itinId \?\? ""\)\}/);
});

test("W7 저장소 어디에도 공유용 홈페이지 폴백이 남아 있지 않다", () => {
  for (const f of ["src/components/TripStoryExport.tsx", "src/app/shared/page.tsx", "src/app/itinerary/page.tsx"]) {
    const src = code(readFileSync(f, "utf8"));
    assert.ok(!/clipboard\.writeText\("https:\/\/gokoreamate\.com"\)/.test(src), f);
    assert.ok(!/url:\s*"https:\/\/gokoreamate\.com"/.test(src), f);
  }
});

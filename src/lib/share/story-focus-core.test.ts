/**
 * story-focus-core — Focus 순서 (TASK-STORY-FOCUS-PREMIUM-UX-V1)
 * Run: node --experimental-strip-types --test src/lib/share/story-focus-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFocusSequence, findSlideIndex, crossesMemory, neighborUrls } from "./story-focus-core.ts";
import type { StoryDay } from "@/components/story/story-types";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const DAYS: StoryDay[] = [
  { dayNumber: 1, dateLabel: "2026-08-19", memories: [
    { id: "a", memo: "첫 바다", placeName: "Haeundae Beach", photos: [{ url: "https://s/a1" }, { url: "https://s/a2" }, { url: "https://s/a3" }] },
    { id: "stop-1-1", memo: "", placeName: "Burger in NY", photos: [] },                      // 사진 없음 → Focus 제외
    { id: "b", memo: "", placeName: "Gamcheon", photos: [{ url: "https://s/b1" }] },
  ]},
  { dayNumber: 2, dateLabel: "2026-08-20", memories: [
    { id: "c", memo: "골목 카페", photos: [{ url: "https://s/c1" }, { url: " " }] },            // 빈 url 제외
  ]},
];

test("F1: Day → 장소 → 사진 순서로 평탄화, 사진 없는 항목·빈 url 제외", () => {
  const seq = buildFocusSequence(DAYS);
  assert.deepEqual(seq.map(s => s.key), ["a#0", "a#1", "a#2", "b#0", "c#0"]);
  assert.deepEqual(seq.map(s => [s.dayNumber, s.photoIndex, s.photoCount]), [[1, 0, 3], [1, 1, 3], [1, 2, 3], [1, 0, 1], [2, 0, 1]]);
  assert.equal(seq[4]!.memo, "골목 카페");
  assert.equal(seq[4]!.placeName, undefined);
});

test("F2: 누른 사진 위치를 찾고, 없으면 그 장소 첫 장 → 0", () => {
  const seq = buildFocusSequence(DAYS);
  assert.equal(findSlideIndex(seq, { id: "a" }, 1), 1);
  assert.equal(findSlideIndex(seq, { id: "b" }, 0), 3);
  assert.equal(findSlideIndex(seq, { id: "a" }, 9), 0, "범위 밖 → 그 장소 첫 장");
  assert.equal(findSlideIndex(seq, { id: "zzz" }, 0), 0);
});

test("F3: 장소 경계 판정과 이웃 미리받기", () => {
  const seq = buildFocusSequence(DAYS);
  assert.equal(crossesMemory(seq, 2, 3), true);
  assert.equal(crossesMemory(seq, 0, 1), false);
  assert.equal(crossesMemory(seq, 4, 5), false, "끝 밖은 경계가 아니다");
  assert.deepEqual(neighborUrls(seq, 0), ["https://s/a2"]);
  assert.deepEqual(neighborUrls(seq, 3), ["https://s/a3", "https://s/c1"]);
});

test("G1: 소유자·공개 Story 둘 다 같은 순서(buildFocusSequence)로 Focus 를 연다", () => {
  for (const f of ["src/app/itinerary/page.tsx", "src/app/shared/page.tsx"]) {
    const src = read(f);
    assert.match(src, /buildFocusSequence\(/, f);
    assert.match(src, /findSlideIndex\(/, f);
    assert.match(src, /<StoryMemoryFocus[\s\S]{0,200}slides=/, f);
  }
});

test("G2: Focus 는 한 방향 스와이프만 받고 세로 드래그는 무시한다 (뒤로가기·스크롤 충돌 방지)", () => {
  const src = read("src/components/story/StoryMemoryFocus.tsx");
  assert.match(src, /Math\.abs\(dy\) > Math\.abs\(dx\)/);
  assert.match(src, /aria-live="polite"/, "장소가 바뀌면 보조기기에도 알린다");
  assert.ok(!src.includes("onTouchMove={e => e.preventDefault"), "스크롤 차단 해킹 없음");
});

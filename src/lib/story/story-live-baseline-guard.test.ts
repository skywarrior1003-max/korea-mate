/**
 * TASK-STORY-LIVE-BASELINE-V1 — 화면 계약 가드
 * Run: node --experimental-strip-types --test src/lib/story/story-live-baseline-guard.test.ts
 *
 * - 소유자 일정 화면에 `일정 | Story` 전환이 있고 같은 route 안에서 view 만 바뀐다
 * - 끝난 여행의 일정은 읽기 전용(편집 진입·추가 패널·Day 완주 토스트 숨김)
 * - /my-trips 의 끝난 여행 섹션은 Story 이고 카드는 같은 /itinerary?id 로 간다
 * - 공개 serializer 는 이 작업으로 바뀌지 않았다 (공개 계약 불변)
 * - 4개 언어 새 키 parity
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const page   = read("src/app/itinerary/page.tsx");
const trips  = read("src/app/my-trips/page.tsx");
const journal = read("src/components/story/StoryJournal.tsx");

test("V1: 일정 화면에 일정|Story 전환이 있고 새 route 를 만들지 않는다", () => {
  assert.match(page, /role="tablist"/);
  assert.match(page, /t\("viewItinerary"\)/);
  assert.match(page, /t\("viewStory"\)/);
  assert.match(page, /buildPrivateStoryDays\(/);
  assert.ok(!page.includes("router.push(`/story"), "별도 Story route 로 보내지 않는다");
});

test("V2: 끝난 여행은 Story 가 기본이고 ?view=story 로 바로 열 수 있다", () => {
  assert.match(page, /searchParams\.get\("view"\) === "story"/);
  assert.match(page, /if \(isPastTrip && searchParams\.get\("view"\) !== "itinerary"\) setTripView\("story"\)/);
});

test("V3: 끝난 여행의 일정은 읽기 전용 — 편집·추가·완주 토스트가 숨는다", () => {
  assert.match(page, /\(!shareId \|\| isOwner\) && !isPastTrip && \(\s*<button\s*onClick=\{\(\) => \{ setViewMode\("compact"\)/);
  assert.match(page, /\(!shareId \|\| isOwner\) && !isPastTrip && \(\s*<UserSpotsPanel/);
  assert.match(page, /onAddToDay=\{\(!shareId \|\| isOwner\) && !isPastTrip \? addCitySpotToDay : undefined\}/);
  assert.match(page, /dayDone !== null && \(!shareId \|\| isOwner\) && !isPastTrip && \(/);
  assert.match(page, /if \(isPastTrip && viewMode === "compact"\) setViewMode\("full"\)/);
});

test("V4: Story view 는 승인된 StoryJournal/Focus 를 재사용한다", () => {
  assert.match(page, /<StoryJournal\s+days=\{storyDays\}/);
  assert.match(page, /<StoryMemoryFocus[\s\S]{0,160}slides=\{slides\}/);
});

test("V5: /my-trips — 끝난 여행은 Story 로, 같은 /itinerary?id 에 &view=story", () => {
  // TASK-MY-TRIPS-FINAL-UI-V1 이후: 지난 여행은 목록에 큰 카드로 반복하지 않고
  // "Past trips live in Story" 한 줄 아래 같은 줄 문법으로 펼쳐진다. 진입 계약은 그대로.
  assert.match(trips, /t\("pastTripsStory"\)/);
  assert.ok(!trips.includes('t("sectionArchive")'), "Memory Archive 명칭이 남으면 안 된다");
  assert.match(trips, /`\/itinerary\?id=\$\{trip\.id\}&view=story`/);
  assert.ok(!trips.includes("router.push(`/story"), "별도 Story route 로 보내지 않는다");
});

test("V6: StoryJournal 은 사진 없는 장소도 이름 한 줄로 남긴다", () => {
  assert.match(journal, /photos\.length === 0 && memory\.placeName/);
});

test("L1: 새 키 4개 언어 parity + 사용자 문구에서 Memory 명칭 제거 (touched keys)", () => {
  const keys = {
    itin:  ["viewSwitchLabel", "viewItinerary", "viewStory", "storyPastHint", "storyLiveHint", "storyEmptyLive"],
    trips: ["sectionStories", "sectionStoriesHint", "storyChip", "openStory"],
    memo:  ["memoriesTitle", "addMemory"],
  } as const;
  for (const l of ["en", "ko", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const [ns, ks] of Object.entries(keys)) {
      for (const k of ks) assert.ok(typeof d[ns]?.[k] === "string" && d[ns][k].trim() !== "", `${l}.${ns}.${k}`);
    }
    assert.ok(!/memor/i.test(d.memo.memoriesTitle), `${l}: memo.memoriesTitle 에 Memory 명칭`);
    assert.ok(!/memor|추억|思い出|回忆/i.test(d.trips.sectionStories), `${l}: trips.sectionStories`);
  }
});

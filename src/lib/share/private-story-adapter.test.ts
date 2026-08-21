/**
 * private-story-adapter — 소유자 비공개 여행 → StoryDay[] (TASK-STORY-LIVE-BASELINE-V1)
 * Run: node --experimental-strip-types --test src/lib/share/private-story-adapter.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPastTrip, stopReached, buildPrivateStoryDays,
  type StoryDayInput, type StoryMomentInput,
} from "./private-story-adapter.ts";

const CLOCK = { todayISO: "2026-08-20", nowHHMM: "14:00" };
const IMG = "https://images.unsplash.com/photo-1.jpg";

const DAYS: StoryDayInput[] = [
  { dayNumber: 1, date: "2026-08-19", places: [
    { name: "Haeundae Beach", time: "10:00", place_id: "1",  source: "city_spot", image: IMG },
    { name: "Burger in NY",   time: "12:30", place_id: "267", source: "city_spot", image: null },
  ]},
  { dayNumber: 2, date: "2026-08-20", places: [
    { name: "Gamcheon Village", time: "09:30", place_id: "5", source: "city_spot", image: IMG },
    { name: "Nampo Cafe",       time: "16:00", place_id: "9", source: "city_spot", image: IMG },
    { name: "No-time Stop",     time: null,    place_id: "7", source: "city_spot", image: IMG },
  ]},
  { dayNumber: 3, date: "2026-08-21", places: [
    { name: "Taejongdae", time: "10:00", place_id: "27", source: "city_spot", image: IMG },
  ]},
];

test("T1: isPastTrip — 종료일이 오늘보다 앞일 때만 참", () => {
  assert.equal(isPastTrip("2026-08-19", CLOCK.todayISO), true);
  assert.equal(isPastTrip("2026-08-20", CLOCK.todayISO), false);
  assert.equal(isPastTrip("2026-08-21", CLOCK.todayISO), false);
  assert.equal(isPastTrip("", CLOCK.todayISO), false);
  assert.equal(isPastTrip(null, CLOCK.todayISO), false);
});

test("T2: stopReached — 지난 날 참, 미래 거짓, 오늘은 시각이 지금 이전일 때만", () => {
  assert.equal(stopReached("2026-08-19", null, CLOCK), true);
  assert.equal(stopReached("2026-08-21", "09:00", CLOCK), false);
  assert.equal(stopReached("2026-08-20", "13:59", CLOCK), true);
  assert.equal(stopReached("2026-08-20", "14:00", CLOCK), true);
  assert.equal(stopReached("2026-08-20", "14:01", CLOCK), false);
  assert.equal(stopReached("2026-08-20", null, CLOCK), false, "오늘인데 시각이 없으면 보수적으로 제외");
  assert.equal(stopReached("2026-08-20", "bad", CLOCK), false);
});

test("A1: 진행 중 + 사진 0장 — 지난 장소만으로 Story 가 비어 있지 않다", () => {
  const out = buildPrivateStoryDays(DAYS, [], { ...CLOCK, isPast: false });
  assert.deepEqual(out.map(d => d.dayNumber), [1, 2]);
  assert.equal(out[0]!.memories.length, 2);
  // 오늘: 09:30 만 포함, 16:00 과 시각 없음은 제외
  assert.deepEqual(out[1]!.memories.map(m => m.placeName), ["Gamcheon Village"]);
  // 카탈로그 이미지가 있으면 사진으로, 없으면 빈 사진 목록 — 항목은 사라지지 않는다
  assert.equal(out[0]!.memories[0]!.photos[0]!.url, IMG);
  assert.equal(out[0]!.memories[1]!.photos.length, 0);
  assert.equal(out[0]!.memories[1]!.placeName, "Burger in NY");
});

test("A2: 진행 중 — 미래 Day 의 장소는 Story 에 들어가지 않는다", () => {
  const out = buildPrivateStoryDays(DAYS, [], { ...CLOCK, isPast: false });
  assert.ok(!out.some(d => d.dayNumber === 3));
  assert.ok(!JSON.stringify(out).includes("Taejongdae"));
});

test("P1: 끝난 여행 — 전체 일정이 Story 기본 골격이 된다 (시각 없는 장소 포함)", () => {
  const out = buildPrivateStoryDays(DAYS, [], { ...CLOCK, todayISO: "2026-09-01", isPast: true });
  assert.deepEqual(out.map(d => d.dayNumber), [1, 2, 3]);
  assert.equal(out[1]!.memories.length, 3);
  assert.equal(out[2]!.memories[0]!.placeName, "Taejongdae");
});

test("M1: city_spot_id 가 일치하는 순간은 그 장소 항목을 대체한다 (같은 Day)", () => {
  const moments: StoryMomentInput[] = [
    { moment_id: "m1", day_number: 1, place_name: "whatever", city_spot_id: 1,
      memo: "첫 바다", photo_data: "data:image/jpeg;base64,AAA", photo_data_extra: ["data:image/jpeg;base64,BBB"] },
  ];
  const out = buildPrivateStoryDays(DAYS, moments, { ...CLOCK, isPast: false });
  const d1 = out[0]!.memories;
  assert.equal(d1.length, 2, "기본 항목이 대체될 뿐 개수는 유지");
  assert.equal(d1[0]!.id, "m1");
  assert.equal(d1[0]!.memo, "첫 바다");
  assert.equal(d1[0]!.placeName, "Haeundae Beach", "장소명은 일정의 정본을 쓴다");
  assert.equal(d1[0]!.photos.length, 2, "다중 사진이 그대로 전달된다");
  assert.equal(d1[1]!.id, "stop-1-1", "사진 없는 다른 장소는 기본 항목으로 남는다");
});

test("M2: 장소명만 같고 city_spot_id 가 없는 순간은 결합하지 않고 독립 항목으로 남는다", () => {
  const moments: StoryMomentInput[] = [
    { moment_id: "m2", day_number: 1, place_name: "Haeundae Beach", city_spot_id: null, memo: "note", photo_data: null },
  ];
  const out = buildPrivateStoryDays(DAYS, moments, { ...CLOCK, isPast: false });
  const d1 = out[0]!.memories;
  assert.deepEqual(d1.map(m => m.id), ["stop-1-0", "stop-1-1", "m2"]);
  assert.equal(d1[0]!.memo, "", "추측 결합으로 기본 항목이 바뀌면 안 된다");
});

test("M3: day 가 없거나 일정에 없는 순간은 마지막 Day 로 — 사라지지 않는다", () => {
  const moments: StoryMomentInput[] = [
    { moment_id: "m3", day_number: null, memo: "어딘가", photo_data: null },
    { moment_id: "m4", day_number: 99,   memo: "또 어딘가", photo_data: null },
  ];
  const out = buildPrivateStoryDays(DAYS, moments, { ...CLOCK, todayISO: "2026-09-01", isPast: true });
  const last = out[out.length - 1]!;
  assert.equal(last.dayNumber, 3);
  assert.deepEqual(last.memories.slice(-2).map(m => m.id), ["m3", "m4"]);
});

test("M4: 미래 Day 에 남긴 순간도 사용자 기록이므로 보인다 (기본 장소는 제외된 채)", () => {
  const moments: StoryMomentInput[] = [
    { moment_id: "m5", day_number: 3, memo: "미리 가봄", photo_data: "data:image/jpeg;base64,CCC" },
  ];
  const out = buildPrivateStoryDays(DAYS, moments, { ...CLOCK, isPast: false });
  const d3 = out.find(d => d.dayNumber === 3)!;
  assert.deepEqual(d3.memories.map(m => m.id), ["m5"]);
});

test("S1: 죽은 호스트 카탈로그 이미지는 쓰지 않는다 (깨진 사진 대신 없음)", () => {
  const days: StoryDayInput[] = [{ dayNumber: 1, date: "2026-08-19", places: [
    { name: "Dead", time: "10:00", place_id: "3", source: "city_spot", image: "https://source.unsplash.com/x" },
  ]}];
  const out = buildPrivateStoryDays(days, [], { ...CLOCK, isPast: false });
  assert.equal(out[0]!.memories[0]!.photos.length, 0);
});

test("S2: 출력에는 좌표·device·저장 경로 키가 없다 (표현 타입만)", () => {
  const moments = [{ moment_id: "m1", day_number: 1, city_spot_id: 1, memo: "x", photo_data: "data:image/jpeg;base64,AAA",
    lat: 35.1, lng: 129.0, device_id: "dev", storage_path: "a/b.jpg" } as unknown as StoryMomentInput];
  const out = buildPrivateStoryDays(DAYS, moments, { ...CLOCK, isPast: false });
  const json = JSON.stringify(out);
  for (const k of ["lat", "lng", "device_id", "storage_path", "35.1"]) assert.ok(!json.includes(k), k);
  assert.deepEqual(Object.keys(out[0]!.memories[0]!).sort(), ["id", "memo", "photos", "placeName"]);
});

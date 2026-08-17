// 공개 Story 로 무엇이 나가는가.
//
// 운영에서 실제로 새던 것을 그대로 fixture 로 만든다 — My Place 를 This Trip 에
// 담아 만든 일정을 공개하면, 그 장소의 비공개 메모가 `days.scheduled[].tips` 를
// 타고 공개 응답에 실렸다. 여기서는 그 문자열이 결과에 없다는 것을 못 박는다.

import test from "node:test";
import assert from "node:assert/strict";
import {
  publicPlace, publicDay, serializePublicDays, serializePublicItinerary,
  PUBLIC_SELECT_COLUMNS,
} from "./public-story.ts";

const SECRET = "여기 프러포즈했다 아무한테도 말하지 마";

/** 실제 저장 모양 그대로 (itinerary/page.tsx 가 쓰는 필드) */
const CITY_SPOT = {
  name: "감천문화마을", category: "attraction", location: "Saha-gu",
  time: "10:00", duration: "90m", slot: "morning",
  tips: "언덕이 가파르니 편한 신발을 신으세요.",
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gamcheon",
  lat: 35.0975, lng: 129.0107,
  place_id: "4412", source: "city_spot", sourceKey: "city_spot:4412",
  affiliateProvider: "klook", bookingUrl: "https://example.test/book",
};

const USER_SPOT = {
  name: "우리가 앉았던 벤치", category: "attraction", location: "Busan",
  time: "14:40", duration: "60m", slot: "afternoon",
  tips: SECRET,
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=%EB%B2%A4%EC%B9%98",
  lat: 35.1587, lng: 129.1604,
  sourceKey: "user_spot:0eaa004e-e153-4574-a849-43b5511c6b0b",
};

const STAY = {
  name: "QA 호텔", category: "accommodation", location: "Busan",
  time: "21:00", duration: "600m", slot: "night",
  tips: "", googleMapsUrl: "", isAccommodation: true,
};

// ── A. 공식 장소 ─────────────────────────────────────────────────────────────
test("★공식 장소는 안내문과 정본 열쇠를 유지하고 좌표·지도링크는 내보내지 않는다", () => {
  const p = publicPlace(CITY_SPOT);
  assert.equal(p.name, "감천문화마을");
  assert.equal(p.category, "attraction");
  assert.equal(p.time, "10:00");
  assert.equal(p.duration, "90m");
  assert.equal(p.slot, "morning");
  assert.equal(p.tips, CITY_SPOT.tips);
  assert.equal(p.place_id, "4412");
  for (const gone of ["lat", "lng", "googleMapsUrl", "sourceKey", "source",
                      "affiliateProvider", "bookingUrl"]) {
    assert.ok(!(gone in p), `${gone} 가 공개된다`);
  }
});

// ── B. My Place ──────────────────────────────────────────────────────────────
test("★My Place 의 메모는 공개되지 않는다", () => {
  const p = publicPlace(USER_SPOT);
  assert.equal(p.name, "우리가 앉았던 벤치");
  assert.equal(p.category, "attraction");
  assert.equal(p.time, "14:40");
  assert.equal(p.duration, "60m");
  assert.equal(p.slot, "afternoon");
  assert.ok(!("tips" in p), "비공개 메모가 tips 로 나간다");
  assert.ok(!JSON.stringify(p).includes(SECRET), "어떤 필드로든 메모가 나간다");
  for (const gone of ["lat", "lng", "googleMapsUrl", "sourceKey", "place_id"]) {
    assert.ok(!(gone in p), `${gone} 가 공개된다`);
  }
});

test("★source 로만 표시된 My Place 도 같은 대접을 받는다", () => {
  const p = publicPlace({ ...USER_SPOT, sourceKey: undefined, source: "user_spot" });
  assert.ok(!("tips" in p));
  assert.ok(!JSON.stringify(p).includes(SECRET));
});

test("★공식 장소로 증명되지 않으면 안내문을 내보내지 않는다", () => {
  // 오래된 기록에는 source 도 sourceKey 도 없다. 그 자리에 사용자가 적은 글이
  // 들어와 있을 수 있으므로 증명되지 않은 tips 는 버린다.
  const p = publicPlace({ name: "옛 기록", category: "attraction", location: "Busan",
                          time: "11:00", duration: "60m", tips: SECRET });
  assert.ok(!("tips" in p));
  assert.equal(p.name, "옛 기록");
});

test("★숙소 표시는 유지된다", () => {
  const p = publicPlace(STAY);
  assert.equal(p.isAccommodation, true);
  assert.equal(p.name, "QA 호텔");
});

// ── C. legacy / 형식 ─────────────────────────────────────────────────────────
test("★__v:2 는 __v:2 로, unscheduled 는 언제나 비어 있다", () => {
  const out = serializePublicDays({
    __v: 2,
    scheduled: [{ dayNumber: 1, date: "2026-08-20", places: [CITY_SPOT, USER_SPOT] }],
    unscheduled: [{ name: "원작성자 This Trip", note: SECRET }],
  }) as { __v: number; scheduled: unknown[]; unscheduled: unknown[] };

  assert.equal(out.__v, 2);
  assert.equal(out.scheduled.length, 1);
  assert.deepEqual(out.unscheduled, []);
  assert.ok(!JSON.stringify(out).includes(SECRET), "legacy unscheduled 가 공개된다");
});

test("★배열로 저장된 옛 기록은 배열로 돌려준다", () => {
  const out = serializePublicDays([{ dayNumber: 1, date: "2026-08-20", places: [USER_SPOT] }]);
  assert.ok(Array.isArray(out));
  assert.equal((out as unknown[]).length, 1);
  assert.ok(!JSON.stringify(out).includes(SECRET));
});

test("★빈 값과 모르는 모양에서 죽지 않는다", () => {
  assert.deepEqual(serializePublicDays([]), []);
  assert.deepEqual(serializePublicDays(null), []);
  assert.deepEqual(serializePublicDays("이상한 값"), []);
  assert.deepEqual(serializePublicDays({ __v: 9 }), []);
  assert.deepEqual(serializePublicDays({ __v: 2 }),
    { __v: 2, scheduled: [], unscheduled: [] });
  assert.deepEqual(publicDay({ dayNumber: 1 }).places, []);
  assert.deepEqual(publicDay(null).places, []);
  const bare = publicPlace(null);
  assert.equal(bare.name, "");
  assert.ok(!("slot" in bare));
});

// ── 일정 한 건 ───────────────────────────────────────────────────────────────
test("★공개 응답에 소유권 필드가 없다", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    city: "busan", start_date: "2026-08-20", end_date: "2026-08-23",
    travelers: "2", travel_style: "relaxed", trip_title: "부산 4일",
    updated_at: "2026-08-16T00:00:00Z", view_count: 3, helpful_count: 1, copy_count: 2,
    days: { __v: 2, scheduled: [{ dayNumber: 1, date: "2026-08-20", places: [USER_SPOT] }], unscheduled: [] },
    device_id: "b2222222-2222-4222-8222-222222222222",
    email: "someone@example.test", is_public: true, copy_of: null,
  };
  const out = serializePublicItinerary(row);
  const raw = JSON.stringify(out);
  for (const bad of ["device_id", "email", "is_public", "copy_of", SECRET,
                     "b2222222", "someone@example.test"]) {
    assert.ok(!raw.includes(bad), `${bad} 가 공개된다`);
  }
  assert.equal(out.trip_title, "부산 4일");
  assert.equal(out.copy_count, 2);
});

test("★조회하는 컬럼 자체에 소유권 필드가 없다", () => {
  for (const bad of ["device_id", "email", "is_public", "copy_of"]) {
    assert.ok(!PUBLIC_SELECT_COLUMNS.includes(bad), `${bad} 를 읽는다`);
  }
  for (const need of ["id", "city", "days", "trip_title"]) {
    assert.ok(PUBLIC_SELECT_COLUMNS.includes(need), `${need} 가 빠졌다`);
  }
});

test("★빠진 값은 0/빈 문자열로 채운다 — 화면이 undefined 를 만나지 않는다", () => {
  const out = serializePublicItinerary({});
  assert.equal(out.city, "");
  assert.equal(out.view_count, 0);
  assert.equal(out.updated_at, null);
  assert.deepEqual(out.days, []);
});

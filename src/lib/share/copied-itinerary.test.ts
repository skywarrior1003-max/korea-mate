// 복사본이 무엇을 가져오는가.
//
// 공개물과 요구가 반대다. 받은 사람은 이 일정을 **실제로 다닌다** — 지도에 핀이
// 찍혀야 하고 스케줄러가 다시 계산할 수 있어야 한다. 그래서 좌표는 남긴다.
// 대신 원작성자가 자기 My Place 에 적어 둔 메모와 그 사람의 장소 열쇠는
// 가져오지 않는다. 그건 여행 계획이 아니다.

import test from "node:test";
import assert from "node:assert/strict";
import { copiedPlace, copiedDay, buildCopiedItinerary } from "./copied-itinerary.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SECRET = "여기 프러포즈했다 아무한테도 말하지 마";
const OWNER_KEY = "user_spot:0eaa004e-e153-4574-a849-43b5511c6b0b";

const CITY_SPOT = {
  name: "감천문화마을", category: "attraction", location: "Saha-gu",
  time: "10:00", duration: "90m", slot: "morning",
  tips: "언덕이 가파르니 편한 신발을 신으세요.",
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Gamcheon",
  lat: 35.0975, lng: 129.0107,
  place_id: "4412", source: "city_spot", sourceKey: "city_spot:4412",
  cartSnapshot: { id: "x", note: SECRET },
};

const USER_SPOT = {
  name: "우리가 앉았던 벤치", category: "attraction", location: "Busan",
  time: "14:40", duration: "60m", slot: "afternoon",
  tips: SECRET, lat: 35.1587, lng: 129.1604,
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=bench",
  sourceKey: OWNER_KEY,
};

// ── D. 공식 장소 ─────────────────────────────────────────────────────────────
test("★공식 장소는 지도·스케줄러가 쓰는 값을 그대로 가져온다", () => {
  const p = copiedPlace(CITY_SPOT);
  assert.equal(p.lat, 35.0975);
  assert.equal(p.lng, 129.0107);
  assert.equal(p.place_id, "4412");
  assert.equal(p.source, "city_spot");
  assert.equal(p.sourceKey, "city_spot:4412");
  assert.equal(p.tips, CITY_SPOT.tips);
  assert.equal(p.googleMapsUrl, CITY_SPOT.googleMapsUrl);
  assert.equal(p.time, "10:00");
  assert.equal(p.duration, "90m");
  assert.equal(p.slot, "morning");
  // whitelist 라 저장 구조에 붙어 있던 것이 딸려오지 않는다
  assert.ok(!("cartSnapshot" in p), "cartSnapshot 이 복사된다");
  assert.ok(!JSON.stringify(p).includes(SECRET));
});

// ── E. My Place ──────────────────────────────────────────────────────────────
test("★남의 My Place 는 메모와 열쇠 없이, 좌표는 그대로 가져온다", () => {
  const p = copiedPlace(USER_SPOT);
  assert.equal(p.name, "우리가 앉았던 벤치");
  assert.equal(p.category, "attraction");
  assert.equal(p.time, "14:40");
  assert.equal(p.duration, "60m");
  assert.equal(p.slot, "afternoon");
  // 다녀야 하니 좌표는 남는다
  assert.equal(p.lat, 35.1587);
  assert.equal(p.lng, 129.1604);
  // 일기와 남의 열쇠는 남지 않는다
  assert.ok(!("tips" in p), "원작성자 메모가 복사된다");
  assert.ok(!("sourceKey" in p), "원작성자 user_spot 열쇠가 복사된다");
  assert.ok(!JSON.stringify(p).includes(SECRET));
  assert.ok(!JSON.stringify(p).includes("0eaa004e"), "원작성자 장소 id 가 복사된다");
});

test("★source 로만 표시된 My Place 도 같다", () => {
  const p = copiedPlace({ ...USER_SPOT, sourceKey: undefined, source: "user_spot" });
  assert.ok(!("tips" in p));
  assert.ok(!("source" in p));
  assert.equal(p.lat, 35.1587);
});

test("★숙소 표시와 좌표 없는 장소도 그대로 지나간다", () => {
  const stay = copiedPlace({ name: "QA 호텔", category: "accommodation",
                             location: "Busan", time: "21:00", duration: "600m",
                             isAccommodation: true, tips: "", googleMapsUrl: "" });
  assert.equal(stay.isAccommodation, true);
  assert.ok(!("lat" in stay));
  assert.ok(!("tips" in stay), "빈 문자열까지 실어 나르지 않는다");
});

// ── 형식 ─────────────────────────────────────────────────────────────────────
test("★저장 형식을 바꾸지 않는다 — 받은 사람도 같은 파서로 읽는다", () => {
  const out = buildCopiedItinerary({
    __v: 2,
    scheduled: [{ dayNumber: 1, date: "2026-08-20", places: [CITY_SPOT, USER_SPOT] }],
    unscheduled: [{ name: "원작성자 This Trip", note: SECRET }],
  }) as { __v: number; scheduled: { places: unknown[] }[]; unscheduled: unknown[] };

  assert.equal(out.__v, 2);
  assert.equal(out.scheduled[0]!.places.length, 2);
  assert.deepEqual(out.unscheduled, [], "원작성자의 This Trip 이 복사된다");
  assert.ok(!JSON.stringify(out).includes(SECRET));
  assert.ok(!JSON.stringify(out).includes(OWNER_KEY));
});

test("★배열로 저장된 옛 기록은 배열로 돌려준다", () => {
  const out = buildCopiedItinerary([{ dayNumber: 1, date: "2026-08-20", places: [USER_SPOT] }]);
  assert.ok(Array.isArray(out));
  assert.ok(!JSON.stringify(out).includes(SECRET));
});

test("★빈 값과 모르는 모양에서 죽지 않는다", () => {
  assert.deepEqual(buildCopiedItinerary([]), []);
  assert.deepEqual(buildCopiedItinerary(null), []);
  assert.deepEqual(buildCopiedItinerary({ __v: 2 }), { __v: 2, scheduled: [], unscheduled: [] });
  assert.deepEqual(copiedDay(null).places, []);
});

// ── F. Memory 는 복사하지 않는다 ─────────────────────────────────────────────
test("★복사 API 는 trip_moments 를 읽지도 쓰지도 않는다", () => {
  const src = readFileSync(join(process.cwd(), "functions", "api", "itinerary", "copy.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "")
                  .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /trip_moments/, "복사가 Memory 테이블을 건드린다");
  assert.doesNotMatch(code, /storage/i,     "복사가 사진 저장소를 건드린다");
  // 원본을 그대로 옮기던 줄이 사라졌다
  assert.doesNotMatch(code, /days:\s*source\.days/, "raw days 를 그대로 복사한다");
  assert.match(code, /days:\s*buildCopiedItinerary\(source\.days\)/);
});

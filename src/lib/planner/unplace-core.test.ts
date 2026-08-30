import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeToUnplacedCartEvent, isUnplaceable } from "./unplace-core.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("★스케줄러 항목 → 보관함 항목: 이름·카테고리·좌표·설명·체류를 옮기고 지어내지 않는다", () => {
  const r = placeToUnplacedCartEvent({ name: "감천문화마을", category: "attraction", location: "사하구", time: "10:41", duration: "90m", tips: "골목", lat: 35.09, lng: 129.01, sourceKey: "city_spot:2", timeSource: "scheduler" }, "2026-08-31", "Busan");
  assert.equal(r.event.name, "감천문화마을");
  assert.equal(r.event.type, "attraction");
  assert.equal(r.event.sourceKey, "city_spot:2");
  assert.equal(r.event.lat, 35.09);
  assert.equal(r.event.recommendedDurationMinutes, 90);
  assert.equal(r.event.description, "골목");
  assert.equal(r.event.whyItMatters, "");
  assert.equal(r.fixed, null, "스케줄러 시각은 hard constraint 가 아니다");
  assert.deepEqual(r.meta, { time: "10:41", timeSource: "scheduler", duration: "90m", fromDate: "2026-08-31" });
});

test("★fixed 일정은 CartFixed(날짜·시작·소요) 로 보존된다", () => {
  const r = placeToUnplacedCartEvent({ name: "공연", category: "event", time: "20:00", duration: "60m", isFixed: true, sourceKey: "event:busan:x" }, "2026-08-31", "Busan");
  assert.deepEqual(r.fixed, { date: "2026-08-31", startTime: "20:00", durationMinutes: 60 });
});

test("★사용자가 정한 시각은 unplacedMeta 로 남는다 (다시 배치할 때 되살린다)", () => {
  const r = placeToUnplacedCartEvent({ name: "카페", category: "cafe", time: "10:15", duration: "60m", timeSource: "user", sourceKey: "user_spot:abc" }, "2026-08-31", "Busan");
  assert.equal(r.meta.timeSource, "user");
  assert.equal(r.meta.time, "10:15");
  assert.equal((r.event as { unplacedMeta?: { time: string | null } }).unplacedMeta?.time, "10:15");
});

test("★보관함에서 온 항목은 cartSnapshot 원본을 되살린다 (addedAt/sortOrder/tripCity 는 버린다)", () => {
  const snap = { id: "local-3", sourceKey: "city_spot:3", type: "restaurant", name: "뉴러우멘관즈", shortName: "뉴러우멘관즈", city: "Busan", addedAt: 1, sortOrder: 4, tripCity: "Busan", lat: 35.1, lng: 129.1 } as never;
  const r = placeToUnplacedCartEvent({ name: "뉴러우멘관즈", category: "restaurant", cartSnapshot: snap }, "2026-08-31", "Busan");
  assert.equal(r.event.id, "local-3");
  assert.equal(r.event.sourceKey, "city_spot:3");
  assert.ok(!("addedAt" in r.event) && !("sortOrder" in r.event) && !("tripCity" in r.event));
});

test("★숙소 체크인 항목은 보관함으로 보내지 않는다", () => {
  assert.equal(isUnplaceable({ name: "호텔", isAccommodation: true }), false);
  assert.equal(isUnplaceable({ name: "카페" }), true);
});

test("★page.tsx — 기간 축소는 확인 없이 적용되고 잘린 장소는 삭제 대신 미배정으로 간다 (source guard)", () => {
  const page = read("../../app/itinerary/page.tsx");
  assert.match(page, /placeToUnplacedCartEvent\(/, "잘린 장소는 보관함 항목으로 변환된다");
  assert.match(page, /editDatesShrinkMoved/, "옮겼다는 안내를 준다");
  assert.ok(!page.includes("editDatesShrinkConfirm") && !page.includes("editDatesShrinkGo"), "옛 '삭제하고 변경' 흐름이 남아 있다");
  assert.ok(!/confirmRemoval/.test(page), "확인-후-삭제 계약이 남아 있다");
  for (const loc of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`../../messages/${loc}.json`));
    assert.ok(m.planner?.editDatesShrinkMoved?.includes("{n}"), `${loc}: editDatesShrinkMoved 에 {n} 없음`);
    assert.equal(m.planner?.editDatesShrinkConfirm, undefined, `${loc}: 옛 키 잔존`);
  }
});

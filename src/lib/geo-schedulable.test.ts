import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSchedulableCoordinate, isValidCoordinate } from "./geo.ts";

test("★P0 coordinate gate — 한국 범위 안의 유효 좌표만 자동 배치 후보가 된다", () => {
  assert.equal(isSchedulableCoordinate(35.1587, 129.1603), true, "해운대");
  assert.equal(isSchedulableCoordinate(33.4996, 126.5312), true, "제주");
  assert.equal(isSchedulableCoordinate(129.1603, 35.1587), false, "lat/lng 스왑");
  assert.equal(isSchedulableCoordinate(0, 0), false);
  assert.equal(isSchedulableCoordinate(null, 129.1), false);
  assert.equal(isSchedulableCoordinate(NaN, 129.1), false);
  assert.equal(isSchedulableCoordinate(37.7749, -122.4194), false, "다른 나라");
  assert.equal(isValidCoordinate(37.7749, -122.4194), true, "화면용 유효성은 그대로(범위 판정 없음)");
});

test("★source guard — 스케줄러 후보와 This Trip hint 가 같은 게이트를 지난다 (silent drop 없음)", () => {
  const plan = readFileSync(new URL("../../functions/api/trip/plan.ts", import.meta.url), "utf8");
  assert.match(plan, /rawRows = \(data as any\[\]\)\.filter\(row => isSchedulableCoordinate\(row\.lat, row\.lng\)\)\.map/);
  assert.match(plan, /cart_hints\.filter\(h => isSchedulableCoordinate\(h\.lat, h\.lng\)\)\.map\(hint => \{/);
  const page = readFileSync(new URL("../app/itinerary/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\.filter\(item => !isSchedulableCoordinate\(item\.lat, item\.lng\)\)/, "걸러진 This Trip 항목은 skippedCartNames 안내로 간다");
  assert.match(page, /\.filter\(item => isSchedulableCoordinate\(item\.lat, item\.lng\)\)/);
});

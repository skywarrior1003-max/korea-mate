import test from "node:test";
import assert from "node:assert/strict";
import { savedSelectionsToRelease } from "./saved-promotion.ts";

const pick = (sourceKey: string, id?: string) => ({ sourceKey, id });
const keys = (v: { sourceKey: string }[]) => v.map(r => r.sourceKey);

// Saved 에 A·B·C 가 있고 D·E 는 담지 않았다.
const FAV_KEYS = ["city_spot:1", "city_spot:2", "city_spot:3", "city_spot:4", "city_spot:5"];
const FAV_IDS  = ["1", "2", "3", "4", "5"];

test("★고른 것 중 Saved 에도 있는 것만 내린다", () => {
  const picks = [pick("city_spot:1", "1"), pick("city_spot:2", "2"), pick("city_spot:3", "3")];
  assert.deepEqual(keys(savedSelectionsToRelease(picks, FAV_KEYS, FAV_IDS)),
    ["city_spot:1", "city_spot:2", "city_spot:3"]);
});

test("★고르지 않은 Saved 는 목록에 오르지 않는다", () => {
  const picks = [pick("city_spot:1", "1")];
  const out = keys(savedSelectionsToRelease(picks, FAV_KEYS, FAV_IDS));
  assert.deepEqual(out, ["city_spot:1"]);
  for (const kept of ["city_spot:4", "city_spot:5"]) assert.ok(!out.includes(kept), kept);
});

test("★Saved 에 없던 선택은 아무 일도 일으키지 않는다", () => {
  // Explore 에서 하트 없이 바로 담은 곳
  const picks = [pick("city_spot:99", "99"), pick("local_info:busan:3")];
  assert.deepEqual(savedSelectionsToRelease(picks, FAV_KEYS, FAV_IDS), []);
});

test("★My Places 원본은 절대 내리지 않는다", () => {
  const picks = [pick("user_spot:8f14e45f-ceea-467a-9d3f-1b2c3d4e5f60", "8f14e45f")];
  assert.deepEqual(savedSelectionsToRelease(picks, ["user_spot:8f14e45f-ceea-467a-9d3f-1b2c3d4e5f60"], []), []);
});

test("★선택이 비면 아무것도 내리지 않는다", () => {
  assert.deepEqual(savedSelectionsToRelease([], FAV_KEYS, FAV_IDS), []);
  assert.deepEqual(savedSelectionsToRelease(null, FAV_KEYS, FAV_IDS), []);
  assert.deepEqual(savedSelectionsToRelease(undefined, null, null), []);
});

test("★Saved 가 비면 아무것도 내리지 않는다", () => {
  assert.deepEqual(savedSelectionsToRelease([pick("city_spot:1", "1")], [], []), []);
});

test("★같은 장소를 두 번 담아도 한 번만 내린다", () => {
  const picks = [pick("city_spot:1", "1"), pick("city_spot:1", "1")];
  assert.equal(savedSelectionsToRelease(picks, FAV_KEYS, FAV_IDS).length, 1);
});

test("★sourceKey 기록이 있으면 id 만 같은 다른 장소를 끌어오지 않는다", () => {
  // 예전 `local-24` 충돌 — 같은 id 를 가진 서로 다른 장소가 실재한다.
  const picks = [pick("local_info:busan:24", "local-24")];
  const favKeys = ["city_spot:24"];          // Saved 에 있는 것은 전혀 다른 장소다
  const favIds  = ["local-24"];
  assert.deepEqual(savedSelectionsToRelease(picks, favKeys, favIds), []);
});

test("★sourceKey 기록이 아예 없는 예전 상태에서만 id 로 맞힌다", () => {
  const picks = [pick("local_info:busan:24", "local-24")];
  const out = savedSelectionsToRelease(picks, [], ["local-24"]);
  assert.deepEqual(out, [{ id: "local-24", sourceKey: "local_info:busan:24" }]);
});

test("★removeFavorite 에 넘길 id 와 sourceKey 를 함께 준다", () => {
  const out = savedSelectionsToRelease([pick("city_spot:2", "2")], FAV_KEYS, FAV_IDS);
  assert.deepEqual(out, [{ id: "2", sourceKey: "city_spot:2" }]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  citySwitchAction, savedToReleaseForCity, hasPlanningState,
} from "./city-switch-core.ts";

const READY     = { planningReady: true };
const NOT_READY = { planningReady: false };

// ── 무엇을 할 것인가 ─────────────────────────────────────────────────────────
test("★열리지 않은 도시를 고르면 아무것도 바꾸지 않는다", () => {
  assert.equal(citySwitchAction({ from: "Busan", to: "Seoul", toCity: NOT_READY, hasPlanningState: true }), "blocked");
  assert.equal(citySwitchAction({ from: "Busan", to: "Seoul", toCity: NOT_READY, hasPlanningState: false }), "blocked");
});

test("★모르는 도시도 막는다 — 없는 곳으로 옮기지 않는다", () => {
  for (const to of [null, undefined, "", "   "]) {
    assert.equal(citySwitchAction({ from: "Busan", to, toCity: READY, hasPlanningState: true }), "blocked", String(to));
  }
  assert.equal(citySwitchAction({ from: "Busan", to: "Nowhere", toCity: null, hasPlanningState: true }), "blocked");
});

test("★같은 도시는 할 일이 없다", () => {
  assert.equal(citySwitchAction({ from: "Busan", to: "Busan", toCity: READY, hasPlanningState: true }), "noop");
  assert.equal(citySwitchAction({ from: "busan", to: "BUSAN", toCity: READY, hasPlanningState: true }), "noop");
});

test("★지울 것이 없으면 바로 옮긴다", () => {
  assert.equal(citySwitchAction({ from: "Busan", to: "Gyeongju", toCity: READY, hasPlanningState: false }), "switch");
  // 아직 아무 도시도 고르지 않은 상태에서도 막지 않는다
  assert.equal(citySwitchAction({ from: null, to: "Gyeongju", toCity: READY, hasPlanningState: false }), "switch");
});

test("★지울 것이 있으면 먼저 묻는다", () => {
  assert.equal(citySwitchAction({ from: "Busan", to: "Gyeongju", toCity: READY, hasPlanningState: true }), "confirm");
});

test("★도시 이름을 코드가 알지 않는다 — 판단은 선언된 값으로만 한다", () => {
  // 같은 이름이라도 선언 값이 바뀌면 결과가 바뀐다
  assert.equal(citySwitchAction({ from: "Busan", to: "Seoul", toCity: NOT_READY, hasPlanningState: false }), "blocked");
  assert.equal(citySwitchAction({ from: "Busan", to: "Seoul", toCity: READY,     hasPlanningState: false }), "switch");
});

// ── 무엇을 지울 것인가 ───────────────────────────────────────────────────────
const SAVED = [
  { id: "1", sourceKey: "city_spot:1", city: "busan" },
  { id: "2", sourceKey: "city_spot:2", city: "Busan" },      // 대소문자 무관
  { id: "3", sourceKey: "city_spot:3", city: "gyeongju" },
  { id: "4", sourceKey: "city_spot:4" },                      // 도시를 모른다
  { id: "5", sourceKey: "city_spot:5", city: "" },            // 도시를 모른다
];
const keys = (v: { sourceKey: string }[]) => v.map(r => r.sourceKey);

test("★그 도시 것이 확실한 Saved 만 고른다", () => {
  assert.deepEqual(keys(savedToReleaseForCity(SAVED, "Busan")), ["city_spot:1", "city_spot:2"]);
});

test("★다른 도시 Saved 는 고르지 않는다", () => {
  assert.ok(!keys(savedToReleaseForCity(SAVED, "Busan")).includes("city_spot:3"));
  assert.deepEqual(keys(savedToReleaseForCity(SAVED, "Gyeongju")), ["city_spot:3"]);
});

test("★도시를 모르는 예전 Saved 는 추측해서 지우지 않는다", () => {
  for (const c of ["Busan", "Gyeongju"]) {
    const out = keys(savedToReleaseForCity(SAVED, c));
    assert.ok(!out.includes("city_spot:4"), c);
    assert.ok(!out.includes("city_spot:5"), c);
  }
});

test("★도시를 모르면 아무것도 고르지 않는다", () => {
  for (const c of [null, undefined, "", "  "]) {
    assert.deepEqual(savedToReleaseForCity(SAVED, c), [], String(c));
  }
});

test("★같은 장소가 두 번 있어도 한 번만 고른다", () => {
  const dup = [SAVED[0], SAVED[0]];
  assert.equal(savedToReleaseForCity(dup, "Busan").length, 1);
});

test("★removeFavorite 에 넘길 id 와 sourceKey 를 함께 준다", () => {
  assert.deepEqual(savedToReleaseForCity([SAVED[0]], "Busan"), [{ id: "1", sourceKey: "city_spot:1" }]);
});

// ── 지울 것이 있는가 ─────────────────────────────────────────────────────────
test("★Saved 든 This Trip 이든 하나라도 있으면 묻는다", () => {
  assert.equal(hasPlanningState({ savedForCity: 0, cartForCity: 0 }), false);
  assert.equal(hasPlanningState({ savedForCity: 1, cartForCity: 0 }), true);
  assert.equal(hasPlanningState({ savedForCity: 0, cartForCity: 1 }), true);
  assert.equal(hasPlanningState({ savedForCity: 3, cartForCity: 2 }), true);
});

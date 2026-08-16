import test from "node:test";
import assert from "node:assert/strict";
import { reduciblePicks, canFinalizeTrip } from "./trip-feasibility.ts";

const pick = (name: string, hasFixed = false) => ({ key: `k:${name}`, name, hasFixed });

test("★다 들어갔으면 확정할 수 있다", () => {
  assert.equal(canFinalizeTrip([], []), true);
  assert.equal(canFinalizeTrip(null, null), true);
  assert.equal(canFinalizeTrip(undefined, undefined), true);
});

test("★시간 미고정 장소가 남으면 확정하지 않는다", () => {
  const left = [pick("감천문화마을"), pick("흰여울문화마을")];
  assert.equal(canFinalizeTrip(left, []), false);
  assert.deepEqual(reduciblePicks(left, []).map(p => p.name),
    ["감천문화마을", "흰여울문화마을"]);
});

test("★고정 시각 장소는 '줄이세요' 로 바꿔 말하지 않는다", () => {
  // 일반 장소를 아무리 지워도 해결되지 않는 종류다. 이미 자기 안내가 붙는다.
  const left = [pick("야구 경기", true), pick("콘서트", true)];
  assert.deepEqual(reduciblePicks(left, []), []);
  assert.equal(canFinalizeTrip(left, []), true);
});

test("★하루 창 밖으로 지정된 고정 일정도 제외한다", () => {
  const left = [pick("새벽 시장"), pick("자갈치시장")];
  assert.deepEqual(reduciblePicks(left, ["새벽 시장"]).map(p => p.name), ["자갈치시장"]);
});

test("★이름 앞뒤 공백이 달라도 같은 장소로 본다", () => {
  const left = [pick("  광안리해수욕장 ")];
  assert.deepEqual(reduciblePicks(left, ["광안리해수욕장"]), []);
});

test("★고정과 일반이 섞이면 일반만 남긴다", () => {
  const left = [pick("야구 경기", true), pick("태종대"), pick("이기대")];
  assert.deepEqual(reduciblePicks(left, []).map(p => p.name), ["태종대", "이기대"]);
  assert.equal(canFinalizeTrip(left, []), false);
});

test("★key 를 그대로 넘긴다 — 화면이 목록을 그릴 때 쓴다", () => {
  const left = [pick("송도해수욕장")];
  assert.deepEqual(reduciblePicks(left, []), [{ key: "k:송도해수욕장", name: "송도해수욕장" }]);
});

test("★좌표 없는 장소는 애초에 여기 오지 않는다 — 빈 입력을 오판하지 않는다", () => {
  // cartHints 는 좌표가 유효한 것만 담으므로 unplaced 에 섞일 수 없다.
  // 그래도 빈 목록을 "줄여야 한다" 로 읽지 않는지 못 박는다.
  assert.equal(canFinalizeTrip([], ["좌표 없는 곳"]), true);
});

// My Trip 이 저장되면 그 도시의 This Trip 은 할 일을 다 했다. 그 도시 것만 덜어낸다.
//
// 무엇을 막는가
//   `clearCart()` 는 저장소를 통째로 비운다. 서울 일정을 만들었는데 담아 두었던
//   부산 목록이 함께 사라지는 종류의 사고다.

import test from "node:test";
import assert from "node:assert/strict";
import { dropCity, forCity } from "./city-scope-core.ts";

const item = (name: string, tripCity?: string | null, city?: string) =>
  ({ name, tripCity, city });

const SET = [
  item("해운대", "Busan"),
  item("감천문화마을", "busan"),          // 대소문자가 달라도 같은 도시다
  item("경복궁", "Seoul"),
  item("내 카페", null),                  // 어느 여행 것인지 모른다
  item("자갈치", undefined, "Busan"),     // tripCity 없던 시절 항목
];
const names = (v: { name: string }[]) => v.map(i => i.name);

test("★그 도시 것만 덜어낸다", () => {
  assert.deepEqual(names(dropCity(SET, "Busan")), ["경복궁", "내 카페"]);
});

test("★대소문자가 달라도 같은 도시로 본다", () => {
  assert.deepEqual(names(dropCity(SET, "busan")), names(dropCity(SET, "BUSAN")));
});

test("★다른 도시 선택은 건드리지 않는다", () => {
  assert.ok(names(dropCity(SET, "Busan")).includes("경복궁"));
  assert.ok(names(dropCity(SET, "Seoul")).includes("해운대"));
});

test("★어느 여행 것인지 모르는 예전 선택은 남긴다", () => {
  for (const c of ["Busan", "Seoul"]) {
    assert.ok(names(dropCity(SET, c)).includes("내 카페"), c);
  }
});

test("★도시를 모르면 아무것도 지우지 않는다", () => {
  for (const c of [null, undefined, "", "   "]) {
    assert.deepEqual(names(dropCity(SET, c)), names(SET), JSON.stringify(c));
  }
});

test("★없는 도시를 지워도 그대로다", () => {
  assert.deepEqual(names(dropCity(SET, "Jeju")), names(SET));
});

test("★forCity 와 정확히 반대다 — 둘을 합치면 원본이다", () => {
  const kept  = dropCity(SET, "Busan");
  const taken = forCity(SET, "Busan");
  assert.equal(kept.length + taken.length, SET.length);
  for (const t of taken) assert.ok(!kept.includes(t), t.name);
});

test("★원본 배열을 바꾸지 않는다", () => {
  const before = names(SET).join(",");
  dropCity(SET, "Busan");
  assert.equal(names(SET).join(","), before);
});

/**
 * Visited 키 격리 테스트
 * Run: node --experimental-strip-types src/lib/visited.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { visitedStorageKey, visitedPlaceKey } from "./visited.ts";

test("여행 간 격리: itineraryId별 storage key 상이", () => {
  const a = visitedStorageKey("11111111-aaaa");
  const b = visitedStorageKey("22222222-bbbb");
  assert.notStrictEqual(a, b);
  assert.ok(a.includes("11111111-aaaa"));
});

test("미저장 여행은 draft 버킷", () => {
  assert.strictEqual(visitedStorageKey(null), "koreamate_visited_draft");
  assert.strictEqual(visitedStorageKey(undefined), "koreamate_visited_draft");
});

test("place_id 최우선: 같은 이름·다른 place_id → 다른 키", () => {
  const a = visitedPlaceKey(1, { place_id: "42", name: "Cafe X" });
  const b = visitedPlaceKey(1, { place_id: "99", name: "Cafe X" });
  assert.notStrictEqual(a, b);
});

test("같은 place_id·다른 Day → 다른 키", () => {
  const a = visitedPlaceKey(1, { place_id: "42", name: "Cafe X" });
  const b = visitedPlaceKey(2, { place_id: "42", name: "Cafe X" });
  assert.notStrictEqual(a, b);
});

test("place_id 폴백: name 사용, place_id 값과 네임스페이스 분리", () => {
  // place_id "42"인 장소와 이름이 "42"인 장소가 충돌하지 않아야 함
  const byId   = visitedPlaceKey(1, { place_id: "42", name: "Somewhere" });
  const byName = visitedPlaceKey(1, { name: "42" });
  assert.notStrictEqual(byId, byName);
});

test("언어 무관: 키는 저장 데이터만 사용 (동일 입력 → 동일 키)", () => {
  // UI locale이 바뀌어도 place 스냅샷(place_id·name)은 불변 — 키 재현성 확인
  const before = visitedPlaceKey(3, { place_id: "7", name: "Haeundae Beach" });
  const after  = visitedPlaceKey(3, { place_id: "7", name: "Haeundae Beach" });
  assert.strictEqual(before, after);
});

test("동일 여행·동일 장소 재방문 토글 대상 일치 (안정성)", () => {
  const k1 = visitedPlaceKey(2, { name: "Jeonpo Cafe Street" });
  const k2 = visitedPlaceKey(2, { name: "Jeonpo Cafe Street" });
  assert.strictEqual(k1, k2);
});

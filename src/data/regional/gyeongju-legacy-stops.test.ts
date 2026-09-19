// 경주 legacy 코스 stop 배선 가드 (GYEONGJU-LEGACY-COURSE-STOPS-PREVIEW-V1).
// 원본 course-place-links 실측을 고정한다 — 코스 수·순서·linked ID·name-only 가
// 조용히 바뀌면 여기서 실패해야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getRecommendedTrips } from "./regional-recommendations.ts";

const legacy = getRecommendedTrips("gyeongju").filter(t => t.origin === "gyeongju-official");

test("legacy 코스는 54개, 제목·순서 유지", () => {
  assert.equal(legacy.length, 54);
  // 정렬 앵커: 처음·마지막 코스 고정(카드 순서 회귀 감지)
  assert.equal(legacy[0].title, "팔방미인 보문관광단지 여행");
  assert.equal(legacy[53].title, "경주여행17선(영문)");
});

test("source-backed 16개 코스만 stops 를 갖는다", () => {
  const withStops = legacy.filter(t => t.stops.length > 0);
  assert.equal(withStops.length, 16);
  assert.equal(legacy.length - withStops.length, 38); // 0-stop 유지(CTA 가드 대상)
  assert.deepEqual(
    withStops.map(t => t.id).sort(),
    ["080c8957f0431a", "1db6f2f1c75c66", "26dc1a68d89d91", "2fde29376fca2e", "3bd3edd4276e0f",
     "62459c196210d2", "665f6a1495f352", "6d2dfd6d4e94a0", "79870661da2f6c", "7ca104af2a43d8",
     "81f7239c56b927", "8634d5b04154fc", "87b7d6be431eef", "9b2d66c1682879", "9e63b9e88c7484",
     "d96db695f6d542"].sort(),
  );
});

test("occurrence 118 · LINKED 84 · name-only(HOLD 포함) 34", () => {
  const stops = legacy.flatMap(t => t.stops);
  assert.equal(stops.length, 118);
  assert.equal(stops.filter(s => s.spotId !== null).length, 84);
  assert.equal(stops.filter(s => s.spotId === null).length, 34);
  // linked 는 전부 배선 계보 라벨을 갖는다
  for (const s of stops) {
    if (s.spotId !== null) assert.equal(s.linkage, "GYEONGJU_LEGACY_STOPS_V1");
    else assert.equal(s.linkage, null);
  }
});

test("대표 코스 stop 순서·연결 고정(시내권 유네스코·바다 코스)", () => {
  const unesco = legacy.find(t => t.id === "8634d5b04154fc")!;
  assert.deepEqual(unesco.stops.map(s => `${s.name}:${s.spotId ?? "-"}`), [
    "불국사:528", "석굴암:530", "신라역사과학관:531", "경주역사유적지구 황룡사 지구:-",
    "경주역사유적지구 월성 지구:427", "경주 역사유적지구 대릉원지구:436", "양동마을:546", "옥산서원:548",
  ]);
  const sea = legacy.find(t => t.id === "62459c196210d2")!;
  assert.equal(sea.stops.length, 8);
  assert.equal(sea.stops.filter(s => s.spotId !== null).length, 4);
  // HOLD(RELATED_ENTITY_ONLY) 는 연결하지 않는다 — 감포항 stop 은 name-only
  const gampo = sea.stops.find(s => s.name?.startsWith("감포항"));
  assert.equal(gampo?.spotId, null);
});

test("황룡사 지구 HOLD — 725 그룹 행을 연결하지 않는다", () => {
  const all = legacy.flatMap(t => t.stops);
  const hwang = all.filter(s => s.name?.includes("황룡사 지구"));
  assert.ok(hwang.length >= 1);
  for (const s of hwang) assert.equal(s.spotId, null);
});

test("regional 22코스와 충돌 0 — 경주 primary 4코스는 기존 배선 유지", () => {
  const primary = getRecommendedTrips("gyeongju").filter(t => t.origin === "regional-official");
  assert.equal(primary.length, 4);
  assert.deepEqual(primary.map(t => t.stops.length), [7, 7, 7, 10]);
});

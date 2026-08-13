// zone 확대 판정은 "가까운 데 몇 개 있나" 가 아니라 "오늘 고를 수 있는 게 몇 개 있나" 다.
//
// 왜 이 파일이 있나
//   공항·외곽처럼 1km 안에 장소가 대여섯 개뿐인 곳에서, 그 대여섯 개가 전부
//   어제 간 곳이어도 zone 확대가 멈췄다. 3km·7km 안에 안 가 본 곳이 수십 개
//   있어도 스케줄러는 그것을 본 적이 없다.
//
//   확대는 먼 곳을 **고른다** 는 뜻이 아니다. 평가할 기회를 준다는 뜻이고,
//   실제 선택은 기존 거리 점수·동선 페널티·사용자 선택이 한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expandZones } from "./zone-classifier.ts";
import type { ZonedPlace } from "./types.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

let seq = 0;
function place(zone: 1 | 2 | 3): ZonedPlace {
  seq++;
  return {
    place_id:   `p${seq}`,
    category:   "attraction",
    coordinate: { lat: 35 + seq * 1e-4, lng: 129 + seq * 1e-4 },
    zone_id:    zone,
    distance_m: zone === 1 ? 500 : zone === 2 ? 2_000 : 5_000,
  };
}
const many = (zone: 1 | 2 | 3, n: number) => Array.from({ length: n }, () => place(zone));
const idsOf = (ps: ZonedPlace[]) => ps.map(p => p.place_id);
const notIn = (used: Set<string>) => (p: ZonedPlace) => !used.has(p.place_id);

// ── 기존 동작 보존 ────────────────────────────────────────────────────────────

test("옵션이 없으면 기존 기준(5 / 10) 그대로다", () => {
  seq = 0;
  const zone1of5 = [...many(1, 5), ...many(2, 40)];
  assert.equal(expandZones(zone1of5).activeZone, 1, "zone-1 이 5 개면 예전처럼 멈춰야 한다");

  seq = 0;
  const zone1of4 = [...many(1, 4), ...many(2, 20)];
  assert.equal(expandZones(zone1of4).activeZone, 2);

  seq = 0;
  const sparse = [...many(1, 2), ...many(2, 3), ...many(3, 40)];
  assert.equal(expandZones(sparse).activeZone, 3);
});

// ── Case A — raw 는 넉넉한데 usable 이 부족하다 ───────────────────────────────

test("Case A: zone-1 raw 8 이지만 5 개가 이미 간 곳이면 다음 zone 으로 넓힌다", () => {
  seq = 0;
  const z1 = many(1, 8);
  const z2 = many(2, 40);
  const used = new Set(idsOf(z1.slice(0, 5)));   // usable 은 3

  const before = expandZones([...z1, ...z2]);                                   // 옵션 없음 = 예전 동작
  assert.equal(before.activeZone, 1, "예전 기준이면 raw 8 이라 멈춘다 — 이것이 결함이다");

  const after = expandZones([...z1, ...z2], { targetSupply: 30, isUsable: notIn(used) });
  assert.equal(after.activeZone, 2, "usable 3 인데 멈췄다");
  assert.ok(after.candidates.length > z1.length, "outer zone 후보가 실제로 들어와야 한다");
});

test("Case A: 판정에만 쓰고 반환 목록에서 제외 후보를 걸러 내지 않는다", () => {
  seq = 0;
  const z1 = many(1, 8);
  const used = new Set(idsOf(z1.slice(0, 5)));
  const r = expandZones([...z1, ...many(2, 40)], { targetSupply: 30, isUsable: notIn(used) });

  for (const id of used) {
    assert.ok(idsOf(r.candidates).includes(id),
      "제외 후보가 반환 목록에서 사라졌다 — 점수 계산 집합이 바뀐다");
  }
});

// ── Case B — zone-1 만으로 충분하다 ───────────────────────────────────────────

test("Case B: zone-1 usable 이 target 을 채우면 넓히지 않는다", () => {
  seq = 0;
  const z1 = many(1, 30);
  const r = expandZones([...z1, ...many(2, 50)], { targetSupply: 30, isUsable: () => true });
  assert.equal(r.activeZone, 1);
  assert.deepEqual(idsOf(r.candidates), idsOf(z1), "불필요하게 outer zone 을 끌고 왔다");
});

// ── Case C — zone-2 에서 충족 ─────────────────────────────────────────────────

test("Case C: 부족하면 zone-2 까지만 넓힌다 — 필요한 만큼만", () => {
  seq = 0;
  const z1 = many(1, 4), z2 = many(2, 26), z3 = many(3, 50);
  const r = expandZones([...z1, ...z2, ...z3], { targetSupply: 30, isUsable: () => true });
  assert.equal(r.activeZone, 2);
  assert.equal(r.candidates.length, 30);
  for (const p of r.candidates) assert.notEqual(p.zone_id, 3, "zone-3 까지 끌고 왔다");
});

// ── Case D — zone-3 까지 ──────────────────────────────────────────────────────

test("Case D: zone-2 까지도 부족하면 zone-3 까지 넓힌다", () => {
  seq = 0;
  const all = [...many(1, 3), ...many(2, 5), ...many(3, 40)];
  const r = expandZones(all, { targetSupply: 30, isUsable: () => true });
  assert.equal(r.activeZone, 3);
  assert.equal(r.candidates.length, all.length);
});

test("현재 최대 zone 을 넘어서 넓히지 않는다 — 후보가 모자라도 zone-3 이 끝이다", () => {
  seq = 0;
  const all = [...many(1, 1), ...many(2, 1), ...many(3, 2)];
  const r = expandZones(all, { targetSupply: 30, isUsable: () => true });
  assert.equal(r.activeZone, 3);
  assert.equal(r.candidates.length, 4, "없는 후보를 만들어 내면 안 된다");
});

test("전부 이미 간 곳이면 최대 zone 까지 넓힌다", () => {
  seq = 0;
  const all = [...many(1, 8), ...many(2, 8), ...many(3, 8)];
  const r = expandZones(all, { targetSupply: 30, isUsable: () => false });
  assert.equal(r.activeZone, 3);
});

// ── 배포 경로 배선 ────────────────────────────────────────────────────────────

const planSrc = readFileSync(path.join(process.cwd(), "functions", "api", "trip", "plan.ts"), "utf8");

test("plan.ts: zone 확대가 요청 limit 과 제외 목록을 기준으로 판정한다", () => {
  assert.match(planSrc, /expandZones\(zonedPlaces,\s*\{/, "plan.ts 가 아직 옵션 없이 부른다");
  assert.match(planSrc, /targetSupply:\s*input\.limit/, "임의의 숫자를 새로 만들었거나 limit 을 쓰지 않는다");
  assert.match(planSrc, /isUsable:\s*\(p\) => !excluded\.has\(String\(p\.place_id\)\)/,
    "제외 목록이 zone 판정에 반영되지 않는다");
});

test("plan.ts: 반경·zone 상수는 그대로다", () => {
  assert.match(planSrc, /const MAX_RADIUS_KM = 7;/);
  assert.match(planSrc, /const DEFAULT_LIMIT = 30;/);
});

test("zone-classifier: 반경 임계값 1km / 3km / 7km 그대로다", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "lib", "near-me", "zone-classifier.ts"), "utf8");
  assert.match(src, /1:\s*1_000/);
  assert.match(src, /2:\s*3_000/);
  assert.match(src, /3:\s*7_000/);
});

test("near-me-engine 은 옵션 없이 부른다 — Near Me 화면 동작 불변", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "lib", "near-me", "near-me-engine.ts"), "utf8");
  assert.match(src, /expandZones\(zonedPlaces\)/);
});

console.log(`\nzone-usable-supply: ${passed} passed`);

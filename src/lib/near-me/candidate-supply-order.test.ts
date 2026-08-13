// 후보 공급 순서 — 자르기 전에 뺀다.
//
// 왜 이 파일이 있나
//   여러 날 일정에서 3 일차·4 일차가 12 시간 창에 한 곳만 배치되는 일이 있었다.
//   반경 안에 안 가 본 곳이 수백 개 남아 있는데도 그랬다. 원인은 순서였다 —
//   상위 30 개를 먼저 고르고 그 다음에 "어제 간 곳" 을 뺐다. 30 개가 전부
//   어제 간 곳이면 남는 것이 없다.
//
//   자르는 것은 **고를 수 있는 후보** 에 적용해야 한다.
//
// 무엇을 고정하나
//   ① 순서 자체의 성질 — 실제 diversifyByCategory 로 두 순서를 모두 돌려 비교한다
//   ② 배포되는 경로가 그 순서를 쓰는지 — functions/api/trip/plan.ts 를 읽어 확인한다
//      (functions/ 는 확장자 없는 import 라 node 테스트 러너가 import 할 수 없다.
//       저장소의 기존 guard 테스트들과 같은 방식이다.)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { diversifyByCategory } from "./candidate-diversity.ts";

const PLAN_TS = path.join(process.cwd(), "functions", "api", "trip", "plan.ts");
const planSrc = readFileSync(PLAN_TS, "utf8");

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const LIMIT = 30;

/** 점수 순으로 앞쪽이 전부 "어제 간 곳" 인 풀. 뒤쪽에는 안 가 본 곳이 넉넉하다. */
function buildPool() {
  const cats = ["food", "attraction", "walking"];
  const all = [];
  for (let i = 0; i < 100; i++) {
    all.push({
      place_id: `p-${i}`,
      category: cats[i % cats.length],
      score:    1000 - i,           // p-0 이 가장 높다
      coordinate: { lat: 35 + i * 1e-4, lng: 129 + i * 1e-4 },
      zone_id: 1 as const,
    });
  }
  return all;
}

/** 잘라낸 결과에 들어갈 만큼 점수가 높은 앞쪽을 전부 제외 대상으로 잡는다. */
function usedIdsCoveringTheCut(pool: ReturnType<typeof buildPool>) {
  const cut = diversifyByCategory(pool as any, LIMIT);
  return new Set(cut.map((c: any) => String(c.place_id)));
}

// ── ① 순서의 성질 ─────────────────────────────────────────────────────────────

test("자른 뒤 빼면 후보가 0 이 된다 — 이것이 고치려는 결함이다", () => {
  const pool = buildPool();
  const used = usedIdsCoveringTheCut(pool);

  const limitedFirst = diversifyByCategory(pool as any, LIMIT);
  const afterExclude = limitedFirst.filter((c: any) => !used.has(String(c.place_id)));

  assert.equal(afterExclude.length, 0, "결함 재현이 안 됐다 — fixture 가 잘못됐다");
});

test("빼고 나서 자르면 남은 후보에서 limit 만큼 공급된다", () => {
  const pool = buildPool();
  const used = usedIdsCoveringTheCut(pool);

  const usable = pool.filter(c => !used.has(String(c.place_id)));
  const result = diversifyByCategory(usable as any, LIMIT);

  assert.equal(usable.length, 100 - used.size);
  assert.equal(result.length, LIMIT, "사용 가능한 후보가 넉넉한데 limit 을 못 채웠다");
});

test("이미 간 곳은 어떤 순서로도 다시 나오지 않는다", () => {
  const pool = buildPool();
  const used = usedIdsCoveringTheCut(pool);

  const result = diversifyByCategory(pool.filter(c => !used.has(String(c.place_id))) as any, LIMIT);
  for (const c of result) {
    assert.ok(!used.has(String((c as any).place_id)), `제외한 ${(c as any).place_id} 가 다시 들어왔다`);
  }
});

test("limit 상한은 그대로다 — 순서를 바꿔도 30 을 넘지 않는다", () => {
  const pool = buildPool();
  const result = diversifyByCategory(pool as any, LIMIT);
  assert.ok(result.length <= LIMIT);
  assert.equal(result.length, LIMIT);
});

test("카테고리 다양성 의미가 유지된다 — 풀에 있는 카테고리는 결과에도 있다", () => {
  const pool = buildPool();
  const used = usedIdsCoveringTheCut(pool);
  const usable = pool.filter(c => !used.has(String(c.place_id)));

  const poolCats   = new Set(usable.map(c => c.category));
  const resultCats = new Set(diversifyByCategory(usable as any, LIMIT).map((c: any) => c.category));

  for (const cat of poolCats) {
    assert.ok(resultCats.has(cat), `카테고리 ${cat} 이 결과에서 사라졌다`);
  }
});

test("제외가 없으면 결과가 기존과 완전히 같다", () => {
  const pool = buildPool();
  const before = diversifyByCategory(pool as any, LIMIT).map((c: any) => c.place_id);
  const after  = diversifyByCategory(pool.filter(() => true) as any, LIMIT).map((c: any) => c.place_id);
  assert.deepEqual(after, before);
});

// ── ② 배포 경로가 그 순서를 쓰는가 ────────────────────────────────────────────

/** runNearMeDirect 본문만 잘라낸다 — 핸들러 쪽 exclusion 과 섞이지 않게. */
function nearMeDirectBody(): string {
  const start = planSrc.indexOf("async function runNearMeDirect");
  assert.ok(start > 0, "runNearMeDirect 를 찾지 못했다");
  const end = planSrc.indexOf("// ── Place display map", start);
  assert.ok(end > start, "runNearMeDirect 본문의 끝을 찾지 못했다");
  return planSrc.slice(start, end);
}

test("plan.ts: 후보를 자르기 전에 제외가 적용된다", () => {
  const body = nearMeDirectBody();
  const excludeAt   = body.search(/exclude_place_ids\s*\?\?\s*\[\]/);
  const diversifyAt  = body.indexOf("diversifyByCategory(");

  assert.ok(excludeAt   > 0, "runNearMeDirect 안에서 exclude_place_ids 를 쓰지 않는다");
  assert.ok(diversifyAt > 0, "diversifyByCategory 호출을 찾지 못했다");
  assert.ok(
    excludeAt < diversifyAt,
    "제외가 diversifyByCategory 뒤에 있다 — 자른 뒤에 빼면 후보가 0 이 된다",
  );
});

test("plan.ts: diversifyByCategory 는 제외된 풀을 받는다", () => {
  const body = nearMeDirectBody();
  assert.match(
    body,
    /diversifyByCategory\(\s*usable\b/,
    "diversifyByCategory 가 제외 전 배열(scored)을 그대로 받고 있다",
  );
});

test("plan.ts: 핸들러의 사후 exclusion 은 남아 있다 — This Trip 픽 재배치 방지", () => {
  assert.match(planSrc, /const excludeSet = new Set\(exclude_place_ids\)/);
  assert.match(planSrc, /allCandidates\.filter\(c => !excludeSet\.has\(String\(c\.place_id\)\)\)/);
});

test("plan.ts: 제외 identity 는 String(place_id) 그대로다", () => {
  const body = nearMeDirectBody();
  assert.match(body, /excluded\.has\(String\(c\.place_id\)\)/, "identity 계약이 바뀌었다");
});

// ── ③ 이번 TASK 가 건드리지 않기로 한 것 ──────────────────────────────────────

test("반경·limit·zone 상수는 그대로다", () => {
  assert.match(planSrc, /const MAX_RADIUS_KM = 7;/);
  assert.match(planSrc, /const DEFAULT_LIMIT = 30;/);
  assert.match(planSrc, /expandZones\(zonedPlaces\)/);
});

console.log(`\ncandidate-supply-order: ${passed} passed`);

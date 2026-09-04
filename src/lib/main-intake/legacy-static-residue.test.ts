// Retired legacy places must not survive as user-facing static cards (events.json / local-info.json / Home V1 list).
// 실행: node --experimental-strip-types src/lib/main-intake/legacy-static-residue.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const RETIRED_STATIC_NAMES = ["Hwangnyeongsan Night View Trail", "Jangsan Mountain Trail", "Igidae Coastal Walk", "Igidae Coastal Trail", "Oryukdo Skywalk", "BIFF광장 & 남포동", "부산항대교 전망", "온천천 벚꽃 산책로"];

test("events.json: no standalone place card named after a retired city_spots row (spot-busan-010 removed); independent events stay", () => {
  const ev = JSON.parse(read("public", "data", "events.json")) as Array<{ id: string; name: string; type: string }>;
  assert.ok(!ev.some(e => e.id === "spot-busan-010"));
  for (const e of ev) assert.ok(!RETIRED_STATIC_NAMES.includes(e.name), `${e.id} ${e.name}`);
  for (const id of ["kpop-idol-001", "kpop-idol-011", "kpop-idol-009", "visit-busan-002", "visit-busan-003", "evt-anchor-001", "evt-pre-001"]) assert.ok(ev.some(e => e.id === id), id);
});

test("local-info.json: V1 static duplicates of retired rows are gone (13/14/15/20/24/31), other items intact", () => {
  const li = JSON.parse(read("public", "data", "local-info.json")) as Array<{ id: number; name: string }>;
  for (const id of [13, 14, 15, 20, 24, 31]) assert.ok(!li.some(x => x.id === id), `local-info id ${id}`);
  for (const x of li) assert.ok(!RETIRED_STATIC_NAMES.some(n => x.name.startsWith(n)), `${x.id} ${x.name}`);
  assert.equal(li.length, 73);
  assert.ok(li.some(x => x.id === 6 && x.name === "Haeundae Beach"));
});

test("Home/Planner: V1 정적 카드 목록 자체가 제거됐고 은퇴 장소가 되살아나지 않는다", () => {
  // RELEASE-CLEANUP/PLANNER-SPOTS-SEPARATION 에서 Home 의 BUSAN_SPOTS V1
  // 디렉토리는 통째로 제거됐다(발견은 Search·City Hub·Explore 담당).
  // 원 invariant("은퇴한 legacy 장소가 사용자-facing 정적 카드로 살아남지
  // 않는다")는 더 강한 형태 — 목록 부재 — 로 유지된다.
  for (const f of [["src", "app", "HomeClient.tsx"], ["src", "app", "planner", "PlannerClient.tsx"]]) {
    const src = read(...f);
    assert.ok(!src.includes("BUSAN_SPOTS"), `${f.join("/")}: V1 목록 재등장 금지`);
    for (const n of RETIRED_STATIC_NAMES) assert.ok(!src.includes(`name: "${n}"`), `${f.join("/")}: ${n}`);
  }
});

test("src/data/cities/busan.ts staticSpots (Explore initial/fallback list): retired V1 cards removed", () => {
  const src = read("src", "data", "cities", "busan.ts");
  for (const n of RETIRED_STATIC_NAMES) assert.ok(!src.includes(`name: "${n}"`), n);
  assert.equal((src.match(/^\s+name: "/gm) || []).length, 5, "city name + 4 remaining spots");
});

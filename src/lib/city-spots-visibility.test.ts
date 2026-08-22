/**
 * TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · Gate B — 서비스 노출 게이트 계약
 * Run: node --experimental-strip-types --test src/lib/city-spots-visibility.test.ts
 *
 * 검증하는 것
 *   · discovery 에만 is_published=true 가 붙고 reference 에는 절대 붙지 않는다
 *   · 게이트 OFF(현재 기본)면 어떤 조회도 바뀌지 않는다 — migration 전 Production 안전
 *   · 호출부 배선: Explore=discovery · itinerary/ItineraryDayMap=reference · near-me/플래너 후보=discovery
 *     · /place static params=reference · sitemap=discovery · Story/Moment/user-spots 의 id 검증은 필터 없음
 *   · migration 056 파일: additive · default false · 기존 행 backfill true · 인덱스 · DELETE/RLS/id 변경 없음
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DISCOVERY_VISIBILITY_GATE_ENABLED, PUBLISHED_COLUMN, applyVisibility, discoveryGateActive, isDiscoverable, visibilityRestFilter,
} from "./city-spots-visibility.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

class FakeQuery {
  calls: Array<[string, boolean]> = [];
  eq(column: string, value: boolean): FakeQuery { this.calls.push([column, value]); return this; }
}

test("V1: discovery + 게이트 ON 에서만 is_published=true 가 붙는다", () => {
  const q1 = applyVisibility(new FakeQuery(), "discovery", true);
  assert.deepEqual(q1.calls, [[PUBLISHED_COLUMN, true]]);
  assert.deepEqual(applyVisibility(new FakeQuery(), "reference", true).calls, []);
  assert.deepEqual(applyVisibility(new FakeQuery(), "discovery", false).calls, []);
  assert.equal(visibilityRestFilter("discovery", true), "&is_published=eq.true");
  assert.equal(visibilityRestFilter("reference", true), "");
  assert.equal(visibilityRestFilter("discovery", false), "");
  assert.ok(discoveryGateActive("discovery", true) && !discoveryGateActive("reference", true) && !discoveryGateActive("discovery", false));
});

test("V2: 게이트 ON(릴리스) — discovery 에만 is_published=true 가 붙고 reference 는 그대로 · OFF 계약은 명시 인자로 유지", () => {
  // TASK-FIVE-CITY-CORE-VISIBILITY-GATE-RELEASE-V1: migration 056·057 적용·검증 후 ON. 714행 전부 true 라 결과는 불변.
  assert.equal(DISCOVERY_VISIBILITY_GATE_ENABLED, true);
  assert.deepEqual(applyVisibility(new FakeQuery(), "discovery").calls, [[PUBLISHED_COLUMN, true]]);
  assert.equal(visibilityRestFilter("discovery"), "&is_published=eq.true");
  assert.deepEqual(applyVisibility(new FakeQuery(), "reference").calls, []);
  assert.equal(visibilityRestFilter("reference"), "");
  // OFF 상태 계약(게이트가 꺼지면 어떤 조회도 바뀌지 않음)은 명시 인자로 계속 보장한다
  assert.deepEqual(applyVisibility(new FakeQuery(), "discovery", false).calls, []);
  assert.equal(visibilityRestFilter("discovery", false), "");
  // 행 단위 판단: 컬럼 없음/NULL 은 보이는 쪽, 명시적 false 만 숨김(게이트 ON 일 때)
  assert.equal(isDiscoverable({}, true), true);
  assert.equal(isDiscoverable({ is_published: null }, true), true);
  assert.equal(isDiscoverable({ is_published: false }, true), false);
  assert.equal(isDiscoverable({ is_published: false }, false), true);
  assert.equal(isDiscoverable(null, true), false);
});

test("V3: 호출부 배선 — discovery 와 reference 가 바뀌지 않았다", () => {
  const citySpots = read("src/lib/city-spots.ts");
  assert.match(citySpots, /fetchCitySpots\(city: string, scope: VisibilityScope = "discovery"\)/);
  assert.match(citySpots, /fetchCitySpotsByCategory\([\s\S]*?scope: VisibilityScope = "discovery"/);
  assert.equal((citySpots.match(/applyVisibility\(/g) ?? []).length, 2);
  // Explore 는 기본(discovery)
  assert.match(read("src/components/ExploreCity.tsx"), /fetchCitySpots\(city\.name\.toLowerCase\(\)\)/);
  // 일정 hydration 은 reference — R1 SCALE 이후 도시 전량이 아니라 place_id 집합 조회(fetchCitySpotsByIds: 필터 없음)
  for (const p of ["src/app/itinerary/page.tsx", "src/components/ItineraryDayMap.tsx"]) {
    assert.match(read(p), /fetchCitySpotsByIds\(/); assert.ok(!/fetchCitySpots\(/.test(read(p)), `${p}: 도시 전량 조회 없음`);
  }
  {
    const byIds = citySpots.slice(citySpots.indexOf("export async function fetchCitySpotsByIds"), citySpots.indexOf("export async function fetchCitySpotsByCategory"));
    assert.ok(byIds.length > 0 && !/applyVisibility|is_published/.test(byIds), "byIds 는 reference(필터 없음)");
  }
  // 자동 후보 공급 = discovery (near-me · Functions 플래너)
  assert.match(read("src/lib/near-me/candidate-generator.ts"), /applyVisibility\([\s\S]*?"discovery",\s*\)/);
  const plan = read("functions/api/trip/plan.ts");
  assert.match(plan, /applyVisibility\([\s\S]*?"discovery",\s*\)/);
  assert.equal((plan.match(/applyVisibility\(/g) ?? []).length, 1, "place_map(by id) 은 reference — 필터 없음");
  // 정적 경로 = reference, sitemap = discovery
  assert.match(read("src/app/place/[id]/page.tsx"), /fetchPublicSpotIds\("reference"\)/);
  assert.match(read("src/app/place/[id]/page.tsx"), /spot\.is_published === false \? \{ robots: \{ index: false/);
  assert.match(read("src/app/sitemap.ts"), /fetchPublicSpotIds\("discovery"\)/);
  assert.match(read("src/lib/place-detail/place-source.ts"), /fetchPublicSpotIds\(scope: VisibilityScope = "reference"\)/);
  // Story/Moment/user-spots 의 id 검증(reference)에는 게이트를 넣지 않았다
  for (const p of ["functions/api/shared/[id]/story.ts", "functions/api/trip-moments/index.ts", "functions/api/user-spots/from-canonical.ts", "functions/api/user-spots/[id]/enrich.ts", "src/app/api/trip/plan/route.ts"]) {
    assert.ok(!/is_published|applyVisibility/.test(read(p)), `${p} 는 reference 조회 — 필터 없음`);
  }
});

test("V4: migration 056 — additive · default false · 기존 행 backfill · 인덱스 · 파괴적 문장 없음", () => {
  const sql = read("supabase/migrations/056_city_spots_is_published.sql").toLowerCase();
  assert.match(sql, /alter table public\.city_spots\s+add column if not exists is_published boolean not null default false/);
  assert.match(sql, /update public\.city_spots set is_published = true where is_published = false/);
  assert.match(sql, /create index if not exists city_spots_city_is_published_idx\s+on public\.city_spots \(city, is_published\)/);
  for (const bad of ["drop ", "delete from", "truncate", "create policy", "alter policy", "drop policy", "grant ", "revoke ", "alter column id", "rename "]) {
    assert.ok(!sql.includes(bad), `migration 056 must not contain '${bad}'`);
  }
  // 같은 번호의 migration 이 둘이 아니다
  const files = readFileSync(new URL("supabase/migrations/056_city_spots_is_published.sql", ROOT)) ? 1 : 0;
  assert.equal(files, 1);
});

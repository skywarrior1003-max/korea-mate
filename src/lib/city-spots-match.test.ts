/**
 * TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 — 이름 기반 legacy fallback 의 ambiguity-safe 계약
 * + migration 057(UNIQUE(city,name) 제거) 가드
 * Run: node --experimental-strip-types --test src/lib/city-spots-match.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchCitySpot } from "./city-spots-match.ts";
import type { CitySpot } from "../data/cities/types.ts";

const ROOT = new URL("../../", import.meta.url);
const spot = (id: number, name: string): CitySpot => ({ id, name, city: "jeonju", category: "restaurant" } as unknown as CitySpot);

test("M1: 같은 도시에 같은 표시명이 둘이면 이름만으로는 고르지 않는다(null) — 하나뿐이면 돌려준다", () => {
  const two = [spot(1, "진미반점"), spot(2, "진미반점"), spot(3, "베테랑칼국수")];
  assert.equal(matchCitySpot("진미반점", two), null, "동명 2건 → 모호 → null");
  assert.equal(matchCitySpot("베테랑칼국수", two)?.id, 3);
  assert.equal(matchCitySpot("진미반점", [spot(1, "진미반점"), spot(3, "베테랑칼국수")])?.id, 1);
  // 부분 일치·키워드 단계도 유일할 때만
  assert.equal(matchCitySpot("Tonshou PNU Branch", [spot(1, "Tonshou"), spot(2, "Tonshou")]), null);
  assert.equal(matchCitySpot("Tonshou PNU Branch", [spot(1, "Tonshou"), spot(2, "Other")])?.id, 1);
  assert.equal(matchCitySpot("", two), null);
  assert.equal(matchCitySpot("x", []), null);
});

test("M2: migration 057 — uq_city_spots_city_name 제거 + 비유니크 인덱스, 파괴적 문장 없음, 056 과 번호 충돌 없음", () => {
  const sql = readFileSync(new URL("supabase/migrations/057_city_spots_drop_city_name_unique.sql", ROOT), "utf8").toLowerCase();
  assert.match(sql, /alter table public\.city_spots\s+drop constraint if exists uq_city_spots_city_name/);
  assert.match(sql, /create index if not exists city_spots_city_name_idx\s+on public\.city_spots \(city, name\)/);
  assert.ok(!/create unique index/.test(sql));
  for (const bad of ["delete from", "truncate", "drop table", "create policy", "alter policy", "drop policy", "grant ", "revoke ", "alter column id", "rename "]) {
    assert.ok(!sql.includes(bad), `057 must not contain '${bad}'`);
  }
  // 013 의 제약명과 정확히 같은 이름을 지운다
  const m013 = readFileSync(new URL("supabase/migrations/013_city_spots_unique_city_name.sql", ROOT), "utf8");
  assert.match(m013, /uq_city_spots_city_name/);
  // 런타임은 (city,name) 유일성에 의존하지 않는다 — 이름으로 DB 행을 찾는 쿼리가 없다
  for (const p of ["src/lib/city-spots.ts", "src/lib/place-detail/place-source.ts", "functions/api/trip/plan.ts", "src/lib/near-me/candidate-generator.ts"]) {
    const src = readFileSync(new URL(p, ROOT), "utf8");
    assert.ok(!/\.eq\("name"|name=eq\.|onConflict:\s*"city,name"/.test(src), `${p} must not look rows up by (city,name)`);
  }
  // importer 는 (city,name) upsert 를 쓰지 않는다
  const core = readFileSync(new URL("src/lib/main-intake/importer-core.ts", ROOT), "utf8");
  assert.ok(!/onConflict/.test(core));
});

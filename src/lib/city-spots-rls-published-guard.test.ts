// CITY-SPOTS-RLS-HOTFIX-V1 — 081 정책 파일 계약 가드
//
// 지키는 것
//   · anon·authenticated 둘 다 is_published=true 행만 SELECT (익명 비공개 노출 차단
//     + 로그인 0행 해소가 한 정책에서 나온다 — 어느 한쪽만 남는 회귀 금지)
//   · 재실행 멱등: 새/옛 정책 이름 모두 DROP IF EXISTS 후 CREATE
//   · 단일 트랜잭션(교체 도중 더 넓은 접근이 열리는 중간 상태 금지)
//   · 이 파일이 정책 교체 외의 일(grant·데이터·다른 테이블)을 하지 않는다
//   · 클라이언트 discovery 게이트(UNPUBLISHED-PLACE-GATE-V1)가 켜져 있고
//     hydration 이 published-only(discovery) scope 를 유지한다 — RLS 를 좁혀도
//     화면이 안전한 근거가 코드에서 사라지면 여기서 걸린다
//
// 실행: node --experimental-strip-types src/lib/city-spots-rls-published-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSqlComments = (s: string) => s.replace(/^\s*--.*$/gm, "");

test("081 — 정책 불변식: 양 role · published-only · 멱등 · 단일 트랜잭션", () => {
  const raw = read("supabase/migrations/081_city_spots_published_read_rls.sql");
  const s = stripSqlComments(raw);

  // 양 role 에 같은 published 조건 하나
  assert.match(s, /CREATE POLICY anon_authenticated_read_published_city_spots/);
  assert.match(s, /ON public\.city_spots/);
  assert.match(s, /FOR SELECT/);
  assert.match(s, /TO anon, authenticated/);
  assert.match(s, /USING \(is_published = true\)/);

  // 멱등: 두 이름 모두 IF EXISTS 로 선제거 — 재실행이 "이미 존재" 로 죽지 않는다
  assert.match(s, /DROP POLICY IF EXISTS anon_read_city_spots ON public\.city_spots;/);
  assert.match(s, /DROP POLICY IF EXISTS anon_authenticated_read_published_city_spots ON public\.city_spots;/);

  // 단일 트랜잭션 — 교체가 원자적으로 보인다
  assert.match(s, /^\s*BEGIN;/m);
  assert.match(s, /^\s*COMMIT;\s*$/m);

  // 정책 교체 외 금지: grant/데이터/함수/다른 테이블 접근 없음
  assert.equal((s.match(/CREATE POLICY/g) ?? []).length, 1, "정책 생성은 정확히 1개");
  assert.ok(!/GRANT|REVOKE|ALTER TABLE|INSERT|UPDATE|DELETE|CREATE (TABLE|FUNCTION|INDEX)/i.test(s),
    "081 은 정책 교체만 한다");
  assert.ok(!/USING \(true\)/.test(s), "무조건 개방(qual true) 재도입 금지");
  const tables = [...s.matchAll(/ON public\.([a-z_]+)/g)].map(m => m[1]);
  assert.ok(tables.every(t => t === "city_spots"), "city_spots 외 테이블 접근 금지");
});

test("081 — 화면 안전 전제: 클라 discovery 게이트·hydration fallback 이 살아 있다", () => {
  const vis = read("src/lib/city-spots-visibility.ts");
  assert.match(vis, /DISCOVERY_VISIBILITY_GATE_ENABLED = true/);
  const cs = read("src/lib/city-spots.ts");
  // hydration 이 비공개 행에 의존하지 않는 계약(미매칭 = snapshot name-only)
  assert.match(cs, /fetchCitySpotsByIds/);
  // 브라우저 hydration 호출부는 discovery 를 명시한다
  assert.match(read("src/app/itinerary/page.tsx"), /fetchCitySpotsByIds\([\s\S]{0,120}?"discovery"\)/);
  assert.match(read("src/components/ItineraryDayMap.tsx"), /fetchCitySpotsByIds\([\s\S]{0,120}?"discovery"\)/);
});

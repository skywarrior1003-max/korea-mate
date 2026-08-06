// 039 정적 검증.
//
// 이 migration 은 운영에 자동 적용되지 않고 사용자가 SQL Editor 에서 직접 실행한다.
// 그래서 파일이 곧 실행될 내용이며, 여기서 잡지 못한 것은 운영에서 그대로 돈다.
// 대상 테이블·파괴적 SQL·service_role 무변경을 고정한다.
//
// 038 은 이미 운영에 적용됐으므로 이 파일에서 수정하지 않는다 — 함께 지켜본다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PATH_039 = join(ROOT, "supabase", "migrations", "039_lock_down_legacy_restaurants.sql");
const RAW = readFileSync(PATH_039, "utf8");
/** 주석을 뗀 실행 본문 — 설명문에 단어가 있다고 통과하면 안 된다 */
const SQL = RAW.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
const BODY = SQL.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

test("★039 파일이 존재한다", () => {
  assert.ok(existsSync(PATH_039));
});

// ── 대상 ─────────────────────────────────────────────────────────────────────
test("★대상은 public.restaurants 한 테이블뿐이다", () => {
  const tables = [...SQL.matchAll(/public\.(\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tables)], ["restaurants"]);
});

test("★다른 테이블 권한을 건드리지 않는다", () => {
  for (const t of ["spot_reactions", "spots", "events", "planner_sessions",
                   "city_spots", "itineraries", "user_spots", "trip_moments"]) {
    assert.doesNotMatch(SQL, new RegExp(`public\\.${t}\\b`), `다른 테이블: ${t}`);
  }
});

// ── 실행 본문 ────────────────────────────────────────────────────────────────
test("★트랜잭션으로 감싼다", () => {
  assert.match(BODY, /^BEGIN;/);
  assert.match(BODY, /COMMIT;$/);
});

test("★RLS 활성 · 정책 제거 · 클라이언트 권한 회수를 모두 담는다", () => {
  assert.match(SQL, /ALTER TABLE public\.restaurants\s*\n?\s*ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /DROP POLICY IF EXISTS restaurants_anon_select\s*\n?\s*ON public\.restaurants/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES\s*\n?\s*ON TABLE public\.restaurants\s*\n?\s*FROM PUBLIC/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES\s*\n?\s*ON TABLE public\.restaurants\s*\n?\s*FROM anon/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES\s*\n?\s*ON TABLE public\.restaurants\s*\n?\s*FROM authenticated/);
});

test("★실행 본문이 계획한 5개 문장뿐이다 — 몰래 끼어든 SQL 이 없다", () => {
  assert.equal(BODY,
    "BEGIN; " +
    "ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; " +
    "DROP POLICY IF EXISTS restaurants_anon_select ON public.restaurants; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM PUBLIC; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM anon; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM authenticated; " +
    "COMMIT;");
});

// ── service_role ─────────────────────────────────────────────────────────────
test("★service_role 에 GRANT 도 REVOKE 도 하지 않는다", () => {
  assert.doesNotMatch(SQL, /GRANT[^\n]*service_role/,  "service_role GRANT");
  assert.doesNotMatch(SQL, /REVOKE[^\n]*service_role/, "service_role REVOKE");
});

test("★롤백에서도 service_role 을 바꾸지 않는다", () => {
  const rollback = RAW.slice(RAW.indexOf("── 5. 롤백"));
  assert.doesNotMatch(rollback, /GRANT[^\n]*service_role/,  "롤백에 service_role GRANT");
  assert.doesNotMatch(rollback, /REVOKE[^\n]*service_role/, "롤백에 service_role REVOKE");
  assert.match(rollback, /GRANT SELECT ON TABLE public\.restaurants TO anon, authenticated/);
  assert.match(rollback, /CREATE POLICY restaurants_anon_select/);
});

test("★롤백에서 PUBLIC 권한을 새로 부여하지 않는다 — 원래 없었다", () => {
  const rollback = RAW.slice(RAW.indexOf("── 5. 롤백"));
  assert.doesNotMatch(rollback, /GRANT[^\n]*TO PUBLIC/i);
});

// ── 파괴적 SQL 금지 ──────────────────────────────────────────────────────────
test("★데이터·스키마를 바꾸는 SQL 이 없다", () => {
  for (const bad of [/\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bUPDATE\s+public\./i,
                     /\bINSERT\s+INTO\b/i, /\bDROP\s+TABLE\b/i,
                     /\bALTER\s+TABLE[^\n]*\bDROP\b/i, /\bALTER\s+COLUMN\b/i,
                     /\bDROP\s+INDEX\b/i, /\bCREATE\s+INDEX\b/i, /\bDROP\s+TRIGGER\b/i]) {
    assert.doesNotMatch(SQL, bad, String(bad));
  }
});

test("★SQL Editor 트랜잭션과 충돌하는 CONCURRENTLY 를 쓰지 않는다", () => {
  assert.doesNotMatch(SQL, /CONCURRENTLY/i);
});

test("★자동 적용을 안내하지 않는다", () => {
  assert.doesNotMatch(SQL, /supabase db push/i);
  assert.match(RAW, /`supabase db push` 로 적용하지 않는다/);
});

// ── 문서 ─────────────────────────────────────────────────────────────────────
test("★사전검증·적용 후 검증·롤백 절이 모두 있다", () => {
  assert.match(RAW, /── 1\. 사전검증/);
  assert.match(RAW, /── 4\. 적용 후 검증/);
  assert.match(RAW, /── 5\. 롤백/);
});

test("★사전검증이 행 수를 특정 값으로 강제하지 않는다", () => {
  // 100 을 하드코딩해 실패시키면 데이터가 늘어난 정상 상황에서도 막힌다
  assert.doesNotMatch(SQL, /count\(\*\)\s*=\s*100/);
  assert.match(RAW, /특정 숫자를 강제하지 않는다/);
});

test("★적용 후 검증이 service_role 7종을 기대값으로 적는다", () => {
  assert.match(RAW, /7종|7 행/);
  assert.match(RAW, /DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE/);
});

// ── 038 은 건드리지 않는다 ───────────────────────────────────────────────────
test("★이미 운영에 적용된 038 을 수정하지 않았다", () => {
  const S38 = readFileSync(join(ROOT, "supabase", "migrations", "038_lock_down_spot_reactions.sql"), "utf8")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  assert.equal(S38,
    "BEGIN; " +
    "ALTER TABLE public.spot_reactions ENABLE ROW LEVEL SECURITY; " +
    "CREATE UNIQUE INDEX IF NOT EXISTS spot_reactions_device_place_reaction_uniq " +
    "ON public.spot_reactions (device_id, place_id, reaction); " +
    "DROP POLICY IF EXISTS anon_read_reactions ON public.spot_reactions; " +
    "DROP POLICY IF EXISTS anon_insert_reactions ON public.spot_reactions; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM PUBLIC; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM anon; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM authenticated; " +
    "COMMIT;");
});

// ── 코드가 restaurants 테이블을 쓰지 않는다 ─────────────────────────────────
test("★브라우저·Pages Function 어디에도 restaurants 테이블 접근이 없다", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
  for (const f of [["src", "app", "HomeClient.tsx"], ["src", "app", "all-spots", "page.tsx"],
                   ["src", "app", "restaurants", "RestaurantsClient.tsx"]]) {
    const src = strip(readFileSync(join(ROOT, ...f), "utf8"));
    assert.doesNotMatch(src, /from\(["']restaurants["']\)/, `${f.join("/")}: supabase.from`);
    assert.doesNotMatch(src, /rest\/v1\/restaurants/,       `${f.join("/")}: REST 직접 호출`);
  }
  // 화면이 실제로 쓰는 것은 정적 JSON 이다 — 회수해도 깨지지 않는 근거
  const home = readFileSync(join(ROOT, "src", "app", "HomeClient.tsx"), "utf8");
  assert.match(home, /fetch\("\/data\/restaurants\.json"\)/);
});

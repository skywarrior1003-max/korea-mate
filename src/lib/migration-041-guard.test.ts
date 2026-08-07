// 041 정적 검증 + spots 브라우저 접근 회귀 방어.
//
// 041 은 운영에 자동 적용되지 않고 사용자가 SQL Editor 에서 직접 실행한다.
// 그래서 파일이 곧 실행될 내용이며, 여기서 잡지 못한 것은 운영에서 그대로 돈다.
//
// 더 중요한 건 코드 쪽이다. 누군가 편의상 브라우저에서 spots 를 다시 읽으면
// 041 로 닫은 SELECT 가 곧바로 장애가 된다. 그 형태가 되살아나지 않게 고정한다.
//
// spots 는 버려진 테이블이 아니라 관리자 CSV 업로드 대상이다. 관리자 경로 3종은
// 전부 service_role 이므로 이 회수의 영향을 받지 않는다 — 그 사실도 함께 지킨다.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG = (f: string) => join(ROOT, "supabase", "migrations", f);
const F041 = "041_lock_down_legacy_spots_select.sql";

const RAW = readFileSync(MIG(F041), "utf8");
/** 주석을 뗀 실행 본문 */
const SQL = RAW.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
const BODY = SQL.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

const body = (f: string) =>
  readFileSync(MIG(f), "utf8").split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

test("★041 파일이 존재한다", () => {
  assert.ok(existsSync(MIG(F041)));
});

// ── 대상 ─────────────────────────────────────────────────────────────────────
test("★대상은 public.spots 한 테이블뿐이다", () => {
  const tables = [...SQL.matchAll(/public\.(\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tables)], ["spots"]);
});

test("★다른 테이블 권한을 건드리지 않는다", () => {
  for (const t of ["city_spots", "spot_reactions", "restaurants", "events",
                   "planner_sessions", "itineraries", "user_spots", "places"]) {
    assert.doesNotMatch(SQL, new RegExp(`public\\.${t}\\b`), `다른 테이블: ${t}`);
  }
});

// ── 실행 본문 ────────────────────────────────────────────────────────────────
test("★실행 본문이 계획한 5개 문장뿐이다 — 몰래 끼어든 SQL 이 없다", () => {
  assert.equal(BODY,
    "BEGIN; " +
    "ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY; " +
    "DROP POLICY IF EXISTS spots_anon_select ON public.spots; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spots FROM PUBLIC; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spots FROM anon; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.spots FROM authenticated; " +
    "COMMIT;");
});

test("★실제 policy 이름을 쓴다 — spots_anon_select", () => {
  assert.match(SQL, /DROP POLICY IF EXISTS spots_anon_select/);
});

test("★트랜잭션으로 감싼다", () => {
  assert.match(BODY, /^BEGIN;/);
  assert.match(BODY, /COMMIT;$/);
});

// ── service_role · 데이터 보호 ───────────────────────────────────────────────
test("★service_role 에 GRANT 도 REVOKE 도 하지 않는다", () => {
  assert.doesNotMatch(SQL, /GRANT[^\n]*service_role/);
  assert.doesNotMatch(SQL, /REVOKE[^\n]*service_role/);
  assert.doesNotMatch(SQL, /postgres/);
});

test("★데이터·스키마를 바꾸는 SQL 이 없다 — 테이블·행을 지우지 않는다", () => {
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
  assert.doesNotMatch(SQL, /count\(\*\)\s*=\s*0/);
  assert.match(RAW, /특정 숫자를 SQL 로 강제하지 않는다/);
});

test("★적용 후 검증이 service_role 7종과 컬럼 권한까지 본다", () => {
  const post = RAW.slice(RAW.indexOf("── 4. 적용 후"), RAW.indexOf("── 5. 롤백"));
  assert.match(post, /7종|7 행/);
  assert.match(post, /DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE/);
  assert.match(post, /column_privileges/);
});

test("★롤백이 적용 전 상태를 정확히 복원하고 PUBLIC 을 새로 열지 않는다", () => {
  const rb = RAW.slice(RAW.indexOf("── 5. 롤백"));
  assert.match(rb, /GRANT SELECT ON TABLE public\.spots TO anon, authenticated/);
  assert.match(rb, /CREATE POLICY spots_anon_select/);
  assert.doesNotMatch(rb, /GRANT[^\n]*TO PUBLIC/i);
  assert.doesNotMatch(rb, /GRANT[^\n]*service_role/);
  assert.doesNotMatch(rb, /REVOKE[^\n]*service_role/);
});

// ── 코드 회귀 방어 ───────────────────────────────────────────────────────────
test("★브라우저에서 spots 를 직접 읽는 코드가 없다", () => {
  const supa = strip(readFileSync(join(ROOT, "src", "lib", "spots.ts"), "utf8"));
  assert.doesNotMatch(supa, /from\(["']spots["']\)/, "spots.ts 에 supabase.from");
  assert.doesNotMatch(supa, /rest\/v1\/spots/,       "spots.ts 에 REST 직접 호출");
  assert.doesNotMatch(supa, /\bsupabase\b/,          "spots.ts 에 브라우저 DB 클라이언트");
  const admin = strip(readFileSync(join(ROOT, "src", "app", "korea-mate-admin", "page.tsx"), "utf8"));
  assert.doesNotMatch(admin, /from\(["']spots["']\)/);
  assert.doesNotMatch(admin, /rest\/v1\/spots/);
});

test("★제거한 read helper 4종이 되살아나지 않았다", () => {
  const supa = readFileSync(join(ROOT, "src", "lib", "spots.ts"), "utf8");
  for (const fn of ["fetchSpotByPlaceId", "fetchSpotsByCategory", "fetchAllSpots", "searchSpots"]) {
    assert.doesNotMatch(supa, new RegExp(`export async function ${fn}\\b`), fn);
  }
});

test("★계속 쓰는 export 는 그대로 남아 있다", () => {
  const supa = readFileSync(join(ROOT, "src", "lib", "spots.ts"), "utf8");
  for (const keep of ["SpotRow", "SpotCategory", "HikingDifficulty",
                      "dislikeSpot", "fetchFlaggedSpots", "csvRowToSpot"]) {
    assert.match(supa, new RegExp(`export (async function|function|type|interface) ${keep}\\b`), keep);
  }
});

test("★spots 접근은 전부 service_role 관리자 서버 경로다", () => {
  for (const [f, need] of [["upsert-spots.ts", /rest\/v1\/spots\?on_conflict=place_id/],
                           ["delete-spot.ts", /rest\/v1\/spots\?place_id=eq\./],
                           ["spot-reactions-summary.ts", /rest\/v1\/spots\?select=place_id,title/]] as const) {
    const src = strip(readFileSync(join(ROOT, "functions", "api", "admin", f), "utf8"));
    assert.match(src, need, f);
    assert.match(src, /getServiceRoleHeaders\(|SUPABASE_SERVICE_ROLE_KEY/, `${f}: service_role 미사용`);
    assert.match(src, /checkAdminAuth\(/, `${f}: 관리자 인증 없음`);
  }
});

// ── 기존 migration 보호 ──────────────────────────────────────────────────────
test("★016·022·030·038·039·040 실행 본문이 그대로다", () => {
  const expected: Record<string, string> = {
    "016_create_shared_itinerary_rpc.sql":     "857f1632afda1966828f43ac96211708",
    "022_itinerary_is_public.sql":             "8969e64146d64ece21375d3f0fc6324c",
    "030_shared_itinerary_copy_count.sql":     "29f336908ea19d81018ddcb83e301e0b",
    "038_lock_down_spot_reactions.sql":        "b17339279c3f0552adf1d9fc63832965",
    "039_lock_down_legacy_restaurants.sql":    "44386bbfd717e4d5e15a4ecdea49bb3c",
    "040_fix_function_search_paths.sql":       "014c233d1fbccc25154fbd08662465f7",
  };
  for (const [f, h] of Object.entries(expected)) assert.equal(md5(body(f)), h, f);
});

test("★migration 번호는 041 이 마지막이다", () => {
  const files = readdirSync(join(ROOT, "supabase", "migrations"))
    .filter(f => f.endsWith(".sql")).sort();
  assert.ok(files.includes(F041));
  // 042(place_reports)·043(place_likes)는 별도 작업이 추가했다. 그 밖은 없어야 한다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^04[23]_(place_reports|place_likes)\.sql$/, `예상치 못한 migration: ${f}`);
  }
});

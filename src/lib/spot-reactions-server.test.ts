// spot_reactions 서버 전환 계약 (정적 검사 + 순수 로직 실행).
//
// 이 전환의 핵심은 "브라우저가 더는 spot_reactions 를 직접 만지지 않는다" 이다.
// 나중에 누가 편의상 anon 경로를 되살리면 038 로 닫은 구멍이 다시 열리므로,
// 코드에서 그 형태가 사라졌는지 여기서 고정한다.
//
// 주석은 검사 대상에서 뺀다 — 설명문에 단어가 있다고 통과하면 안 된다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const FN      = strip(read("functions", "api", "spots", "reactions.ts"));
const ADMIN   = strip(read("functions", "api", "admin", "spot-reactions-summary.ts"));
const SPOTS   = strip(read("src", "lib", "spots.ts"));
const ADMINUI = strip(read("src", "app", "korea-mate-admin", "page.tsx"));
const CARD    = strip(read("src", "components", "EventCard.tsx"));
const SQL     = read("supabase", "migrations", "038_lock_down_spot_reactions.sql")
                  .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");

// ── 브라우저 직접 접근 제거 ─────────────────────────────────────────────────
test("★브라우저 코드에 spot_reactions 직접 접근이 남아 있지 않다", () => {
  for (const [name, src] of [["src/lib/spots.ts", SPOTS], ["admin page", ADMINUI], ["EventCard", CARD]] as const) {
    assert.doesNotMatch(src, /from\(["']spot_reactions["']\)/, `${name}: supabase.from`);
    assert.doesNotMatch(src, /rest\/v1\/spot_reactions/,       `${name}: REST 직접 호출`);
  }
});

test("★서버 호출 실패 시 anon DB 로 되돌아가지 않는다", () => {
  // catch 안에서 supabase 를 다시 부르면 서버로 옮긴 의미가 없다
  const dislike = SPOTS.slice(SPOTS.indexOf("export async function dislikeSpot"),
                              SPOTS.indexOf("export async function fetchFlaggedSpots"));
  assert.match(dislike, /fetch\("\/api\/spots\/reactions"/);
  assert.doesNotMatch(dislike, /supabase/, "dislike 경로에 supabase 클라이언트가 남아 있다");
  const flagged = SPOTS.slice(SPOTS.indexOf("export async function fetchFlaggedSpots"));
  assert.match(flagged, /\/api\/admin\/spot-reactions-summary/);
  assert.doesNotMatch(flagged.slice(0, flagged.indexOf("export function csvRowToSpot")), /supabase/);
});

test("★관리자 UI 가 서버 집계를 부르고 admin key 를 넘긴다", () => {
  assert.match(ADMINUI, /fetchFlaggedSpots\(sessionKey, 1\)/);
});

test("★남아 있는 spot_reactions 접근은 전부 서버·관리자 인증 경로다", () => {
  // 관리자 삭제 경로는 FK 정리를 위해 reaction 을 지워야 한다. anon 이 아니라
  // service_role + admin 인증이어야 하며, 그 형태를 고정한다.
  const NEXT_ROUTE = strip(read("src", "app", "api", "admin", "delete-spot", "route.ts"));
  assert.match(NEXT_ROUTE, /checkAdminAuth\(req\)/);
  assert.match(NEXT_ROUTE, /getSupabaseAdmin\(\)/);
  assert.doesNotMatch(NEXT_ROUTE, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

  const PAGES_FN = strip(read("functions", "api", "admin", "delete-spot.ts"));
  assert.match(PAGES_FN, /checkAdminAuth\(request, env\.ADMIN_KEY\)/);
  assert.match(PAGES_FN, /getServiceRoleHeaders\(/);
});

// ── 사용자 Function 검증 계약 ───────────────────────────────────────────────
test("★method 는 POST 만 허용한다", () => {
  assert.match(FN, /Method Not Allowed/);
  assert.match(FN, /Allow: "POST"/);
});

test("★device id 는 UUID 형식만 받는다", () => {
  assert.match(FN, /const DEVICE_ID_RE = /);
  assert.match(FN, /if \(!DEVICE_ID_RE\.test\(deviceId\)\) return json/);
  // body 로도 device_id 를 받으면 header 검증을 우회할 수 있다
  assert.doesNotMatch(FN, /body\.device_id/, "device_id 를 body 에서도 받고 있다");
});

test("★reaction 은 실제 존재하는 값만 허용한다 — 새 종류를 만들지 않았다", () => {
  assert.match(FN, /const ALLOWED_REACTIONS = new Set\(\["dislike"\]\)/);
  assert.match(FN, /if \(!ALLOWED_REACTIONS\.has\(reaction\)\) return json/);
});

test("★place_id 는 길이·문자셋을 검증한다", () => {
  assert.match(FN, /PLACE_ID_MAX/);
  assert.match(FN, /PLACE_ID_RE\s*=\s*\/\^\[A-Za-z0-9_\.:-\]\+\$\//);
  assert.match(FN, /placeId\.length > PLACE_ID_MAX/);
});

test("★본문 크기와 JSON 파싱 오류를 막는다", () => {
  assert.match(FN, /MAX_BODY_BYTES/);
  assert.match(FN, /payload too large/);
  assert.match(FN, /invalid json/);
});

test("★중복(23505)은 오류가 아니라 idempotent 성공이다", () => {
  assert.match(FN, /23505/);
  assert.match(FN, /already_recorded/);
});

test("★service role 은 서버에서만 쓴다", () => {
  assert.match(FN, /env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(SPOTS, /SERVICE_ROLE/i, "클라이언트에 service role 참조");
  assert.doesNotMatch(ADMINUI, /SERVICE_ROLE/i);
});

// ── 응답·로그에 개인 식별값을 넣지 않는다 ──────────────────────────────────
test("★응답에 raw device id · 내부 id · row 원문이 없다", () => {
  assert.match(FN, /Prefer: "return=minimal"/, "INSERT 결과 row 를 돌려받지 않는다");
  // "invalid device id" 같은 오류 문구는 값이 아니다. 실제 값이 실려 나가는
  // 형태(변수 삽입)만 잡는다.
  for (const call of FN.match(/json\([^\n]*\)/g) ?? []) {
    assert.doesNotMatch(call, /\bdeviceId\b/, `응답에 device id 값: ${call}`);
    assert.doesNotMatch(call, /\bdetail\b/,   `응답에 DB 오류 원문: ${call}`);
    assert.doesNotMatch(call, /\bres\.json|\brow\b/, `응답에 row 원문: ${call}`);
  }
});

test("★로그에 raw device id · DB 오류 원문을 남기지 않는다", () => {
  const logs = FN.match(/console\.(error|log|warn)\([^\n]*/g) ?? [];
  assert.ok(logs.length > 0, "로그가 아예 없다");
  for (const l of logs) {
    assert.doesNotMatch(l, /deviceId/,  `로그에 device id: ${l}`);
    assert.doesNotMatch(l, /\bdetail\b/, `로그에 DB 오류 원문: ${l}`);
    assert.doesNotMatch(l, /\braw\b/,    `로그에 원본 body: ${l}`);
  }
});

test("★DB 오류 원문을 응답 본문에 넣지 않는다", () => {
  assert.doesNotMatch(FN, /json\(\{\s*error:\s*detail/);
  assert.match(FN, /json\(\{ error: "server error" \}, 502\)/);
});

// ── 관리자 Function ─────────────────────────────────────────────────────────
test("★관리자 집계는 기존 x-admin-key 검증을 그대로 쓴다", () => {
  assert.match(ADMIN, /import \{ json, checkAdminAuth, getServiceRoleHeaders \}/);
  assert.match(ADMIN, /const authErr = checkAdminAuth\(request, env\.ADMIN_KEY\)/);
  assert.match(ADMIN, /if \(authErr\) return authErr/);
});

test("★관리자 집계가 device_id 를 아예 select 하지 않는다", () => {
  assert.match(ADMIN, /select=place_id,created_at/);
  assert.doesNotMatch(ADMIN, /select=[^"'`\s]*device_id/, "device_id 를 조회하고 있다");
  assert.doesNotMatch(ADMIN, /device_id:/, "응답에 device_id 필드");
});

test("★관리자 응답은 집계 필드만 돌려준다", () => {
  assert.match(ADMIN, /items: filtered\.map\(\(\[place_id, v\]\) => \(\{/);
  assert.match(ADMIN, /place_id,\s*\n\s*title:/);
  assert.match(ADMIN, /count: v\.count/);
});

test("★기존 판정 기준(threshold·정렬·제목 폴백)을 유지한다", () => {
  assert.match(ADMIN, /const DEFAULT_THRESHOLD = 1/);
  assert.match(ADMIN, /v\.count >= threshold/);
  assert.match(ADMIN, /sort\(\(a, b\) => b\[1\]\.count - a\[1\]\.count\)/);
  assert.match(ADMIN, /titleMap\.get\(place_id\) \?\? place_id/);
  assert.match(ADMIN, /reaction=eq\.dislike/);
});

test("★관리자 Function 도 GET 만 허용한다", () => {
  assert.match(ADMIN, /Allow: "GET"/);
});

// ── 038 migration 정적 검증 ─────────────────────────────────────────────────
test("★038 은 spot_reactions 한 테이블만 대상으로 한다", () => {
  const tables = [...SQL.matchAll(/public\.(\w+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(tables)], ["spot_reactions"]);
});

test("★038 에 데이터 파괴 SQL 이 없다", () => {
  for (const bad of [/\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bUPDATE\s+public\./i,
                     /\bDROP\s+TABLE\b/i, /\bALTER\s+TABLE\s+\S+\s+DROP\b/i]) {
    assert.doesNotMatch(SQL, bad, String(bad));
  }
});

test("★038 은 SQL Editor 와 충돌하는 CONCURRENTLY 를 쓰지 않는다", () => {
  assert.doesNotMatch(SQL, /CONCURRENTLY/i);
});

test("★038 이 unique index · policy 제거 · privilege 회수를 모두 담는다", () => {
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS spot_reactions_device_place_reaction_uniq\s*\n\s*ON public\.spot_reactions \(device_id, place_id, reaction\)/);
  assert.match(SQL, /DROP POLICY IF EXISTS anon_read_reactions\s+ON public\.spot_reactions/);
  assert.match(SQL, /DROP POLICY IF EXISTS anon_insert_reactions ON public\.spot_reactions/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES ON TABLE public\.spot_reactions FROM PUBLIC/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES ON TABLE public\.spot_reactions FROM anon/);
  assert.match(SQL, /REVOKE ALL PRIVILEGES ON TABLE public\.spot_reactions FROM authenticated/);
  assert.match(SQL, /ALTER TABLE public\.spot_reactions ENABLE ROW LEVEL SECURITY/);
});

test("★038 은 service_role 권한을 건드리지 않는다 — 관리자 삭제 경로가 DELETE 를 쓴다", () => {
  // 초안은 GRANT SELECT, INSERT ... TO service_role 을 넣었는데 잘못이었다.
  // service_role 은 이미 7종(DELETE 포함)을 갖고 있고, DELETE 는 관리자 장소
  // 삭제 Function 이 spot_reactions 를 FK 순서상 먼저 지울 때 필요하다.
  // 둘만 적어 두면 "이 둘이면 충분하다"는 잘못된 기대가 남는다.
  assert.doesNotMatch(SQL, /GRANT[^\n]*service_role/,  "service_role 에 GRANT 하지 않는다");
  assert.doesNotMatch(SQL, /REVOKE[^\n]*service_role/, "service_role 권한을 회수하지 않는다");
});

test("★038 실행 본문이 2026-08-06 운영에 적용된 SQL 과 일치한다", () => {
  const body = SQL.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  assert.equal(body,
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

test("★적용 후 검증 문서가 service_role 7종을 기대값으로 적는다", () => {
  const RAW = read("supabase", "migrations", "038_lock_down_spot_reactions.sql");
  assert.match(RAW, /7종|7 행/, "service_role 기대값이 7종으로 적혀 있어야 한다");
  assert.match(RAW, /DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE/);
  assert.doesNotMatch(RAW, /service_role 은 SELECT·INSERT 유지 \(2 행\)/, "옛 2행 기대값이 남아 있다");
});

test("★038 문서에 사전검증 7종·적용 후 검증·롤백이 모두 있다", () => {
  const RAW = read("supabase", "migrations", "038_lock_down_spot_reactions.sql");
  for (const k of ["null_device", "null_place", "null_reaction", "dup_groups",
                   "bad_reaction", "long_device", "long_place"]) {
    assert.match(RAW, new RegExp(k), `사전검증 누락: ${k}`);
  }
  assert.match(RAW, /적용 후 검증/);
  assert.match(RAW, /DROP INDEX IF EXISTS public\.spot_reactions_device_place_reaction_uniq/);
  assert.match(RAW, /GRANT SELECT, INSERT ON TABLE public\.spot_reactions TO anon, authenticated/);
});

test("★038 은 다른 테이블 권한을 건드리지 않는다", () => {
  for (const t of ["restaurants", "spots", "events", "planner_sessions", "city_spots", "itineraries"]) {
    assert.doesNotMatch(SQL, new RegExp(`public\\.${t}\\b`), `다른 테이블 변경: ${t}`);
  }
});

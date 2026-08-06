// 040 정적 검증.
//
// 이 migration 은 운영에 자동 적용되지 않고 사용자가 SQL Editor 에서 직접 실행한다.
// 그래서 파일이 곧 실행될 내용이며, 여기서 잡지 못한 것은 운영에서 그대로 돈다.
//
// 이 작업의 핵심은 "body 를 건드리지 않는다" 이다. CREATE OR REPLACE 가 한 줄이라도
// 섞이면 함수 정의를 덮어쓰게 되고, 그건 감사 없이 운영 함수를 바꾸는 일이 된다.
//
// 기존 migration 039 이하 실행 본문은 수정하지 않는다 — 함께 지켜본다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PATH_040 = join(ROOT, "supabase", "migrations", "040_fix_function_search_paths.sql");
const RAW = readFileSync(PATH_040, "utf8");
/** 주석을 뗀 실행 본문 — 설명문에 단어가 있다고 통과하면 안 된다 */
const SQL = RAW.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
const BODY = SQL.split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

const TARGETS = ["set_updated_at", "update_places_updated_at", "update_events_updated_at"];

test("★040 파일이 존재한다", () => {
  assert.ok(existsSync(PATH_040));
});

// ── 실행 본문 ────────────────────────────────────────────────────────────────
test("★실행 본문이 계획한 5개 문장뿐이다 — 몰래 끼어든 SQL 이 없다", () => {
  assert.equal(BODY,
    "BEGIN; " +
    "ALTER FUNCTION public.set_updated_at() SET search_path = ''; " +
    "ALTER FUNCTION public.update_places_updated_at() SET search_path = ''; " +
    "ALTER FUNCTION public.update_events_updated_at() SET search_path = ''; " +
    "COMMIT;");
});

test("★트랜잭션으로 감싼다", () => {
  assert.match(BODY, /^BEGIN;/);
  assert.match(BODY, /COMMIT;$/);
});

test("★대상은 정확히 3개 함수다", () => {
  const alters = SQL.match(/ALTER FUNCTION\s+public\.(\w+)\(\)/g) ?? [];
  assert.equal(alters.length, 3);
  const names = alters.map(a => a.match(/public\.(\w+)\(\)/)![1]).sort();
  assert.deepEqual(names, [...TARGETS].sort());
});

test("★무인자 signature `()` 를 명시한다 — 이름만 쓰지 않는다", () => {
  for (const fn of TARGETS) {
    assert.match(SQL, new RegExp(`ALTER FUNCTION\\s+public\\.${fn}\\(\\)`), fn);
  }
  // 스키마 없이 부르거나 괄호를 빠뜨린 형태가 없어야 한다
  assert.doesNotMatch(SQL, /ALTER FUNCTION\s+(?!public\.)/);
  assert.doesNotMatch(SQL, /ALTER FUNCTION\s+public\.\w+\s+SET/);
});

test("★고정 search_path 는 빈 문자열이다 — public 을 넣지 않았다", () => {
  const sets = SQL.match(/SET search_path = [^;]+/g) ?? [];
  assert.equal(sets.length, 3);
  for (const s of sets) assert.equal(s.trim(), "SET search_path = ''");
  assert.doesNotMatch(SQL, /search_path\s*=\s*public/);
  assert.doesNotMatch(SQL, /search_path\s*=\s*pg_catalog/);
});

test("★실행 본문에는 ALTER FUNCTION 외 DDL 이 없다", () => {
  const stmts = BODY.replace(/^BEGIN;\s*/, "").replace(/\s*COMMIT;$/, "")
    .split(";").map(s => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 3);
  for (const s of stmts) assert.match(s, /^ALTER FUNCTION /, s);
});

// ── 변경 금지 항목 ───────────────────────────────────────────────────────────
test("★함수 body 를 덮어쓰지 않는다", () => {
  assert.doesNotMatch(SQL, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  assert.doesNotMatch(SQL, /\$function\$|\$\$/);
  assert.doesNotMatch(SQL, /\bRETURN\s+NEW\b/i);
});

test("★owner·권한·security 속성을 바꾸지 않는다", () => {
  for (const bad of [/OWNER\s+TO/i, /\bGRANT\b/i, /\bREVOKE\b/i,
                     /SECURITY\s+DEFINER/i, /SECURITY\s+INVOKER/i]) {
    assert.doesNotMatch(SQL, bad, String(bad));
  }
});

test("★trigger·table·데이터를 바꾸지 않는다", () => {
  for (const bad of [/CREATE\s+TRIGGER/i, /DROP\s+TRIGGER/i, /ALTER\s+TRIGGER/i,
                     /ALTER\s+TABLE/i, /DROP\s+TABLE/i, /ALTER\s+COLUMN/i,
                     /\bDELETE\s+FROM\b/i, /\bUPDATE\s+public\./i,
                     /\bINSERT\s+INTO\b/i, /\bTRUNCATE\b/i,
                     /DROP\s+FUNCTION/i, /CREATE\s+INDEX/i, /DROP\s+INDEX/i]) {
    assert.doesNotMatch(SQL, bad, String(bad));
  }
});

test("★get_shared_itinerary 를 실행 본문에서 건드리지 않는다", () => {
  assert.doesNotMatch(SQL, /get_shared_itinerary/);
  // 설명 주석에는 남는 WARN 2건으로 언급돼 있어야 한다
  assert.match(RAW, /get_shared_itinerary anon EXECUTE/);
  assert.match(RAW, /get_shared_itinerary authenticated EXECUTE/);
});

test("★대상 3개 외 다른 함수를 바꾸지 않는다", () => {
  const fns = [...SQL.matchAll(/public\.(\w+)\(\)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(fns)].sort(), [...TARGETS].sort());
});

test("★자동 적용을 안내하지 않는다", () => {
  assert.doesNotMatch(SQL, /supabase db push/i);
  assert.match(RAW, /`supabase db push` 로 적용하지 않는다/);
});

// ── 주석 계약 ────────────────────────────────────────────────────────────────
test("★적용 전 검증 · 적용 후 검증 · 롤백 절이 모두 있다", () => {
  assert.match(RAW, /── 1\. 적용 전 읽기 전용 검증/);
  assert.match(RAW, /── 3\. 적용 후 검증/);
  assert.match(RAW, /── 4\. 롤백/);
});

test("★적용 전 검증이 signature·owner·security·search_path·trigger·grants 를 모두 확인한다", () => {
  const pre = RAW.slice(RAW.indexOf("── 1. 적용 전"), RAW.indexOf("── 2. 적용"));
  for (const k of ["pg_get_function_identity_arguments", "pg_get_userbyid", "prosecdef",
                   "proconfig", "pg_trigger", "aclexplode", "md5"]) {
    assert.match(pre, new RegExp(k), `사전검증 누락: ${k}`);
  }
  assert.match(pre, /ERROR 0 · WARN 5 · INFO 10/);
});

test("★적용 후 검증이 body·owner·security·grants·trigger 불변을 확인한다", () => {
  const post = RAW.slice(RAW.indexOf("── 3. 적용 후"), RAW.indexOf("── 4. 롤백"));
  assert.match(post, /proconfig/);
  assert.match(post, /prosrc|def_md5/, "body 불변 비교 기준");
  assert.match(post, /owner/);
  assert.match(post, /security_definer/);
  assert.match(post, /EXECUTE grants 불변/);
  assert.match(post, /trigger 연결 불변/);
  assert.match(post, /ERROR 0 · WARN 2 · INFO 10/);
});

test("★롤백은 RESET search_path 만 쓴다", () => {
  const rb = RAW.slice(RAW.indexOf("── 4. 롤백"));
  for (const fn of TARGETS) {
    assert.match(rb, new RegExp(`ALTER FUNCTION public\\.${fn}\\(\\)\\s+RESET search_path`), fn);
  }
  // 롤백에서 body·owner·권한을 되돌린다고 쓰면 안 된다.
  // `SET search_path` 는 단어 경계로 잡는다 — 그냥 쓰면 "RESET search_path" 안의
  // "SET search_path" 까지 걸린다.
  for (const bad of [/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i, /OWNER\s+TO/i,
                     /\bGRANT\b/i, /\bREVOKE\b/i, /\bSET search_path/]) {
    assert.doesNotMatch(rb, bad, String(bad));
  }
});

// ── 기존 migration 보호 ──────────────────────────────────────────────────────
test("★이미 운영에 적용된 038·039 실행 본문을 수정하지 않았다", () => {
  const bodyOf = (f: string) => readFileSync(join(ROOT, "supabase", "migrations", f), "utf8")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
    .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");

  assert.equal(bodyOf("038_lock_down_spot_reactions.sql"),
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

  assert.equal(bodyOf("039_lock_down_legacy_restaurants.sql"),
    "BEGIN; " +
    "ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; " +
    "DROP POLICY IF EXISTS restaurants_anon_select ON public.restaurants; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM PUBLIC; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM anon; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM authenticated; " +
    "COMMIT;");
});

// ── 저장소의 함수 정의와 대조 ────────────────────────────────────────────────
test("★세 함수의 저장소 정의가 모두 `NEW.updated_at = now(); RETURN NEW;` 뿐이다", () => {
  // body 를 바꾸지 않는 근거다. 저장소 정의가 바뀌면 이 판단을 다시 해야 한다.
  const sources: Array<[string, string]> = [
    ["set_updated_at",           join(ROOT, "supabase", "contact_inquiries.sql")],
    ["update_places_updated_at", join(ROOT, "supabase", "migrations", "003_places_table.sql")],
    ["update_events_updated_at", join(ROOT, "supabase", "migrations", "004_events_schema.sql")],
  ];
  for (const [fn, file] of sources) {
    const src = readFileSync(file, "utf8");
    const i = src.indexOf(`FUNCTION ${fn}()`);
    assert.ok(i > 0, `${fn} 정의를 ${file} 에서 찾지 못했다`);
    const seg = src.slice(i, i + 400);
    const m = seg.match(/BEGIN[\s\S]*?END;/);
    assert.ok(m, `${fn} body 를 읽지 못했다`);
    assert.equal(m[0].replace(/\s+/g, " ").trim().toLowerCase(),
      "begin new.updated_at = now(); return new; end;", fn);
  }
});

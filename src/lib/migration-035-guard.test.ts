// 035 보안 계약 회귀 방어 (정적 검사).
//
// `increment_trip_view` 는 anon 이 직접 호출할 수 있는 유일한 카운터다.
// 누군가 나중에 이 migration 을 손대면서 is_public 가드나 search_path 를
// 빼면 비공개 일정 조회수가 다시 열린다. 운영 DB 없이 파일만으로 확인할 수
// 있는 조건들을 여기에 고정한다.
//
// 실제 동작(공개 +1 / 비공개 +0)은 DB 가 있어야 확인할 수 있으므로 적용 시
// transaction rollback 으로 검증했고, 이 파일은 그 계약이 코드에서 사라지지
// 않았는지만 지킨다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG_DIR = join(ROOT, "supabase", "migrations");
const M035 = readFileSync(join(MIG_DIR, "035_harden_increment_trip_view.sql"), "utf8");

// 주석을 뺀 실행 SQL 만 본다 — 설명문에 단어가 있다고 통과하면 안 된다
const SQL = M035.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
const FN_BODY = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION"), SQL.indexOf("-- ── 2.") >= 0
  ? SQL.indexOf("-- ── 2.") : SQL.length).split("$function$")[1] ?? "";

test("★비공개 일정을 거르는 조건이 있다", () => {
  assert.match(FN_BODY, /is_public\s+IS\s+TRUE/i);
});

test("★NULL view_count 를 0 으로 보정한다 — NULL+1 은 카운터를 영구히 죽인다", () => {
  assert.match(FN_BODY, /COALESCE\s*\(\s*view_count\s*,\s*0\s*\)\s*\+\s*1/i);
});

test("★search_path 가 빈 값으로 고정된다", () => {
  assert.match(SQL, /SET\s+search_path\s*=\s*''/);
  assert.doesNotMatch(SQL, /SET\s+search_path\s*=\s*public\s*$/m);
});

test("★대상 테이블이 스키마 한정이다 — search_path='' 의 전제", () => {
  assert.match(FN_BODY, /UPDATE\s+public\.itineraries/i);
});

test("★SECURITY DEFINER 와 기존 signature·반환형이 유지된다", () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.increment_trip_view\(trip_id_param uuid\)/);
  assert.match(SQL, /RETURNS void/);
  assert.match(SQL, /LANGUAGE plpgsql/);
  assert.match(SQL, /SECURITY DEFINER/);
});

test("★DROP + CREATE 를 쓰지 않는다 — ACL 이 초기화되어 anon EXECUTE 가 사라진다", () => {
  assert.doesNotMatch(SQL, /DROP\s+FUNCTION/i);
});

test("★증가량을 인자로 받지 않는다 — 외부에서 임의 값을 넣을 수 없다", () => {
  const sig = SQL.match(/increment_trip_view\(([^)]*)\)/)?.[1] ?? "";
  assert.equal(sig.trim(), "trip_id_param uuid");
  assert.doesNotMatch(FN_BODY, /view_count\s*\+\s*(?!1\b)\w/);
});

test("★동적 SQL 이 없다", () => {
  assert.doesNotMatch(FN_BODY, /\bEXECUTE\s+/i);
});

test("★조회수 외 다른 컬럼을 건드리지 않는다", () => {
  const sets = [...FN_BODY.matchAll(/SET\s+(\w+)\s*=/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual([...new Set(sets)], ["view_count"]);
});

test("★권한을 조작하지 않는다 — GRANT·REVOKE 없음", () => {
  assert.doesNotMatch(SQL, /\bGRANT\b/i);
  assert.doesNotMatch(SQL, /\bREVOKE\b/i);
});

test("★public.itineraries 외 다른 테이블을 바꾸지 않는다", () => {
  const targets = [...SQL.matchAll(/\bUPDATE\s+([a-zA-Z_.]+)/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual([...new Set(targets)], ["public.itineraries"]);
  assert.doesNotMatch(SQL, /\b(DROP\s+TABLE|TRUNCATE|ALTER\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY)\b/i);
});

test("★035 는 increment_trip_view 외의 함수를 재정의하지 않는다", () => {
  const fns = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION\s+([a-zA-Z_.]+)\s*\(/gi)].map(m => m[1].toLowerCase());
  assert.deepEqual(fns, ["public.increment_trip_view"]);
  assert.doesNotMatch(SQL, /get_shared_itinerary\s*\(/i);
});

test("★migration 번호가 겹치지 않는다", () => {
  const same = readdirSync(MIG_DIR).filter(f => f.startsWith("035"));
  assert.deepEqual(same, ["035_harden_increment_trip_view.sql"]);
});

test("브라우저 호출 경로는 그대로다 — 인자 이름·엔드포인트 불변", () => {
  const page = readFileSync(join(ROOT, "src", "app", "shared", "page.tsx"), "utf8");
  assert.match(page, /rest\/v1\/rpc\/increment_trip_view/);
  assert.match(page, /trip_id_param/);
});

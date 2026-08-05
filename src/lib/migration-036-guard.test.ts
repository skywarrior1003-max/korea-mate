// 036 보안 계약 회귀 방어 (정적 검사).
//
// dedupe 테이블과 서버 전용 recorder 는 조회수 집계의 유일한 방어선이다.
// 원자성(ON CONFLICT 한 문장)·24시간 조건·hash 형식·권한이 나중에 조용히
// 느슨해지면 조작 경로가 다시 열린다. 파일만으로 확인할 수 있는 조건을 고정한다.
//
// 실제 동작(첫 +1 / 24h 내 +0 / 다른 기기 +1 / 비공개 +0)은 운영 DB 에서
// transaction rollback 으로 검증했다. 이 파일은 그 계약이 코드에서 사라지지
// 않았는지만 지킨다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG_DIR = join(ROOT, "supabase", "migrations");
const RAW = readFileSync(join(MIG_DIR, "036_create_itinerary_view_dedup.sql"), "utf8");
// 주석 제외 — 설명문에 단어가 있다고 통과하면 안 된다
const SQL = RAW.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");

// ── 테이블 구조 ──────────────────────────────────────────────────────────────
test("★dedupe 테이블이 (itinerary_id, viewer_hash) 복합 기본키를 갖는다", () => {
  assert.match(SQL, /PRIMARY KEY \(itinerary_id, viewer_hash\)/);
});

test("★viewer_hash 는 소문자 SHA-256 64자리 hex 만 허용한다", () => {
  assert.match(SQL, /CHECK \(viewer_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
});

test("★itineraries 외래키 + ON DELETE CASCADE", () => {
  assert.match(SQL, /REFERENCES public\.itineraries\(id\) ON DELETE CASCADE/);
});

test("★raw device id·IP·User-Agent 컬럼을 만들지 않는다", () => {
  const create = SQL.slice(SQL.indexOf("CREATE TABLE public.itinerary_view_dedup"),
                           SQL.indexOf("COMMENT ON TABLE"));
  assert.doesNotMatch(create, /device_id|ip_address|\buser_agent\b|fingerprint/i);
  // 컬럼은 4개만
  assert.deepEqual(
    [...create.matchAll(/^\s{2}(\w+)\s+(uuid|text|timestamptz)/gm)].map(m => m[1]),
    ["itinerary_id", "viewer_hash", "first_counted_at", "last_counted_at"],
  );
});

// ── 테이블 보안 ──────────────────────────────────────────────────────────────
test("★RLS 를 켜고 정책을 만들지 않는다", () => {
  assert.match(SQL, /ALTER TABLE public\.itinerary_view_dedup ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});

test("★anon·authenticated·PUBLIC 테이블 권한을 전부 회수한다", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"])
    assert.match(SQL, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.itinerary_view_dedup FROM ${role};`));
  assert.match(SQL, /GRANT\s+ALL PRIVILEGES ON TABLE public\.itinerary_view_dedup TO\s+service_role;/);
});

// ── recorder 함수 ────────────────────────────────────────────────────────────
const FN = SQL.slice(SQL.indexOf("CREATE FUNCTION public.record_public_itinerary_view"),
                     SQL.indexOf("ALTER FUNCTION public.record_public_itinerary_view"));

test("★recorder signature·반환형이 계약대로다", () => {
  assert.match(SQL, /CREATE FUNCTION public\.record_public_itinerary_view\(\s*p_itinerary_id uuid,\s*p_viewer_hash\s+text\s*\)/);
  assert.match(FN, /RETURNS boolean/);
});

test("★SECURITY DEFINER + search_path 빈 값 + 동적 SQL 없음", () => {
  assert.match(FN, /SECURITY DEFINER/);
  assert.match(FN, /SET search_path = ''/);
  assert.doesNotMatch(FN, /\bEXECUTE\s+['"]/i);
});

test("★모든 객체가 schema-qualified 다", () => {
  assert.match(FN, /INSERT INTO public\.itinerary_view_dedup/);
  assert.match(FN, /FROM public\.itineraries/);
  assert.match(FN, /UPDATE public\.itineraries/);
  // 스키마 없는 참조가 없어야 한다
  assert.doesNotMatch(FN, /\b(INSERT INTO|UPDATE)\s+(?!public\.)itinerar/i);
});

test("★공개 일정만 집계한다", () => {
  assert.match(FN, /i\.is_public IS TRUE/);
  assert.match(FN, /AND is_public IS TRUE/);
});

test("★입력 검증 — NULL·형식 위반은 조용히 false", () => {
  assert.match(FN, /p_itinerary_id IS NULL OR p_viewer_hash IS NULL[\s\S]{0,60}RETURN false/);
  assert.match(FN, /p_viewer_hash !~ '\^\[0-9a-f\]\{64\}\$'[\s\S]{0,60}RETURN false/);
  assert.doesNotMatch(FN, /RAISE\s+(EXCEPTION|NOTICE|WARNING)/i);
});

test("★★원자성 — 중복 판정과 집계 인정이 한 문장이다 (SELECT 후 UPDATE 분리 금지)", () => {
  assert.match(FN, /ON CONFLICT \(itinerary_id, viewer_hash\) DO UPDATE/);
  assert.match(FN, /WHERE d\.last_counted_at <= now\(\) - interval '24 hours'/);
  assert.match(FN, /RETURNING 1 AS hit/);
  // 집계 인정 여부는 upsert 의 RETURNING 개수로만 결정된다
  assert.match(FN, /SELECT count\(\*\) INTO v_counted FROM counted/);
});

test("★24시간 기준은 DB 시간(now())을 쓴다 — 클라이언트 시계 신뢰 금지", () => {
  assert.match(FN, /now\(\) - interval '24 hours'/);
  assert.doesNotMatch(FN, /p_now|p_timestamp|client_time/i);
});

test("★증가량은 고정 +1 이며 입력으로 받지 않는다", () => {
  assert.match(FN, /view_count = COALESCE\(view_count, 0\) \+ 1/);
  const sig = SQL.match(/record_public_itinerary_view\(([^)]*)\)/)?.[1] ?? "";
  assert.match(sig, /^\s*p_itinerary_id uuid,\s*p_viewer_hash\s+text\s*$/);
});

test("★recorder 는 service_role 전용", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"])
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION public\\.record_public_itinerary_view\\(uuid, text\\) FROM ${role};`));
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.record_public_itinerary_view\(uuid, text\) TO service_role;/);
  assert.match(SQL, /ALTER FUNCTION public\.record_public_itinerary_view\(uuid, text\) OWNER TO postgres/);
});

// ── 범위 제한 ────────────────────────────────────────────────────────────────
test("★036 은 increment_trip_view 를 건드리지 않는다", () => {
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.increment_trip_view/);
  assert.doesNotMatch(SQL, /(GRANT|REVOKE)[^;]*increment_trip_view/i);
});

test("★036 은 다른 테이블·정책을 바꾸지 않는다", () => {
  const tables = [...SQL.matchAll(/\b(?:ALTER TABLE|CREATE TABLE|DROP TABLE|TRUNCATE)\s+(?:IF EXISTS\s+)?([a-zA-Z_.]+)/gi)]
    .map(m => m[1].toLowerCase());
  assert.deepEqual([...new Set(tables)], ["public.itinerary_view_dedup"]);
  assert.doesNotMatch(SQL, /DROP (TABLE|FUNCTION)(?!\s+IF EXISTS public\.record)/i);
});

test("★036 은 데이터를 넣거나 지우지 않는다", () => {
  // 함수 본문(런타임 동작)과 DO 블록(검증 로직 — 권한 이름 배열에 'TRUNCATE'
  // 문자열이 들어간다)을 뺀, 실제 migration 문장만 본다.
  const outside = SQL
    .replace(/AS \$function\$[\s\S]*?\$function\$/g, "")
    .replace(/DO \$(\w+)\$[\s\S]*?\$\1\$;/g, "");
  // 문장 시작 위치의 DML 만 검사한다
  assert.doesNotMatch(outside, /(^|;)\s*(INSERT INTO|DELETE FROM|TRUNCATE)\b/im);
});

test("★migration 번호가 겹치지 않는다", () => {
  assert.deepEqual(readdirSync(MIG_DIR).filter(f => f.startsWith("036")),
                   ["036_create_itinerary_view_dedup.sql"]);
});

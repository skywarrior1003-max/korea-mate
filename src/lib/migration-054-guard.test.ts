// 054 — migration 자기검증과 운영 확인 SQL 의 계약 테스트
//
// 여기서 지키는 것은 두 가지다.
//   1. 054 는 "성공했다고 말하면서 실제로는 안 바뀐" 상태를 남길 수 없다.
//      제약 이름이 예상과 다르면 조용히 지나가는 대신 EXCEPTION 을 던지고,
//      같은 트랜잭션 안이므로 앞의 변경까지 전부 되돌아간다.
//   2. 운영에서 사람이 실행할 확인 SQL 에는 쓰기 문장이 들어갈 수 없다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { STORY_REPORT_CATEGORIES, STORY_TARGET_TYPE } from "./moderation/story-moderation-core.ts";

const MIG_PATH = "supabase/migrations/054_story_reports_and_moderation.sql";
const SQL_PATH = "docs/operations/production-catalog-readonly-053-054.sql";
const M042_PATH = "supabase/migrations/042_place_reports.sql";

const MIG  = readFileSync(MIG_PATH, "utf8");
const OPS  = readFileSync(SQL_PATH, "utf8");
const M042 = readFileSync(M042_PATH, "utf8");

/** `--` 주석을 걷어낸, 실제로 실행되는 SQL 만 */
function runnable(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}
const mig = runnable(MIG);
const ops = runnable(OPS);

// ── S: 자기검증이 실제로 들어 있다 ───────────────────────────────────────────

test("S1 자기검증 블록이 트랜잭션 **안에** 있다 — 실패하면 앞의 변경도 되돌아간다", () => {
  const begin  = mig.indexOf("BEGIN;");
  const doIdx  = mig.indexOf("DO $v054$");
  const commit = mig.indexOf("COMMIT;");
  assert.ok(begin  >= 0, "BEGIN; 이 없다");
  assert.ok(doIdx  > begin,  "자기검증이 BEGIN 앞에 있다");
  assert.ok(commit > doIdx,  "자기검증이 COMMIT 뒤에 있다 — 그러면 되돌릴 수 없다");
  // dollar-quote 가 짝을 이룬다
  assert.equal((mig.match(/\$v054\$/g) ?? []).length, 2);
});

test("S2 이름을 믿지 않고 catalog 정의를 본다", () => {
  assert.match(mig, /pg_get_constraintdef\(/);
  assert.match(mig, /'public\.place_reports'::regclass/);
  // 단순히 제약 "이름" 이 있는지만 보고 넘어가면 안 된다
  assert.ok(
    !/conname\s*=\s*'place_reports_target_type_chk'/.test(mig),
    "이름 존재 검사만으로는 옛 제약 잔존을 잡지 못한다",
  );
});

test("S3 shared_story 를 막는 옛 target_type CHECK 잔존을 탐지한다", () => {
  // 정의에 target_type 이 있는데 shared_story 가 없는 CHECK → 중단
  assert.match(mig, /LIKE '%target_type%'/);
  assert.match(mig, /NOT LIKE '%''shared_story''%'/);
  const idx = mig.indexOf("NOT LIKE '%''shared_story''%'");
  assert.match(mig.slice(idx, idx + 400), /RAISE EXCEPTION/);
});

test("S4 shared_story 를 허용하는 CHECK 가 실제로 존재하는지도 본다", () => {
  // S3 만으로는 "target_type CHECK 가 아예 없는" 상태가 통과해 버린다
  assert.match(mig, /IF NOT EXISTS \([\s\S]{0,400}LIKE '%''shared_story''%'[\s\S]{0,120}RAISE EXCEPTION/);
  assert.equal(STORY_TARGET_TYPE, "shared_story");
});

test("S5 사유는 042 의 15개 + Story 4개, 열아홉 값을 전부 확인한다", () => {
  const block = mig.slice(mig.indexOf("unnest(ARRAY["), mig.indexOf("]) AS v"));
  const values = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.equal(values.length, 19, `19개가 아니다: ${values.length}`);

  // 042 가 만든 15개가 하나도 빠지지 않았다 — 빠지면 기존 장소 신고가 막힌다
  const legacy = [...M042.slice(M042.indexOf("place_reports_category_chk"))
    .slice(0, 600).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.equal(legacy.length, 15, `042 의 사유가 15개가 아니다: ${legacy.length}`);
  for (const v of legacy) assert.ok(values.includes(v), `042 의 사유가 빠졌다: ${v}`);

  // Story 사유도 서버가 아는 값과 같다
  for (const v of STORY_REPORT_CATEGORIES) {
    assert.ok(values.includes(v), `Story 사유가 빠졌다: ${v}`);
  }
});

test("S6 새 사유를 막는 옛 category CHECK 잔존도 탐지한다", () => {
  assert.match(mig, /LIKE '%category%'[\s\S]{0,80}NOT LIKE '%''inappropriate_content''%'/);
  const idx = mig.indexOf("NOT LIKE '%''inappropriate_content''%'");
  assert.match(mig.slice(idx, idx + 400), /RAISE EXCEPTION/);
});

test("S7 moderation 컬럼은 존재만이 아니라 타입까지 본다", () => {
  // ADD COLUMN IF NOT EXISTS 는 같은 이름의 다른 타입 컬럼을 조용히 통과시킨다
  assert.match(mig, /column_name\s*=\s*'moderation_hidden_at'/);
  assert.match(mig, /udt_name/);
  assert.match(mig, /coltype <> 'timestamptz'/);
  assert.match(mig, /IF coltype IS NULL THEN[\s\S]{0,160}RAISE EXCEPTION/);
});

test("S8 이름 모르는 제약을 짐작으로 지우지 않는다 — 탐지와 중단뿐", () => {
  // DROP 대상은 042 가 선언한 두 이름뿐이다. catalog 조회 결과로 DROP 하지 않는다.
  const drops = [...mig.matchAll(/DROP CONSTRAINT[^;]*;/g)].map(m => m[0]);
  assert.equal(drops.length, 2, `DROP CONSTRAINT 가 2개가 아니다: ${drops.length}`);
  for (const d of drops) {
    assert.match(d, /IF EXISTS place_reports_(target_type|category)_chk/);
  }
  assert.ok(!/EXECUTE\s+format|EXECUTE\s+'/.test(mig), "동적 DROP 을 만들지 않는다");
});

// ── D: 기존 계약 회귀 없음 ───────────────────────────────────────────────────

test("D1 자기검증 추가가 데이터를 건드리지 않는다", () => {
  assert.ok(!/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i.test(mig), "쓰기 문장이 생겼다");
  assert.ok(!/DROP TABLE|DROP COLUMN/i.test(mig));
});

test("D2 RLS·권한을 완화하지 않는다", () => {
  assert.ok(!/\bGRANT\b|\bREVOKE\b|DISABLE ROW LEVEL|CREATE POLICY/i.test(mig));
});

test("D3 054 가 하던 일은 그대로다", () => {
  assert.match(mig, /ADD CONSTRAINT place_reports_target_type_chk[\s\S]{0,160}'shared_story'/);
  assert.match(mig, /ADD COLUMN IF NOT EXISTS moderation_hidden_at TIMESTAMPTZ/);
  assert.match(mig, /CREATE INDEX IF NOT EXISTS idx_itineraries_moderation_hidden/);
});

test("D4 053 은 이번에 건드리지 않았다", () => {
  const m053 = readFileSync("supabase/migrations/053_trip_moments_place_and_public_consent.sql", "utf8");
  assert.ok(!/DO \$/.test(m053), "053 에 자기검증을 넣지 않았다 — 이번 범위가 아니다");
  assert.match(m053, /trip_moments_public_consent_check/);
});

// ── O: 운영 확인 SQL ─────────────────────────────────────────────────────────

test("O1 운영 확인 SQL 파일이 있다", () => {
  assert.ok(existsSync(SQL_PATH));
});

test("O2 쓰기 문장이 하나도 없다", () => {
  const FORBIDDEN = [
    "INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "CREATE",
    "TRUNCATE", "GRANT", "REVOKE", "CALL", "DO", "SET ROLE",
  ];
  for (const kw of FORBIDDEN) {
    const re = new RegExp(`\\b${kw.replace(" ", "\\s+")}\\b`, "i");
    assert.ok(!re.test(ops), `실행문에 금지 토큰이 있다: ${kw}`);
  }
});

test("O3 SELECT / WITH 로만 되어 있다", () => {
  const statements = ops.split(";").map(s => s.trim()).filter(Boolean);
  assert.ok(statements.length >= 7, `질의가 너무 적다: ${statements.length}`);
  for (const st of statements) {
    assert.match(st, /^(SELECT|WITH)\b/i, `SELECT/WITH 로 시작하지 않는 문장: ${st.slice(0, 60)}`);
  }
});

test("O4 A~G 를 모두 준비했다", () => {
  for (const h of ["A. migration history", "B. trip_moments", "C. place_reports 제약",
                   "D. itineraries moderation", "E. RLS", "F. 권한", "G. 집계"]) {
    assert.ok(OPS.includes(h), `빠진 묶음: ${h}`);
  }
});

test("O5 개인 데이터를 읽지 않는다", () => {
  // information_schema 의 `column_name IN (...)` 목록은 **이름을 묻는 것**이지
  // 값을 읽는 것이 아니다(053 이 컬럼을 만들었는지 확인하는 자리다).
  // 그 목록을 걷어낸 뒤에도 남아 있으면 그건 실제로 값을 꺼내는 것이다.
  const dataOnly = ops.replace(/column_name IN \([^)]*\)/g, "column_name IN ()");
  for (const col of ["memo", "storage_path", "device_id", "note", "reporter_key",
                     "lat", "lng", "location_label", "trip_title", "resolution_note"]) {
    assert.ok(!new RegExp(`\\b${col}\\b`).test(dataOnly), `개인 데이터 컬럼을 읽는다: ${col}`);
  }
  assert.ok(!/SELECT\s+\*/i.test(ops), "select * 는 무엇이 나올지 모른다");
});

test("O6 C 묶음이 제약의 실제 이름과 정의를 보여 준다 — 이번 BLOCKED 의 핵심", () => {
  assert.match(ops, /pg_get_constraintdef\(c\.oid\)[\s\S]{0,80}FROM pg_constraint/);
  assert.match(ops, /'public\.place_reports'::regclass/);
  assert.match(ops, /conname/);
});

test("O7 history 표를 정본으로 읽지 않도록 경고가 붙어 있다", () => {
  // 이 저장소는 수동 적용이라 052 가 history 에 없는 것이 정상이다
  assert.match(OPS, /수동 적용분이 \*\*기록되지 않는다/);
  assert.match(OPS, /schema 결과가 정본/);
  // 컬럼명을 짐작하지 않고 먼저 introspection 한다
  assert.match(ops, /table_schema = 'supabase_migrations'/);
});

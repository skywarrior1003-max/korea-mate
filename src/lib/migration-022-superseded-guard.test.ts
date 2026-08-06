// 022 도 최종 정의가 아니라는 사실을 코드로 고정한다.
//
// 022 의 get_shared_itinerary 정의는 `is_public = true` 를 갖고 있어서 016 만큼
// 위험해 보이지는 않는다. 그래서 오히려 더 조심해야 한다 — "필터가 있으니
// 괜찮겠지" 하고 복구에 쓰기 쉽다. 실제로는 030 보다 오래된 계약이다.
//
//   · 반환 컬럼 11개 (현재 12개에서 copy_count 누락)
//   · ACL 이 anon·authenticated 뿐 (030 의 postgres·service_role 없음)
//
// 022 는 CREATE OR REPLACE 를 쓰는데 PostgreSQL 은 그 방식으로 반환 타입을 바꿀
// 수 없다. 그대로 돌리면 실패하고 롤백되지만, 그 오류를 피하려 DROP FUNCTION 을
// 먼저 하면 위 회귀가 실제로 반영된다.
//
// 016 쪽은 migration-016-superseded-guard.test.ts 가 지킨다. 030 계약 검증이
// 두 파일에 겹치는 것은 의도한 이중 방어다 — 한쪽이 지워져도 다른 쪽이 남는다.
//
// 주석 추가는 허용하되 실행 본문이 바뀌면 반드시 실패해야 한다.
// 실행 본문 md5 는 2026-08-06 기준 값으로 고정한다.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG = (f: string) => join(ROOT, "supabase", "migrations", f);
const F016 = "016_create_shared_itinerary_rpc.sql";
const F022 = "022_itinerary_is_public.sql";
const F030 = "030_shared_itinerary_copy_count.sql";

const raw = (f: string) => readFileSync(MIG(f), "utf8");
/** 주석을 뗀 실행 본문 — 주석 추가는 통과, SQL 변경은 실패해야 한다 */
const body = (f: string) =>
  raw(f).split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
        .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** RETURNS TABLE(...) 의 컬럼 이름 목록 */
function returnCols(f: string): string[] {
  const m = raw(f).match(/RETURNS TABLE\s*\(([\s\S]*?)\)\s*\n?LANGUAGE/i);
  if (!m) return [];
  return m[1].split(",").map(x => x.replace(/--.*/, "").trim()).filter(Boolean)
             .map(x => x.split(/\s+/)[0]);
}

const RAW016 = raw(F016);
const RAW022 = raw(F022);
const SQL022 = body(F022);
const SQL030 = body(F030);

// ── 1~4. 016·022 경고 ────────────────────────────────────────────────────────
test("★016 경고가 그대로 있다", () => {
  assert.match(RAW016, /SUPERSEDED BY 030/);
  assert.match(RAW016, /단독으로 실행하지 마라|단독 실행/);
});

test("★022 에 SUPERSEDED BY 030 경고가 있다", () => {
  assert.match(RAW022, /SUPERSEDED BY 030/);
  assert.match(RAW022, /030_shared_itinerary_copy_count\.sql/);
});

test("★022 경고에 단독 실행 금지 의미가 있다", () => {
  assert.match(RAW022, /단독으로 실행하지 마라|단독 실행/);
  assert.match(RAW022, /복구·재적용·수동 SQL 실행에는 022 가 아니라 030 을 쓴다/);
});

test("★022 경고가 감사에서 확인된 구체적 회귀를 적는다", () => {
  // 추측이 아니라 실측된 두 가지만 적혀 있어야 한다
  assert.match(RAW022, /반환 컬럼 11개/);
  assert.match(RAW022, /copy_count/);
  assert.match(RAW022, /postgres·service_role/);
});

test("★경고가 파일 맨 앞에 있다 — 스크롤해야 보이면 소용없다", () => {
  assert.match(RAW022.split("\n").slice(0, 3).join("\n"), /SUPERSEDED BY 030/);
});

// ── 022 가 실제로 구버전임을 고정 ────────────────────────────────────────────
test("★022 의 반환 컬럼은 11개이고 copy_count 가 없다", () => {
  const c = returnCols(F022);
  assert.equal(c.length, 11, c.join(","));
  assert.ok(!c.includes("copy_count"));
});

test("★022 의 ACL 에는 postgres·service_role 이 없다", () => {
  assert.match(SQL022, /GRANT\s+EXECUTE ON FUNCTION public\.get_shared_itinerary\(uuid\) TO anon/);
  assert.match(SQL022, /GRANT\s+EXECUTE ON FUNCTION public\.get_shared_itinerary\(uuid\) TO authenticated/);
  assert.doesNotMatch(SQL022, /TO postgres/);
  assert.doesNotMatch(SQL022, /TO service_role/);
});

test("★022 는 CREATE OR REPLACE 방식이다 — 반환 타입을 못 바꿔 실패하는 이유", () => {
  assert.match(SQL022, /CREATE OR REPLACE FUNCTION public\.get_shared_itinerary\(p_id uuid\)/);
  assert.doesNotMatch(SQL022, /DROP FUNCTION/);
});

// ── 5~15. 030 권위 계약 ──────────────────────────────────────────────────────
test("★030 파일이 존재한다", () => {
  assert.ok(existsSync(MIG(F030)));
});

test("★030 이 12컬럼을 반환하고 copy_count 를 포함한다", () => {
  const c = returnCols(F030);
  assert.equal(c.length, 12, c.join(","));
  assert.ok(c.includes("copy_count"));
  assert.deepEqual(c, ["id", "city", "start_date", "end_date", "travelers", "travel_style",
                       "days", "trip_title", "updated_at", "view_count", "helpful_count", "copy_count"]);
});

test("★030 이 공개 일정만 반환한다", () => {
  assert.match(SQL030, /WHERE i\.id = p_id/);
  assert.match(SQL030, /AND i\.is_public = true/);
  assert.match(SQL030, /LIMIT 1/);
});

test("★030 이 SECURITY DEFINER · 고정 search_path 를 유지한다", () => {
  assert.match(SQL030, /SECURITY DEFINER/);
  assert.match(SQL030, /SET search_path TO ''/);
});

test("★030 이 PUBLIC EXECUTE 를 회수한다", () => {
  assert.match(SQL030, /REVOKE EXECUTE ON FUNCTION public\.get_shared_itinerary\(uuid\) FROM PUBLIC/);
});

test("★030 의 EXECUTE 계약 4역할이 모두 명시돼 있다", () => {
  for (const role of ["postgres", "anon", "authenticated", "service_role"]) {
    assert.match(SQL030,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.get_shared_itinerary\\(uuid\\) TO ${role}`), role);
  }
});

test("★030 이 민감정보를 반환하지 않는다", () => {
  for (const bad of [/\bdevice_id\b/, /\bemail\b/, /\bcreated_at\b/, /\buser_id\b/]) {
    assert.doesNotMatch(SQL030, bad, String(bad));
  }
});

// ── 16~19. 실행 본문 불변 ────────────────────────────────────────────────────
test("★016·022·030 실행 본문이 바뀌지 않았다 (주석 추가는 허용)", () => {
  assert.equal(md5(body(F016)), "857f1632afda1966828f43ac96211708", "016");
  assert.equal(md5(SQL022),     "8969e64146d64ece21375d3f0fc6324c", "022");
  assert.equal(md5(SQL030),     "29f336908ea19d81018ddcb83e301e0b", "030");
});

test("★038·039·040 실행 본문이 바뀌지 않았다", () => {
  assert.equal(md5(body("038_lock_down_spot_reactions.sql")),      "b17339279c3f0552adf1d9fc63832965", "038");
  assert.equal(md5(body("039_lock_down_legacy_restaurants.sql")),  "44386bbfd717e4d5e15a4ecdea49bb3c", "039");
  assert.equal(md5(body("040_fix_function_search_paths.sql")),     "014c233d1fbccc25154fbd08662465f7", "040");
});

// ── 20~23. 범위 밖 변경 금지 ─────────────────────────────────────────────────
test("★신규 migration 을 만들지 않았다 — 번호는 040 이 마지막", () => {
  assert.ok(!existsSync(MIG("041_restrict_get_shared_itinerary_execute.sql")));
  const files = readdirSync(join(ROOT, "supabase", "migrations"))
    .filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.at(-1)?.slice(0, 3), "040");
});

test("★공유 RPC 호출 구조를 바꾸지 않았다", () => {
  const supa = readFileSync(join(ROOT, "src", "lib", "supabase.ts"), "utf8");
  assert.match(supa, /\.rpc\("get_shared_itinerary", \{ p_id: id \}\)/);
});

test("★022 경고문이 실행 지시로 읽히지 않는다", () => {
  // 이번에 추가한 경고 블록만 본다. 그 아래 원래 헤더는 손대지 않았다.
  const warn = RAW022.slice(0, RAW022.indexOf("═"));
  for (const bad of [/\bGRANT\b/, /\bREVOKE\b/, /supabase db push/i, /migration repair/i]) {
    assert.doesNotMatch(warn, bad, String(bad));
  }
});

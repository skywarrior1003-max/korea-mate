// 016 이 최종 정의가 아니라는 사실을 코드로 고정한다.
//
// 016 의 get_shared_itinerary 정의에는 `is_public = true` 필터가 없다. 누군가
// 복구·재적용 과정에서 016 만 다시 실행하면 함수가 그 옛 정의로 덮이고, UUID 만
// 알면 비공개 일정까지 조회된다. 운영에 비공개 일정이 실제로 존재한다.
//
// 그래서 두 가지를 지킨다.
//   1) 016 상단 경고가 사라지지 않게 한다
//   2) 030 이 권위 정의라는 조건(is_public 강제 · SECURITY DEFINER · 고정
//      search_path · ACL 계약)이 조용히 바뀌지 않게 한다
//
// 주석 추가는 허용하되 두 파일의 **실행 본문**이 바뀌면 반드시 실패해야 한다.
// 실행 본문 md5 는 2026-08-06 기준 값으로 고정한다.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG = (f: string) => join(ROOT, "supabase", "migrations", f);
const F016 = "016_create_shared_itinerary_rpc.sql";
const F030 = "030_shared_itinerary_copy_count.sql";

const raw = (f: string) => readFileSync(MIG(f), "utf8");
/** 주석을 뗀 실행 본문 — 주석 추가는 통과, SQL 변경은 실패해야 한다 */
const body = (f: string) =>
  raw(f).split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n")
        .split("\n").map(l => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const RAW016 = raw(F016);
const SQL030 = body(F030);

// ── 1~3. 016 경고 주석 ───────────────────────────────────────────────────────
test("★016 에 030 이 최종 정의라는 경고가 있다", () => {
  assert.match(RAW016, /SUPERSEDED BY 030/);
  assert.match(RAW016, /030_shared_itinerary_copy_count\.sql/);
});

test("★016 단독 실행 금지 문구가 있다", () => {
  assert.match(RAW016, /단독으로 실행하지 마라|단독 실행/);
  assert.match(RAW016, /복구·재적용·수동 SQL 실행에는 016 이 아니라 030 을 쓴다/);
});

test("★016 에 is_public 필터가 없어 비공개 일정이 노출된다는 위험 설명이 있다", () => {
  assert.match(RAW016, /is_public = true` 필터가 없다|is_public 필터가 없/);
  assert.match(RAW016, /비공개\s*\*?\*?일정/);
});

test("★경고가 파일 앞부분에 있다 — 스크롤해야 보이면 소용없다", () => {
  const head = RAW016.split("\n").slice(0, 5).join("\n");
  assert.match(head, /SUPERSEDED BY 030/);
});

// ── 4~9. 030 권위 정의 ───────────────────────────────────────────────────────
test("★030 파일이 존재한다", () => {
  assert.ok(existsSync(MIG(F030)));
});

test("★030 이 공개 일정만 반환한다 — is_public = true 강제", () => {
  assert.match(SQL030, /WHERE i\.id = p_id/);
  assert.match(SQL030, /AND i\.is_public = true/);
  assert.match(SQL030, /LIMIT 1/);
});

test("★030 이 SECURITY DEFINER 를 유지한다", () => {
  assert.match(SQL030, /SECURITY DEFINER/);
});

test("★030 이 고정 search_path 를 유지한다", () => {
  assert.match(SQL030, /SET search_path TO ''/);
});

test("★030 이 PUBLIC EXECUTE 를 회수한다", () => {
  assert.match(SQL030, /REVOKE EXECUTE ON FUNCTION public\.get_shared_itinerary\(uuid\) FROM PUBLIC/);
});

test("★030 의 EXECUTE 계약이 명시돼 있다 — postgres·anon·authenticated·service_role", () => {
  for (const role of ["postgres", "anon", "authenticated", "service_role"]) {
    assert.match(SQL030,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.get_shared_itinerary\\(uuid\\) TO ${role}`), role);
  }
});

test("★030 이 12컬럼을 반환한다 — copy_count 포함", () => {
  for (const col of ["id", "city", "start_date", "end_date", "travelers", "travel_style",
                     "days", "trip_title", "updated_at", "view_count", "helpful_count", "copy_count"]) {
    assert.match(SQL030, new RegExp(`\\b${col}\\b`), col);
  }
  // device_id · email · created_at 은 반환하지 않는다
  for (const bad of [/\bdevice_id\b/, /\bemail\b/, /\bcreated_at\b/]) {
    assert.doesNotMatch(SQL030, bad, String(bad));
  }
});

// ── 10~11. 실행 본문 불변 ────────────────────────────────────────────────────
test("★016 실행 본문이 바뀌지 않았다 (주석 추가는 허용)", () => {
  assert.equal(md5(body(F016)), "857f1632afda1966828f43ac96211708");
});

test("★030 실행 본문이 바뀌지 않았다", () => {
  assert.equal(md5(SQL030), "29f336908ea19d81018ddcb83e301e0b");
});

test("★016 실행 본문에 is_public 을 몰래 끼워 넣지 않았다 — 이력은 이력대로 둔다", () => {
  assert.doesNotMatch(body(F016), /is_public/);
});

// ── 12~16. 범위 밖 변경 금지 ─────────────────────────────────────────────────
test("★신규 migration 을 만들지 않았다 — 번호는 040 이 마지막", () => {
  assert.ok(!existsSync(MIG("041_restrict_get_shared_itinerary_execute.sql")));
  const files = readdirSync(join(ROOT, "supabase", "migrations"))
    .filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.at(-1)?.slice(0, 3), "040");
});

test("★016 경고문이 실행 지시로 읽히지 않는다", () => {
  // 이번에 추가한 경고 블록만 본다. 그 아래 원래 헤더에는 "기존 정책/GRANT는
  // 이 파일에서 변경하지 않음" 같은 기존 문장이 있고, 그건 건드리지 않았다.
  const warn = RAW016.slice(0, RAW016.indexOf("═"));
  for (const bad of [/\bGRANT\b/, /\bREVOKE\b/, /supabase db push/i, /migration repair/i]) {
    assert.doesNotMatch(warn, bad, String(bad));
  }
});

test("★040 이하 다른 migration 실행 본문이 그대로다", () => {
  // 이번 작업에서 손댈 이유가 없는 최근 보안 migration 3종을 함께 지킨다
  assert.equal(body("038_lock_down_spot_reactions.sql"),
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
  assert.equal(body("039_lock_down_legacy_restaurants.sql"),
    "BEGIN; " +
    "ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY; " +
    "DROP POLICY IF EXISTS restaurants_anon_select ON public.restaurants; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM PUBLIC; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM anon; " +
    "REVOKE ALL PRIVILEGES ON TABLE public.restaurants FROM authenticated; " +
    "COMMIT;");
  assert.equal(body("040_fix_function_search_paths.sql"),
    "BEGIN; " +
    "ALTER FUNCTION public.set_updated_at() SET search_path = ''; " +
    "ALTER FUNCTION public.update_places_updated_at() SET search_path = ''; " +
    "ALTER FUNCTION public.update_events_updated_at() SET search_path = ''; " +
    "COMMIT;");
});

test("★공유 RPC 호출 구조를 바꾸지 않았다 — 권한 회수 코드 0", () => {
  const supa = readFileSync(join(ROOT, "src", "lib", "supabase.ts"), "utf8");
  assert.match(supa, /\.rpc\("get_shared_itinerary", \{ p_id: id \}\)/);
});

// 장소 제보 moderation — 보안·계약 테스트 (C1~C26)
//
// 여기서 지키는 것은 두 가지다.
//   1. 인증 없이는 아무것도 못 읽는다. 그리고 인증 실패는 DB 를 부르기 전에 끝난다.
//   2. moderation 은 판단을 적을 뿐, 공개 데이터를 바꾸지 않는다.
//
// 실제 DB·provider 를 부르지 않는다. 순수 로직은 직접 호출하고, 서버 계약은
// 소스 텍스트로 고정한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseModerationListQuery, buildModerationQuery, toModerationRow,
  aggregateReports, validateModerationPatch, isAllowedTransition, buildStatusUpdate,
  normalizeResolutionNote, isValidReportId, isTerminalStatus,
  MODERATION_PAGE_DEFAULT, MODERATION_PAGE_MAX, MODERATION_FIELDS,
  MODERATION_FORBIDDEN_FIELDS, RESOLUTION_NOTE_MAX_CHARS,
  type ModerationListQuery,
} from "./report-moderation-core.ts";

const API  = readFileSync("functions/api/admin/place-reports.ts", "utf8");
const CORE = readFileSync("src/lib/reports/report-moderation-core.ts", "utf8");
const AUTH = readFileSync("functions/_lib/admin-auth.ts", "utf8");

/** 주석을 걷어낸 실제 코드. 설명문이 검사에 걸리지 않게 한다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const apiCode  = code(API);
const coreCode = code(CORE);

const q = (s: string) => new URLSearchParams(s);

/** 파싱이 성공했음을 확인하고 값을 꺼낸다. 실패하면 그 자리에서 테스트가 끝난다. */
function mustParse(qs: string): ModerationListQuery {
  const r = parseModerationListQuery(q(qs));
  assert.equal(r.ok, true, `파싱 실패: ${qs}`);
  if (!r.ok) throw new Error("unreachable");
  return r.value;
}

// ── C1~C4 인증 ──────────────────────────────────────────────────────────────

test("C1 인증 헤더가 없으면 거부한다", () => {
  // 공통 helper 가 x-admin-key 부재를 401 로 끝낸다
  assert.match(code(AUTH), /const provided = request\.headers\.get\("x-admin-key"\)/);
  assert.match(code(AUTH), /if \(!provided\)/);
  assert.match(code(AUTH), /"Unauthorized" \}, 401/);
  // moderation endpoint 가 그 helper 를 쓴다 — 자체 인증을 새로 만들지 않았다
  assert.match(apiCode, /checkAdminAuth\(request, env\.ADMIN_KEY\)/);
  assert.doesNotMatch(apiCode, /function\s+checkAdminAuth/);
});

test("C2 잘못된 키는 거부한다 — 서버 secret 과 다르면 통과 없음", () => {
  // 비교는 고정 시간 비교로 강화됐다. 직접 비교로 되돌아가면 여기서 걸린다.
  // (자세한 계약은 admin-auth-hardening.test.ts 가 실제 호출로 지킨다.)
  assert.match(code(AUTH), /if \(!keysMatch\(provided, adminKey\)\)/);
  assert.doesNotMatch(code(AUTH), /provided !== adminKey/);
  // ADMIN_KEY 미설정이면 통과가 아니라 503 fail-closed
  assert.match(code(AUTH), /if \(!adminKey\)/);
  assert.match(code(AUTH), /503/);
  // 클라이언트가 판정하는 경로가 없다
  assert.doesNotMatch(apiCode, /NEXT_PUBLIC_ADMIN/);
});

test("C3 올바른 인증이면 목록을 조회한다", () => {
  assert.match(apiCode, /export const onRequestGet/);
  assert.match(apiCode, /place_reports\?\$\{buildModerationQuery\(q\)\}/);
  const parsed = parseModerationListQuery(q(""));
  assert.equal(parsed.ok, true);
});

test("C4 인증 실패는 DB 조회 전에 종료한다", () => {
  for (const handler of ["onRequestGet", "onRequestPatch"]) {
    const start = apiCode.indexOf(`export const ${handler}`);
    assert.ok(start > 0, `${handler} 없음`);
    const body = apiCode.slice(start, start + 2600);
    const auth  = body.indexOf("checkAdminAuth");
    const creds = body.indexOf("getServiceRoleHeaders");
    const fetch_ = body.indexOf("await rest(");
    assert.ok(auth > 0, `${handler}: 인증 호출 없음`);
    assert.ok(auth < creds, `${handler}: service_role 획득이 인증보다 먼저다`);
    assert.ok(auth < fetch_, `${handler}: DB 호출이 인증보다 먼저다`);
    // 인증 결과를 즉시 반환한다 — 뒤로 흘려보내지 않는다
    assert.match(body, /const authErr = checkAdminAuth\(request, env\.ADMIN_KEY\);\s*\n\s*if \(authErr\) return authErr;/);
  }
});

// ── C5~C10 조회 조건 ────────────────────────────────────────────────────────

test("C5 status filter", () => {
  assert.equal(mustParse("status=reviewing").status, "reviewing");
  assert.match(buildModerationQuery(mustParse("status=reviewing")), /status=eq\.reviewing/);
  const bad = parseModerationListQuery(q("status=deleted_forever"));
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && bad.error, "invalid_status");
});

test("C6 category filter", () => {
  assert.equal(mustParse("category=hours_or_holiday").category, "hours_or_holiday");
  assert.match(buildModerationQuery(mustParse("category=hours_or_holiday")), /category=eq\.hours_or_holiday/);
  assert.equal(parseModerationListQuery(q("category=중국집")).ok, false);
});

test("C7 target filter — type 없이 key 만 줘도 city_spot 으로 확정된다", () => {
  const r = mustParse("target_key=1234");
  assert.equal(r.target_type, "city_spot");
  assert.equal(r.target_key, "1234");
  const built = buildModerationQuery(r);
  assert.match(built, /target_type=eq\.city_spot/);
  assert.match(built, /target_key=eq\.1234/);
  // 임의 문자열 key 는 받지 않는다
  assert.equal(parseModerationListQuery(q("target_key=drop%20table")).ok, false);
  // 공개 대상이 아닌 type 은 거부
  assert.equal(parseModerationListQuery(q("target_type=user_spot&target_key=1")).ok, false);
});

test("C8 pagination — limit·offset 이 질의에 반영된다", () => {
  const r = mustParse("limit=10&offset=30");
  assert.equal(r.limit, 10);
  assert.equal(r.offset, 30);
  const built = buildModerationQuery(r);
  assert.match(built, /limit=10/);
  assert.match(built, /offset=30/);
  // 기본값
  assert.equal(mustParse("").limit, MODERATION_PAGE_DEFAULT);
  assert.equal(mustParse("").offset, 0);
});

test("C9 page size 상한 — 무제한 dump 가 불가능하다", () => {
  for (const raw of ["limit=100000", "limit=999999999", `limit=${MODERATION_PAGE_MAX + 1}`]) {
    assert.equal(mustParse(raw).limit, MODERATION_PAGE_MAX, raw);
  }
  // 형식이 틀린 값은 조용히 고치지 않고 거부한다
  for (const raw of ["limit=-1", "limit=abc", "limit=1e9", "offset=-5"]) {
    assert.equal(parseModerationListQuery(q(raw)).ok, false, raw);
  }
  // 서버가 만든 질의에 limit 이 반드시 들어간다
  assert.match(buildModerationQuery({ limit: MODERATION_PAGE_MAX, offset: 0, sort: "newest" }), /limit=100/);
});

test("C10 정렬 newest/oldest", () => {
  assert.match(buildModerationQuery(mustParse("sort=newest")), /order=created_at\.desc/);
  assert.match(buildModerationQuery(mustParse("sort=oldest")), /order=created_at\.asc/);
  assert.equal(parseModerationListQuery(q("sort=random")).ok, false);
  assert.equal(mustParse("").sort, "newest");   // 기본은 최신순
});

// ── C11~C12 식별값 비노출 ───────────────────────────────────────────────────

test("C11 raw reporter_key 는 기본 응답에 없다", () => {
  assert.ok(!(MODERATION_FIELDS as readonly string[]).includes("reporter_key"));
  // select 를 allowlist 로만 만든다 — select=* 가 없다
  assert.match(coreCode, /export const MODERATION_SELECT = MODERATION_FIELDS\.join\(","\)/);
  assert.doesNotMatch(coreCode, /select=\*/);
  assert.doesNotMatch(apiCode, /select=\*/);
  // 응답 직전 한 번 더 거른다
  const leaked = toModerationRow({ id: 1, status: "pending", reporter_key: "a".repeat(64) });
  assert.equal("reporter_key" in leaked, false);
  assert.deepEqual(Object.keys(leaked), ["id", "status"]);
  // 집계 질의만 reporter_key 를 읽고, 나가는 것은 숫자다
  assert.match(apiCode, /select=reporter_key,category,status,created_at/);
  assert.match(apiCode, /aggregate = aggregateReports\(/);
  assert.doesNotMatch(apiCode, /reporter_key:/);
});

test("C12 device_id 는 응답에도 저장에도 없다", () => {
  for (const f of MODERATION_FORBIDDEN_FIELDS) {
    assert.ok(!(MODERATION_FIELDS as readonly string[]).includes(f), f);
  }
  assert.doesNotMatch(apiCode, /device_id/);
  // core 에서 device_id 가 나오는 곳은 "내보내면 안 되는 칸" 목록 하나뿐이다.
  // 읽거나 쓰는 코드(.device_id / device_id: / device_id =)는 없어야 한다.
  assert.doesNotMatch(coreCode, /\.device_id|device_id\s*[:=][^"]/);
  assert.equal((coreCode.match(/device_id/g) ?? []).length, 1);
  assert.match(coreCode, /MODERATION_FORBIDDEN_FIELDS = \["reporter_key", "device_id"\]/);
  const leaked = toModerationRow({ id: 1, device_id: "11111111-2222-3333-4444-555555555555" });
  assert.equal("device_id" in leaked, false);
  // 로그에도 개인 식별값이 없다
  const logCalls = apiCode.match(/log\(\{[^}]*\}\)/g) ?? [];
  assert.ok(logCalls.length > 0);
  for (const c of logCalls) {
    assert.doesNotMatch(c, /device|reporter_key|note/);
  }
});

// ── C13~C15 독립 신고자 집계 ────────────────────────────────────────────────

const row = (k: string, cat: string, st: string, at: string): {
  reporter_key: string; category: string; status: string; created_at: string;
} => ({ reporter_key: k, category: cat, status: st, created_at: at });

test("C13 집계가 정확하다", () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const a = aggregateReports([
    row("k1", "hours_or_holiday", "pending", "2026-08-07T09:00:00Z"),
    row("k2", "hours_or_holiday", "reviewing", "2026-08-06T09:00:00Z"),
    row("k3", "price_or_fee", "pending", "2026-08-01T09:00:00Z"),
  ], now);
  assert.equal(a.total_reports, 3);
  assert.equal(a.independent_reporters, 3);
  assert.equal(a.pending_reports, 2);
  assert.equal(a.recent_reports_24h, 1);
  assert.deepEqual(a.category_counts, { hours_or_holiday: 2, price_or_fee: 1 });
  assert.equal(a.latest_report_at, "2026-08-07T09:00:00.000Z");
});

test("C14 같은 사람이 반복 신고해도 독립 신고자는 1이다", () => {
  const a = aggregateReports([
    row("k1", "safety", "pending", "2026-08-07T01:00:00Z"),
    row("k1", "safety", "pending", "2026-08-07T02:00:00Z"),
    row("k1", "cleanliness", "pending", "2026-08-07T03:00:00Z"),
  ], new Date("2026-08-07T12:00:00Z"));
  assert.equal(a.total_reports, 3);          // 총 건수는 3
  assert.equal(a.independent_reporters, 1);  // 사람은 1명
  assert.notEqual(a.total_reports, a.independent_reporters);
});

test("C15 다른 사람이 신고하면 독립 신고자가 늘어난다", () => {
  const base = [row("k1", "safety", "pending", "2026-08-07T01:00:00Z")];
  assert.equal(aggregateReports(base).independent_reporters, 1);
  assert.equal(aggregateReports([...base, row("k2", "safety", "pending", "2026-08-07T02:00:00Z")])
    .independent_reporters, 2);
  assert.equal(aggregateReports([...base,
    row("k2", "safety", "pending", "2026-08-07T02:00:00Z"),
    row("k3", "safety", "pending", "2026-08-07T03:00:00Z")]).independent_reporters, 3);
});

// ── C16~C20 상태 변경 ───────────────────────────────────────────────────────

test("C16 허용된 상태 전이", () => {
  assert.equal(isAllowedTransition("pending", "reviewing"), true);
  assert.equal(isAllowedTransition("pending", "resolved_corrected"), true);
  assert.equal(isAllowedTransition("reviewing", "rejected"), true);
  assert.equal(isAllowedTransition("reviewing", "pending"), true);
  // 종결 상태는 reviewing 을 거쳐야만 되돌린다 — 다시 봤다는 기록이 남는다
  assert.equal(isAllowedTransition("resolved_hidden", "reviewing"), true);
  assert.equal(isAllowedTransition("resolved_hidden", "resolved_removed"), false);
  assert.equal(isAllowedTransition("rejected", "resolved_corrected"), false);
  assert.equal(isAllowedTransition("pending", "pending"), false);
  // 서버가 현재 상태를 읽고 판단한다 — 클라이언트가 준 from 을 믿지 않는다.
  // (알림 사건 종료 판단에 target 이 필요해 select 에 두 칸이 늘었다.
  //  현재 상태를 서버가 직접 읽는다는 계약은 그대로다.)
  assert.match(apiCode, /select=id,status,target_type,target_key&limit=1/);
  assert.match(apiCode, /isAllowedTransition\(current\.status, patch\.status\)/);
  assert.match(apiCode, /"invalid_transition", 409/);
});

test("C17 정의되지 않은 상태는 거부한다", () => {
  for (const s of ["deleted", "APPROVED", "", "resolved", "pending; drop table", null, 7]) {
    const r = validateModerationPatch({ id: "1", status: s });
    assert.equal(r.ok, false, String(s));
  }
  assert.equal(isAllowedTransition("pending", "banned"), false);
  assert.equal(isAllowedTransition("nonsense", "reviewing"), false);
});

test("C18 잘못된 report id 는 거부한다", () => {
  for (const id of ["0", "-1", "abc", "", "1 or 1=1", "1;drop", null, {}, 1.5]) {
    assert.equal(validateModerationPatch({ id, status: "reviewing" }).ok, false, String(id));
  }
  assert.equal(isValidReportId("1"), true);
  assert.equal(isValidReportId(42), true);
  // 없는 id 는 404 로 끝난다
  assert.match(apiCode, /if \(!current\) return fail\("not_found", 404\)/);
});

test("C19 resolution_note 길이 상한", () => {
  assert.equal(normalizeResolutionNote("x".repeat(RESOLUTION_NOTE_MAX_CHARS)).ok, true);
  const over = normalizeResolutionNote("x".repeat(RESOLUTION_NOTE_MAX_CHARS + 1));
  assert.equal(over.ok, false);
  assert.equal(over.ok === false && over.error, "resolution_note_too_long");
  // 공백만이면 null, 앞뒤 공백은 다듬되 내용을 조용히 자르지 않는다
  const blank = normalizeResolutionNote("   ");
  assert.equal(blank.ok && blank.note, null);
  const kept = normalizeResolutionNote("  기록  ");
  assert.equal(kept.ok && kept.note, "기록");
  assert.equal(validateModerationPatch({ id: "1", status: "reviewing", resolution_note: "y".repeat(2000) }).ok, false);
  // 본문 크기 자체도 잘린다
  assert.match(apiCode, /if \(raw\.length > MAX_BODY_BYTES\)/);
});

test("C20 DB 오류 원문이 밖으로 나가지 않는다", () => {
  // 응답에 넣는 것은 우리가 정한 코드뿐이다
  assert.match(apiCode, /return fail\("server_error", 502\)/);
  assert.doesNotMatch(apiCode, /JSON\.stringify\((updRes|listRes|curRes|aggRes)\.data\)/);
  assert.doesNotMatch(apiCode, /error:\s*(updRes|listRes|curRes|aggRes)/);
  // 로그에도 status 만 남긴다
  assert.match(apiCode, /log\(\{ status: "update_failed", httpStatus: updRes\.status \}\)/);
  assert.doesNotMatch(apiCode, /console\.log\((updRes|listRes|curRes|aggRes)/);
});

// ── C21~C25 부작용 없음 ─────────────────────────────────────────────────────

test("C21 resolved_hidden 이 city_spots 를 바꾸지 않는다", () => {
  const u = buildStatusUpdate({ id: "1", status: "resolved_hidden", resolution_note: null });
  assert.deepEqual(Object.keys(u).sort(), ["resolved_at", "status", "updated_at"]);
  assert.equal(u.status, "resolved_hidden");
  assert.ok(typeof u.resolved_at === "string");   // 종결이므로 시각이 찍힌다
  // 이 endpoint 는 place_reports 밖의 테이블을 부르지 않는다
  const tables = [...apiCode.matchAll(/rest\/v1\/\$\{|"(GET|POST|PATCH|DELETE)",\s*\n?\s*`?([a-z_]+)\?/g)];
  assert.ok(tables.length >= 0);
  assert.doesNotMatch(apiCode, /city_spots/);
  assert.doesNotMatch(coreCode, /city_spots/);
  assert.doesNotMatch(apiCode, /is_hidden|hidden\s*[:=]\s*true|visible\s*[:=]\s*false/);
});

test("C22 resolved_removed 가 DELETE 를 부르지 않는다", () => {
  const u = buildStatusUpdate({ id: "1", status: "resolved_removed", resolution_note: null });
  assert.equal(u.status, "resolved_removed");
  assert.equal("deleted" in u, false);
  assert.doesNotMatch(apiCode, /"DELETE"/);
  assert.doesNotMatch(coreCode, /"DELETE"/);
  // 비종결 상태로 되돌리면 resolved_at 이 지워진다
  const back = buildStatusUpdate({ id: "1", status: "reviewing", resolution_note: null });
  assert.equal(back.resolved_at, null);
  assert.equal(isTerminalStatus("reviewing"), false);
  assert.equal(isTerminalStatus("resolved_removed"), true);
});

test("C23 moderation 이 AI·scheduler 를 건드리지 않는다", () => {
  for (const src of [apiCode, coreCode]) {
    assert.doesNotMatch(src, /scheduler|runScheduler|adjusted_score|profileBias|PROFILE_MAX_BONUS/i);
    assert.doesNotMatch(src, /gemini|personaliz|AI_PERSONALIZATION/i);
  }
  // 스케줄러 쪽에서도 신고를 읽지 않는다
  const engine = readFileSync("src/lib/scheduler/engine.ts", "utf8");
  assert.doesNotMatch(code(engine), /place_reports|report_count|reporter_key/);
});

test("C24 moderation 이 Like 를 바꾸지 않는다", () => {
  for (const src of [apiCode, coreCode]) {
    assert.doesNotMatch(src, /place_likes|liker_key|likeState/);
  }
  // Like 수와 신고 수를 합치는 식이 어디에도 없다
  for (const src of [apiCode, coreCode]) {
    assert.doesNotMatch(src, /like[_ ]?count\s*[-+]|net[_ ]?score|popularity/i);
  }
});

test("C25 moderation 이 Saved 를 바꾸지 않는다", () => {
  for (const src of [apiCode, coreCode]) {
    assert.doesNotMatch(src, /favorites|toggleFavorite|cacheSavedSpot|localStorage/);
  }
});

test("C26 공개 신고 endpoint 로 moderation 데이터를 읽을 수 없다", () => {
  const publicApi = code(readFileSync("functions/api/place-report.ts", "utf8"));
  // 공개 경로에는 GET 목록이 없다 — POST 접수만 있다
  assert.doesNotMatch(publicApi, /export (const|async function) onRequestGet/);
  assert.match(publicApi, /onRequestPost/);
  // 공개 응답은 "접수됨" 뿐이다
  assert.match(publicApi, /acceptedResponse\(\)/);
  assert.doesNotMatch(publicApi, /reporter_key\s*[,}]/);
  assert.doesNotMatch(publicApi, /MODERATION_|report_moderation/);
  // moderation 은 관리자 경로에만 있다
  assert.ok(API.length > 0);
  assert.match(apiCode, /from "\.\.\/\.\.\/_lib\/admin-auth"/);
});

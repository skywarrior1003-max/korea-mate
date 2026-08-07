// 장소 제보 계약 고정.
//
// 이 테스트가 지키는 것은 기능이 아니라 **판단의 경계**다.
//   신고는 접수 시점에 사실이 아니다. 그래서
//     · 공개하지 않고
//     · 신고자를 드러내지 않고
//     · 한 건으로 장소를 숨기거나 점수를 깎지 않고
//     · 한 사람의 반복을 여러 명으로 세지 않는다.
//   Like(긍정)와 Report(품질 위험)는 서로 다른 축이라 한 점수로 합치지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REPORT_TARGET_TYPES, REPORT_CATEGORIES, REPORT_STATUSES,
  OBJECTIVE_CATEGORIES, EXPERIENCE_CATEGORIES,
  NOTE_MAX_CHARS, INITIAL_REPORT_STATUS, DUPLICATE_WINDOW_MS, RATE_MAX,
  isValidTargetType, isValidTargetKey, isValidCategory, isObjectiveCategory,
  normalizeNote, isValidDeviceId, reporterKey, reporterKeyInput,
  validateReportRequest, acceptedResponse, countIndependentReporters,
} from "./place-report-core.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DEV = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const body = (over: Record<string, unknown> = {}) =>
  ({ target_type: "city_spot", target_key: "99", category: "hours_or_holiday", ...over });

// ── R1~R5 · R21 · R24 ───────────────────────────────────────────────────────

test("★R1 공개 장소 신고는 통과한다", () => {
  const r = validateReportRequest(body(), DEV);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.value, {
      target_type: "city_spot", target_key: "99",
      category: "hours_or_holiday", note: null, device_id: DEV,
    });
  }
});

test("★R2·R3 잘못된 대상은 거부한다", () => {
  for (const t of [{ target_type: "restaurant" }, { target_type: "" }, { target_type: 1 }]) {
    const r = validateReportRequest(body(t), DEV);
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, "invalid_target");
  }
  // city_spots PK 는 숫자다. 임의 문자열 키를 받지 않는다.
  for (const k of ["abc", "1; drop", "", "  ", "-1", "1".repeat(20)]) {
    const r = validateReportRequest(body({ target_key: k }), DEV);
    assert.equal(r.ok, false, k);
  }
  assert.equal(isValidTargetKey("city_spot", "412"), true);
});

test("★R4 private/비공개 entity 는 신고 대상이 아니다", () => {
  assert.deepEqual([...REPORT_TARGET_TYPES], ["city_spot"]);
  assert.equal(isValidTargetType("user_spot"), false);
  assert.equal(isValidTargetType("itinerary"), false);
  assert.equal(isValidTargetType("trip_moment"), false);
  // My Places 는 다른 사람이 보는 공개 관광정보가 아니다
  assert.equal(validateReportRequest(body({ target_type: "user_spot" }), DEV).ok, false);
});

test("★R5·R24 사유는 allowlist 로만 받는다", () => {
  assert.equal(REPORT_CATEGORIES.length, 15);
  assert.equal(OBJECTIVE_CATEGORIES.length + EXPERIENCE_CATEGORIES.length + 1, REPORT_CATEGORIES.length);
  for (const c of REPORT_CATEGORIES) assert.equal(isValidCategory(c), true, c);
  for (const c of ["", "spam", "<script>", "OTHER", null, 7]) {
    assert.equal(isValidCategory(c as never), false, String(c));
  }
  // 확인 가능한 사실 축과 주관 축을 구분해 둔다
  assert.equal(isObjectiveCategory("hours_or_holiday"), true);
  assert.equal(isObjectiveCategory("overcharge_suspected"), false);
  assert.equal(isObjectiveCategory("staff_service"), false);
});

test("★R21 지원하는 공개 target type 전체", () => {
  for (const t of REPORT_TARGET_TYPES) {
    assert.equal(validateReportRequest(body({ target_type: t }), DEV).ok, true, t);
  }
});

// ── R6·R7 자유 입력 ─────────────────────────────────────────────────────────

test("★R6 자유 입력 길이 상한 — 조용히 자르지 않고 거부한다", () => {
  assert.equal(NOTE_MAX_CHARS, 500);
  const long = "가".repeat(NOTE_MAX_CHARS + 1);
  const r = normalizeNote(long);
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, "note_too_long");
  assert.equal(normalizeNote("가".repeat(NOTE_MAX_CHARS)).ok, true);
  const v = validateReportRequest(body({ note: long }), DEV);
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.error, "note_too_long");
});

test("★R7 빈 자유 입력은 null 로 정규화된다", () => {
  for (const v of ["", "   ", "\n\t ", undefined, null, 42]) {
    const r = normalizeNote(v);
    assert.equal(r.ok, true); if (r.ok) assert.equal(r.note, null, JSON.stringify(v));
  }
  const r = normalizeNote("  운영시간이 달라요  ");
  assert.equal(r.ok, true); if (r.ok) assert.equal(r.note, "운영시간이 달라요");
});

// ── R8~R10 중복·독립 신고자 ─────────────────────────────────────────────────

test("★R8 중복 방지 창이 정의돼 있다", () => {
  assert.equal(DUPLICATE_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.ok(RATE_MAX > 0 && RATE_MAX <= 20);
  // 서버가 실제로 그 창으로 조회한다
  const fn = code("functions", "api", "place-report.ts");
  assert.match(fn, /DUPLICATE_WINDOW_MS/);
  // 방어는 두 겹이다 — 서버 창 조회와 DB 유니크. 둘 다 있어야 한다.
  assert.equal((fn.match(/fail\("duplicate_recent", 409\)/g) ?? []).length, 2,
    "중복 방어가 서버·DB 두 곳에 모두 있어야 한다");
  assert.match(fn, /created_at=gte\./);
  assert.match(fn, /23505/);
  assert.match(read("supabase", "migrations", "042_place_reports.sql"),
    /create unique index if not exists uq_place_reports_reporter_target_category/);
});

test("★R9 한 사람의 반복은 여러 명으로 세지 않는다", () => {
  const rows = [{ reporter_key: "a" }, { reporter_key: "a" }, { reporter_key: "a" }];
  assert.equal(rows.length, 3);
  assert.equal(countIndependentReporters(rows), 1);
});

test("★R10 서로 다른 사람은 각각 센다", () => {
  assert.equal(countIndependentReporters(
    [{ reporter_key: "a" }, { reporter_key: "b" }, { reporter_key: "a" }]), 2);
});

// ── R11~R14 다른 시스템을 건드리지 않는다 ───────────────────────────────────

test("★R11·R12 신고가 장소를 숨기거나 점수를 바꾸지 않는다", () => {
  const core = code("src", "lib", "reports", "place-report-core.ts");
  const fn   = code("functions", "api", "place-report.ts");
  for (const s of [core, fn]) {
    assert.doesNotMatch(s, /city_spots[^\n]*(update|delete|patch)/i);
    assert.doesNotMatch(s, /is_hidden|hide|visible\s*=|score|profileBias|adjusted_score/i);
  }
  // 스케줄러·AI 쪽에서 신고를 참조하지 않는다
  assert.doesNotMatch(read("src", "lib", "scheduler", "engine.ts"), /place_report|report/i);
  assert.doesNotMatch(read("src", "lib", "scheduler", "profile-bias.ts"), /place_report|report/i);
});

test("★R13·R14 Like 와 Report 는 서로를 바꾸지 않는다", () => {
  const fn = code("functions", "api", "place-report.ts");
  assert.doesNotMatch(fn, /spot_reactions|like/i);
  const reactions = code("functions", "api", "spots", "reactions.ts");
  assert.doesNotMatch(reactions, /place_report/i);
});

test("★R23 Like ≠ Report — 하나의 점수로 합치지 않는다", () => {
  const core = code("src", "lib", "reports", "place-report-core.ts");
  // 긍정 신호에서 신고 수를 빼는 계산이 어디에도 없다
  assert.doesNotMatch(core, /like[^\n]*-[^\n]*report|report[^\n]*-[^\n]*like/i);
  assert.doesNotMatch(core, /popularity|net_score|combined/i);
});

test("★R22 Save ≠ Like — Saved 는 여전히 개인 북마크다", () => {
  const fav = code("src", "lib", "favorites.ts");
  assert.doesNotMatch(fav, /place_report|reaction/i);
  // 제보 경로가 Saved 저장소를 건드리지 않는다
  assert.doesNotMatch(code("src", "components", "PlaceReportModal.tsx"),
    /koreamate_favorites|toggleFavorite|cacheSavedSpot/);
});

// ── R15~R19 보안·개인정보 ───────────────────────────────────────────────────

test("★R15 raw 신고 row 에 public 읽기를 주지 않는다", () => {
  const m = read("supabase", "migrations", "042_place_reports.sql");
  assert.match(m, /enable row level security/i);
  assert.match(m, /revoke all on public\.place_reports from anon/i);
  assert.match(m, /revoke all on public\.place_reports from authenticated/i);
  assert.match(m, /revoke all on public\.place_reports from public/i);
  // 정책을 만들지 않는다 = anon/authenticated 는 아무것도 못 한다
  assert.doesNotMatch(m, /create policy/i);
  assert.doesNotMatch(m, /grant (select|insert|update|delete)[^\n]*to (anon|authenticated|public)/i);
});

test("★R16 브라우저가 DB 에 직접 쓰지 않는다", () => {
  const modal = code("src", "components", "PlaceReportModal.tsx");
  assert.doesNotMatch(modal, /supabase|createClient|rest\/v1|SERVICE_ROLE/i);
  assert.match(modal, /fetch\("\/api\/place-report"/);
  // 서버만 service_role 을 쓴다
  assert.match(code("functions", "api", "place-report.ts"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("★R17 DB 오류 원문을 사용자에게 주지 않는다", () => {
  const fn = code("functions", "api", "place-report.ts");
  // 응답에 나가는 값은 안정적인 code 뿐이다
  assert.match(fn, /json\(\{ success: false, error \}, status\)/);
  // DB 응답 본문·에러 메시지를 사용자 응답에 싣지 않는다
  assert.doesNotMatch(fn, /json\([^)]*ins\.data|json\([^)]*\.message/);
  assert.doesNotMatch(fn, /fail\([^)]*ins\.|fail\([^)]*error\.message/);
});

test("★R18 신고자 식별값을 응답·로그에 넣지 않는다", () => {
  assert.deepEqual(acceptedResponse(), { success: true, status: "received" });
  const fn = code("functions", "api", "place-report.ts");
  assert.doesNotMatch(fn, /log\(\{[^}]*(deviceId|device_id|rkey|reporter_key)/);
  // 응답 본문을 만드는 자리에 신고자 값이 섞이지 않는다
  assert.doesNotMatch(fn, /return json\([\s\S]{0,120}?(rkey|reporter_key|deviceId)/);
  assert.match(fn, /return json\(acceptedResponse\(\), 201\)/);
  // 성공 응답 형태 자체가 고정돼 있다
  assert.deepEqual(Object.keys(acceptedResponse()).sort(), ["status", "success"]);
});

test("★R19 자유 입력은 공개 렌더링 경로가 없다", () => {
  // note 를 화면에 그리는 코드가 저장소 어디에도 없다
  const modal = read("src", "components", "PlaceReportModal.tsx");
  assert.doesNotMatch(modal, /dangerouslySetInnerHTML/);
  const core = code("src", "lib", "reports", "place-report-core.ts");
  // 순수 모듈에 렌더링 경로가 없다 (제네릭 타입 표기는 렌더링이 아니다)
  assert.doesNotMatch(core, /innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(core, /return\s*\(?\s*</);
  // note 가 나타나는 자리는 사용자 자신의 입력창 하나뿐이다.
  // 남의 신고 내용을 그리는 자리가 없다는 뜻이다.
  const bindings = [...modal.matchAll(/\{\s*note\s*\}/g)];
  assert.equal(bindings.length, 1, "note 바인딩이 입력창 말고 더 있다");
  assert.match(modal, /value=\{note\}/);
  assert.doesNotMatch(modal, /<p[^>]*>\s*\{note\}|<span[^>]*>\s*\{note\}/);
});

test("★신고자 키는 가명이고 대상마다 달라 행적을 이을 수 없다", async () => {
  assert.equal(isValidDeviceId(DEV), true);
  for (const d of ["", "abc", "3f2a1b4c5d6e4f708a9b0c1d2e3f4a5b", null]) {
    assert.equal(isValidDeviceId(d as never), false, String(d));
  }
  const k1 = await reporterKey(DEV, "city_spot", "99");
  const k2 = await reporterKey(DEV, "city_spot", "100");
  const k3 = await reporterKey(DEV, "city_spot", "99");
  assert.equal(k1.length, 64);
  assert.equal(k1, k3, "같은 대상에서는 안정적이어야 중복 방지가 된다");
  assert.notEqual(k1, k2, "대상이 다르면 값도 달라야 행적을 못 잇는다");
  assert.doesNotMatch(k1, /-/);                       // raw UUID 가 아니다
  assert.ok(!k1.includes(DEV.slice(0, 8)));
  assert.match(reporterKeyInput(DEV, "city_spot", "99"), /^3f2a1b4c.*\|city_spot:99$/);
});

// ── R20 UI 계약 ─────────────────────────────────────────────────────────────

test("★R20 모달은 모바일 우선이고 연타를 막는다", () => {
  const m = read("src", "components", "PlaceReportModal.tsx");
  assert.match(m, /items-end sm:items-center/);        // 모바일 bottom sheet
  assert.match(m, /max-h-\[88vh\] overflow-y-auto/);   // 넘치면 모달 안에서 스크롤
  assert.match(m, /min-h-11|min-h-12/);                // 터치 타깃
  assert.match(m, /disabled=\{!category \|\| phase === "sending"\}/);
  assert.match(m, /if \(!category \|\| phase === "sending"\) return;/);
  assert.match(m, /role="dialog"/);
  assert.match(m, /aria-modal="true"/);
  assert.match(m, /e\.key === "Escape"/);
  // 사진 업로드는 V1 범위 밖
  assert.doesNotMatch(m, /type="file"|FormData/);
});

// ── moderation 계약 ─────────────────────────────────────────────────────────

test("★moderation 상태 — 접수는 사실 확정이 아니다", () => {
  assert.equal(INITIAL_REPORT_STATUS, "pending");
  for (const s of ["pending", "reviewing", "resolved_corrected", "resolved_no_change",
                   "resolved_hidden", "resolved_removed", "rejected", "duplicate"]) {
    assert.ok((REPORT_STATUSES as readonly string[]).includes(s), s);
  }
  const m = read("supabase", "migrations", "042_place_reports.sql");
  for (const s of REPORT_STATUSES) assert.ok(m.includes(`'${s}'`), s);
  assert.match(m, /default 'pending'/);
});

test("★migration 은 파괴적이지 않다", () => {
  const m = read("supabase", "migrations", "042_place_reports.sql");
  assert.match(m, /create table if not exists public\.place_reports/);
  assert.doesNotMatch(m, /drop table (?!if exists public\.place_reports)/i);
  assert.doesNotMatch(m, /\balter table public\.city_spots\b/i);
  assert.doesNotMatch(m, /\bdelete from\b|\btruncate\b/i);
  // 재실행 안전
  for (const p of [/create table if not exists/, /create index if not exists/,
                   /create unique index if not exists/]) assert.match(m, p);
  // 사유·상태·길이를 DB 에서도 강제한다
  assert.match(m, /place_reports_category_chk/);
  assert.match(m, /place_reports_target_type_chk/);
  assert.match(m, /char_length\(note\) <= 500/);
  assert.match(m, /uq_place_reports_reporter_target_category/);
});

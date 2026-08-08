// 관리자 알림 — 계약·보안 테스트 (R1~R15 · L1~L11 · E1~E10)
//
// 여기서 지키는 것
//   1. 알릴 만할 때만 알리고, 같은 것을 두 번 알리지 않는다.
//   2. 몇 달 뒤 새 문제는 다시 알릴 수 있다.
//   3. 메일이 실패해도 사용자의 신고·좋아요는 성공한 채로 남는다.
//   4. 알림은 확인 요청일 뿐 아무것도 바꾸지 않는다.
//
// 실제 메일·DB 를 부르지 않는다. 순수 로직은 직접 호출하고, 서버 계약은
// 소스 텍스트로 고정한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  activeReports, distinctReporters, anchorReportId, hasActiveReports,
  reportNotificationCandidates, likeNotificationCandidates,
  buildReportEmail, isImmediateSingleCategory, isActiveReportStatus,
  ACTIVE_REPORT_STATUSES, REPORT_MILESTONES, LIKE_MILESTONES,
  CLOSED_REPORT_MIN_REPORTERS, EMAIL_FORBIDDEN_FIELDS,
  EVENT_REPORT_THRESHOLD, EVENT_REPORT_SAFETY, EVENT_LIKE_MILESTONE,
  EVENT_PUBLIC_PLACE_SUBMISSION, DELIVERY_IMMEDIATE, DELIVERY_DIGEST,
  type ReportRow,
} from "./admin-notification-core.ts";

const read = (p: string) => readFileSync(p, "utf8");
/** 주석을 걷어낸 실제 코드. 설명문이 검사에 걸리지 않게 한다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const CORE   = read("src/lib/notifications/admin-notification-core.ts");
const NOTIFY = read("functions/_lib/admin-notify.ts");
const MAIL   = read("functions/_lib/admin-email.ts");
const REPORT = read("functions/api/place-report.ts");
const LIKE   = read("functions/api/place-like.ts");
const CONTACT= read("functions/api/contact.ts");
const SQL    = read("supabase/migrations/044_admin_notification_events.sql");

const coreCode   = code(CORE);
const notifyCode = code(NOTIFY);
const mailCode   = code(MAIL);
const reportCode = code(REPORT);
const likeCode   = code(LIKE);
const sqlCode    = SQL.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

let seq = 0;
const row = (
  reporter: string, category = "hours_or_holiday", status = "pending", id?: number,
): ReportRow => ({
  id: id ?? ++seq, reporter_key: reporter, category, status,
  created_at: "2026-08-08T00:00:00Z",
});

const milestones = (cs: { milestone_key: string }[]) => cs.map(c => c.milestone_key).sort();

/** 사건 id 는 DB 가 준다. 여기서는 고정값 하나면 충분하다. */
const INC = 7001;

// ── R1~R5 일반 임계 ─────────────────────────────────────────────────────────

test("R1 신고자 1명이면 알리지 않는다", () => {
  const c = reportNotificationCandidates("1", [row("a")], INC);
  assert.deepEqual(c, []);
});

test("R2 서로 다른 2명이면 알린다", () => {
  const c = reportNotificationCandidates("1", [row("a"), row("b")], INC);
  assert.deepEqual(milestones(c), ["threshold:2"]);
  assert.equal(c[0].event_type, EVENT_REPORT_THRESHOLD);
  assert.equal(c[0].delivery_mode, DELIVERY_IMMEDIATE);
  assert.equal(c[0].metric_value, 2);
});

test("R3 같은 단계는 반복해서 만들지 않는다 — DB 가 막는다", () => {
  // 3명·4명이어도 새로 생기는 단계는 threshold:2 하나뿐이고,
  // 그 하나는 이미 예약돼 있으므로 UNIQUE 가 두 번째를 거부한다.
  for (const n of [2, 3, 4]) {
    const rows = Array.from({ length: n }, (_, i) => row(`r${i}`));
    assert.deepEqual(milestones(reportNotificationCandidates("1", rows, INC)), ["threshold:2"], `${n}명`);
  }
  assert.match(sqlCode, /create unique index if not exists uq_ane_report_event/);
  assert.match(sqlCode, /\(event_type, target_type, target_key, incident_id, milestone_key\)/);
});

test("R4 5명이 되면 단계가 하나 늘어난다", () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(`r${i}`));
  assert.deepEqual(milestones(reportNotificationCandidates("1", rows, INC)), ["threshold:2", "threshold:5"]);
});

test("R5 10명이 되면 또 하나 늘어난다", () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`));
  assert.deepEqual(milestones(reportNotificationCandidates("1", rows, INC)),
                   ["threshold:10", "threshold:2", "threshold:5"]);
  assert.deepEqual([...REPORT_MILESTONES], [2, 5, 10]);
});

test("R6 같은 사람이 반복 신고해도 사람 수는 늘지 않는다", () => {
  const rows = [row("a"), row("a"), row("a"), row("a"), row("a")];
  assert.equal(distinctReporters(rows), 1);
  assert.deepEqual(reportNotificationCandidates("1", rows, INC), []);
  // 총 건수로 세는 코드가 어디에도 없다
  assert.match(coreCode, /new Set\(rows\.map\(r => r\.reporter_key\)\)\.size/);
  assert.doesNotMatch(coreCode, /rows\.length >= m|act\.length >= m/);
});

// ── R7~R10 사유별 ───────────────────────────────────────────────────────────

test("R7 safety 는 첫 1건부터 알린다", () => {
  const c = reportNotificationCandidates("1", [row("a", "safety")], INC);
  assert.deepEqual(milestones(c), ["safety:1"]);
  assert.equal(c[0].event_type, EVENT_REPORT_SAFETY);
  assert.equal(c[0].delivery_mode, DELIVERY_IMMEDIATE);
  assert.equal(isImmediateSingleCategory("safety"), true);
  assert.equal(isImmediateSingleCategory("cleanliness"), false);
});

test("R8 같은 사건 안에서 safety 를 반복해도 단계는 하나다", () => {
  const c = reportNotificationCandidates("1", [
    row("a", "safety", "pending", 100), row("b", "safety", "pending", 101),
  ], INC);
  const safety = c.filter(x => x.event_type === EVENT_REPORT_SAFETY);
  assert.equal(safety.length, 1);
  assert.equal(safety[0].milestone_key, "safety:1");
  // 사건 id 가 같으므로 두 번째 예약은 DB 가 거부한다
  assert.equal(safety[0].incident_id, INC);
});

test("R9 폐업 신고 1명만으로는 알리지 않는다", () => {
  assert.deepEqual(reportNotificationCandidates("1", [row("a", "closed_or_unavailable")], INC), []);
  assert.equal(CLOSED_REPORT_MIN_REPORTERS, 2);
});

test("R10 폐업 신고가 2명이면 알린다", () => {
  const c = reportNotificationCandidates("1", [
    row("a", "closed_or_unavailable"), row("b", "closed_or_unavailable"),
  ], INC);
  assert.deepEqual(milestones(c), ["threshold:2"]);
});

// ── R11~R12 사건이 끝나면 다시 알릴 수 있다 ─────────────────────────────────

test("R11 열려 있는 신고가 모두 종결되면 사건이 끝난다", () => {
  const closed = [
    row("a", "safety", "resolved_corrected", 100),
    row("b", "safety", "rejected", 101),
    row("c", "safety", "duplicate", 102),
  ];
  assert.deepEqual(activeReports(closed), []);
  assert.equal(hasActiveReports(closed), false);
  assert.equal(anchorReportId(closed), null);
  assert.deepEqual(reportNotificationCandidates("1", closed, INC), []);
  assert.deepEqual([...ACTIVE_REPORT_STATUSES], ["pending", "reviewing"]);
  assert.equal(isActiveReportStatus("resolved_hidden"), false);
  assert.equal(isActiveReportStatus("reviewing"), true);
});

test("R12 새 사건이 열리면 같은 단계를 다시 쓸 수 있다", () => {
  const old = [
    row("a", "hours_or_holiday", "resolved_corrected", 100),
    row("b", "hours_or_holiday", "resolved_corrected", 101),
  ];
  // 몇 달 뒤 새 신고 두 건
  const now = [...old, row("c", "hours_or_holiday", "pending", 500),
                       row("d", "hours_or_holiday", "pending", 501)];
  // 새 사건이므로 DB 가 새 id 를 준다
  const NEW_INC = 7002;
  const c = reportNotificationCandidates("1", now, NEW_INC);
  assert.deepEqual(milestones(c), ["threshold:2"]);
  assert.equal(c[0].incident_id, NEW_INC);
  assert.notEqual(c[0].incident_id, INC);
  // 신고용 UNIQUE 에 incident_id 가 들어 있어 새 사건에서는 다시 쓸 수 있다
  assert.match(sqlCode, /uq_ane_report_event[\s\S]{0,200}\(event_type, target_type, target_key, incident_id, milestone_key\)[\s\S]{0,60}where incident_id is not null/);
});

// ── R13~R15 동시성·실패·프라이버시 ──────────────────────────────────────────

test("R13 동시에 임계를 넘겨도 발송은 한 번이다 — 먼저 자리를 잡은 쪽만", () => {
  // 세고 나서 보내고 나중에 기록하는 구조가 아니다.
  assert.match(notifyCode, /const r = await reserve\(env, base, h, c\);\s*\n\s*if \(!r\.reserved\) continue;/);
  const reserveIdx = notifyCode.indexOf("const r = await reserve(");
  const sendIdx    = notifyCode.indexOf("await sendAdminEmail(env, mail)");
  assert.ok(reserveIdx > 0 && sendIdx > reserveIdx, "예약보다 발송이 먼저다");
  // 중복은 오류가 아니다
  assert.match(notifyCode, /if \(res\.status === 409\) return \{ reserved: false/);
  assert.match(notifyCode, /"23505"/);
});

test("R14 메일이 실패해도 신고 접수는 성공한다", () => {
  // 알림은 응답을 만든 뒤가 아니라, 응답을 붙잡지 않는 자리에서 돈다
  assert.match(reportCode, /if \(ctx\.waitUntil\) ctx\.waitUntil\(notify\); else void notify;/);
  assert.match(reportCode, /return json\(acceptedResponse\(\), 201\);/);
  const notifyIdx = reportCode.indexOf("const notify = (async () =>");
  const insertIdx = reportCode.indexOf('rest(env, "POST", "place_reports"');
  assert.ok(insertIdx > 0 && notifyIdx > insertIdx, "저장보다 알림이 먼저다");
  // 알림 경로의 예외를 삼킨다
  assert.match(reportCode, /catch \{\s*\n[\s\S]{0,120}notify_failed/);
  // helper 도 던지지 않는다
  assert.doesNotMatch(mailCode, /throw /);
  assert.match(mailCode, /return \{ ok: false, reason: "provider_error", status: res\.status \}/);
});

test("R15 응답·메일에 신고자 식별값이 없다", () => {
  const mail = buildReportEmail({
    targetKey: "42", placeName: "Haeundae Beach", city: "busan",
    reporters: 3, milestoneKey: "threshold:2",
    categories: ["safety", "cleanliness"], occurredAt: "2026-08-08T00:00:00Z",
    adminPath: "https://gokoreamate.com/korea-mate-admin",
  });
  const whole = mail.subject + "\n" + mail.text;
  for (const f of EMAIL_FORBIDDEN_FIELDS) assert.equal(whole.includes(f), false, f);
  assert.doesNotMatch(whole, /[0-9a-f]{64}/);          // 해시가 통째로 들어가지 않는다
  assert.ok(whole.includes("Haeundae Beach"));
  assert.ok(whole.includes("3명"));
  // 단정하는 말을 쓰지 않는다 — 접수 시점의 신고는 사실이 아니다
  assert.doesNotMatch(whole, /사기|위험한 곳|바가지|폐업 확정|불량 업소/);
  assert.ok(whole.includes("확인 요청"));
  // 신고 API 응답에 알림 내부 정보가 없다
  assert.doesNotMatch(reportCode, /notification_id|event_id|ADMIN_NOTIFICATION_EMAIL/);
});

// ── L1~L11 좋아요 ───────────────────────────────────────────────────────────

test("L1 좋아요 1건은 아무것도 만들지 않는다", () => {
  assert.deepEqual(likeNotificationCandidates("1", 1), []);
  for (const n of [0, 1, 2, 3, 4]) assert.deepEqual(likeNotificationCandidates("1", n), [], String(n));
});

test("L2 5개가 되면 요약 후보 1건 — 메일은 보내지 않는다", () => {
  const c = likeNotificationCandidates("1", 5);
  assert.deepEqual(milestones(c), ["like:5"]);
  assert.equal(c[0].event_type, EVENT_LIKE_MILESTONE);
  assert.equal(c[0].delivery_mode, DELIVERY_DIGEST);
  // 좋아요 경로는 메일 helper 를 부르지 않는다
  assert.doesNotMatch(likeCode, /sendAdminEmail|admin-email/);
  assert.match(notifyCode, /export async function reserveLikeMilestones/);
  const fn = notifyCode.slice(notifyCode.indexOf("export async function reserveLikeMilestones"));
  assert.doesNotMatch(fn, /sendAdminEmail/);
});

test("L3 10개가 되면 후보가 하나 더 생긴다", () => {
  assert.deepEqual(milestones(likeNotificationCandidates("1", 10)), ["like:10", "like:5"]);
});

test("L4 25·50·100 도 같은 방식이다", () => {
  assert.deepEqual([...LIKE_MILESTONES], [5, 10, 25, 50, 100]);
  assert.equal(likeNotificationCandidates("1", 25).length, 3);
  assert.equal(likeNotificationCandidates("1", 50).length, 4);
  assert.equal(likeNotificationCandidates("1", 100).length, 5);
  assert.equal(likeNotificationCandidates("1", 999).length, 5);   // 그 위는 없다
});

test("L5 취소는 아무것도 만들지 않는다", () => {
  assert.match(likeCode, /if \(r\.action === "like"\) \{/);
  // 호출 지점은 정확히 하나이고, 그 하나가 like 분기 안에 있다.
  // (import 줄은 세지 않는다 — 호출 형태로만 본다.)
  assert.equal((likeCode.match(/reserveLikeMilestones\(/g) ?? []).length, 1);
  const gate = likeCode.indexOf('if (r.action === "like") {');
  const call = likeCode.indexOf("reserveLikeMilestones(ctx.env");
  assert.ok(gate > 0 && call > gate, "알림 호출이 like 분기 밖에 있다");
  // unlike 는 count 만 다시 세고 끝난다
  assert.match(likeCode, /const del = await rest\(env, "DELETE"/);
});

test("L6 5→4→5 로 오가도 like:5 는 한 번뿐이다", () => {
  // 후보 자체는 매번 같은 이름으로 나온다. 두 번째는 DB 가 거부한다.
  const a = likeNotificationCandidates("1", 5);
  const b = likeNotificationCandidates("1", 5);
  assert.deepEqual(milestones(a), milestones(b));
  assert.equal(a[0].incident_id, null);   // 사건 개념 없음 = 평생 한 번
  assert.match(coreCode, /incident_id:\s*null,/);
});

test("L7 10→9→10 도 마찬가지다", () => {
  const c = likeNotificationCandidates("1", 10).find(x => x.milestone_key === "like:10");
  assert.ok(c);
  assert.equal(c.incident_id, null);
  // 좋아요 전용 partial unique 가 (event_type, target, milestone) 을 평생 하나로 묶는다.
  // Postgres 에서 NULL 은 서로 같지 않으므로 incident_id 를 포함한 열쇠로는
  // 좋아요 중복을 막을 수 없다. 그래서 조건을 나눴다.
  assert.match(sqlCode, /uq_ane_like_event[\s\S]{0,200}\(event_type, target_type, target_key, milestone_key\)[\s\S]{0,60}where incident_id is null/);
});

test("L8 동시에 같은 단계를 넘겨도 후보는 하나만 남는다", () => {
  assert.match(notifyCode, /export async function reserveLikeMilestones/);
  const fn = notifyCode.slice(notifyCode.indexOf("export async function reserveLikeMilestones"));
  assert.match(fn, /const r = await reserve\(env, base, h, c\)/);
  assert.match(sqlCode, /create unique index if not exists uq_ane_like_event/);
});

test("L9·L10·L11 알림이 Saved·Report·AI 를 바꾸지 않는다", () => {
  // Saved 는 기기 로컬 신호다. 좋아요 수에 섞이면 "몇 명이 좋다고 했나" 가
  // 무슨 뜻인지 아무도 말할 수 없게 된다. 인자 자체를 두 개로 고정한다.
  assert.equal(likeNotificationCandidates.length, 2);
  assert.match(coreCode, /likeNotificationCandidates\(\s+targetKey: string, count: number,\s+\)/);
  assert.doesNotMatch(coreCode, /saved|favorite/i);
  assert.doesNotMatch(notifyCode, /saved|favorite/i);
  for (const src of [coreCode, notifyCode, mailCode]) {
    assert.doesNotMatch(src, /favorites|toggleFavorite|localStorage/);
    assert.doesNotMatch(src, /scheduler|profileBias|adjusted_score|gemini|personaliz/i);
  }
  // 신고 상태를 자동으로 바꾸지 않는다
  assert.doesNotMatch(notifyCode, /resolved_|"PATCH",\s*`\$\{base\}\/rest\/v1\/place_reports/);
  // 장소를 숨기거나 지우지 않는다
  assert.doesNotMatch(notifyCode, /"DELETE"/);
  assert.doesNotMatch(notifyCode, /is_hidden/);
  // city_spots 는 이름·도시를 읽기만 한다
  const cityUses = notifyCode.match(/city_spots[^\n]*/g) ?? [];
  assert.equal(cityUses.length, 1);
  assert.match(cityUses[0], /select=name,city&limit=1/);
  // Like 와 Report 를 한 점수로 합치지 않는다
  for (const src of [coreCode, notifyCode]) {
    assert.doesNotMatch(src, /netScore|net_score|popularity|like[_ ]?-[_ ]?report/i);
  }
});

// ── E1~E10 메일 helper ──────────────────────────────────────────────────────

test("E1 contact 기존 발송 계약이 그대로다", () => {
  const c = code(CONTACT);
  assert.match(c, /waitUntil\(\s*\n?\s*sendAdminEmail\(env, \{/);   // 여전히 비차단
  assert.match(c, /return json\(\{ success: true \}\)/);
  assert.match(c, /\[gokoreamate Inquiry\]/);                       // 제목 형식 유지
});

test("E2 알림과 contact 가 같은 helper 를 쓴다", () => {
  assert.match(code(CONTACT), /import \{ sendAdminEmail as sendViaResend \} from "\.\.\/_lib\/admin-email"/);
  assert.match(notifyCode, /import \{ sendAdminEmail \} from "\.\/admin-email"/);
});

test("E3 provider 호출이 한 곳뿐이다", () => {
  const hits: string[] = [];
  for (const [name, src] of [["admin-email", mailCode], ["admin-notify", notifyCode],
                             ["contact", code(CONTACT)], ["place-report", reportCode],
                             ["place-like", likeCode]] as [string, string][]) {
    if (src.includes("api.resend.com")) hits.push(name);
  }
  assert.deepEqual(hits, ["admin-email"]);
  assert.equal((mailCode.match(/api\.resend\.com/g) ?? []).length, 1);
  // SDK 를 추가하지 않았다
  const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
  assert.equal("resend" in (pkg.dependencies ?? {}), false);
});

test("E4·E5 secret 과 수신자가 서버에만 있다", () => {
  assert.match(mailCode, /env\.RESEND_API_KEY/);
  assert.match(mailCode, /env\.ADMIN_NOTIFICATION_EMAIL/);
  for (const src of [mailCode, notifyCode, coreCode]) {
    assert.doesNotMatch(src, /NEXT_PUBLIC_RESEND|NEXT_PUBLIC_ADMIN/);
  }
  // 순수 로직 쪽은 secret 을 읽지 않는다.
  // core 에 RESEND_API_KEY 가 보이는 곳은 "메일에 넣으면 안 되는 것" 목록 하나뿐이다.
  assert.doesNotMatch(coreCode, /env\.|process\.env/);
  assert.equal((coreCode.match(/RESEND_API_KEY/g) ?? []).length, 1);
  assert.match(coreCode, /EMAIL_FORBIDDEN_FIELDS = \[[\s\S]{0,120}"RESEND_API_KEY", "ADMIN_KEY",/);
  assert.doesNotMatch(coreCode, /ADMIN_NOTIFICATION_EMAIL/);
});

test("E6 재시도가 없다", () => {
  assert.doesNotMatch(mailCode, /retry|attempt|for \(|while \(/i);
  assert.equal((mailCode.match(/await fetch\(/g) ?? []).length, 1);
});

test("E7·E8 provider 오류 원문을 밖으로 내보내지 않는다", () => {
  assert.match(mailCode, /console\.error\("\[admin-email\] provider responded with status", res\.status\)/);
  assert.doesNotMatch(mailCode, /await res\.text\(\)/);
  assert.doesNotMatch(mailCode, /res\.body|JSON\.stringify\(res\)/);
  // 호출자에게도 코드만 준다
  assert.match(mailCode, /reason: "provider_error"/);
});

test("E9 사용자 요청을 붙잡지 않는다", () => {
  for (const [name, src] of [["report", reportCode], ["like", likeCode]] as [string, string][]) {
    assert.match(src, /if \(ctx\.waitUntil\) ctx\.waitUntil\(notify\); else void notify;/, name);
  }
  // 알림 실패가 500 으로 바뀌지 않는다
  assert.doesNotMatch(reportCode, /notify[\s\S]{0,200}fail\("server_error"/);
  assert.doesNotMatch(likeCode, /notify[\s\S]{0,200}fail\("server_error"/);
});

test("E10 044 가 보안 계약을 지킨다", () => {
  for (const t of ["admin_notification_incidents", "admin_notification_events"]) {
    // 정렬용 공백이 들어갈 수 있으므로 공백 개수에 의존하지 않는다
    assert.match(sqlCode, new RegExp(`alter table public\\.${t}\\s+enable row level security;`), t);
    for (const r of ["anon", "authenticated", "public"]) {
      assert.ok(sqlCode.includes(`revoke all on public.${t} from ${r};`), `${t}/${r}`);
    }
  }
  assert.doesNotMatch(sqlCode, /create policy/i);
  assert.doesNotMatch(sqlCode, /\b(drop|truncate|delete from)\b/i);
  // 저장하지 않는 것들
  for (const f of ["device_id", "reporter_key", "liker_key", "RESEND_API_KEY", "ADMIN_KEY"]) {
    assert.equal(sqlCode.includes(f), false, f);
  }
  // 미래 확장 축이 열려 있다 — 새 event_type 은 migration 없이 추가된다
  assert.match(sqlCode, /event_type\s+text not null/);
  assert.doesNotMatch(sqlCode, /check \(event_type in \(/);
  assert.equal(EVENT_PUBLIC_PLACE_SUBMISSION, "public_place_submission");
  // user_spots 는 알림 대상이 아니다
  assert.doesNotMatch(sqlCode, /user_spot/);
  for (const src of [coreCode, notifyCode]) assert.doesNotMatch(src, /user_spots?/);
  assert.match(sqlCode, /check \(target_type in \('city_spot'\)\)/);
});

// ── N23·N24 제품 계약이 문서로 남아 있다 ────────────────────────────────────
//
// 코드로는 아직 아무것도 만들지 않았다. 그래서 이 계약은 문서가 지킨다.
// 문서에서 지워지면 여기서 걸린다.

test("C1 외부 공유와 공개 기여는 같은 동의가 아니다 — 문서로 고정", () => {
  const doc = read("docs/product/user-place-public-contribution-contract-v1.md");
  // 줄바꿈 위치에 의존하지 않는다 — 문장이 남아 있는지만 본다.
  const flat = doc.replace(/\s+/g, " ");
  assert.match(flat, /공유했다는 사실만으로 그 장소가 \*\*자동으로 공개 데이터가 되지 않는다\.\*\*/);
  assert.match(flat, /공개 장소 제안은 \*\*사용자의 명시적 행동과 동의\*\*를 요구한다/);
  // 승인 전 자동 공개 금지
  assert.match(flat, /승인 전 자동 `city_spots` publish \*\*금지\*\*/);
  // My Places 기본값은 개인
  assert.match(flat, /기본적으로 \*\*개인 장소\*\*다/);
  assert.match(flat, /개인 `user_spots` 자체를 관리자 이메일이나 공개 moderation 대상으로 \*\*자동 연결하지 않는다\.\*\*/);
});

test("C2 공개 기여 흐름이 코드로 구현되지 않았다 — 이번 범위 밖", () => {
  // 계약만 남기고 구현은 하지 않았다. 구현이 생기면 이 테스트를 의도적으로
  // 고치게 되고, 그때 위 계약을 다시 읽게 된다.
  for (const src of [coreCode, notifyCode]) {
    assert.doesNotMatch(src, /public_place_submission\s*[:=]\s*\{|submitPublicPlace|promoteToCitySpot/);
  }
  // 확장 자리만 열어 뒀다
  assert.match(coreCode, /EVENT_PUBLIC_PLACE_SUBMISSION = "public_place_submission"/);
  assert.doesNotMatch(notifyCode, /EVENT_PUBLIC_PLACE_SUBMISSION/);
});

// ── I1~I10 사건의 일생 ──────────────────────────────────────────────────────
//
// 이 묶음이 이번 수정의 전부다. 하나의 실제 사건은 일부 신고가 처리돼도
// **같은 사건**이어야 하고, 전부 처리된 뒤에야 닫혀야 한다.

/** DB 를 흉내 낸 최소 모형 — partial unique 두 개를 그대로 재현한다. */
function makeDb() {
  const incidents: { id: number; target: string; status: "open" | "closed"; anchor: number | null }[] = [];
  const events: { event_type: string; target: string; incident_id: number | null; milestone_key: string }[] = [];
  let nextId = 1000;
  return {
    incidents, events,
    /** 열린 사건을 가져오거나 연다. 열린 사건은 target 당 하나뿐이다. */
    getOrOpen(target: string, rows: readonly ReportRow[]): number {
      const open = incidents.find(i => i.target === target && i.status === "open");
      if (open) return open.id;
      const id = ++nextId;
      incidents.push({ id, target, status: "open", anchor: anchorReportId(rows) });
      return id;
    },
    /** 열려 있는 신고가 하나도 없을 때만 닫는다. */
    closeIfResolved(target: string, rows: readonly ReportRow[]): "closed" | "kept" {
      if (hasActiveReports(rows)) return "kept";
      const open = incidents.find(i => i.target === target && i.status === "open");
      if (open) open.status = "closed";
      return "closed";
    },
    /** reserve — 이미 있으면 false. 신고와 좋아요의 열쇠가 다르다. */
    reserve(c: { event_type: string; target_key: string; incident_id: number | null; milestone_key: string }): boolean {
      const dup = events.some(e =>
        e.event_type === c.event_type && e.target === c.target_key &&
        e.milestone_key === c.milestone_key &&
        (c.incident_id === null ? e.incident_id === null : e.incident_id === c.incident_id));
      if (dup) return false;
      events.push({ event_type: c.event_type, target: c.target_key,
                    incident_id: c.incident_id, milestone_key: c.milestone_key });
      return true;
    },
  };
}

/** 신고 하나가 들어왔을 때 서버가 하는 일 전체 */
function onReport(db: ReturnType<typeof makeDb>, target: string, rows: ReportRow[]): number {
  const inc = db.getOrOpen(target, rows);
  let sent = 0;
  for (const c of reportNotificationCandidates(target, rows, inc)) {
    if (db.reserve(c)) sent += 1;
  }
  return sent;
}

test("I1~I10 사건은 일부가 처리돼도 같은 사건이고, 전부 끝나야 닫힌다", () => {
  const db = makeDb();
  const T = "42";
  const rows: ReportRow[] = [];

  // I1 — 첫 신고 → 사건 A 열림
  rows.push(row("u1", "hours_or_holiday", "pending", 101));
  assert.equal(onReport(db, T, rows), 0, "1명이면 알리지 않는다");
  const A = db.incidents[0].id;
  assert.equal(db.incidents.length, 1);
  assert.equal(db.incidents[0].status, "open");
  assert.equal(db.incidents[0].anchor, 101);

  // I2 — 두 번째 신고 → 같은 사건, threshold 2 발송
  rows.push(row("u2", "hours_or_holiday", "pending", 102));
  assert.equal(onReport(db, T, rows), 1, "2명에서 한 번 알린다");
  assert.equal(db.incidents.length, 1);
  assert.equal(db.getOrOpen(T, rows), A);

  // I3 — #101 만 처리. #102 는 아직 열려 있다 → 사건 유지
  rows[0].status = "resolved_corrected";
  assert.equal(db.closeIfResolved(T, rows), "kept");
  assert.equal(db.incidents[0].status, "open");

  // I4 — 이 상태에서 다시 평가해도 사건 id 가 그대로고 재발송이 없다.
  //      **예전 구조에서는 여기서 앵커가 102 로 옮겨가 다시 울렸다.**
  const stillA = db.getOrOpen(T, rows);
  assert.equal(stillA, A, "사건 id 가 바뀌었다");
  assert.equal(onReport(db, T, rows), 0, "같은 사건에서 다시 알렸다");
  assert.notEqual(anchorReportId(rows), 101);   // 앵커 계산값은 바뀌지만
  assert.equal(db.incidents[0].id, A);          // 사건 id 는 그대로다

  // I5 — 신고 하나 더 → 여전히 사건 A
  rows.push(row("u3", "hours_or_holiday", "pending", 103));
  assert.equal(onReport(db, T, rows), 0, "threshold:2 는 이미 보냈다");
  assert.equal(db.getOrOpen(T, rows), A);

  // I6 — #102 처리, #103 남음 → 유지
  rows[1].status = "resolved_no_change";
  assert.equal(db.closeIfResolved(T, rows), "kept");
  assert.equal(db.incidents[0].status, "open");

  // I7 — 마지막 #103 처리 → active 0 → 사건 A 닫힘
  rows[2].status = "rejected";
  assert.equal(db.closeIfResolved(T, rows), "closed");
  assert.equal(db.incidents[0].status, "closed");

  // I8·I9 — 몇 달 뒤 새 신고 → 새 사건 B
  rows.push(row("u4", "hours_or_holiday", "pending", 200));
  onReport(db, T, rows);
  const B = db.incidents.find(i => i.status === "open")!.id;
  assert.equal(db.incidents.length, 2);
  assert.notEqual(A, B, "새 사건이 열리지 않았다");

  // I10 — 새 사건에서 threshold 2 를 다시 쓸 수 있다
  rows.push(row("u5", "hours_or_holiday", "pending", 201));
  assert.equal(onReport(db, T, rows), 1, "새 사건에서 다시 알리지 못했다");
  const t2 = db.events.filter(e => e.milestone_key === "threshold:2");
  assert.equal(t2.length, 2);
  assert.deepEqual(t2.map(e => e.incident_id), [A, B]);
});

// ── C1~C5 동시성 ────────────────────────────────────────────────────────────

test("C1~C4 첫 신고 두 건이 겹쳐도 사건 1개 · 알림 1건이다", () => {
  const db = makeDb();
  const T = "42";
  const rows: ReportRow[] = [
    row("u1", "hours_or_holiday", "pending", 301),
    row("u2", "hours_or_holiday", "pending", 302),
  ];
  // 두 요청이 같은 순간 같은 상태를 본다
  const incA = db.getOrOpen(T, rows);
  const incB = db.getOrOpen(T, rows);
  assert.equal(incA, incB, "C2 두 요청이 다른 사건을 썼다");
  assert.equal(db.incidents.filter(i => i.status === "open").length, 1, "C1 열린 사건이 둘이다");

  // 둘 다 "2명이다" 라고 판단하지만 자리는 하나뿐이다
  const a = reportNotificationCandidates(T, rows, incA).filter(c => db.reserve(c)).length;
  const b = reportNotificationCandidates(T, rows, incB).filter(c => db.reserve(c)).length;
  assert.equal(a + b, 1, "C3·C4 발송 시도가 2회다");

  // DB 가 마지막 방어선이라는 계약이 스키마에 있다
  assert.match(sqlCode, /create unique index if not exists uq_ani_one_open_per_target[\s\S]{0,160}where status = 'open'/);
  // 애플리케이션 메모리 잠금으로 때우지 않았다
  assert.doesNotMatch(notifyCode, /Map<|Set<|lock|mutex/i);
});

test("C5 일부 처리와 새 신고가 겹쳐도 사건이 불필요하게 갈리지 않는다", () => {
  const db = makeDb();
  const T = "42";
  const rows: ReportRow[] = [
    row("u1", "hours_or_holiday", "pending", 401),
    row("u2", "hours_or_holiday", "pending", 402),
  ];
  const A = db.getOrOpen(T, rows);

  // 관리자가 401 을 처리하는 동시에 새 신고가 들어온다
  rows[0].status = "resolved_corrected";
  rows.push(row("u3", "hours_or_holiday", "pending", 403));
  assert.equal(db.closeIfResolved(T, rows), "kept");
  assert.equal(db.getOrOpen(T, rows), A);
  assert.equal(db.incidents.length, 1);

  // 조회 → 없으면 생성 → 충돌하면 재조회 순서가 코드에 있다
  assert.match(notifyCode, /const existing = await find\(\);\s*\n\s*if \(existing !== null\) return existing;/);
  assert.match(notifyCode, /return await find\(\);/);
});

test("C6 사건 종료는 moderation 이 판단을 적은 뒤에만 일어난다", () => {
  const mod = code(read("functions/api/admin/place-reports.ts"));
  const updIdx   = mod.indexOf('rest(base, headers, "PATCH"');
  const closeIdx = mod.indexOf("closeIncidentIfResolved(");
  assert.ok(updIdx > 0 && closeIdx > updIdx, "사건 종료가 상태 기록보다 먼저다");
  // 사건 종료가 신고 상태를 바꾸지 않는다
  const closeFn = notifyCode.slice(notifyCode.indexOf("export async function closeIncidentIfResolved"));
  assert.doesNotMatch(closeFn, /place_reports\?[^`]*`,\s*\{\s*\n?\s*method: "(PATCH|POST|DELETE)"/);
  assert.match(closeFn, /if \(hasActiveReports\(rows\)\) return "kept";/);
  // 실패해도 관리자 요청은 성공으로 끝난다
  assert.match(mod, /\.catch\(\(\) => "none" as const\)/);
});

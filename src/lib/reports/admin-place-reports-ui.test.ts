// 장소 제보 검토 화면 — 계약·보안 테스트 (A1~A10 · S1~S10 · E1~E6)
//
// 이 화면은 검증되지 않은 남의 글(note)을 관리자에게 보여 준다. 그래서 여기서
// 지키는 것은 "예쁘게 나오는가" 가 아니라 두 가지다.
//   1. 사용자가 쓴 글이 절대 HTML 로 해석되지 않는다.
//   2. 관리자 키와 신고자 식별값이 화면·번들·URL 어디에도 남지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { ALLOWED_TRANSITIONS, RESOLUTION_NOTE_MAX_CHARS } from "./report-moderation-core.ts";
import { REPORT_STATUSES } from "./place-report-core.ts";

const PAGE_PATH = "src/app/korea-mate-admin/place-reports/page.tsx";
const PAGE   = readFileSync(PAGE_PATH, "utf8");
const HOME   = readFileSync("src/app/korea-mate-admin/page.tsx", "utf8");
const LAYOUT = readFileSync("src/app/korea-mate-admin/layout.tsx", "utf8");
const NOTIFY = readFileSync("functions/_lib/admin-notify.ts", "utf8");

/** 주석을 걷어낸 실제 코드. 설명문이 검사에 걸리지 않게 한다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const page   = code(PAGE);
const home   = code(HOME);
const notify = code(NOTIFY);

// ── A1~A10 화면 ─────────────────────────────────────────────────────────────

test("A1 route 파일이 존재하고 client component 다", () => {
  assert.ok(existsSync(PAGE_PATH));
  assert.match(PAGE, /^"use client";/);
  assert.match(page, /export default function AdminPlaceReportsPage/);
});

test("A2 인증 게이트 — 키가 없으면 목록을 부르지 않는다", () => {
  // 키가 없으면 로그인 화면에서 return 하고, 목록 fetch 는 그 뒤에만 일어난다
  assert.match(page, /if \(!adminKey\) \{[\s\S]{0,80}return \(/);
  const gate  = page.indexOf("if (!adminKey) {");
  const fetchIdx = page.indexOf("/api/admin/place-reports?");
  assert.ok(gate > 0 && fetchIdx > 0);
  // 목록 로딩은 adminKey 가 있을 때만 도는 effect 안에 있다
  assert.match(page, /if \(!adminKey\) return;/);
  assert.match(page, /"x-admin-key": key/);
});

test("A3 기존 sessionStorage 패턴을 그대로 쓴다", () => {
  assert.match(page, /const SESSION_KEY = "km_admin_key"/);
  // 기존 화면과 같은 키 이름이어야 재로그인 없이 이어진다
  const inquiries = readFileSync("src/app/korea-mate-admin/inquiries/page.tsx", "utf8");
  assert.match(inquiries, /"km_admin_key"/);
  assert.match(page, /sessionStorage\.getItem\(SESSION_KEY\)/);
  assert.match(page, /sessionStorage\.setItem\(SESSION_KEY, key\)/);
});

test("A4 401 이면 저장된 키를 지우고 다시 입력받는다", () => {
  const hits = page.match(/res\.status === 401\)? \{[\s\S]{0,220}?\}/g) ?? [];
  assert.ok(hits.length >= 2, "GET·PATCH 두 경로 모두에 401 처리가 있어야 한다");
  for (const h of hits) {
    assert.match(h, /sessionStorage\.removeItem\(SESSION_KEY\)/);
    assert.match(h, /setAdminKey\(null\)/);
  }
});

test("A5 이메일 딥링크 query 를 읽는다", () => {
  assert.match(page, /useSearchParams\(\)/);
  assert.match(page, /params\.get\("target_type"\)/);
  assert.match(page, /params\.get\("target_key"\)/);
  assert.match(page, /q\.set\("target_type", deepType\); q\.set\("target_key", deepKey\)/);
});

test("A6 잘못된 딥링크는 죽지 않고 전체 목록으로 떨어진다", () => {
  // 형식이 맞을 때만 쓴다. 아니면 null 이 되어 필터가 붙지 않는다.
  assert.match(page, /rawType === "city_spot" \? "city_spot" : null/);
  assert.match(page, /\/\^\[0-9\]\{1,12\}\$\/\.test\(rawKey\) \? rawKey : null/);
  assert.match(page, /if \(deepType && deepKey\)/);
});

test("A7 필터는 open/resolved/all 세 개뿐이다", () => {
  assert.match(page, /type View = "open" \| "resolved" \| "all"/);
  assert.match(page, /const OPEN_STATUSES = \["pending", "reviewing"\]/);
  // API 의 status 필터는 값 하나만 받으므로 한 번 받아 화면에서 나눈다
  assert.doesNotMatch(page, /q\.set\("status"/);
});

test("A8·A9 빈 상태와 오류 상태가 있다", () => {
  assert.match(page, /접수된 신고가 없습니다/);
  assert.match(page, /이 조건에 해당하는 신고가 없습니다/);
  assert.match(page, /\{error && /);
});

test("A10 상태 변경 뒤 서버 값으로 다시 그린다", () => {
  const fn = page.slice(page.indexOf("async function apply"));
  assert.match(fn, /await load\(adminKey\);/);
  // 연타 방지
  assert.match(fn, /if \(!adminKey \|\| busyId !== null\) return;/);
});

test("A11 UI 가 API 보다 많은 전이를 제공하지 않는다", () => {
  // 버튼 목록은 코드가 아니라 계약에서 나온다
  assert.match(page, /const next = ALLOWED_TRANSITIONS\[r\.status\] \?\? \[\]/);
  assert.doesNotMatch(page, /\["resolved_corrected", "resolved_no_change"/);   // 하드코딩 금지
  // 계약 자체가 살아 있는지도 확인
  assert.deepEqual([...ALLOWED_TRANSITIONS.pending], ["reviewing",
    "resolved_corrected", "resolved_no_change", "resolved_hidden",
    "resolved_removed", "rejected", "duplicate"]);
  for (const s of REPORT_STATUSES) assert.ok(Array.isArray(ALLOWED_TRANSITIONS[s]), s);
});

// ── S1~S10 보안 ─────────────────────────────────────────────────────────────

test("S1·S2·S3 키가 코드·번들·URL 어디에도 없다", () => {
  assert.doesNotMatch(page, /NEXT_PUBLIC_ADMIN_KEY/);
  assert.doesNotMatch(page, /process\.env/);
  // 키는 사용자가 입력한 값만 헤더로 나간다
  assert.match(page, /headers: \{ "x-admin-key": key \}/);
  // URL 에 키를 실어 보내지 않는다
  assert.doesNotMatch(page, /admin[_-]?key=/i);
  assert.doesNotMatch(page, /q\.set\("[^"]*key", adminKey\)/);
  // 탭을 닫으면 사라져야 한다. localStorage 는 남는다.
  assert.doesNotMatch(page, /localStorage/);
});

test("S4·S5 신고자 식별값을 그리지 않는다", () => {
  for (const f of ["reporter_key", "device_id", "liker_key"]) {
    assert.equal(page.includes(f), false, f);
  }
});

test("S6·S7 사용자 note 는 일반 텍스트로만 그린다", () => {
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /innerHTML|createElement\('script'\)|DOMParser|Markdown|marked\(/);
  // note 는 JSX 자식으로만 들어간다 — React 가 이스케이프한다
  assert.match(page, /\{r\.note\}/);
  assert.match(page, /\{r\.resolution_note\}/);
  // 주석에서 "쓰지 않는다" 고 설명하는 자리는 세지 않는다. 실제 코드만 본다.
  assert.equal((page.match(/dangerouslySetInnerHTML/g) ?? []).length, 0);
});

test("S8 admin layout 의 noindex 를 상속한다", () => {
  assert.match(LAYOUT, /robots: \{ index: false, follow: false \}/);
  // 새 화면이 자체 metadata 로 이를 뒤집지 않는다
  assert.doesNotMatch(page, /export const metadata/);
  assert.doesNotMatch(page, /index: true/);
});

test("S9·S10 오류 원문을 그대로 뿌리지 않는다", () => {
  assert.match(page, /HTTP \$\{res\.status\}/);
  assert.doesNotMatch(page, /await res\.text\(\)/);
  assert.doesNotMatch(page, /JSON\.stringify\(res\)/);
  assert.match(page, /변경하지 못했습니다 \(HTTP \$\{res\.status\}\)/);
  // 503 은 원인을 알려 주되 값은 말하지 않는다
  assert.match(page, /서버에 ADMIN_KEY 가 설정돼 있지 않습니다/);

  // 화면에 뜨는 어떤 문자열에도 키 변수가 섞이면 안 된다.
  // 오류 메시지에 키를 이어 붙이는 실수가 가장 흔한 유출 경로다.
  const sinks = page.match(/set(Error|PwError)\([\s\S]{0,160}?\);/g) ?? [];
  assert.ok(sinks.length > 0);
  for (const call of sinks) {
    assert.doesNotMatch(call, /\b(key|adminKey|pw|sessionKey)\b/, call);
  }
  // JSX 로 키를 그리지도 않는다
  assert.doesNotMatch(page, /\{\s*(adminKey|key)\s*\}/);
});

test("S11 자동 hide/delete 로 오해하게 쓰지 않는다", () => {
  assert.match(PAGE, /자동으로 숨겨지거나 삭제되지 않고/);
  assert.match(PAGE, /판단을 적어 두는 기록/);
  // 화면이 city_spots 를 직접 건드리지 않는다
  assert.doesNotMatch(page, /city_spots/);
});

// ── E1~E6 이메일 딥링크 ─────────────────────────────────────────────────────

test("E1·E2·E3 메일이 이 화면의 해당 장소로 바로 간다", () => {
  assert.match(notify, /\/korea-mate-admin\/place-reports\//);
  assert.match(notify, /target_type=\$\{encodeURIComponent\(c\.target_type\)\}/);
  assert.match(notify, /target_key=\$\{encodeURIComponent\(targetKey\)\}/);
  // root 로 되돌아가지 않았다
  assert.doesNotMatch(notify, /adminPath:\s+`\$\{site\}\/korea-mate-admin`/);
});

test("E4 query 를 안전하게 인코딩한다", () => {
  assert.equal((notify.match(/encodeURIComponent/g) ?? []).length >= 2, true);
  // target_type 을 문자열로 박아 넣지 않는다
  assert.doesNotMatch(notify, /target_type=city_spot/);
});

test("E5 base URL 계약이 그대로다", () => {
  assert.match(notify, /const site = env\.NEXT_PUBLIC_SITE_URL \?\? "https:\/\/gokoreamate\.com"/);
});

test("E6 URL 에 secret 이 없다", () => {
  const seg = notify.slice(notify.indexOf("adminPath:"), notify.indexOf("adminPath:") + 320);
  assert.doesNotMatch(seg, /ADMIN_KEY|RESEND|SERVICE_ROLE/i);
  assert.doesNotMatch(seg, /[?&](admin[_-]?key|api[_-]?key|token|secret)=/i);
});

test("E7 메일 본문의 기존 문구가 그대로다", () => {
  const core = readFileSync("src/lib/notifications/admin-notification-core.ts", "utf8");
  assert.match(core, /접수된 신고가 검토 기준에 도달했습니다/);
  assert.match(core, /사실로 확정된/);
  assert.match(core, /이 메일은 확인 요청입니다/);
  assert.match(core, /장소가 숨겨지거나 삭제되지 않고/);
  assert.match(core, /관리자 확인:/);
});

// ── 회귀 ────────────────────────────────────────────────────────────────────

test("R1 관리자 홈에 진입 링크가 생겼고 기존 기능은 그대로다", () => {
  assert.match(home, /href="\/korea-mate-admin\/place-reports"/);
  assert.match(home, /장소 제보 검토/);
  // 기존 화면·기능이 남아 있다
  assert.match(home, /setAuthed\(false\); setSessionKey\(""\)/);   // 로그아웃
  for (const api of ["/api/admin/upsert-spots", "/api/admin/delete-spot", "/api/admin/migrate"]) {
    assert.ok(HOME.includes(api), api);
  }
  assert.match(home, /refreshFlagged/);   // 기존 신뢰도 이슈 패널 유지
  const inq = readFileSync("src/app/korea-mate-admin/inquiries/page.tsx", "utf8");
  assert.ok(inq.includes("/api/admin/contact-inquiries"));
  assert.ok(existsSync("src/app/korea-mate-admin/user-spots/page.tsx"));
});

test("R2 note 길이 상한이 API 계약과 같다", () => {
  assert.equal(RESOLUTION_NOTE_MAX_CHARS, 1000);
  assert.match(page, /maxLength=\{RESOLUTION_NOTE_MAX_CHARS\}/);
  assert.match(page, /note\.slice\(0, RESOLUTION_NOTE_MAX_CHARS\)/);
});

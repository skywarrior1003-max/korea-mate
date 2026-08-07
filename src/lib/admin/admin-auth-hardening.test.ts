// 관리자 키 비교 강화 — 실제 함수를 불러서 검증한다.
//
// 소스 문자열만 보는 테스트가 아니다. checkAdminAuth 를 그대로 호출해
// 통과/거부/fail-closed 를 확인하고, 소스 검사는 "직접 비교로 되돌아가지
// 않았는가" 를 지키는 데만 쓴다.
//
// 여기 쓰는 키는 전부 이 파일 안에서 만든 가짜 값이다. 실제 ADMIN_KEY 를
// 읽지도, 요구하지도 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkAdminAuth, json, getServiceRoleHeaders } from "../../../functions/_lib/admin-auth.ts";

const AUTH = readFileSync("functions/_lib/admin-auth.ts", "utf8");
/** 주석을 걷어낸 실제 코드. 설명문이 검사에 걸리지 않게 한다. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const authCode = code(AUTH);

const FAKE_KEY = "test-only-fake-admin-key-not-a-secret-0123456789";
const req = (key?: string) =>
  new Request("https://example.test/api/admin/anything", {
    headers: key === undefined ? {} : { "x-admin-key": key },
  });

// ── A1~A6 동작 ──────────────────────────────────────────────────────────────

test("A1 헤더가 없으면 401", () => {
  const r = checkAdminAuth(req(), FAKE_KEY);
  assert.ok(r instanceof Response);
  assert.equal(r?.status, 401);
});

test("A2 키가 틀리면 401 — 앞부분이 맞아도 통과하지 않는다", () => {
  for (const wrong of [
    "",                                   // 빈 값
    "x",                                  // 완전히 다름
    FAKE_KEY.slice(0, FAKE_KEY.length - 1),   // 마지막 한 글자만 빠짐
    FAKE_KEY + "x",                       // 한 글자 더 붙음
    FAKE_KEY.slice(0, 10),                // 앞 10글자만 맞음
    FAKE_KEY.toUpperCase(),               // 대소문자 다름
    FAKE_KEY.replace("-", "_"),           // 한 글자만 다름
  ]) {
    const r = checkAdminAuth(req(wrong), FAKE_KEY);
    assert.equal(r?.status, 401, JSON.stringify(wrong));
  }

  // 헤더 값의 앞뒤 공백은 HTTP 규격(OWS)상 플랫폼이 잘라낸 뒤 우리에게 준다.
  // 즉 " key " 는 우리 코드에 닿기 전에 "key" 가 된다. 강화 이전에도 같았고
  // 취약점이 아니다 — 다만 우리가 trim 을 한다고 오해하지 않도록 여기 남긴다.
  assert.equal(checkAdminAuth(req(" " + FAKE_KEY + " "), FAKE_KEY), null);
});

test("A3 키가 맞으면 통과(null)", () => {
  assert.equal(checkAdminAuth(req(FAKE_KEY), FAKE_KEY), null);
});

test("A4 ADMIN_KEY 미설정이면 503 fail-closed — 통과가 아니다", () => {
  for (const unset of [undefined, ""]) {
    const r = checkAdminAuth(req(FAKE_KEY), unset);
    assert.ok(r instanceof Response, String(unset));
    assert.equal(r?.status, 503, String(unset));
  }
  // 키를 안 보내도 마찬가지로 503 이고, 절대 null 이 되지 않는다
  assert.notEqual(checkAdminAuth(req(), undefined), null);
});

test("A5 응답 본문에 키가 들어가지 않는다", async () => {
  for (const [r, label] of [
    [checkAdminAuth(req("wrong-key-value"), FAKE_KEY), "wrong"],
    [checkAdminAuth(req(), FAKE_KEY), "missing"],
    [checkAdminAuth(req(FAKE_KEY), undefined), "unset"],
  ] as [Response, string][]) {
    const body = await r.text();
    assert.doesNotMatch(body, /wrong-key-value/, label);
    assert.doesNotMatch(body, new RegExp(FAKE_KEY), label);
    assert.doesNotMatch(body, /length|len=|\d{2,}/, label);   // 길이 힌트도 없다
  }
});

test("A6 401 과 503 의 뜻이 그대로다", async () => {
  assert.equal(JSON.parse(await checkAdminAuth(req("nope"), FAKE_KEY)!.text()).error, "Unauthorized");
  assert.match(JSON.parse(await checkAdminAuth(req("x"), undefined)!.text()).error, /not configured/i);
  // helper 의 다른 export 계약도 그대로다
  assert.equal(json({ a: 1 }, 418).status, 418);
  assert.equal(getServiceRoleHeaders(undefined), null);
  assert.equal(getServiceRoleHeaders("fake-role-key")?.apikey, "fake-role-key");
});

// ── A7~A9 강화 방식 고정 ────────────────────────────────────────────────────

test("A7 직접 문자열 비교로 되돌아가지 않았다", () => {
  // 이 한 줄이 이 작업의 핵심이다. 되돌아가면 여기서 걸린다.
  assert.doesNotMatch(authCode, /provided !== adminKey/);
  assert.doesNotMatch(authCode, /provided === adminKey/);
  assert.match(authCode, /timingSafeEqual\(a, b\)/);
  assert.match(authCode, /import \{ createHash, timingSafeEqual \} from "node:crypto"/);
});

test("A8 길이가 달라도 예외로 새지 않는다 — 먼저 고정 길이로 만든다", () => {
  // 런타임에서 timingSafeEqual 은 길이가 다르면 TypeError 를 던진다.
  // sha256 을 먼저 걸어 항상 32바이트끼리 비교한다.
  assert.match(authCode, /createHash\("sha256"\)\.update\(provided, "utf8"\)\.digest\(\)/);
  assert.match(authCode, /createHash\("sha256"\)\.update\(adminKey, "utf8"\)\.digest\(\)/);
  // 길이가 극단적으로 다른 입력에도 던지지 않고 401 로 끝나야 한다
  for (const wrong of ["a", "b".repeat(100_000)]) {
    assert.doesNotThrow(() => checkAdminAuth(req(wrong), FAKE_KEY));
    assert.equal(checkAdminAuth(req(wrong), FAKE_KEY)?.status, 401);
  }
});

test("A9 raw key 를 로그에 남기지 않는다", () => {
  const logs = authCode.match(/console\.(log|error|warn)\([^)]*\)/g) ?? [];
  assert.ok(logs.length > 0);
  for (const l of logs) {
    assert.doesNotMatch(l, /adminKey|provided|x-admin-key/, l);
  }
  // 인증 함수 안에서 값을 밖으로 내보내는 경로가 없다
  assert.doesNotMatch(authCode, /return .*adminKey/);
});

// ── A10 기존 6개 endpoint 회귀 ──────────────────────────────────────────────

test("A10 기존 admin endpoint 6개가 같은 helper 를 같은 자리에서 쓴다", () => {
  const eps = [
    "functions/api/admin/contact-inquiries.ts",
    "functions/api/admin/delete-spot.ts",
    "functions/api/admin/spot-reactions-summary.ts",
    "functions/api/admin/upsert-spots.ts",
    "functions/api/admin/user-spots.ts",
    "functions/api/admin/place-reports.ts",
  ];
  for (const p of eps) {
    const c = code(readFileSync(p, "utf8"));
    assert.match(c, /checkAdminAuth\(request, env\.ADMIN_KEY\)/, p);
    // 자체 인증을 새로 만들지 않았다
    assert.doesNotMatch(c, /function\s+checkAdminAuth/, p);
    assert.doesNotMatch(c, /NEXT_PUBLIC_ADMIN/, p);
    // 인증이 DB 접근보다 먼저다
    const auth = c.indexOf("checkAdminAuth");
    const creds = c.indexOf("getServiceRoleHeaders");
    assert.ok(auth > 0, p);
    if (creds > 0) assert.ok(auth < creds, `${p}: service_role 획득이 인증보다 먼저다`);
  }
});

test("A11 auth 계약이 바뀌지 않았다 — 헤더·env 이름·동기 시그니처 유지", () => {
  assert.match(authCode, /request\.headers\.get\("x-admin-key"\)/);
  assert.match(authCode, /adminKey: string \| undefined/);
  // 동기 함수 그대로다. async 로 바뀌면 6개 호출부가 전부 await 를 붙여야 한다.
  assert.match(authCode, /export function checkAdminAuth\(/);
  assert.doesNotMatch(authCode, /export async function checkAdminAuth\(/);
  assert.equal(checkAdminAuth(req(FAKE_KEY), FAKE_KEY) instanceof Promise, false);
});

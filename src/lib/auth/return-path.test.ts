// V2-MINIMAL-GOOGLE-AUTH-V1 §6·§16 — 복귀 경로 정화 가드
// 실행: node --experimental-strip-types src/lib/auth/return-path.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeReturnPath } from "./return-path.ts";

test("허용 — 앱 내부 상대경로(쿼리·해시 포함)", () => {
  assert.equal(sanitizeReturnPath("/"), "/");
  assert.equal(sanitizeReturnPath("/more"), "/more");
  assert.equal(sanitizeReturnPath("/itinerary?city=Busan&startDate=2026-10-01"), "/itinerary?city=Busan&startDate=2026-10-01");
  assert.equal(sanitizeReturnPath("/picks#selected"), "/picks#selected");
});

test("차단 — 외부 URL·protocol-relative·스킴", () => {
  assert.equal(sanitizeReturnPath("https://evil.example"), "/");
  assert.equal(sanitizeReturnPath("http://evil.example/x"), "/");
  assert.equal(sanitizeReturnPath("//evil.example"), "/");
  assert.equal(sanitizeReturnPath("//evil.example/path"), "/");
  assert.equal(sanitizeReturnPath("javascript:alert(1)"), "/");
  assert.equal(sanitizeReturnPath("data:text/html,x"), "/");
  assert.equal(sanitizeReturnPath("/https:evil"), "/", "첫 세그먼트 스킴 형태 거부");
});

test("차단 — 인코딩·이중 인코딩·역슬래시 우회", () => {
  assert.equal(sanitizeReturnPath("%2F%2Fevil.example"), "/", "인코딩된 //");
  assert.equal(sanitizeReturnPath("%252F%252Fevil.example"), "/", "이중 인코딩된 //");
  assert.equal(sanitizeReturnPath("/%5C%5Cevil.example"), "/", "인코딩된 역슬래시");
  assert.equal(sanitizeReturnPath("/\\\\evil.example"), "/", "역슬래시");
  assert.equal(sanitizeReturnPath("/%00x"), "/", "제어문자");
  assert.equal(sanitizeReturnPath("%68ttps://evil.example"), "/", "부분 인코딩 스킴");
});

test("차단 — callback 자기 자신(로그인 루프)", () => {
  assert.equal(sanitizeReturnPath("/auth/callback"), "/");
  assert.equal(sanitizeReturnPath("/auth/callback?code=x"), "/");
  assert.equal(sanitizeReturnPath("/auth/callback/deep"), "/");
});

test("/more 복귀 배선 — 저장→소비 계약 (CLOSEOUT-V1 §E-2 회귀 가드)", () => {
  // Owner OAuth E2E 중 '홈 복귀' 관찰의 재발 방지: 모의 provider 왕복 하네스로
  // /more→…→/more 를 실측 재현 실패(정상 동작) 확인했고, 여기서는 그 배선이
  // 향후에도 유지되는지 고정한다.
  const read = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", p), "utf8");
  // ① More 는 정확히 "/more" 를 시작 경로로 전달한다
  assert.match(read("src/app/more/MoreClient.tsx"), /signInWithGoogle\("\/more"\)/);
  // ② 시작 함수는 OAuth 이동 전에 정화된 경로를 sessionStorage 에 저장한다
  const client = read("src/lib/auth/auth-client.ts");
  const setIdx = client.indexOf("sessionStorage.setItem(AUTH_RETURN_KEY");
  const oauthIdx = client.indexOf("signInWithOAuth");
  assert.ok(setIdx > 0 && setIdx < oauthIdx, "저장이 OAuth 시작보다 앞");
  assert.match(client, /sanitizeReturnPath\(returnPath\)/);
  // ③ callback 은 저장값을 정화해 읽고, activate 성공 시에만 그 경로로 복귀한다
  const cb = read("src/app/auth/callback/AuthCallbackClient.tsx");
  assert.match(cb, /sanitizeReturnPath\(sessionStorage\.getItem\(AUTH_RETURN_KEY\)\)/);
  const backIdx = cb.indexOf("sanitizeReturnPath(sessionStorage.getItem");
  const activateIdx = cb.indexOf("activateAccount()");
  const replaceIdx = cb.indexOf("router.replace(back)");
  assert.ok(backIdx < activateIdx && activateIdx < replaceIdx, "back 확보→activate→복귀 순서");
  // ④ 정화기는 /more 를 변형하지 않는다(위 단위 케이스와 동일 계약 재확인)
  assert.equal(sanitizeReturnPath("/more"), "/more");
});

test("차단 — 비문자열·빈 값·과대 입력", () => {
  assert.equal(sanitizeReturnPath(null), "/");
  assert.equal(sanitizeReturnPath(undefined), "/");
  assert.equal(sanitizeReturnPath(""), "/");
  assert.equal(sanitizeReturnPath(123), "/");
  assert.equal(sanitizeReturnPath("/" + "a".repeat(3000)), "/");
});

// V2-MINIMAL-GOOGLE-AUTH-V1 §6·§16 — 복귀 경로 정화 가드
// 실행: node --experimental-strip-types src/lib/auth/return-path.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
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

test("차단 — 비문자열·빈 값·과대 입력", () => {
  assert.equal(sanitizeReturnPath(null), "/");
  assert.equal(sanitizeReturnPath(undefined), "/");
  assert.equal(sanitizeReturnPath(""), "/");
  assert.equal(sanitizeReturnPath(123), "/");
  assert.equal(sanitizeReturnPath("/" + "a".repeat(3000)), "/");
});

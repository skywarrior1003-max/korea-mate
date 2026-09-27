// ACCOUNT-DELETE-V1 — 계정 영구 삭제 계약 가드
// 실행: node --experimental-strip-types src/lib/auth/account-delete-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("intent — 서버 검증 재인증(HMAC 도메인 분리·TTL·클라 시각 불신)", () => {
  const s = read("functions/api/account/delete-intent.ts");
  assert.match(s, /DELETE_INTENT_DOMAIN = "gkm-account-delete-v1"/); // consent intent·device 해시와 분리
  assert.match(s, /REAUTH_MAX_AGE_MS/);
  assert.match(s, /last_sign_in_at/);                                 // GoTrue 서버 기록만 신뢰
  assert.match(s, /admin\/users\//);                                  // admin 조회 — 클라 body 시각 없음
  assert.ok(!/body\.(iat|last_sign_in|time)/.test(s), "클라이언트 시각 불신");
  assert.match(s, /resolveOwnership/);                                // 계정(linked+세션+동의) 요건
  assert.match(s, /reauth_required/);
  const v = strip(s);
  assert.match(v, /nowMs - claims\.iat > DELETE_INTENT_TTL_MS/);      // TTL
  assert.match(v, /diff \|= a\[i\] \^ b\[i\]/);                       // constant-time 비교
});

test("delete — 순서·멱등·성공 위장 금지·유지 계약(정적)", () => {
  const s = read("functions/api/account/delete.ts");
  assert.match(s, /requireUser/);
  assert.match(s, /verifyDeleteIntent/);
  assert.match(s, /purgeItineraryCascade/);                           // 단건 삭제와 동일 cascade 재사용
  // 순서: 콘텐츠 → mapping(RESTRICT 해소) → auth 사용자 마지막
  const iDevices = s.indexOf("account_devices?user_id=eq.");
  const iAuth = s.indexOf("auth/v1/admin/users/", iDevices);
  const iTrips = s.indexOf("purgeItineraryCascade(");
  assert.ok(iTrips > 0 && iTrips < iDevices && iDevices < iAuth, "콘텐츠→mapping→auth 순서");
  // auth 삭제 성공(또는 404=기삭제) 후에만 ok — 성공 위장 금지
  const tail = s.slice(iAuth);
  assert.match(tail, /r\.status !== 404/);
  assert.match(tail, /\{ ok: true, deleted \}/);
  // 실패는 stage 와 함께 — 재시도 가능 계약
  assert.match(s, /delete_failed/, "실패 응답 계약");
  // 유지 계약: usage/share 집계·타인 복사본 무접촉(코드 기준 — 주석 설명은 허용)
  const code = strip(s);
  assert.ok(!/place_usage/.test(code), "익명 활용 집계는 지우지 않는다");
  assert.ok(!/share_events/.test(code), "익명 공유 원장은 지우지 않는다");
  assert.ok(!/copy_of/.test(code), "타인 복사본 무접촉(FK SET NULL 에 맡김)");
  // 해시 축 삭제는 재계산 매칭 — raw key 를 로그·응답에 싣지 않는다
  assert.match(s, /actorKey\(prefix, d, row\.target_type, row\.target_key\)/);
  assert.ok(!/console\.(log|error)\([^)]*saver_key/.test(s), "키 원문 로그 금지");
});

test("공용 cascade — 단건 API 와 계정 삭제가 같은 모듈을 쓴다", () => {
  const purge = read("functions/_lib/itinerary-purge.ts");
  assert.match(purge, /Storage-first/);
  assert.match(purge, /content_likes/);
  assert.match(purge, /story_submissions/);
  assert.match(purge, /trip_moments/);
  const single = read("functions/api/itinerary/[id].ts");
  assert.match(single, /purgeItineraryCascade/);
  assert.ok(!/collectItineraryPhotoPaths/.test(strip(single)), "단건 경로에 중복 구현 잔존 금지");
});

test("클라 — 2단계 확인 UI·reauth 는 기존 PKCE OAuth 로·성공 후 로컬 초기화", () => {
  const cli = read("src/lib/auth/account-delete-client.ts");
  assert.match(cli, /reauth/);
  assert.match(cli, /rotateDeviceId/);
  assert.match(cli, /scope: "local"/);
  const more = read("src/app/more/MoreClient.tsx");
  assert.match(more, /delStep/);
  assert.match(more, /deleteAccountBody/);                            // 결과 설명이 확인 버튼보다 먼저
  assert.match(more, /signInWithGoogle\("\/more"\)/);                 // 재인증 = 기존 OAuth 경로
  assert.ok(more.indexOf("deleteAccountBody") < more.indexOf("deleteConfirmAction"), "설명 후 확인");
  for (const l of ["ko", "en", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { auth: Record<string, string> };
    for (const k of ["deleteAccount", "deleteAccountTitle", "deleteAccountBody", "deleteReauthNotice", "deleteFailed", "deleteWorking", "deleteConfirmAction", "deleteCancel"]) {
      assert.ok((d.auth[k] ?? "").length > 1, `${l}.${k}`);
    }
  }
});

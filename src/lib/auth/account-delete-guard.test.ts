// ACCOUNT-DELETE-V1 — 계정 영구 삭제 계약 가드
// 실행: node --experimental-strip-types src/lib/auth/account-delete-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("intent — 세션 결속 재인증(amr·session_id)·HMAC 도메인 분리·TTL", () => {
  const s = read("functions/api/account/delete-intent.ts");
  assert.match(s, /DELETE_INTENT_DOMAIN = "gkm-account-delete-v1"/); // consent intent·device 해시와 분리
  assert.match(s, /REAUTH_MAX_AGE_MS/);
  // REAUTH-V1: 계정 단위 last_sign_in_at 금지 — 타 브라우저 로그인이 오래된
  // 세션을 통과시키는 결함이 실측됐다. 판정은 **이 세션의 amr timestamp** 로만.
  assert.ok(!/last_sign_in_at/.test(strip(s)), "계정 단위 최근로그인 판정 재도입 금지");
  assert.match(s, /verifiedSessionClaims/);
  assert.match(s, /amr/);
  assert.match(s, /session_id/);
  assert.match(s, /sess\.authAtMs > REAUTH_MAX_AGE_MS|Date\.now\(\) - sess\.authAtMs > REAUTH_MAX_AGE_MS/);
  assert.ok(!/body\.(iat|amr|session_id|time)/.test(s), "클라이언트 body 의 시각·세션 클레임 불신(검증된 Bearer 만)");
  assert.match(s, /resolveOwnership/);                                // 계정(linked+세션+동의) 요건
  assert.match(s, /reauth_required/);
  // intent 에 sid 가 굽힌다 — delete 는 같은 세션에서만 사용 가능
  assert.match(s, /JSON\.stringify\(\{ u: userId, s: sid, iat \}\)/);
  const v = strip(s);
  assert.match(v, /claims\.s !== sid/);
  assert.match(v, /nowMs - claims\.iat > DELETE_INTENT_TTL_MS/);      // TTL
  assert.match(v, /diff \|= a\[i\] \^ b\[i\]/);                       // constant-time 비교
});

test("delete — 순서·멱등·성공 위장 금지·유지 계약(정적)", () => {
  const s = read("functions/api/account/delete.ts");
  assert.match(s, /requireUser/);
  assert.match(s, /verifyDeleteIntent/);
  assert.match(s, /verifiedSessionClaims/);                           // 세션 결속: intent 의 sid == 현재 토큰 sid
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
  assert.match(more, /signInWithGoogle\("\/more\?reauth=delete"\)/);  // 재인증 = 기존 OAuth 경로(복귀 파라미터)
  assert.match(more, /disabled=\{!delIntent/);                         // 실행 버튼은 intent 보유 시에만
  assert.match(more, /deleteVerifyIdentity/);                          // 안전한 본인 확인 단계 분리
  assert.ok(more.indexOf("deleteAccountBody") < more.indexOf("deleteConfirmAction"), "설명 후 확인");
  for (const l of ["ko", "en", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { auth: Record<string, string> };
    for (const k of ["deleteAccount", "deleteAccountTitle", "deleteAccountBody", "deleteReauthNotice", "deleteFailed", "deleteWorking", "deleteConfirmAction", "deleteCancel"]) {
      assert.ok((d.auth[k] ?? "").length > 1, `${l}.${k}`);
    }
  }
});

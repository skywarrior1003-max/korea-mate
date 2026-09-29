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
  // L2: cascade 본문은 functions/_lib/account-purge.ts 로 옮겨 본인·운영자 경로가 공유한다.
  // 본인 경로는 인증·intent·세션 결속을 끝낸 뒤에만 purgeAccount 를 부른다.
  const route = read("functions/api/account/delete.ts");
  assert.match(route, /requireUser/);
  assert.match(route, /verifyDeleteIntent/);
  assert.match(route, /verifiedSessionClaims/);                       // 세션 결속: intent 의 sid == 현재 토큰 sid
  const rc = strip(route);
  assert.ok(rc.indexOf("verifyDeleteIntent(") > 0 && rc.indexOf("verifyDeleteIntent(") < rc.indexOf("purgeAccount(env, userId)"),
    "intent 검증 후에만 삭제");
  const s = read("functions/_lib/account-purge.ts");
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

test("delete — 기기 흔적 전수(DELETION-COVERAGE-V1): 장소 좋아요·도움됨·이벤트 반응·조회·AI 생성", () => {
  const code = strip(read("functions/_lib/account-purge.ts"));
  // 장소 좋아요는 해시 재계산 매칭 목록에 — likerKey 입력 형식 = actorKey("like")
  assert.match(code, /\["place_likes",\s*"liker_key",\s*"like"\]/);
  // 기기 ID 원문 테이블은 계정 기기로만 한정(전체 행·대상 전체 삭제 금지)
  assert.match(code, /\["itinerary_helpful_votes",\s*`device_id=in\.\(\$\{inRaw\}\)`\]/);
  assert.match(code, /\["spot_reactions",\s*`device_id=in\.\(\$\{inRaw\}\)`\]/);
  // 헤더 값이 대소문자 그대로 저장되므로 두 형태 매칭
  assert.match(code, /d\.toLowerCase\(\), d\.toUpperCase\(\)/);
  // 조회 해시·AI 소유 해시는 쓰기 경로와 같은 산식으로 재현
  assert.match(code, /viewer_hash=in\./);
  assert.match(code, /owner_hash=in\./);
  assert.match(code, /ownerHashHmac\(/);
  // 필터 없는 DELETE 금지 — 위 표의 모든 행이 in.(…) 필터를 가진다
  for (const t of ["itinerary_helpful_votes", "spot_reactions", "itinerary_view_dedup", "mytrip_ai_generations"]) {
    assert.ok(!new RegExp(`\\["${t}",\\s*\`\``).test(code), `${t}: 빈 필터 금지`);
  }
  // 신규 단계도 auth 사용자 삭제보다 앞
  assert.ok(code.indexOf('"spot_reactions"') < code.indexOf("auth/v1/admin/users/"), "auth 삭제는 마지막");
});

test("공용 cascade — 단건 API 와 계정 삭제가 같은 모듈을 쓴다", () => {
  const purge = read("functions/_lib/itinerary-purge.ts");
  assert.match(purge, /Storage-first/);
  assert.match(purge, /content_likes/);
  assert.match(purge, /story_submissions/);
  assert.match(purge, /trip_moments/);
  // 여행 id 에 매인 귀속 기록(FK 없음) — 여행과 함께 사라진다
  for (const t of ["itinerary_helpful_votes", "itinerary_view_dedup", "mytrip_ai_generations"]) {
    assert.match(purge, new RegExp(`\\["${t}",\\s*"itinerary_id",\\s*id\\]`), t);
  }
  const single = read("functions/api/itinerary/[id].ts");
  assert.match(single, /purgeItineraryCascade/);
  assert.ok(!/collectItineraryPhotoPaths/.test(strip(single)), "단건 경로에 중복 구현 잔존 금지");
});

test("운영자 삭제(L2) — 관리자 키·확인 문구·계정 존재 확인 후 같은 cascade", () => {
  const s = strip(read("functions/api/admin/account-delete.ts"));
  assert.match(s, /export async function onRequestPost/);
  assert.ok(!/onRequestGet|onRequestDelete/.test(s), "POST 전용");
  const iAuth = s.indexOf("checkAdminAuth(ctx.request, ctx.env.ADMIN_KEY)");
  const iConfirm = s.indexOf("`DELETE ${userId}`");
  const iLookup = s.indexOf("auth/v1/admin/users/");
  const iPurge = s.indexOf("purgeAccount(env, userId)");
  assert.ok(iAuth > 0 && iAuth < iConfirm && iConfirm < iLookup && iLookup < iPurge, "키→확인 문구→존재 확인→삭제 순서");
  assert.match(s, /u\.status === 404\) return json\(\{ error: "not_found" \}, 404\)/);
  assert.match(s, /REASONS = new Set\(\["under_14", "legal_request", "other"\]\)/);
  // 운영자 경로는 본인 재인증을 우회할 뿐 cascade 를 새로 구현하지 않는다
  assert.ok(!/purgeItineraryCascade|account_devices|rest\/v1/.test(s), "cascade 중복 구현 금지");
  // 로그에 사용자 id·이메일 금지
  for (const m of s.matchAll(/console\.\w+\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /userId|email/);
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

// V2-MINIMAL-GOOGLE-AUTH-V1 §16 — 인증 안전 가드(정적 계약 + 서버 helper 단위)
// 실행: node --experimental-strip-types src/lib/auth/auth-safety-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { requireUser, userActorHash, bearerToken } from "../../../functions/_lib/user-auth.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석을 뗀 코드 본문 — 주석의 설명 문구가 금지어 검사에 걸리지 않게 한다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

// ── §4 — 최소 scope·PKCE·provider 계약(정적) ────────────────────────────────

test("클라이언트 — PKCE flow·URL 자동 감지 off", () => {
  const s = read("src/lib/supabase.ts");
  assert.ok(s.includes('flowType: "pkce"'), "PKCE 가 아니다");
  assert.ok(s.includes("detectSessionInUrl: false"), "callback 이 code 교환·URL 정리를 소유해야 한다");
  assert.ok(s.includes("persistSession: true"), "SDK 세션 계약 사용");
});

test("클라이언트 — Google 단일 provider·추가 scope 0·offline 0", () => {
  const c = strip(read("src/lib/auth/auth-client.ts"));
  assert.equal((c.match(/provider:\s*"google"/g) ?? []).length, 1, "google 1곳");
  for (const banned of ['provider: "apple"', 'provider: "kakao"', 'provider: "azure"', 'provider: "github"']) {
    assert.ok(!c.includes(banned), `금지 provider: ${banned}`);
  }
  assert.ok(!/scopes\s*:/.test(c), "scopes 지정 금지 — provider 기본(openid email profile)만");
  assert.ok(!c.includes("access_type"), "offline access 요청 금지");
  assert.ok(!c.includes("offline"), "offline 계열 파라미터 금지");
  // Google provider token 저장·전달 금지
  assert.ok(!c.includes("provider_token") && !c.includes("provider_refresh_token"), "provider token 접근 금지");
  // 세션을 별도 localStorage 키에 복제하지 않는다(§7)
  assert.ok(!/localStorage\.setItem/.test(c), "세션 복제 저장 금지 — SDK 계약만");
});

test("callback — code 교환·URL 정리·정화 복귀·상세 미노출", () => {
  const cb = read("src/app/auth/callback/AuthCallbackClient.tsx");
  assert.ok(cb.includes("exchangeCodeForSession"), "PKCE 교환이 없다");
  assert.ok(cb.includes("history.replaceState"), "일회성 파라미터 URL 제거가 없다");
  assert.ok(cb.includes("sanitizeReturnPath"), "복귀 경로 정화가 없다");
  for (const k of ['"code"', '"state"', '"error_description"']) assert.ok(cb.includes(k), `URL 정리 대상 ${k}`);
  // 오류 화면에 상세를 싣지 않는다 — 표시 문구는 auth i18n 키 2개뿐이고
  // code·oauthError 값을 렌더에 직접 보간하지 않는다
  assert.ok(cb.includes('t("callbackFailed")') && cb.includes('t("signingIn")'), "표시는 i18n 키만");
  assert.ok(!/\{String\(|\{oauthError\}|\{code\}/.test(cb), "오류 상세 노출 금지");
});

// ── §7·§13 — token·secret 누출 금지(정적) ───────────────────────────────────

test("token 은 URL·analytics·로그로 나가지 않는다", () => {
  const files = [
    "src/lib/auth/auth-client.ts", "src/app/auth/callback/AuthCallbackClient.tsx",
    "src/lib/planner/personalize-client.ts", "functions/_lib/user-auth.ts",
  ];
  for (const f of files) {
    const s = read(f);
    assert.ok(!/console\.(log|error|warn)\([^)]*token/i.test(s), `${f}: token 로그 금지`);
    assert.ok(!/[?&]token=|access_token=/.test(s), `${f}: URL query token 금지`);
    assert.ok(!/trackEvent\([^)]*token/i.test(s), `${f}: analytics token 금지`);
  }
  // GA·affiliate 이벤트에 로그인 식별자 신규 추가 0(§13)
  const analytics = read("src/lib/analytics.ts");
  assert.ok(!/user_id|userId|auth/.test(analytics), "analytics 에 사용자 식별 추가 금지");
});

test("service-role 은 클라이언트 코드로 들어오지 않는다", () => {
  for (const f of ["src/lib/auth/auth-client.ts", "src/app/auth/callback/AuthCallbackClient.tsx", "src/app/more/MoreClient.tsx", "src/app/itinerary/page.tsx"]) {
    const s = read(f);
    assert.ok(!s.includes("SERVICE_ROLE"), `${f}: service-role 금지`);
    assert.ok(!s.includes("supabase-admin"), `${f}: admin client 금지`);
  }
});

// ── §8 — 서버 검증 단위(자기완결 모듈이라 직접 실행) ────────────────────────

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://unit.test.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
const reqWith = (auth?: string) => new Request("https://x.test/api", { headers: auth ? { authorization: auth } : {} });
const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test("서버 — Authorization 부재 → 401 authentication_required", async () => {
  const r = await requireUser(ENV, reqWith(undefined), fakeFetch(200, {}));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.response.status, 401);
    assert.deepEqual(await r.response.json(), { error: "authentication_required" });
  }
});

test("서버 — malformed header → 401 (bearer 파싱 실패)", async () => {
  assert.equal(bearerToken(reqWith("Basic abc")), null);
  assert.equal(bearerToken(reqWith("Bearer ")), null);
  const r = await requireUser(ENV, reqWith("Basic abc"), fakeFetch(200, { id: "u" }));
  assert.equal(r.ok, false);
});

test("서버 — 만료·위조·타 환경 token → 401 invalid_session (Supabase 401 반영)", async () => {
  const r = await requireUser(ENV, reqWith("Bearer forged.or.expired"), fakeFetch(401, { message: "invalid" }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.response.status, 401);
    const body = await r.response.json() as { error: string };
    assert.equal(body.error, "invalid_session");
    // email·ref·token 미포함
    assert.equal(Object.keys(body).length, 1);
  }
});

test("서버 — 검증 장애(5xx·네트워크) → 503, 상세 미노출", async () => {
  const r1 = await requireUser(ENV, reqWith("Bearer t"), fakeFetch(500, {}));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.response.status, 503);
  const throwing = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
  const r2 = await requireUser(ENV, reqWith("Bearer t"), throwing);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.response.status, 503);
});

test("서버 — 정상 token → Supabase 검증 user id 반환(클라이언트 주장 무시)", async () => {
  const r = await requireUser(ENV, reqWith("Bearer good"), fakeFetch(200, { id: "3f2c9a1e-1111-4222-8333-444455556666", email: "hidden@example.com" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.userId, "3f2c9a1e-1111-4222-8333-444455556666");
});

test("actor hash — 결정적·기기 무관·device namespace 와 분리", async () => {
  const a = await userActorHash("user-uuid-1", "secret");
  const b = await userActorHash("user-uuid-1", "secret");
  const c = await userActorHash("user-uuid-2", "secret");
  assert.equal(a, b, "같은 사용자는 어디서든 같은 actor");
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
  // namespace 확인 — 소스에 gkm-user-v1 prefix (device 의 gkm-owner-v2 와 다름)
  const src = strip(read("functions/_lib/user-auth.ts"));
  assert.ok(src.includes("gkm-user-v1|"), "user namespace prefix");
  assert.ok(!src.includes("gkm-owner-v2"), "device namespace 혼용 금지(코드 기준)");
});

// ── §9 — AI 사용자 경로 인증 배선(정적) ─────────────────────────────────────

test("AI 4 route — requireUser 가 reserve 이전에 배선되어 있다", () => {
  for (const f of [
    "functions/api/trip/personalize.ts",
    "functions/api/import/analyze.ts",
    "functions/api/generate-itinerary.ts",
  ]) {
    const s = read(f);
    const authIdx = s.indexOf("await requireUser(");
    const reserveIdx = s.indexOf("await aiOpsReserve(");
    assert.ok(authIdx > 0, `${f}: requireUser 없음`);
    assert.ok(authIdx < reserveIdx, `${f}: 인증이 예산 reserve 뒤에 있다`);
    assert.ok(s.includes("checkUserEntitlementPlaceholder("), `${f}: entitlement 자리 없음`);
  }
  const w = read("functions/api/mytrip/writing.ts");
  assert.equal((w.match(/await requireUser\(/g) ?? []).length, 2, "writing 은 레거시·본 2경로 모두");
  assert.ok(w.indexOf("await requireUser(") < w.indexOf("await aiOpsReserve("), "writing 순서");
});

test("비AI 기본 경로 — /api/trip/plan 은 인증 불요", () => {
  const s = read("functions/api/trip/plan.ts");
  assert.ok(!s.includes("requireUser"), "기본 일정에 로그인 요구 금지(§10)");
  assert.ok(!s.includes("authentication_required"), "기본 일정 401 금지");
});

// ── §11 — device 데이터 자동 이전 0(정적) ───────────────────────────────────

test("로그인 흐름은 device 데이터를 건드리지 않는다", () => {
  for (const f of ["src/lib/auth/auth-client.ts", "src/app/auth/callback/AuthCallbackClient.tsx"]) {
    const s = read(f);
    assert.ok(!s.includes("koreamate_device_id") && !s.includes("DEVICE_ID_KEY"), `${f}: device id 접근 금지`);
    assert.ok(!s.includes("itineraries"), `${f}: 일정 소유권 접근 금지`);
    assert.ok(!/localStorage\.(removeItem|clear)/.test(s), `${f}: 기존 데이터 삭제 금지`);
  }
});

// ── §12 — 4locale·내부 용어 금지 ────────────────────────────────────────────

test("auth 문구 — 4locale 존재·내부 용어 미노출", () => {
  const KEYS = ["accountGroup", "googleContinue", "signingIn", "signedInFallback", "signedInHint",
    "signOut", "aiLoginRequiredTitle", "aiLoginKeepsTrips", "callbackFailed", "backToHome"];
  for (const l of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const k of KEYS) {
      const v = m.auth?.[k];
      assert.ok(typeof v === "string" && v.length > 0, `${l}.auth.${k} 누락`);
      for (const banned of ["OAuth", "PKCE", "JWT", "bearer", "token", "Supabase", "provider"]) {
        assert.ok(!v.toLowerCase().includes(banned.toLowerCase()), `${l}.auth.${k} 에 내부 용어 "${banned}"`);
      }
    }
  }
});

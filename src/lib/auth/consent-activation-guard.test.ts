// CONSENT-AND-AUTH-ACTIVATION-V1 — 동의·활성화 계약 가드
// 실행: node --experimental-strip-types src/lib/auth/consent-activation-guard.test.ts
//
// ① requireActiveUser 동작(주입 fetch — 네트워크 0):
//    비로그인 401 · 동의 없음 403 consent_required · 동의 있음 통과 ·
//    판정 장애 503(성공 폴백 금지).
// ② intent cookie 라운드트립: 생성→검증 ok · 변조 거부 · 만료 거부 ·
//    버전 불일치 거부 · constant-time 비교 사용.
// ③ 정적 계약: 버전 문자열 단일 정의 · AI 4route 전부 requireActiveUser
//    (인증이 reserve 앞) · 077 스키마(PII 컬럼 0·CHECK true·UNIQUE·CASCADE·
//    RLS·REVOKE) · cookie 속성(HttpOnly·Lax·Max-Age≤600) · domain separation ·
//    intent/activate 파일에 console 로그 0 · 금지 구조(account_devices 등) 0 ·
//    sheet 기본 미선택·전체선택 없음·생년월일/마케팅 없음.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { requireActiveUser } from "../../../functions/_lib/user-auth.ts";
import {
  createIntentCookieValue, verifyIntentCookie, constantTimeEqual,
} from "../../../functions/_lib/consent-intent.ts";
import {
  TERMS_VERSION, PRIVACY_VERSION, AGE_GATE_VERSION, CONSENT_INTENT_MAX_AGE_S, LEGAL_EFFECTIVE_DATE,
} from "./consent-contract.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://qa-staging.example",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-qa",
  SUPABASE_SERVICE_ROLE_KEY: "service-qa",
  MYTRIP_HASH_SECRET: "unit-secret",
};
const req = (bearer?: string, cookie?: string) =>
  new Request("https://qa.example/api/x", {
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
/** /auth/v1/user 와 /rest/v1/user_consents 를 흉내내는 주입 fetch */
const fakeFetch = (opts: { userOk: boolean; consentRows: number; consentFail?: boolean }) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return opts.userOk
        ? new Response(JSON.stringify({ id: "00000000-0000-4000-8000-0000000000aa" }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (url.includes("/rest/v1/user_consents")) {
      if (opts.consentFail) return new Response("{}", { status: 500 });
      return new Response(JSON.stringify(Array.from({ length: opts.consentRows }, (_, i) => ({ id: i + 1 }))), { status: 200 });
    }
    throw new Error("unexpected fetch: " + url);
  }) as typeof fetch;

test("① 비로그인 → 401 authentication_required", async () => {
  const r = await requireActiveUser(ENV, req(), fakeFetch({ userOk: true, consentRows: 1 }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.response.status, 401);
});

test("① 유효 session + 동의 없음 → 403 consent_required", async () => {
  const r = await requireActiveUser(ENV, req("tok"), fakeFetch({ userOk: true, consentRows: 0 }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.response.status, 403);
    assert.match(await r.response.text(), /consent_required/);
  }
});

test("① 유효 session + 현재 버전 동의 → 통과(userId 만)", async () => {
  const r = await requireActiveUser(ENV, req("tok"), fakeFetch({ userOk: true, consentRows: 1 }));
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.userId, /^0{8}-/);
});

test("① 동의 판정 장애 → 503 (성공으로 폴백하지 않음)", async () => {
  const r = await requireActiveUser(ENV, req("tok"), fakeFetch({ userOk: true, consentRows: 0, consentFail: true }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.response.status, 503);
});

test("② intent cookie — 생성→검증 ok·변조/만료/버전 불일치 거부", async () => {
  const env = { MYTRIP_HASH_SECRET: "unit-secret" };
  const v = await createIntentCookieValue(env, "ko");
  assert.ok(v && v.startsWith("v1."));
  const okReq = new Request("https://x.example/", { headers: { cookie: `gkm_consent_intent=${v}` } });
  assert.deepEqual(await verifyIntentCookie(env, okReq), { ok: true, locale: "ko" });
  // 변조(서명 마지막 문자 뒤집기)
  const tam = v!.replace(/.$/, c => (c === "0" ? "1" : "0"));
  const tamReq = new Request("https://x.example/", { headers: { cookie: `gkm_consent_intent=${tam}` } });
  const tr = await verifyIntentCookie(env, tamReq);
  assert.equal(tr.ok, false);
  // 만료 — 발급 시점보다 max-age 이후 시각으로 검증
  const past = await createIntentCookieValue(env, "ko", Date.now() - (CONSENT_INTENT_MAX_AGE_S + 5) * 1000);
  const exReq = new Request("https://x.example/", { headers: { cookie: `gkm_consent_intent=${past}` } });
  const er = await verifyIntentCookie(env, exReq);
  assert.equal(er.ok, false);
  if (!er.ok) assert.equal(er.reason, "expired");
  // 다른 secret = 서명 불일치(버전 위조 포함 모든 payload 조작이 여기서 죽는다)
  const or = await verifyIntentCookie({ MYTRIP_HASH_SECRET: "other" }, okReq);
  assert.equal(or.ok, false);
  if (!or.ok) assert.equal(or.reason, "bad_signature");
  // constant-time 비교
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "ab"), false);
});

test("③ 버전 문자열 단일 정의 — contract 밖 하드코딩 0", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next|out|\.git/.test(e.name)) walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (p.endsWith("src/lib/auth/consent-contract.ts")) continue;
      if (p.endsWith("consent-activation-guard.test.ts")) continue;
      const s = read(p);
      if (s.includes("preview-legal-v1") || s.includes("preview-age-14-v1")) offenders.push(p);
    }
  };
  walk("src"); walk("functions");
  assert.deepEqual(offenders, []);
  // 게시 전(null)은 Preview 버전, 출시 커밋(시행일)부터는 세 버전 모두 같은 날짜에서 파생 — 어긋날 수 없다
  if (LEGAL_EFFECTIVE_DATE === null) {
    assert.equal(TERMS_VERSION, "preview-legal-v1");
    assert.equal(PRIVACY_VERSION, "preview-legal-v1");
    assert.equal(AGE_GATE_VERSION, "preview-age-14-v1");
  } else {
    assert.match(LEGAL_EFFECTIVE_DATE, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(TERMS_VERSION, `legal-${LEGAL_EFFECTIVE_DATE}-v1`);
    assert.equal(PRIVACY_VERSION, `legal-${LEGAL_EFFECTIVE_DATE}-v1`);
    assert.equal(AGE_GATE_VERSION, `age-14-${LEGAL_EFFECTIVE_DATE}-v1`);
  }
});

test("③ AI 4route — requireActiveUser 가 관문(맨 requireUser 게이트 잔존 0)", () => {
  for (const p of [
    "functions/api/generate-itinerary.ts",
    "functions/api/import/analyze.ts",
    "functions/api/mytrip/writing.ts",
    "functions/api/trip/personalize.ts",
  ]) {
    const s = strip(read(p));
    assert.ok(s.includes("requireActiveUser("), p + ": requireActiveUser 필요");
    assert.ok(!/await requireUser\(/.test(s), p + ": 동의 없는 requireUser 게이트 금지");
    // 인증이 비용 예약(aiOpsReserve)보다 앞이어야 한다
    const authIdx = s.indexOf("requireActiveUser(");
    const reserveIdx = s.indexOf("aiOpsReserve(");
    if (reserveIdx >= 0) assert.ok(authIdx < reserveIdx, p + ": 인증이 reserve 앞");
  }
});

test("③ 077 — 스키마·잠금 계약", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations"));
  assert.equal(files.filter(f => f.startsWith("077")).length, 1);
  const s = read("supabase/migrations/077_user_consents.sql");
  assert.match(s, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(s, /age_over_14_confirmed\s+BOOLEAN\s+NOT NULL CHECK \(age_over_14_confirmed = true\)/);
  assert.match(s, /terms_agreed\s+BOOLEAN\s+NOT NULL CHECK \(terms_agreed = true\)/);
  assert.match(s, /privacy_acknowledged\s+BOOLEAN\s+NOT NULL CHECK \(privacy_acknowledged = true\)/);
  assert.match(s, /locale IN \('ko','en','ja','zh'\)/);
  assert.match(s, /UNIQUE \(user_id, age_gate_version, terms_version, privacy_version\)/);
  assert.match(s, /ENABLE ROW LEVEL SECURITY/);
  assert.match(s, /REVOKE ALL ON TABLE public\.user_consents FROM PUBLIC, anon, authenticated/);
  // PII 컬럼 정의 금지(검증 DO 의 나열 문자열은 제외하고 컬럼 정의부만 본다)
  const cols = s.slice(s.indexOf("CREATE TABLE"), s.indexOf("-- 동일 사용자"));
  for (const bad of ["email", "birth", "ip ", "user_agent", "device_id", "actor_hash", "nonce", "token"]) {
    assert.ok(!cols.toLowerCase().includes(bad), "077 PII 컬럼 금지: " + bad);
  }
});

test("③ intent cookie 속성·domain separation·로그 0", () => {
  const lib = read("functions/_lib/consent-intent.ts");
  assert.match(lib, /HttpOnly; SameSite=Lax; Path=\//);
  assert.match(lib, /gkm-consent-intent-v1/);
  assert.ok(strip(lib).match(/console\./) === null, "consent-intent 에 console 금지");
  const api = read("functions/api/auth/consent-intent.ts");
  assert.ok(strip(api).match(/console\./) === null, "intent API 에 console 금지");
  const act = read("functions/api/auth/activate.ts");
  assert.ok(strip(act).match(/console\./) === null, "activate 에 console 금지");
  assert.ok(CONSENT_INTENT_MAX_AGE_S <= 600, "Max-Age 10분 이내");
  // body 주입 필드를 참조하지 않는다
  assert.ok(!/body\.(user_id|email|accepted_at|terms_version)/.test(strip(act)), "activate body 주입 참조 금지");
});

test("③ sheet — 기본 미선택·일괄 선택 없음·생년월일/마케팅 없음·링크 자동체크 없음", () => {
  const s = read("src/components/auth/ConsentSheet.tsx");
  assert.match(s, /useState\(false\)[\s\S]*useState\(false\)[\s\S]*useState\(false\)/);
  const code = strip(s); // 주석의 금지 선언문 자체는 제외하고 코드만 본다
  assert.ok(!/selectAll|checkAll|모두 동의|전체 동의/i.test(code), "일괄 선택 금지");
  assert.ok(!/birth|생년월일|marketing|마케팅/i.test(code), "생년월일·마케팅 금지");
  assert.match(s, /stopPropagation/); // 링크 클릭이 체크 토글로 번지지 않는다
  assert.match(s, /disabled=\{!ready\}/);
  const strippedSheet = strip(s);
  assert.ok(strippedSheet.includes("postConsentIntent"), "intent 성공 후에만 진행");
});

test("③ 금지 구조 — 계정 삭제 0(연결은 LINKING-V1 에서 도입)", () => {
  const targets: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next|out|\.git/.test(e.name)) walk(p); continue; }
      if (/\.(ts|tsx|sql)$/.test(e.name)) targets.push(p);
    }
  };
  walk("src"); walk("functions"); walk("supabase/migrations");
  for (const p of targets) {
    if (p.endsWith("consent-activation-guard.test.ts")) continue; // 자기 자신 제외
    const s = read(p);
    assert.ok(!/account_deletions/.test(s), p); // account_devices 는 LINKING-V1 에서 도입됨
  }
  // 소유권 API 는 여전히 device 기준(변경 0)
  assert.match(read("functions/api/itinerary/[id].ts"), /x-device-id/);
});

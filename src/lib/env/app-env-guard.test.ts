// V2-ENVIRONMENT-ISOLATION-V1 회귀 가드 (§15)
// 실행: node --experimental-strip-types src/lib/env/app-env-guard.test.ts
//
// 계약: APP_ENV SSOT(NODE_ENV 오판 금지) · origin/ref 매트릭스 · mode(live=prod 전용)
// · fail-closed · 배선(빌드/런타임/AI/analytics/affiliate) · 번들 격리.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  parseAppEnv, parseMode, modeAllowed, originAllowed,
  refFromSupabaseUrl, supabaseRefAllowed, refsConsistent,
  PRODUCTION_ORIGIN,
} from "./app-env-core.ts";
import { envGate, aiAllowed, PRODUCTION_SUPABASE_REF } from "../../../functions/_lib/app-env.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const PROD_REF = PRODUCTION_SUPABASE_REF;
const FAKE_STAGING = "abcdefghijklmnopqrst";
const policy = (expected?: string | null) => ({ productionRef: PROD_REF, expectedRef: expected ?? null });
const url = (ref: string) => `https://${ref}.supabase.co`;

test("§15 APP_ENV — 정상 파싱·누락/오타 실패·NODE_ENV 오판 금지", () => {
  assert.equal(parseAppEnv("development"), "development");
  assert.equal(parseAppEnv("staging"), "staging");
  assert.equal(parseAppEnv("Production"), "production");
  assert.equal(parseAppEnv(undefined), null, "누락은 null — production 추정 금지");
  assert.equal(parseAppEnv("prod"), null, "오타는 null");
  // NODE_ENV 는 입력 경로 자체가 없다 — 판정 코드가 NODE_ENV 를 읽지 않는다
  const gate = read("src/lib/env/app-env-core.ts") + read("functions/_lib/app-env.ts") + read("functions/api/_middleware.ts") + read("scripts/verify-environment.mjs");
  assert.ok(!gate.includes("process.env.NODE_ENV") && !/\bNODE_ENV\s*[=!]==?/.test(gate), "환경 가드가 NODE_ENV 로 판정");
});

test("§15 origin — 환경별 허용/거부", () => {
  assert.equal(originAllowed("production", PRODUCTION_ORIGIN), true);
  assert.equal(originAllowed("production", "https://x.korea-mate.pages.dev"), false, "prod + pages.dev 거부");
  assert.equal(originAllowed("staging", "https://abc123.korea-mate.pages.dev"), true);
  assert.equal(originAllowed("staging", PRODUCTION_ORIGIN), false, "staging + 실도메인 거부");
  assert.equal(originAllowed("development", "http://localhost:3000"), true);
  assert.equal(originAllowed("development", PRODUCTION_ORIGIN), false);
});

test("§15 Supabase ref — 환경 매트릭스·불일치 거부", () => {
  assert.equal(supabaseRefAllowed("production", PROD_REF, policy()), true);
  assert.equal(supabaseRefAllowed("production", FAKE_STAGING, policy()), false, "prod + staging ref 거부");
  assert.equal(supabaseRefAllowed("staging", FAKE_STAGING, policy(FAKE_STAGING)), true);
  assert.equal(supabaseRefAllowed("staging", PROD_REF, policy(PROD_REF)), false, "staging + prod ref 거부(expected 로도 우회 불가)");
  assert.equal(supabaseRefAllowed("staging", FAKE_STAGING, policy(null)), false, "staging 은 expected 필수");
  assert.equal(supabaseRefAllowed("development", PROD_REF, policy()), false, "dev + prod DB 명시 허용 없음 → 실패");
  assert.equal(supabaseRefAllowed("development", FAKE_STAGING, policy()), true);
  assert.equal(refFromSupabaseUrl("https://evil.example/x"), null, "잘못된 URL 거부");
  assert.equal(refsConsistent(url(FAKE_STAGING), url(FAKE_STAGING)), true);
  assert.equal(refsConsistent(url(FAKE_STAGING), url(PROD_REF)), false, "public/server ref 불일치 거부");
  assert.equal(refsConsistent(url(FAKE_STAGING), undefined), true, "단일 URL 구조(현행) 일치");
});

test("§15 mode — live 는 production 전용·fallback 없음", () => {
  for (const m of ["live"] as const) {
    assert.equal(modeAllowed("staging", m), false, "staging live 거부(AI/analytics/affiliate/payment 동일 규칙)");
    assert.equal(modeAllowed("development", m), false);
    assert.equal(modeAllowed("production", m), true);
  }
  assert.equal(modeAllowed("production", "off"), true, "Production AI off 허용");
  assert.equal(parseMode(undefined), "off", "누락은 off — fail-closed");
  // AI: 키 없는 환경이 Production key 로 fallback 하지 않는다 — 서버 판정은
  // 이 env 객체의 GEMINI_API_KEY 만 본다(다른 키 참조 코드 부재).
  assert.equal(aiAllowed({ APP_ENV: "staging", AI_MODE: "test" }), false, "staging test 는 자체 키 필수");
  assert.equal(aiAllowed({ APP_ENV: "staging", AI_MODE: "test", GEMINI_API_KEY: "k" }), true);
  assert.equal(aiAllowed({ APP_ENV: "staging", AI_MODE: "live", GEMINI_API_KEY: "k" }), false, "staging live 거부");
  assert.equal(aiAllowed({ APP_ENV: "production", AI_MODE: "live" }), true);
  assert.equal(aiAllowed({ APP_ENV: "production" }), false, "prod 에서도 AI_MODE 누락=off");
  assert.ok(!read("functions/_lib/app-env.ts").includes("PRODUCTION_GEMINI"), "prod key fallback 경로 없음");
});

test("§15 runtime — mismatch 는 query 이전 503·응답에 환경 상세 없음", async () => {
  const call = (env: Record<string, string>, host = "https://x.korea-mate.pages.dev") =>
    envGate(env, host + "/api/itineraries");
  // 정상: staging 조합
  assert.equal(call({ APP_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: url(FAKE_STAGING), EXPECTED_SUPABASE_PROJECT_REF: FAKE_STAGING }), null);
  // APP_ENV 누락 → 503
  const r1 = call({ NEXT_PUBLIC_SUPABASE_URL: url(FAKE_STAGING) });
  assert.equal(r1?.status, 503);
  // staging + production DB → 503 (DB query 이전)
  const r2 = call({ APP_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF), EXPECTED_SUPABASE_PROJECT_REF: PROD_REF });
  assert.equal(r2?.status, 503);
  // production 실도메인 + staging APP_ENV → 503
  const r3 = envGate({ APP_ENV: "staging", NEXT_PUBLIC_SUPABASE_URL: url(FAKE_STAGING), EXPECTED_SUPABASE_PROJECT_REF: FAKE_STAGING }, "https://gokoreamate.com/api/x");
  assert.equal(r3?.status, 503);
  // 응답 본문에 ref·URL·환경 상세 없음
  const body = await r2!.text();
  assert.ok(!body.includes("supabase") && !body.includes(PROD_REF) && !body.includes("staging"), "오류에 내부 상세 노출");
  // production 정상 조합은 통과(향후 릴리스 계약)
  assert.equal(envGate({ APP_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF) }, "https://gokoreamate.com/api/x"), null);
});

test("배선 — build guard·middleware·AI 라우트·analytics·affiliate", () => {
  assert.ok(read("scripts/build-static.mjs").includes("verify-environment.mjs"), "빌드 가드 미배선");
  const vg = read("scripts/verify-environment.mjs");
  for (const s of ["CF_PAGES_BRANCH", "NEXT_PUBLIC_APP_ENV", "EXPECTED_SUPABASE_PROJECT_REF", "live is only allowed in production"]) {
    assert.ok(vg.includes(s), `빌드 가드 검증 소실: ${s}`);
  }
  assert.ok(read("functions/api/_middleware.ts").includes("envGate"), "런타임 미들웨어 미배선");
  for (const f of ["functions/api/mytrip/writing.ts", "functions/api/generate-itinerary.ts", "functions/api/import/analyze.ts", "functions/api/trip/personalize.ts"]) {
    assert.ok(read(f).includes("aiAllowed("), `${f}: AI 게이트 소실`);
  }
  assert.ok(read("src/lib/analytics.ts").includes("NEXT_PUBLIC_APP_ENV"), "trackEvent 환경 게이트 소실");
  const aff = read("src/components/AffiliateLink.tsx");
  assert.ok(aff.includes("affiliateLive") && aff.includes("AFFILIATE_PREVIEW_HREF"), "affiliate 게이트 소실");
  assert.ok(read("src/app/layout.tsx").includes("NEXT_PUBLIC_APP_ENV"), "GA 스크립트 환경 게이트 소실");
  // 파트너 SSOT 상수 무변경(§11-2)
  const links = read("src/config/partner-links.ts");
  for (const s of ['AGODA_CID = "1972243"', 'KLOOK_AID = "123610"', 'KKDAY_CID = "26267"', 'TRIP_ALLIANCE_ID = "9901788"']) {
    assert.ok(links.includes(s), `파트너 SSOT 변경됨: ${s}`);
  }
});

test("클라이언트 번들 격리 — server-only 모듈·secret 부재 (out/ 필요)", () => {
  const outDir = path.join(ROOT, "out");
  assert.ok(existsSync(outDir), "out/ 이 없다 — npm run build:static 후 실행");
  // 정적 번들 전체 스캔(텍스트 파일만)
  const chunks: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html|txt|json|css)$/.test(e.name) && statSync(p).size < 8_000_000) chunks.push(p);
    }
  };
  walk(outDir);
  const localEnv = read(".env.local");
  const sr = localEnv.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
  const admin = readFileSync(path.join(ROOT, ".dev.vars"), "utf8").match(/^ADMIN_KEY=(.+)$/m)?.[1]?.trim();
  const gemini = localEnv.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
  const appEnvBuild = (localEnv.match(/^APP_ENV=(.+)$/m)?.[1] ?? "").trim();
  let srHit = 0, adminHit = 0, aiHit = 0, serverOnlyHit = 0, prodRefHit = 0;
  for (const f of chunks) {
    const s = readFileSync(f, "utf8");
    if (sr && s.includes(sr)) srHit++;
    if (admin && admin.length > 12 && s.includes(admin)) adminHit++;
    if (gemini && gemini.length > 12 && s.includes(gemini)) aiHit++;
    if (s.includes("gkm-server-env-guard-v1")) serverOnlyHit++;
    if (appEnvBuild !== "production" && s.includes(PROD_REF)) prodRefHit++;
  }
  assert.equal(srHit, 0, "service role 이 번들에 있다");
  assert.equal(adminHit, 0, "ADMIN_KEY 가 번들에 있다");
  assert.equal(aiHit, 0, "AI secret 이 번들에 있다");
  assert.equal(serverOnlyHit, 0, "server-only 환경 모듈이 클라이언트 번들에 포함");
  assert.equal(prodRefHit, 0, "비-production 빌드 산출물에 Production ref 존재");
});

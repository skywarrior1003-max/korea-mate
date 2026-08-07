// 자동 QA 가 운영 데이터를 쓰지 못하게 하는 guard 계약 고정.
//
// 이 테스트가 지키는 건 코드 스타일이 아니라 **사고 재발**이다.
// 실제로 일어난 일: Playwright route 패턴이 `**/api/itinerary/**` 였는데
// 자동 저장은 하위 경로 없는 `/api/itinerary` 로 나가서 매칭되지 않았고,
// 로컬 wrangler 가 운영 Supabase 자격증명을 쓰고 있어서 운영 DB 에 14건이 저장됐다.
//
// 그래서 두 가지를 못 박는다.
//   ① 운영 backend 를 가리키는 자동 QA 는 시작 자체가 실패한다
//   ② write 차단은 glob 이 아니라 method + pathname 으로 판단한다 (root 경로 포함)
//
// 동시에 **Production runtime 은 절대 막히면 안 된다** — 일반 사용자의 저장 기능이다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCTION_SUPABASE_REF, WRITE_METHODS, WRITE_GUARDED_PATHS,
  isAutomatedQa, writeMockGuaranteed,
  evaluateQaBackendGuard, assertQaNotUsingProductionWriteBackend,
  shouldBlockQaRequest,
} from "../../tests/qa-guard.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const QA_URL   = "https://qa-project-ref.supabase.co";

// ── 1~4. Guard A — 운영 backend hard fail ───────────────────────────────────
test("★1 운영 project ref + 자동 QA → 실패", () => {
  const d = evaluateQaBackendGuard({ CI: "1" }, [PROD_URL]);
  assert.equal(d.shouldFail, true);
  assert.throws(() => assertQaNotUsingProductionWriteBackend({ CI: "1" }, [PROD_URL]), /QA GUARD/);
});

test("★2 운영이 아닌 backend + 자동 QA → 통과", () => {
  const d = evaluateQaBackendGuard({ CI: "1" }, [QA_URL]);
  assert.equal(d.shouldFail, false);
  assert.equal(d.reason, "non-production-backend");
  assert.doesNotThrow(() => assertQaNotUsingProductionWriteBackend({ CI: "1" }, [QA_URL]));
});

test("★3 Production runtime 은 guard 대상이 아니다 — 사용자 저장을 막으면 안 된다", () => {
  // 자동 QA 표시가 없는 환경 = 실제 서비스·사람의 로컬 개발
  for (const env of [{}, { NODE_ENV: "production" }, { NODE_ENV: "development" }]) {
    const d = evaluateQaBackendGuard(env, [PROD_URL]);
    assert.equal(d.shouldFail, false, JSON.stringify(env));
    assert.equal(d.reason, "not-automated-qa");
  }
  assert.doesNotThrow(() => assertQaNotUsingProductionWriteBackend({}, [PROD_URL]));
});

test("★4 env 가 없거나 알 수 없으면 안전한 방향으로 간다", () => {
  // 자동 QA 인데 backend 를 알 수 없음 → 운영이라는 증거가 없으므로 통과시키되,
  // 운영 문자열이 하나라도 섞이면 즉시 실패해야 한다.
  assert.equal(evaluateQaBackendGuard({ CI: "1" }, [undefined, ""]).shouldFail, false);
  assert.equal(evaluateQaBackendGuard({ CI: "1" }, [undefined, PROD_URL]).shouldFail, true);
  // write mock 보증은 명시적으로 선언했을 때만 인정한다 (기본은 보증 안 됨)
  assert.equal(writeMockGuaranteed({}), false);
  assert.equal(writeMockGuaranteed({ QA_WRITE_MOCK_GUARANTEED: "true" }), false);
  assert.equal(writeMockGuaranteed({ QA_WRITE_MOCK_GUARANTEED: "1" }), true);
});

test("★자동 QA 판정 — Playwright·CI·명시 플래그", () => {
  for (const env of [{ CI: "1" }, { PW_TEST: "1" }, { PLAYWRIGHT: "1" },
                     { PLAYWRIGHT_TEST_BASE_URL: "http://x" }, { GOKOREAMATE_QA: "1" }]) {
    assert.equal(isAutomatedQa(env), true, JSON.stringify(env));
  }
  assert.equal(isAutomatedQa({}), false);
  assert.equal(isAutomatedQa({ GOKOREAMATE_QA: "0" }), false);
});

test("★write mock 을 보증하면 운영 backend 라도 진행할 수 있다", () => {
  const d = evaluateQaBackendGuard({ CI: "1", QA_WRITE_MOCK_GUARANTEED: "1" }, [PROD_URL]);
  assert.equal(d.shouldFail, false);
  assert.equal(d.reason, "write-mock-guaranteed");
});

// ── 5~9. Guard B — write 요청 차단 ──────────────────────────────────────────
test("★5 root /api/itinerary POST 를 막는다 — 이번 사고의 정확한 지점", () => {
  assert.equal(shouldBlockQaRequest("POST", "http://localhost:8788/api/itinerary"), true);
  assert.equal(shouldBlockQaRequest("POST", "https://gokoreamate.com/api/itinerary"), true);
  // 쿼리스트링이 붙어도 막힌다
  assert.equal(shouldBlockQaRequest("POST", "http://x/api/itinerary?foo=1"), true);
});

test("★6 하위 경로 /api/itinerary/:id POST 도 막는다", () => {
  assert.equal(shouldBlockQaRequest("POST", "http://x/api/itinerary/abc"), true);
  assert.equal(shouldBlockQaRequest("POST", "http://x/api/itinerary/9013c356-63d5-4743-907f-2841ca1383bf"), true);
});

test("★7 PUT·PATCH·DELETE 도 막는다", () => {
  for (const m of ["PUT", "PATCH", "DELETE", "put", "delete"]) {
    assert.equal(shouldBlockQaRequest(m, "http://x/api/itinerary"), true, m);
    assert.equal(shouldBlockQaRequest(m, "http://x/api/itinerary/abc"), true, m);
  }
  assert.deepEqual([...WRITE_METHODS], ["POST", "PUT", "PATCH", "DELETE"]);
});

test("★8 GET·HEAD 읽기는 그대로 통과한다 — 회귀 없음", () => {
  for (const m of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(shouldBlockQaRequest(m, "http://x/api/itinerary"), false, m);
    assert.equal(shouldBlockQaRequest(m, "http://x/api/itinerary/abc"), false, m);
  }
});

test("★9 root 경로 보호가 목록에 남아 있다 — glob 하나에 의존하지 않는다", () => {
  assert.ok(WRITE_GUARDED_PATHS.includes("/api/itinerary"),
    "root /api/itinerary 가 목록에서 빠지면 이번 사고가 그대로 재발한다");
  // 비슷한 이름의 다른 경로를 잘못 막지 않는다
  assert.equal(shouldBlockQaRequest("POST", "http://x/api/itinerary-export"), false);
  assert.equal(shouldBlockQaRequest("POST", "http://x/api/trip/plan"), false);
  // 다른 write 표면도 함께 막는다
  for (const p of ["/api/itineraries", "/api/trip-moments", "/api/user-spots", "/api/spots/reactions"]) {
    assert.equal(shouldBlockQaRequest("POST", "http://x" + p), true, p);
  }
});

// ── 10. 하네스 배선 ─────────────────────────────────────────────────────────
test("★10 Playwright 가 globalSetup 으로 guard 를 실제로 물고 있다", () => {
  const cfg = read("playwright.config.ts");
  assert.match(cfg, /globalSetup:\s*"\.\/tests\/global-setup\.ts"/);
  const setup = read("tests", "global-setup.ts");
  assert.match(setup, /assertQaNotUsingProductionWriteBackend/);
  // .env.local·.dev.vars 값도 함께 본다 — 로컬 wrangler 가 실제로 읽는 것이 그것이다
  assert.match(setup, /\.env\.local/);
  assert.match(setup, /\.dev\.vars/);
});

test("★guard 는 테스트 하네스 전용이다 — 앱 코드가 import 하지 않는다", () => {
  for (const f of ["src/app/itinerary/page.tsx", "src/lib/itinerary-api.ts"]) {
    assert.doesNotMatch(read(...f.split("/")), /qa-guard/, f);
  }
});

test("★secret 을 출력하지 않는다", () => {
  const g = read("tests", "qa-guard.ts");
  assert.doesNotMatch(g, /console\.(log|error|warn)/);
  // 길이·앞자리 노출도 하지 않는다
  assert.doesNotMatch(g, /\.slice\(0,\s*\d+\)|\.length\b.*key/i);
});

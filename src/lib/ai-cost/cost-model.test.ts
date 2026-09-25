// V2-AI-COST-AUDIT-V1 — 계산기·인벤토리·차단 배선 회귀 가드
// 실행: node --experimental-strip-types src/lib/ai-cost/cost-model.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

import {
  MODEL_SKU, PRICE_IN_PER_MTOK_USD, PRICE_OUT_PER_MTOK_USD, MODEL_MAX_OUTPUT_TOKENS,
  FX, tokensFromChars, callCostUSD, actionCostUSD, usdToKrw,
  PROFILES, usableKrw, ticketScenario, TICKET_PRICE_KRW,
} from "./cost-model.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

test("계산기 — 단가·행동 원가·반올림", () => {
  // 1M in + 1M out = $0.30 + $2.50
  assert.equal(callCostUSD(1_000_000, 1_000_000), PRICE_IN_PER_MTOK_USD + PRICE_OUT_PER_MTOK_USD);
  assert.equal(callCostUSD(0, 0), 0);
  assert.equal(tokensFromChars(0), 0);
  assert.equal(tokensFromChars(1), 1, "올림(과소평가 금지)");
  assert.equal(tokensFromChars(3000), 1000);
  // 일정 생성 최악(8192 캡) = 출력 8,192 tok 지배: ≈ $0.022
  const worst = actionCostUSD(PROFILES.itinerary, "worst");
  assert.ok(worst > 0.018 && worst < 0.026, `itinerary 최악 ${worst.toFixed(4)}`);
  const typ = actionCostUSD(PROFILES.itinerary, "typical");
  assert.ok(typ > 0.008 && typ < 0.02, `itinerary 대표 $${typ.toFixed(4)}`);
});

test("계산기 — 환율 민감도(결론 뒤집힘 여부)", () => {
  const econ = (fx: number) => ({ fxKrwPerUsd: fx, pgFeeRate: 0.033, vatInclusive: true });
  for (const fx of [FX.strongKRW, FX.base, FX.weakKRW]) {
    // V2-HARDCAP 이후: 감사 시점의 무캡(UNBOUNDED) 프로파일을 재구성해 그때의
    // 결론(어떤 환율에서도 100회 최악 적자)이 계속 재현되는지 본다 — 캡의 근거.
    const uncapped = { ...PROFILES.itinerary, outTokensMax: MODEL_MAX_OUTPUT_TOKENS };
    const s = ticketScenario(100, uncapped, econ(fx));
    assert.ok(s.marginWorstKRW < 0, `fx=${fx}: 무캡 최악 마진 ${Math.round(s.marginWorstKRW)}원`);
    // 대표 사용은 어떤 환율에서도 흑자
    assert.ok(s.marginTypicalKRW > 0, `fx=${fx}: 대표 마진`);
  }
});

test("경제성 — 가용액·손익분기", () => {
  const econ = { fxKrwPerUsd: FX.base, pgFeeRate: 0.033, vatInclusive: true };
  const usable = usableKrw(econ);
  assert.ok(usable > 5_000 && usable < TICKET_PRICE_KRW, `가용 ${Math.round(usable)}원`);
  const uncapped = { ...PROFILES.itinerary, outTokensMax: MODEL_MAX_OUTPUT_TOKENS };
  const s = ticketScenario(30, uncapped, econ);
  assert.equal(s.credits, 30);
  assert.ok(s.breakevenActionsWorst >= 20 && s.breakevenActionsWorst <= 30,
    `무캡 최악 손익분기 ${s.breakevenActionsWorst}회(≈22 기대)`);
  // 하드캡(현행 프로파일 = 8,192 캡): 100회도 안전
  const c = ticketScenario(100, PROFILES.itinerary, econ);
  assert.ok(c.marginWorstKRW > 0, `캡 적용 100회 최악 마진 ${Math.round(c.marginWorstKRW)}원`);
});

test("프로파일 ↔ 코드 상수 동기(출력 캡·재시도·상한)", () => {
  // writing: 3,400(멀티모달 moment3) — writing-core 상수 그대로
  const w = read("src/lib/mytrip-writing/writing-core.ts");
  assert.ok(w.includes("MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS = 3400"));
  assert.equal(PROFILES.writing.outTokensMax, 3400);
  // analyze: 4096 · 텍스트 18,000
  assert.ok(read("functions/api/import/analyze.ts").includes("maxOutputTokens: 4096"));
  assert.ok(read("src/lib/url-import/import-core.ts").includes("MAX_TEXT_CHARS = 18_000"));
  assert.equal(PROFILES.importAnalyze.outTokensMax, 4096);
  // personalize: 700 · 6,000 chars
  const pc = read("src/lib/scheduler/ai/profile-personalization-core.ts");
  assert.ok(pc.includes("MAX_OUTPUT_TOKENS = 700") && pc.includes("MAX_PROMPT_CHARS = 6_000"));
  assert.equal(PROFILES.personalize.outTokensMax, 700);
  // itinerary: V2-HARDCAP — generationConfig.maxOutputTokens 8192 와 동기
  const gi = read("functions/api/generate-itinerary.ts");
  assert.ok(gi.includes("maxOutputTokens: 8192"), "itinerary 출력 캡(8192)이 사라졌다 — 무캡 회귀");
  assert.equal(PROFILES.itinerary.outTokensMax, 8_192);
  // 과금 재시도 없음: 503 재시도만·429 즉시 종료
  assert.ok(gi.includes("httpStatus === 429") && gi.includes("503"));
  for (const p of Object.values(PROFILES)) assert.equal(p.billableCallsWorst, 1);
});

test("인벤토리 완전성 — provider 호출부 파일 집합 고정", () => {
  const out = execSync('git grep -l "generativelanguage.googleapis.com" -- "*.ts"', { cwd: ROOT, encoding: "utf8" })
    .trim().split("\n").filter(f => !f.endsWith(".test.ts")).sort();
  assert.deepEqual(out, [
    "functions/api/generate-itinerary.ts",
    "functions/api/import/analyze.ts",
    "functions/api/mytrip/writing.ts",          // Preview/로컬 직호출 fallback 경로
    "src/app/api/generate-itinerary/route.ts",  // legacy: 정적 export 미포함(로컬 전용)
    "src/lib/scheduler/ai/canary-fixture.ts",   // fixture 상수(호출 아님)
    "src/lib/scheduler/ai/gemini-client.ts",
    "src/lib/scheduler/ai/profile-gemini-provider.ts",
    "workers/ai-writing/src/index.ts",          // Production writing 실호출(x-internal-auth 잠금)
    "workers/trend-curator/src/index.ts",       // 주간 cron·Staging 전용 선언
  ], "provider 호출부가 늘었다 — 원가 감사·프로파일 갱신 필요");
  // 모델 단일성(테스트 제외)
  const models = execSync('git grep -hoE "gemini-[0-9][a-z0-9.-]+" -- "*.ts"', { cwd: ROOT, encoding: "utf8" })
    .trim().split("\n").filter(m => /^gemini-[0-9]/.test(m) && !m.includes("flash-lite"));
  assert.ok(models.length > 0 && models.every(m => m === MODEL_SKU || m === "gemini-2"),
    `모델 단일성 위반: ${[...new Set(models)].join(",")}`);
  assert.ok(models.includes(MODEL_SKU));
});

test("AI_MODE=off 차단 — 4개 공개 route + canary 경유 전부 provider 이전", () => {
  for (const f of ["functions/api/mytrip/writing.ts", "functions/api/generate-itinerary.ts",
    "functions/api/import/analyze.ts", "functions/api/trip/personalize.ts"]) {
    const s = read(f);
    // handler 진입 직후(300자 이내)에 게이트 — provider 호출은 그 뒤의 함수에서만 일어난다
    const handler = s.search(/onRequestPost[^=]*[=(]/);
    const gate = s.indexOf("if (!aiAllowed(", handler);
    assert.ok(handler > 0 && gate > handler && gate - handler < 700,
      `${f}: 게이트가 handler 진입부에 없음(handler=${handler}, gate=${gate})`);
  }
  // Production writing 실호출 Worker 는 x-internal-auth fail-closed
  const wk = read("workers/ai-writing/src/index.ts");
  assert.ok(wk.includes("x-internal-auth") && wk.includes('json({ error: "unauthorized" }, 401)'),
    "ai-writing worker 인증 소실");
  // canary 는 personalize handler 를 import — 동일 게이트 경유
  const c = read("functions/api/admin/ai-personalization-canary.ts");
  assert.ok(c.includes('from "../trip/personalize"'), "canary 경유 경로 변경 — 감사 갱신 필요");
});

test("secret 비노출 — 이 모듈·테스트에 키·URL 원문 없음", () => {
  for (const f of ["src/lib/ai-cost/cost-model.ts", "src/lib/ai-cost/cost-model.test.ts"]) {
    const s = read(f);
    assert.ok(!/AIzaSy[A-Za-z0-9_-]{10,}/.test(s), `${f}: API key 패턴`);
    assert.ok(!s.includes("SERVICE_ROLE" + "_KEY="), `${f}: secret 값 형태`);
  }
});

// 실제 Gemini 를 부르는 스크립트의 안전 계약 고정.
//
// 이 저장소에서 돈이 나가는 코드는 이 하나뿐이다. 그래서 상한을 코드로 못 박는다.
//   · 기본 실행은 부르지 않는다
//   · --live 만으로도 부르지 않는다. confirm 토큰까지 있어야 한다
//   · 최대 3회. CLI 로 늘릴 수 없다
//   · 재시도 0. 첫 실패에서 멈춘다

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_PROVIDER_CALLS, CONFIRM_TOKEN, LIVE_MODE, isLiveAuthorized, boundedScenarios,
} from "./ai/live-smoke-contract.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/** 주석을 걷어낸 실제 코드만 본다 */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("★L19 provider 호출 상한이 3 이고 코드에 고정돼 있다", () => {
  assert.equal(MAX_PROVIDER_CALLS, 3);
  const contract = read("src", "lib", "scheduler", "ai", "live-smoke-contract.ts");
  assert.match(contract, /export const MAX_PROVIDER_CALLS = 3;/);
  // CLI 인자로 상한을 바꾸는 경로가 없다
  const src = code("scripts", "ai-personalization-live-smoke.ts");
  assert.doesNotMatch(src, /MAX_PROVIDER_CALLS\s*=/);
  assert.doesNotMatch(src, /--(max|calls|count)=/);
  assert.doesNotMatch(contract, /process\.argv|process\.env/);
});

test("★L20 4번째 호출은 만들 수 없다", () => {
  const many = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(boundedScenarios(many).length, 3);
  // 스크립트가 정의한 시나리오도 3개다 (정적 확인 — 스크립트는 handler 를 끌어오므로 import 하지 않는다)
  const src = read("scripts", "ai-personalization-live-smoke.ts");
  assert.equal((src.match(/name: "LIVE-\d/g) ?? []).length, 3);
});

test("★L21 confirm 토큰이 없으면 provider 를 부르지 않는다", () => {
  assert.equal(isLiveAuthorized([]), false);
  assert.equal(isLiveAuthorized(["--live"]), false);
  assert.equal(isLiveAuthorized([`--confirm=${CONFIRM_TOKEN}`]), false);
  assert.equal(isLiveAuthorized(["--live", "--confirm=WRONG"]), false);
  assert.equal(isLiveAuthorized(["--live", `--confirm=${CONFIRM_TOKEN}`]), true);
  assert.equal(CONFIRM_TOKEN, "GEMINI-STAGING-LIVE-3");
});

test("★L16 staging-live 는 이 프로세스에만 준다 — Production env 를 바꾸지 않는다", () => {
  assert.equal(LIVE_MODE, "staging-live");
  const src = read("scripts", "ai-personalization-live-smoke.ts");
  // env 를 프로세스 전역이나 파일에 쓰지 않는다
  assert.doesNotMatch(src, /process\.env\.AI_PERSONALIZATION_MODE\s*=/);
  assert.doesNotMatch(src, /writeFileSync|wrangler|\.dev\.vars/);
  // 실제 배포 handler 를 그대로 부른다 — 가짜 Gemini 호출 코드를 만들지 않는다
  assert.match(src, /from "\.\.\/functions\/api\/trip\/personalize\.ts"/);
  assert.doesNotMatch(src, /generativelanguage\.googleapis\.com/);
});

test("★L18·L25 재시도 0 · 실패 즉시 중단", () => {
  const src = read("scripts", "ai-personalization-live-smoke.ts");
  assert.match(src, /aiStatus !== "applied"/);
  assert.match(src, /process\.exit\(1\)/);
  assert.doesNotMatch(src, /for\s*\([^)]*retry|while\s*\([^)]*retry|attempt\s*\+\+/i);
  // handler 쪽 계약도 그대로다 — provider fetch 지점은 하나뿐
  const fn = read("functions", "api", "trip", "personalize.ts");
  assert.equal((fn.match(/await fetch\(/g) ?? []).length, 1);
});

test("★L22·L29 prompt 에 개인정보·좌표를 넣지 않는다", () => {
  const src = read("scripts", "ai-personalization-live-smoke.ts");
  assert.doesNotMatch(src, /\blat\b|\blng\b|address|email|device_id|payment/i);
  // 시나리오의 liked_places 는 place_id·category 두 키만 쓴다
  for (const m of src.matchAll(/\{ place_id: "[^"]+", category: "[^"]+" \}/g)) {
    assert.doesNotMatch(m[0], /lat|lng|address/);
  }
  assert.ok((src.match(/liked_places:/g) ?? []).length >= 2);
});

// 돈이 나가는 스크립트의 안전 계약을 고정한다.
//
// 이 파일이 오래 놓쳤던 것
//   예전에는 소스 문자열만 검사했다. 그래서 스크립트가 **로드조차 되지 않는**
//   상태를 아무도 몰랐다. 이제 실제로 import 해서 확인한다 — provider 는
//   부르지 않는다. import 만으로는 아무것도 나가지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_PROVIDER_CALLS, CONFIRM_TOKEN, LIVE_MODE,
  isLiveAuthorized, boundedScenarios, selectLiveScenario, readOnlyFlag,
} from "./ai/live-smoke-contract.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/** 주석을 걷어낸 실제 코드만 본다 */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCRIPT = ["scripts", "ai-personalization-live-smoke.ts"] as const;

test("★L19 provider 호출 상한이 1 이고 코드에 고정돼 있다", () => {
  assert.equal(MAX_PROVIDER_CALLS, 1);
  const contract = read("src", "lib", "scheduler", "ai", "live-smoke-contract.ts");
  assert.match(contract, /export const MAX_PROVIDER_CALLS = 1;/);
  // CLI 인자로 상한을 바꾸는 경로가 없다
  const src = code(...SCRIPT);
  assert.doesNotMatch(src, /MAX_PROVIDER_CALLS\s*=/);
  assert.doesNotMatch(src, /--(max|calls|count)=/);
  assert.doesNotMatch(contract, /process\.env/);
});

test("★L20 두 번째 호출을 만들 수 없다", () => {
  const many = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(boundedScenarios(many).length, 1);
  // 실제 호출 지점은 스크립트 전체에서 하나뿐이다
  const src = code(...SCRIPT);
  assert.equal((src.match(/callProfileProvider\(/g) ?? []).length, 1);
  assert.doesNotMatch(src, /for\s*\([^)]*retry|while\s*\([^)]*retry|attempt\s*\+\+/i);
});

test("★L20b live 는 --only 로 대상을 명시해야 한다", () => {
  assert.equal(readOnlyFlag([]), null);
  assert.equal(readOnlyFlag(["--only="]), null);
  assert.equal(readOnlyFlag(['--only=LIVE-1 seoul']), "LIVE-1 seoul");

  const all = [{ name: "LIVE-1 seoul" }, { name: "LIVE-2 other" }];
  assert.deepEqual(selectLiveScenario([], all), { ok: false, reason: "only_required" });
  assert.deepEqual(selectLiveScenario(["--only=nope"], all), { ok: false, reason: "unknown_scenario" });
  const hit = selectLiveScenario(["--only=LIVE-2 other"], all);
  assert.equal(hit.ok, true);
  if (hit.ok) assert.equal(hit.scenario.name, "LIVE-2 other");
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
  const src = read(...SCRIPT);
  assert.doesNotMatch(src, /process\.env\.AI_PERSONALIZATION_MODE\s*=/);
  assert.doesNotMatch(src, /writeFileSync|wrangler|\.dev\.vars/);
});

test("★L16b Production 과 같은 조각을 쓴다 — 복제하지 않는다", () => {
  const src = code(...SCRIPT);
  // route 를 끌어오지 않는다 (Cloudflare runtime 차이에 걸린다)
  assert.doesNotMatch(src, /functions\/api\/trip\/personalize/);
  // 대신 그 route 가 쓰는 조각을 그대로 부른다
  for (const mod of [
    "profile-personalization-core", "profile-gemini-provider",
    "personalization-profile", "scheduler/engine",
  ]) {
    assert.ok(src.includes(mod), `${mod} 를 재사용해야 한다`);
  }
  // prompt·요청 본문·파서를 자기 손으로 만들지 않는다
  assert.doesNotMatch(src, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(src, /generationConfig|responseSchema|thinkingConfig/);
  assert.doesNotMatch(src, /You infer a traveler preference profile/);
  assert.doesNotMatch(src, /JSON\.parse\(t\)/);
});

test("★L18·L25 재시도 0 · provider 호출 지점은 공용 provider 하나", () => {
  const provider = code("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts");
  assert.equal((provider.match(/await providerFetch\(/g) ?? []).length, 1);
  assert.equal((provider.match(/await fetch\(/g) ?? []).length, 0);
  assert.ok(!/for\s*\(|while\s*\(/.test(provider), "반복문이 있으면 두 번째 요청이 가능해진다");
  // route 도 자기 호출 코드를 갖지 않는다
  const route = code("functions", "api", "trip", "personalize.ts");
  assert.doesNotMatch(route, /generativelanguage\.googleapis\.com/);
  assert.match(route, /callProfileProvider\(/);
});

test("★L22·L29 prompt 에 개인정보·좌표가 들어가지 않는다", () => {
  const src = read(...SCRIPT);
  for (const bad of ["address", "email", "device_id", "payment", "photo", "memo"]) {
    assert.doesNotMatch(src, new RegExp(bad, "i"), `${bad} 가 있다`);
  }
  // 좌표는 스케줄러 검증용으로만 쓰고 provider 로 보내는 body 에는 넣지 않는다.
  const body = src.slice(src.indexOf("selected_places:"), src.indexOf("liked_place_ids"));
  assert.doesNotMatch(body, /\blat\b|\blng\b/, "provider 로 나가는 장소에 좌표가 붙었다");
  assert.match(body, /place_id: p\.place_id, category: p\.category, name: p\.name/);
});

test("★L30 스크립트가 실제로 로드된다 — provider 호출 0", async () => {
  // 예전에는 이 확인이 없어서 스크립트가 로드조차 안 되는 상태를 오래 놓쳤다.
  const m = await import("../../../scripts/ai-personalization-live-smoke.ts");
  assert.ok(Array.isArray(m.SCENARIOS) && m.SCENARIOS.length >= 1);
  assert.equal(m.MAX_PROVIDER_CALLS, 1);
  assert.equal(typeof m.isLiveAuthorized, "function");
  // import 만으로는 아무것도 나가지 않는다 — main 은 직접 실행일 때만 돈다
  const src = code(...SCRIPT);
  assert.match(src, /const invokedDirectly = process\.argv\[1\]\?\.includes\(/);
  assert.match(src, /if \(invokedDirectly\) \{ void main\(\); \}/);
});

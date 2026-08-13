// 실제 Gemini 요청 계약 고정.
//
// 왜 필요한가
//   프롬프트로 "JSON 만 내라" 라고 부탁했더니 HTTP 200 에 25 토큰짜리 파싱 불가 응답이 왔다.
//   형식은 부탁이 아니라 계약이어야 하고, 실패했을 때 왜 실패했는지 알 수 있어야 한다.
//
// 동시에 비용 안전장치는 한 칸도 물러서지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROFILE_CATEGORIES, TIME_PREFERENCES } from "./personalization-profile.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
// 엔드포인트 구현은 route 와 그 route 가 쓰는 순수 core 두 파일에 걸쳐 있다.
// prompt·스키마·상수는 core 로 옮겨졌고 provider 호출은 route 에 남았다.
// 계약은 둘을 합친 것이므로 여기서도 합쳐서 본다 — 단정은 그대로다.
const FN   = () => [
  read("functions", "api", "trip", "personalize.ts"),
  read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts"),
  read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts"),
].join("\n");

test("★P6·P7·P8 thinking 을 끄고 Structured Output 으로 형식을 계약한다", () => {
  const s = FN();
  assert.match(s, /thinkingConfig:\s*\{\s*thinkingBudget:\s*0\s*\}/);
  assert.match(s, /responseMimeType:\s*"application\/json"/);
  assert.match(s, /responseSchema:\s*RESPONSE_SCHEMA/);
  assert.match(s, /const RESPONSE_SCHEMA = \{/);
});

test("★P5·P9 스키마는 PersonalizationProfile 과 1:1 이고 validator 는 그대로 남는다", () => {
  const s = FN();
  for (const f of ["profile_version", "category_weights", "preferred_place_ids",
                   "time_preferences", "pace_bias", "day_density_preference",
                   "cluster_preference", "meal_preference", "preference_summary"]) {
    assert.ok(s.includes(f), `스키마에 ${f} 가 없다`);
  }
  // 자유 map 대신 실제 enum 을 펼쳐 쓴다 — 느슨하게 풀지 않는다
  assert.match(s, /PROFILE_CATEGORIES\.map\(c => \[c, \{ type: "NUMBER" \}\]\)/);
  assert.match(s, /enum: \[\.\.\.TIME_PREFERENCES\]/);
  assert.ok(PROFILE_CATEGORIES.length >= 5 && TIME_PREFERENCES.length === 4);
  // provider 스키마를 믿고 서버 검증을 없애면 안 된다
  assert.match(s, /validateProfile\(parsed, allowedIds\)/);
  // 후보 밖 id 는 validator 가 막는다
  assert.match(s, /const allowedIds = /);
});

test("★P10~P15 실패 원인을 알 수 있는 진단값을 남긴다", () => {
  const s = FN();
  for (const f of ["finishReason", "finishMessage", "candidatesCount", "partsCount",
                   "candidateChars", "thoughtsTokens", "totalTokens", "cachedTokens",
                   "jsonParsed", "validatorPassed", "model"]) {
    assert.match(s, new RegExp(`${f}:`), `진단값 ${f} 가 없다`);
  }
  // provider 가 안 준 값을 0 으로 추측하지 않는다
  assert.match(s, /provider_not_returned/);
  assert.doesNotMatch(s, /thoughtsTokenCount\s*\?\?\s*0/);
  // 응답 원문을 통째로 남기지 않는다
  assert.doesNotMatch(s, /log\(\{[^}]*rawResponse|JSON\.stringify\(raw\)/);
});

test("★P22~P24·P29 비용 안전장치는 그대로다", () => {
  const s = FN();
  assert.match(s, /const TIMEOUT_MS\s+= 8_000;/);
  assert.match(s, /const MAX_OUTPUT_TOKENS = 700;/);
  assert.match(s, /const MODEL\s+= "gemini-2\.5-flash";/);
  assert.match(s, /const MAX_PROMPT_CHARS = 6_000;/);
  assert.equal((s.match(/await providerFetch\(/g) ?? []).length, 1);   // provider 호출 지점 하나
  assert.equal((s.match(/await fetch\(/g) ?? []).length, 0);           // 주입 우회 없음
  assert.doesNotMatch(s, /for\s*\([^)]*attempt|while\s*\([^)]*attempt|retry/i);
  assert.match(s, /attempts: 1/);
});

test("★P16 mode gate — staging-live/production-live 만 provider 를 부른다", () => {
  const s = FN();
  assert.match(s, /if \(mode === "off"\)/);
  assert.match(s, /if \(mode === "mock"\)/);
  assert.match(s, /if \(!modeAllowsProviderCall\(mode\)\)/);
  // 모르는 값은 off
  const mod = read("src", "lib", "scheduler", "ai", "personalization-profile.ts");
  assert.match(mod, /includes\(v\) \? \(v as AiMode\) : "off"/);
});

test("★P25·P26 prompt 에 좌표·주소·개인정보를 넣지 않는다", () => {
  const s = FN();
  const promptFn = s.slice(s.indexOf("function buildPrompt"), s.indexOf("const RESPONSE_SCHEMA"));
  assert.doesNotMatch(promptFn, /[bp]\.(lat|lng|address|price|entry_fee|coordinate)\b/);
  assert.doesNotMatch(promptFn, /device_id|email|\bip\b/i);
});

test("★P19 whole-trip provider 호출은 1회 계약이다", () => {
  // 날짜별 plan 은 provider 를 부르지 않는다
  const plan = read("functions", "api", "trip", "plan.ts");
  assert.doesNotMatch(plan, /generativelanguage|GEMINI_API_KEY/);
  // 클라이언트는 날짜 루프 밖에서 한 번만 부른다
  const page = read("src", "app", "itinerary", "page.tsx");
  assert.equal((page.match(/fetchPersonalizationProfile\(/g) ?? []).length, 1);
});

test("★P1·P3 Functions typecheck gate 가 존재하고 배포 코드를 포함한다", () => {
  const cfg = JSON.parse(read("tsconfig.functions.json").replace(/^\s*\/\/.*$/gm, ""));
  assert.deepEqual(cfg.include, ["functions/**/*.ts"]);
  assert.equal(cfg.compilerOptions.strict, true);
  // 실제 배포 endpoint 를 exclude 로 빼내 게이트를 무력화할 수 없다
  for (const ex of cfg.exclude as string[]) {
    assert.doesNotMatch(ex, /^functions\//, `배포 endpoint 가 typecheck 에서 제외됐다: ${ex}`);
  }
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["typecheck:functions"], "tsc --noEmit -p tsconfig.functions.json");
});

test("★P2·P3 A안 수정에 unsafe 억제가 없다", () => {
  const files = ["functions/api/admin/upsert-spots.ts",
                 "functions/api/trip-moments/index.ts",
                 "functions/shared/[id].ts"];
  for (const f of files) {
    const s = read(...f.split("/"));
    assert.doesNotMatch(s, /@ts-ignore|@ts-expect-error/, f);
    assert.doesNotMatch(s, /as unknown as/, f);
    assert.doesNotMatch(s, /:\s*any\b/, f);
  }
});

test("★P4 공유 페이지 — trip 이 없으면 브랜드 fallback, 정상 trip 은 그대로", () => {
  const s = read("functions", "shared", "[id].ts");
  assert.match(s, /: FALLBACK_OG;/);
  assert.match(s, /img\/trip-cover\/\$\{shareId\}\?v=\$\{encodeURIComponent\(coverVersion\)\}/);
  // 도시별 OG 를 새로 켜지 않았다
  assert.doesNotMatch(s, /CITY_OG_IMAGE\[/);
});

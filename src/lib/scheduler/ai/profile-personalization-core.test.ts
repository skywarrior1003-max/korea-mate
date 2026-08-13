// route 에서 꺼낸 prompt·파서가 **한 글자도 달라지지 않았는지** 고정한다.
//
// 왜 golden 인가
//   이건 기능 개선이 아니라 자리 옮기기다. 옮기면서 문장을 다듬고 싶어지는데,
//   그러면 다음에 실제 모델이 다르게 답해도 원인을 알 수 없다. 그래서 옮기기
//   **전** 코드로 만든 출력을 그대로 박아 두고 대조한다.
//
//   fixture 는 리팩터 직전 원본 함수를 그대로 실행해 만들었다. 손으로 옮겨
//   적은 값이 아니다.
//
// 여기서 provider 를 부르지 않는다. 네트워크가 필요한 것이 하나도 없다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPrompt, extractJson, RESPONSE_SCHEMA,
  MODEL, TIMEOUT_MS, MAX_OUTPUT_TOKENS, MAX_PROMPT_CHARS,
} from "./profile-personalization-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p.join("/").split("/")), "utf8");

interface Golden {
  prompts:        { name: string; out: string }[];
  promptsNoLiked: { name: string; out: string }[];
  parses:         { in: string; out: unknown }[];
  schema:         unknown;
}
const golden = JSON.parse(
  read("src/lib/scheduler/ai/__fixtures__/profile-personalization-golden.json"),
) as Golden;

const P = (id: string, name?: string, category?: string) => ({ place_id: id, name, category });

/** golden 을 만든 것과 같은 입력. 순서·값이 어긋나면 대조가 무의미하다. */
const CASES: { name: string; body: never; places: never[]; liked: never[] }[] = [
  { name: "typical", body: { city: "seoul", locale: "en", start_date: "2026-10-16", end_date: "2026-10-18",
      travel_style: "culture", travelers: 2, pace: "normal" },
    places: [P("1", "Gyeongbokgung", "attraction"), P("2", "Gwangjang Market", "restaurant")], liked: [] },
  { name: "kpop-cafe-relaxed", body: { city: "seoul", locale: "en", start_date: "2026-10-16", end_date: "2026-10-18",
      travel_style: "local", travelers: 1, pace: "relaxed",
      interests: ["k-pop", "cafe", "night view", "first time in seoul"] },
    places: [P("1", "Gyeongbokgung", "attraction"), P("3", "Seongsu Cafe", "cafe"),
             P("user_spot:11111111-2222-3333-4444-555555555555", "My Spot", "cafe")],
    liked: [P("16", "Han River", "nature")] },
  { name: "empty-optional", body: {}, places: [], liked: [] },
  { name: "long-name-truncation", body: { city: "busan" },
    places: [P("9", "가".repeat(200), "attraction")], liked: [] },
  { name: "over-place-cap", body: { city: "seoul", interests: Array.from({ length: 20 }, (_, i) => `i${i}`) },
    places: Array.from({ length: 60 }, (_, i) => P(String(i), `P${i}`, "attraction")),
    liked:  Array.from({ length: 60 }, (_, i) => P(`L${i}`, `L${i}`, "cafe")) },
  { name: "no-category-no-name", body: { city: "seoul", travelers: "2" },
    places: [{ place_id: "7" }], liked: [] },
] as never;

// ── A. prompt 동일성 ─────────────────────────────────────────────────────────

test("A prompt 가 옮기기 전과 글자 단위로 같다", () => {
  assert.equal(CASES.length, golden.prompts.length, "케이스 수가 맞아야 대조가 성립한다");
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!, g = golden.prompts[i]!;
    assert.equal(g.name, c.name, `순서가 어긋났다 (${i})`);
    assert.equal(buildPrompt(c.body, c.places, c.liked), g.out, `${c.name}: prompt 가 달라졌다`);
  }
});

test("A liked 를 생략해도 기본값 동작이 같다", () => {
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!, g = golden.promptsNoLiked[i]!;
    assert.equal(buildPrompt(c.body, c.places), g.out, `${c.name}: liked 기본값 동작이 달라졌다`);
  }
});

test("A prompt 상한이 그대로다", () => {
  assert.equal(MAX_PROMPT_CHARS, 6_000);
  const huge = buildPrompt(
    { city: "x", interests: Array.from({ length: 500 }, (_, i) => `interest-${i}`) } as never,
    Array.from({ length: 500 }, (_, i) => P(String(i), `name-${i}`, "attraction")) as never,
  );
  assert.ok(huge.length <= MAX_PROMPT_CHARS, `${huge.length} > ${MAX_PROMPT_CHARS}`);
});

// ── B. 파서 동일성 ───────────────────────────────────────────────────────────

test("B JSON 추출이 옮기기 전과 같다 — 성공도 실패도", () => {
  assert.equal(golden.parses.length, 9);
  for (const g of golden.parses) {
    assert.deepEqual(extractJson(g.in), g.out, `입력 ${JSON.stringify(g.in).slice(0, 40)}`);
  }
});

test("B 지금 못 읽는 형식을 새로 읽게 만들지 않았다", () => {
  // 옮기는 김에 관대해지면, 다음에 모델이 형식을 어겨도 조용히 통과한다.
  assert.equal(extractJson("no json here"), null);
  assert.equal(extractJson(""), null);
  assert.equal(extractJson("{\"a\":"), null);
});

// ── C. provider 요청 계약 ────────────────────────────────────────────────────

test("C 모델·상한·timeout 이 그대로다", () => {
  assert.equal(MODEL, "gemini-2.5-flash");
  assert.equal(TIMEOUT_MS, 8_000);
  assert.equal(MAX_OUTPUT_TOKENS, 700);
});

test("C 응답 스키마가 옮기기 전과 같다", () => {
  assert.deepEqual(RESPONSE_SCHEMA, golden.schema);
});

// ── D. route 계약 ────────────────────────────────────────────────────────────

const ROUTE = read("functions/api/trip/personalize.ts");
/** 실행부만 본다 — 주석에 남은 단어에 걸리지 않게. */
const routeCode = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");

test("D route 가 core 를 쓰고 자기 복사본을 갖지 않는다", () => {
  assert.match(routeCode, /from "\.\.\/\.\.\/\.\.\/src\/lib\/scheduler\/ai\/profile-personalization-core"/);
  for (const gone of ["function buildPrompt", "function extractJson", "const RESPONSE_SCHEMA"]) {
    assert.ok(!routeCode.includes(gone), `route 에 ${gone} 이 남아 있다 — 복사본이 두 벌이 된다`);
  }
});

test("D provider 호출 계약이 그대로다", () => {
  // 호출 코드는 공용 provider 로 옮겨졌다. route 는 그것을 한 번 부를 뿐이다.
  const prov = read("src/lib/scheduler/ai/profile-gemini-provider.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");
  assert.equal((routeCode.match(/callProfileProvider\(/g) ?? []).length, 1);
  assert.equal((prov.match(/providerFetch\(/g) ?? []).length, 1);   // 호출 지점 하나
  assert.match(prov, /const providerFetch = args\.fetchFn \?\? fetch;/);
  assert.ok(!/for\s*\(|while\s*\(/.test(prov), "provider 에 반복문이 없어야 한다");
  assert.match(prov, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{MODEL\}:generateContent/);
  assert.match(prov, /temperature:\s*0\.3/);
  assert.match(prov, /thinkingBudget:\s*0/);
  assert.match(prov, /responseMimeType:\s*"application\/json"/);
  assert.match(prov, /responseSchema:\s*RESPONSE_SCHEMA/);
});

test("D gate·응답 계약이 그대로다", () => {
  assert.match(routeCode, /resolveAiMode/);
  assert.match(routeCode, /modeAllowsProviderCall/);
  assert.match(routeCode, /validateProfile\(parsed, allowedIds\)/);
  assert.match(routeCode, /json\(\{ profile, ai_status \}\)/);
  assert.match(routeCode, /onRequestPost/);
  assert.match(routeCode, /onRequestOptions/);
});

// ── E. privacy — provider 로 나가는 범위가 넓어지지 않았다 ───────────────────

test("E prompt 에 좌표·기기·비밀이 들어갈 자리가 없다", () => {
  const src = read("src/lib/scheduler/ai/profile-personalization-core.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");
  for (const bad of ["lat", "lng", "coordinate", "device", "address", "photo", "email", "API_KEY"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(src), `core 에 ${bad} 가 있다`);
  }
  // 실제 출력에도 없다
  const out = buildPrompt(
    { city: "seoul" } as never,
    [P("1", "Gyeongbokgung", "attraction")] as never,
  );
  for (const bad of ["lat", "lng", "37.5", "126.9"]) assert.ok(!out.includes(bad), `prompt 에 ${bad}`);
});

test("E core 에 네트워크·secret 접근이 없다", () => {
  const src = read("src/lib/scheduler/ai/profile-personalization-core.ts");
  for (const bad of ["fetch(", "process.env", "generativelanguage", "Authorization"]) {
    assert.ok(!src.includes(bad), `core 는 순수해야 한다 — ${bad} 발견`);
  }
});

// ── F. harness 준비 상태 (provider 호출 0) ───────────────────────────────────

test("F core 가 route 없이 단독으로 로드된다", async () => {
  const m = await import("./profile-personalization-core.ts");
  for (const k of ["buildPrompt", "extractJson", "RESPONSE_SCHEMA", "MODEL"]) {
    assert.ok(k in m, `${k} 가 없다`);
  }
  // 이 테스트가 도는 동안 네트워크는 필요 없다
  assert.equal(typeof m.buildPrompt, "function");
});

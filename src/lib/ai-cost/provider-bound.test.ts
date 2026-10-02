// 모든 AI 경로의 비용 상한 — 공용 상한 함수·Worker 확인·경로별 예약 (2026-10-02)
// node --experimental-strip-types --test src/lib/ai-cost/provider-bound.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { providerBodyBound, PRICED_MODELS, IMAGE_TOKENS, IMAGE_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_CAP, RESERVED_HEADER } from "./provider-bound.ts";
import { buildProviderRequestBody } from "../scheduler/ai/profile-gemini-provider.ts";
import { buildFullTripPrompt, buildFullTripProviderBody, fullTripReserveUsdMicro, fullTripTextBytes } from "../mytrip-writing/full-trip-core.ts";
import { worstFullTripFacts, worstFullTripImages } from "../mytrip-writing/full-trip-worst-fixture.ts";
import { buildAnalyzePrompt, MAX_TEXT_CHARS } from "../url-import/import-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");
const body = (over: Record<string, unknown> = {}, gc: Record<string, unknown> = {}) => ({
  contents: [{ parts: [{ text: "가".repeat(100) }] }],
  generationConfig: { maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 }, ...gc }, ...over,
});

test("상한식 — (사진 데이터 뺀 본문 바이트 + 사진×해상도 토큰) × 입력 단가 + 출력 상한 × 출력 단가", () => {
  const b = body();
  const r = providerBodyBound(b);
  assert.ok(r.ok);
  const bytes = new TextEncoder().encode(JSON.stringify(b)).length;
  assert.equal(r.textBytes, bytes);
  assert.equal(r.usdMicro, Math.ceil(bytes * 0.30 + 700 * 2.50));
  // 사진: 데이터는 세지 않고 장수 × 해상도 토큰(지정 없으면 1120)
  const withImg = { contents: [{ parts: [{ text: "x" }, { inlineData: { mimeType: "image/jpeg", data: "A".repeat(500_000) } }] }], generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } } };
  const ri = providerBodyBound(withImg);
  assert.ok(ri.ok && ri.images === 1 && ri.imageTokens === IMAGE_TOKENS_DEFAULT && ri.textBytes < 2_000);
  const rm = providerBodyBound({ ...withImg, generationConfig: { ...withImg.generationConfig, mediaResolution: "MEDIA_RESOLUTION_MEDIUM" } });
  assert.ok(rm.ok && rm.imageTokens === IMAGE_TOKENS.MEDIA_RESOLUTION_MEDIUM);
  // 단가는 받는 모델 중 가장 비싼 값
  assert.deepEqual(Object.keys(PRICED_MODELS).sort(), ["gemini-2.5-flash", "gemini-3.5-flash-lite"]);
});

test("계산할 수 없는 요청은 거절 — 도구·외부 파일·사진 외 미디어·출력 상한 없음/초과·사고 무제한", () => {
  const reasons = [
    providerBodyBound(body({ tools: [{ google_search: {} }] })),
    providerBodyBound({ contents: [{ parts: [{ fileData: { fileUri: "gs://x" } }] }], generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } } }),
    providerBodyBound({ contents: [{ parts: [{ inlineData: { mimeType: "audio/mp3", data: "AA" } }] }], generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } } }),
    providerBodyBound(body({}, { maxOutputTokens: undefined })),
    providerBodyBound(body({}, { maxOutputTokens: MAX_OUTPUT_TOKENS_CAP + 1 })),
    providerBodyBound(body({}, { thinkingConfig: undefined })),
    providerBodyBound("not json"),
  ].map(r => (r.ok ? "ok" : r.reason));
  assert.deepEqual(reasons, ["tools_not_allowed", "file_data_not_allowed", "non_image_media", "no_output_cap", "output_cap_too_large", "thinking_unbounded", "invalid_body"]);
});

test("본문 바이트 ≥ 실제 토큰 — 이스케이프가 가장 긴 제어 문자·드문 기호로 채워도 바이트로 센다(문자 수가 아니다)", () => {
  const ctrl = providerBodyBound(body({ contents: [{ parts: [{ text: "\u0001".repeat(1000) }] }] }));
  const ko = providerBodyBound(body({ contents: [{ parts: [{ text: "가".repeat(1000) }] }] }));
  assert.ok(ctrl.ok && ko.ok);
  assert.ok(ctrl.textBytes >= 6000, "제어 문자 1개 = 본문 6바이트(\\u0001)");
  assert.ok(ko.textBytes >= 3000, "한글 1자 = 3바이트");
});

test("개인화 — 고정 2,500 대신 본문 상한으로 예약 · 6,000자 상한을 드문 문자로 채운 최악도 계산된다", () => {
  const worst = providerBodyBound(buildProviderRequestBody("\u0001".repeat(6_000)));
  assert.ok(worst.ok && worst.usdMicro > 2_500, `${worst.ok && worst.usdMicro}`);
  const p = read("functions", "api", "trip", "personalize.ts");
  assert.match(p, /const bound = providerBodyBound\(buildProviderRequestBody\(prompt\)\);/);
  assert.match(p, /worstUsdMicro: bound\.usdMicro,/);
  assert.match(p, /bindingProviderFetch\(ctx\.env, bound\.usdMicro\)/);
  assert.doesNotMatch(p, /worstUsdMicro: 2_500/);
});

test("가져오기 — 제목·설명을 자르고, 고정 12,100 대신 본문 상한으로 예약 · 본문 바이트를 Worker 에 알린다", () => {
  const long = "\u0001".repeat(50_000);
  const prompt = buildAnalyzePrompt({ title: long, description: long, text: "가".repeat(MAX_TEXT_CHARS) }, "https://x.test/" + "a".repeat(5_000));
  assert.ok(prompt.length < MAX_TEXT_CHARS + 300 + 600 + 2_048 + 20_000, `${prompt.length}`);
  const a = read("functions", "api", "import", "analyze.ts");
  assert.match(a, /const bound = providerBodyBound\(analyzeBody\);/);
  assert.match(a, /worstUsdMicro: bound\.usdMicro,/);
  assert.match(a, /"x-provider-max-bytes": String\(bodyBytes \+ 1_000\)/);
  assert.doesNotMatch(a, /worstUsdMicro: 12_100/);
});

test("전체 여행 글쓰기 — 공용 상한과 전체 여행 식이 같은 값(최악 본문으로 확인) · 형식 오류 응답은 실제 사용량으로 확정", () => {
  const prompt = buildFullTripPrompt(worstFullTripFacts());
  const imgs = worstFullTripImages().map(i => ({ ...i, data: "QUFB" }));
  const b = providerBodyBound(buildFullTripProviderBody(prompt, imgs));
  assert.ok(b.ok);
  assert.equal(b.usdMicro, fullTripReserveUsdMicro(fullTripTextBytes(prompt, imgs), imgs.length));
  const w = read("functions", "api", "mytrip", "writing-full.ts");
  assert.match(w, /if \(!notSent && \(inTok !== null \|\| outTok !== null\)\) \{\n\s+await aiOpsSettle\([^)]*"committed"/);
  assert.match(w, /\[RESERVED_HEADER\]: String\(reserveUsdMicro\)/);
});

test("레거시 일정 — 사고 끔·시간 상한·입력 자르기·시도 수 × 1회 상한으로 예약·실제 사용량으로 확정", () => {
  const g = read("functions", "api", "generate-itinerary.ts");
  assert.match(g, /thinkingConfig: \{ thinkingBudget: 0 \}/);
  assert.match(g, /const LEGACY_TIMEOUT_MS = 30_000;/);
  assert.match(g, /\} = clipLegacyBody\(body\);/);
  assert.match(g, /worstUsdMicro: perAttempt\.usdMicro \* MAX_RETRIES,/);
  assert.doesNotMatch(g, /usdMicro: 22_000/);
  assert.match(g, /if \(new TextEncoder\(\)\.encode\(text\)\.length > 512 \* 1024\) return aiFeatureUnavailable\(413\);/);
});

test("서울 Worker — 단가 모르는 모델·계산 불가 본문·예약액 < 상한이면 보내지 않는다(provider 0) · 바이트로 잰다", () => {
  const w = read("workers", "ai-writing", "src", "index.ts");
  const prov = w.slice(w.indexOf('if (path === "/provider")'));
  const fetchAt = prov.indexOf("await fetch(");
  for (const s of ['if (!PRICED_MODELS[modelOf(env)]) return refused({ error: "model_not_priced" }, 503);',
                   "const bound = providerBodyBound(parsed);",
                   'return refused({ error: "reservation_below_bound" }, 409);',
                   "if (new TextEncoder().encode(raw).length > bodyMax)"]) {
    const i = prov.indexOf(s);
    assert.ok(i > 0 && i < fetchAt, s);
  }
  assert.equal(RESERVED_HEADER, "x-gkm-reserved-usd-micro");
});

test("원장 밖 호출 — 관리자 모델 점검·Preview 진단은 원장 기록·일일 상한(스위치와 무관), 진단은 관리자 키 필수", () => {
  const mc = read("functions", "api", "admin", "ai-model-check.ts");
  assert.ok(mc.indexOf("aiOpsReserveOpsCheck(env") < mc.indexOf('fetch("https://ai-writing.internal/model-check"'));
  const an = read("functions", "api", "import", "analyze.ts");
  const gate = an.indexOf("checkAdminAuth(ctx.request");
  assert.ok(gate > 0 && gate < an.indexOf('"https://ai-writing.internal/probe"') && gate < an.indexOf('"https://ai-writing.internal/model-check"'));
  const og = read("functions", "_lib", "ai-ops-guard.ts");
  assert.match(og, /export async function aiOpsReserveOpsCheck/);
  assert.match(og, /event: "ai_ops_overrun", ledgerId, reservedUsdMicro/, "초과 지출 기록");
  assert.match(og, /event: "ai_ops_overrun_block"/, "이후 차단 기록");
});

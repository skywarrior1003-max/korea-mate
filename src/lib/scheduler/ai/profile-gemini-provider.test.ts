// provider 호출이 route 에 있을 때와 똑같은지 고정한다.
//
// 여기서 실제 Gemini 를 부르지 않는다. fetch 를 주입해 나가는 요청을 붙잡고,
// 돌려줄 응답도 우리가 정한다. 그래서 이 파일은 network 없이 돈다.
//
// 무엇을 지키는가
//   · URL·model·body 가 옮기기 전과 같다
//   · 실패는 재호출하지 않는다 — HTTP 오류든 timeout 이든 network 오류든
//   · route 와 harness 가 **같은 호출 코드 한 벌**을 쓴다

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callProfileProvider, buildProviderRequestBody, buildProviderUrl,
} from "./profile-gemini-provider.ts";
import {
  MODEL, TIMEOUT_MS, MAX_OUTPUT_TOKENS, RESPONSE_SCHEMA,
} from "./profile-personalization-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "")
            .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");

/** 나가는 요청을 붙잡고 정해진 응답을 돌려준다. 호출 횟수도 센다. */
function spyFetch(reply: () => Promise<Response> | Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return reply();
  }) as typeof fetch;
  return { fn, calls };
}

const okBody = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
});
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ── A. URL / model ───────────────────────────────────────────────────────────

test("A URL 과 model 이 그대로다", () => {
  const url = buildProviderUrl("KEY");
  assert.equal(url,
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=KEY`);
  assert.equal(MODEL, "gemini-2.5-flash");
  assert.ok(url.includes("v1beta"));
  assert.ok(url.includes(":generateContent"));
});

// ── B. request body ──────────────────────────────────────────────────────────

test("B 요청 본문이 옮기기 전과 같다", () => {
  const b = buildProviderRequestBody("PROMPT") as Record<string, unknown>;
  assert.deepEqual(b, {
    contents: [{ parts: [{ text: "PROMPT" }] }],
    generationConfig: {
      maxOutputTokens:  MAX_OUTPUT_TOKENS,
      temperature:      0.3,
      responseMimeType: "application/json",
      responseSchema:   RESPONSE_SCHEMA,
      thinkingConfig:   { thinkingBudget: 0 },
    },
  });
  // 키 순서까지 같아야 직렬화 결과가 같다
  assert.deepEqual(Object.keys(b), ["contents", "generationConfig"]);
  assert.deepEqual(Object.keys(b.generationConfig as object),
    ["maxOutputTokens", "temperature", "responseMimeType", "responseSchema", "thinkingConfig"]);
  // role 은 붙이지 않는다 — 그건 설명문용 client 의 형태다
  assert.ok(!JSON.stringify(b).includes('"role"'));
});

test("B 실제로 나가는 요청이 그 본문 그대로다", async () => {
  const spy = spyFetch(() => jsonRes(okBody('{"a":1}')));
  await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(spy.calls.length, 1);
  const c = spy.calls[0]!;
  assert.equal(c.url, buildProviderUrl("K"));
  assert.equal(c.init.method, "POST");
  assert.deepEqual(c.init.headers, { "Content-Type": "application/json" });
  assert.equal(c.init.body, JSON.stringify(buildProviderRequestBody("P")));
  assert.ok(c.init.signal, "AbortController signal 이 붙어야 timeout 이 산다");
});

// ── C. timeout ───────────────────────────────────────────────────────────────

test("C timeout 이 8초 그대로다", () => {
  assert.equal(TIMEOUT_MS, 8_000);
});

test("C abort 는 timeout 으로 구분된다", async () => {
  const spy = spyFetch(() => {
    const e = new Error("aborted"); e.name = "AbortError"; throw e;
  });
  const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { kind: string }).kind, "timeout");
  assert.equal(spy.calls.length, 1, "재호출 없음");
});

// ── D. 정상 응답 추출 ────────────────────────────────────────────────────────

test("D 정상 응답에서 text 와 raw 를 그대로 넘긴다", async () => {
  const spy = spyFetch(() => jsonRes(okBody('{"profile_version":1}')));
  const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.text, '{"profile_version":1}');
  assert.equal(r.raw.candidates?.[0]?.finishReason, "STOP");
  assert.equal(r.raw.usageMetadata?.totalTokenCount, 30);
  assert.ok(typeof r.latencyMs === "number");
});

test("D parts 가 비어도 빈 문자열로 돌려준다 — 예전과 같다", async () => {
  const spy = spyFetch(() => jsonRes({ candidates: [{ content: { parts: [] } }] }));
  const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.text, "");
});

// ── E. HTTP 실패 ─────────────────────────────────────────────────────────────

test("E 200 이 아니면 status 를 그대로 올리고 재호출하지 않는다", async () => {
  for (const status of [400, 401, 403, 404, 408, 429, 500, 503]) {
    const spy = spyFetch(() => jsonRes({ error: "x" }, status));
    const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
    assert.equal(r.ok, false);
    assert.equal((r as { kind: string }).kind, "http");
    assert.equal((r as { httpStatus: number }).httpStatus, status);
    assert.equal(spy.calls.length, 1, `${status}: 재호출 없음`);
  }
});

// ── F. network / 파싱 실패 ───────────────────────────────────────────────────

test("F network 오류는 error 로 구분되고 재호출하지 않는다", async () => {
  const spy = spyFetch(() => { throw new TypeError("network down"); });
  const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { kind: string }).kind, "error");
  assert.equal(spy.calls.length, 1);
});

test("F 응답이 JSON 이 아니면 error 다 — timeout 과 섞지 않는다", async () => {
  const spy = spyFetch(() => new Response("not json", { status: 200 }));
  const r = await callProfileProvider({ prompt: "P", apiKey: "K", fetchFn: spy.fn });
  assert.equal(r.ok, false);
  assert.equal((r as { kind: string }).kind, "error");
});

// ── G. 재시도 없음 ───────────────────────────────────────────────────────────

test("G provider 모듈에 재시도 루프가 없다", () => {
  const src = code("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts");
  assert.ok(!/for\s*\(|while\s*\(/.test(src), "반복문이 있으면 두 번째 요청이 가능해진다");
  assert.equal((src.match(/providerFetch\(/g) ?? []).length, 1, "호출 지점은 하나뿐");
  assert.ok(!/retry/i.test(src));
});

test("G provider 는 환경변수·secret 을 읽지 않는다", () => {
  const src = read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts");
  for (const bad of ["process.env", "GEMINI_API_KEY", "readFileSync", ".env"]) {
    assert.ok(!src.includes(bad), `provider 에 ${bad} 가 있다`);
  }
});

// ── route 가 같은 provider 를 쓴다 ───────────────────────────────────────────

test("route 는 자기 fetch 를 갖지 않고 공용 provider 를 부른다", () => {
  const route = code("functions", "api", "trip", "personalize.ts");
  assert.match(route, /callProfileProvider\(\{ prompt, apiKey, fetchFn: ctx\.fetchFn \}\)/);
  // route 안에 provider 호출 코드가 남아 있으면 두 벌이 된다
  for (const gone of ["generativelanguage.googleapis.com", "new AbortController", "generationConfig"]) {
    assert.ok(!route.includes(gone), `route 에 ${gone} 이 남아 있다`);
  }
  assert.ok(!/await\s+providerFetch\(|await\s+fetch\(/.test(route), "route 는 직접 fetch 하지 않는다");
});

test("route 의 응답 계약이 그대로다", () => {
  const route = code("functions", "api", "trip", "personalize.ts");
  for (const s of ["fallback_provider_error", "fallback_timeout", "fallback_invalid_response",
                   "fallback_missing_key", "fallback_guard", "disabled", "mock", "applied"]) {
    assert.ok(route.includes(s), `${s} 가 사라졌다`);
  }
  assert.match(route, /validateProfile\(parsed, allowedIds\)/);
  assert.match(route, /json\(\{ profile, ai_status \}\)/);
});

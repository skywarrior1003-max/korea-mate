// AI 비용 guard — 과거 사고 재발 방지를 코드로 고정한다.
//
// 사고의 모양: 400/404 계열 오류에서 호출이 반복되며 하루 만에 비용이 급증.
// 그래서 이 파일이 지키는 건 품질이 아니라 **호출 횟수**다.
//
//   · 어떤 status 에서도 재시도 0
//   · 여행 일수와 무관하게 여행당 1회
//   · 기본 모드 off, 모르는 값도 off
//   · key 없으면 아예 호출하지 않음
//
// 하나라도 무너지면 비용이 다시 샌다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  resolveAiMode, modeAllowsProviderCall, AI_MODES,
  validateProfile, buildMockProfile, PROFILE_VERSION,
  MAX_PROFILE_PLACES, MAX_SUMMARY_CHARS,
} from "./personalization-profile.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const CLIENT   = read("src", "lib", "scheduler", "ai", "gemini-client.ts");
const ENDPOINT = read("functions", "api", "trip", "personalize.ts");
const PLAN     = read("functions", "api", "trip", "plan.ts");
const LEGACY   = read("functions", "api", "generate-itinerary.ts");
const PAGE     = read("src", "app", "itinerary", "page.tsx");
const HELPER   = read("src", "lib", "planner", "personalize-client.ts");

// ── 1~3. mode 계약 ───────────────────────────────────────────────────────────
test("★기본 mode 는 off — 미설정·빈값·공백 전부", () => {
  for (const v of [undefined, null, "", "   "]) assert.equal(resolveAiMode(v as never), "off");
});

test("★모르는 mode 값은 off 로 떨어진다 — 켜지는 방향으로 실수하지 않는다", () => {
  for (const v of ["live", "true", "1", "on", "PRODUCTION", "staging", "yes", "enabled"]) {
    assert.equal(resolveAiMode(v), "off", v);
  }
});

test("★알려진 4개 값만 그대로 통과한다", () => {
  for (const m of AI_MODES) assert.equal(resolveAiMode(m), m);
  assert.equal(resolveAiMode("MOCK"), "mock", "대소문자 무시");
});

test("★provider 를 부를 수 있는 모드는 staging-live·production-live 뿐", () => {
  assert.equal(modeAllowsProviderCall("off"), false);
  assert.equal(modeAllowsProviderCall("mock"), false);
  assert.equal(modeAllowsProviderCall("staging-live"), true);
  assert.equal(modeAllowsProviderCall("production-live"), true);
});

// ── 4~17. 호출 횟수·재시도·timeout ───────────────────────────────────────────
test("★gemini-client 는 재시도하지 않는다 — MAX_ATTEMPTS = 1", () => {
  assert.match(CLIENT, /const MAX_ATTEMPTS\s*=\s*1;/);
  assert.doesNotMatch(strip(CLIENT), /MAX_ATTEMPTS\s*=\s*[2-9]/);
});

test("★gemini-client 에 재시도 sleep·continue 가 남아 있지 않다", () => {
  const s = strip(CLIENT);
  assert.doesNotMatch(s, /await sleep\(/);
  assert.doesNotMatch(s, /attempt < MAX_ATTEMPTS/);
  assert.doesNotMatch(s, /attempt \* 1000/);
});

test("★timeout 은 8초 이하다", () => {
  const m = CLIENT.match(/const TIMEOUT_MS\s*=\s*([\d_]+);/);
  assert.ok(m, "TIMEOUT_MS 를 못 찾았다");
  assert.ok(Number(m[1].replace(/_/g, "")) <= 8000, m[1]);
  const e = ENDPOINT.match(/const TIMEOUT_MS\s*=\s*([\d_]+);/);
  assert.ok(e && Number(e[1].replace(/_/g, "")) <= 8000, "endpoint timeout");
});

test("★endpoint 에 재시도 루프가 없다 — fetch 는 정확히 한 번", () => {
  const s = strip(ENDPOINT);
  assert.equal((s.match(/await fetch\(/g) ?? []).length, 1);
  assert.doesNotMatch(s, /for\s*\([^)]*attempt/);
  assert.doesNotMatch(s, /while\s*\(/);
  assert.doesNotMatch(s, /\.retry|retryCount|setInterval/);
});

test("★모든 오류 status 에서 즉시 fallback — 분기별 재시도 없음", () => {
  const s = strip(ENDPOINT);
  // !res.ok 하나로 400·401·403·404·408·429·5xx 를 전부 받아 즉시 반환한다
  assert.match(s, /if \(!res\.ok\)/);
  assert.match(s, /return reply\(null, "fallback_provider_error"\)/);
  assert.doesNotMatch(s, /statusCode === 503|status === 503/);
});

test("★timeout·network 에서도 재호출하지 않는다", () => {
  const s = strip(ENDPOINT);
  assert.match(s, /AbortController/);
  assert.match(s, /fallback_timeout/);
  assert.doesNotMatch(s, /catch[\s\S]{0,400}await fetch\(/);
});

test("★key 가 없으면 provider 를 부르지 않는다", () => {
  const s = strip(ENDPOINT);
  const keyIdx = s.indexOf('fallback_missing_key');
  const fetchIdx = s.indexOf("await fetch(");
  assert.ok(keyIdx > 0 && fetchIdx > keyIdx, "key 검사가 fetch 보다 먼저여야 한다");
});

test("★off·mock 은 fetch 앞에서 끊는다", () => {
  const s = strip(ENDPOINT);
  const off  = s.indexOf('"disabled"');
  const mock = s.indexOf('"mock"');
  const f    = s.indexOf("await fetch(");
  assert.ok(off > 0 && off < f, "off 분기가 fetch 뒤에 있다");
  assert.ok(mock > 0 && mock < f, "mock 분기가 fetch 뒤에 있다");
});

// ── 18~25. 클라이언트 흐름 ───────────────────────────────────────────────────
test("★personalize 는 날짜 루프 밖에서 호출된다 — 여행당 1회", () => {
  const s = strip(PAGE);
  const call = s.indexOf("await fetchPersonalizationProfile(");
  const loop = s.indexOf("for (let i = 0; i < dates.length; i++)");
  assert.ok(call > 0, "호출을 못 찾았다");
  assert.ok(loop > 0, "날짜 루프를 못 찾았다");
  assert.ok(call < loop, "personalize 가 날짜 루프 안에 있다 — 일수만큼 호출된다");
  assert.equal((s.match(/fetchPersonalizationProfile\(/g) ?? []).length, 1);
});

test("★날짜별 plan 요청 안에서 AI 를 부르지 않는다", () => {
  const s = strip(PLAN);
  assert.doesNotMatch(s, /generativelanguage|callGemini|personalize\(/);
  assert.doesNotMatch(s, /from\s+"[^"]*scheduler\/ai\/(gemini-client|personalizer)/);
});

test("★같은 요청 키는 한 흐름에서 다시 나가지 않는다", () => {
  const s = strip(HELPER);
  assert.match(s, /inFlight/);
  assert.match(s, /if \(existing\) return existing/);
  assert.match(s, /personalizationRequestKey/);
});

test("★클라이언트도 재시도하지 않는다", () => {
  const s = strip(HELPER);
  assert.doesNotMatch(s, /retry|setInterval|setTimeout\([^)]*fetch/);
  assert.match(s, /if \(!res\.ok\) return null/);
});

// ── 26~34. 개인정보 ──────────────────────────────────────────────────────────
test("★prompt·요청에 개인정보를 넣지 않는다", () => {
  for (const src of [ENDPOINT, HELPER]) {
    const s = strip(src);
    for (const bad of [/\bemail\b/i, /\buser_id\b/, /device_id/, /getDeviceId/]) {
      assert.doesNotMatch(s, bad, String(bad));
    }
  }
});

test("★사용자 성향 필드가 실제로 전달된다 — 예전엔 버려지던 값", () => {
  const s = strip(PAGE);
  assert.match(s, /travel_style: tstyle/);
  assert.match(s, /travelers:\s*trav/);
  assert.match(s, /selected_place_ids:/);
  // _trav 라는 이름으로 버려지던 인자가 사라졌다
  assert.doesNotMatch(s, /_trav: string/);
});

// ── 35~43. 프로필 검증 ───────────────────────────────────────────────────────
const ALLOWED = ["1", "2", "3"];
const base = {
  profile_version: PROFILE_VERSION,
  category_weights: { restaurant: 0.8 },
  preferred_place_ids: ["1"],
  time_preferences: { restaurant: "evening" },
  pace_bias: 0, day_density_preference: "balanced",
  cluster_preference: "balanced", meal_preference: "evening",
  preference_summary: "Likes food.",
};

test("★정상 응답은 통과한다", () => {
  const p = validateProfile(base, ALLOWED);
  assert.ok(p);
  assert.equal(p.category_weights.restaurant, 0.8);
  assert.deepEqual(p.preferred_place_ids, ["1"]);
});

test("★모르는 카테고리는 버린다", () => {
  const p = validateProfile({ ...base, category_weights: { restaurant: 0.5, banana: 0.9 } }, ALLOWED);
  assert.ok(p);
  assert.ok(!("banana" in p.category_weights));
});

test("★weight 는 0~1 밖이면 버린다", () => {
  const p = validateProfile({ ...base, category_weights: { restaurant: 5, cafe: -1, nature: 0.5 } }, ALLOWED);
  assert.ok(p);
  assert.deepEqual(Object.keys(p.category_weights), ["nature"]);
});

test("★Selected 밖의 place_id 는 제거된다 — 없는 장소가 들어올 유일한 통로", () => {
  const p = validateProfile({ ...base, preferred_place_ids: ["1", "999", "hacked"] }, ALLOWED);
  assert.ok(p);
  assert.deepEqual(p.preferred_place_ids, ["1"]);
});

test("★모르는 enum 은 안전한 기본값으로 떨어진다", () => {
  const p = validateProfile({ ...base, day_density_preference: "insane", cluster_preference: "x",
                              meal_preference: "brunch", time_preferences: { restaurant: "midnight" } }, ALLOWED);
  assert.ok(p);
  assert.equal(p.day_density_preference, "balanced");
  assert.equal(p.cluster_preference, "balanced");
  assert.equal(p.meal_preference, "flexible");
  assert.deepEqual(p.time_preferences, {});
});

test("★HTML·script·markdown·URL 이 든 요약은 버린다", () => {
  for (const bad of ["<script>alert(1)</script>", "see https://evil.example", "```json", "<b>x</b>"]) {
    const p = validateProfile({ ...base, preference_summary: bad }, ALLOWED);
    assert.equal(p?.preference_summary, "", bad);
  }
});

test("★과도한 길이는 버린다", () => {
  const p = validateProfile({ ...base, preference_summary: "a".repeat(MAX_SUMMARY_CHARS + 1) }, ALLOWED);
  assert.equal(p?.preference_summary, "");
});

test("★배열 길이 상한을 넘겨도 잘라서 처리한다", () => {
  const many = Array.from({ length: 500 }, (_, i) => String(i));
  const p = validateProfile({ ...base, preferred_place_ids: many }, ALLOWED);
  assert.ok(p);
  assert.ok(p.preferred_place_ids.length <= MAX_PROFILE_PLACES);
});

test("★버전이 다르거나 형태가 아니면 null", () => {
  for (const bad of [null, undefined, "str", 42, [], { profile_version: 99 }, {}]) {
    assert.equal(validateProfile(bad, ALLOWED), null, JSON.stringify(bad));
  }
});

test("★쓸 신호가 하나도 없으면 null — 빈 프로필을 만들지 않는다", () => {
  assert.equal(validateProfile({
    profile_version: PROFILE_VERSION, category_weights: {}, preferred_place_ids: [],
    time_preferences: {}, preference_summary: "",
  }, ALLOWED), null);
});

test("★가격·영업시간·주소 같은 사실 필드는 스키마에 아예 없다", () => {
  const p = validateProfile({ ...base, price: "10000", opening_hours: "9-6",
                              address: "somewhere", url: "https://x.example" } as never, ALLOWED);
  assert.ok(p);
  for (const k of ["price", "opening_hours", "address", "url"]) {
    assert.ok(!(k in p), k + " 가 프로필에 남았다");
  }
});

test("★mock 프로필도 같은 스키마를 통과한다", () => {
  const m = buildMockProfile(ALLOWED);
  assert.equal(m.profile_version, PROFILE_VERSION);
  assert.ok(m.preferred_place_ids.every(id => ALLOWED.includes(id)));
  assert.equal(m.source, "fallback");
});

// ── 54~56. legacy endpoint 비용 노출 차단 ────────────────────────────────────
test("★legacy generate-itinerary 는 mode 가 켜져 있지 않으면 provider 에 못 간다", () => {
  // HTTP 핸들러 본문만 본다. 파일 위쪽의 callGemini 정의와 내부 harness 함수는
  // 인터넷에서 도달할 수 없으므로 순서 비교 대상이 아니다.
  const s = strip(LEGACY);
  const hIdx = s.indexOf("onRequestPost");
  const sHandler = hIdx > 0 ? s.slice(hIdx) : s;
  const gate  = sHandler.indexOf("modeAllowsProviderCall(resolveAiMode(env.AI_PERSONALIZATION_MODE))");
  const call  = sHandler.indexOf("await callGemini(");
  assert.ok(gate > 0, "게이트가 없다 — 외부에서 POST 만 해도 요금이 발생한다");
  assert.ok(call > gate, "게이트가 provider 호출보다 뒤에 있다");
  assert.match(sHandler, /status: 410/);
});

test("★신규 personalize 가 유일한 AI 진입점이다", () => {
  // functions/ 에서 provider 를 직접 부르는 파일은 이 둘뿐이고,
  // legacy 는 위 테스트가 게이트를 강제한다.
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p, out);
      else if (d.name.endsWith(".ts")) out.push(p);
    }
    return out;
  };
  const hits = walk(join(ROOT, "functions"))
    .filter(f => /generativelanguage/.test(readFileSync(f, "utf8")))
    .map(f => f.replace(ROOT, "").replace(/\\/g, "/"));
  assert.deepEqual(hits.sort(), [
    "/functions/api/generate-itinerary.ts",
    "/functions/api/trip/personalize.ts",
  ]);
});

// ── 57~60. secret ────────────────────────────────────────────────────────────
test("★secret 은 요청 시점 ctx.env 에서만 읽는다", () => {
  assert.doesNotMatch(strip(CLIENT), /process\.env\.GEMINI_API_KEY/);
  assert.match(strip(ENDPOINT), /ctx\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(strip(ENDPOINT), /process\.env/);
});

test("★key 값을 로그·응답에 흘리지 않는다", () => {
  const s = strip(ENDPOINT);
  assert.doesNotMatch(s, /log\([^)]*apiKey/);
  assert.doesNotMatch(s, /apiKey\.slice|apiKey\.length|apiKey\.substring/);
  // 전체 prompt·response 도 로그에 남기지 않는다
  // promptTokenCount(토큰 수)는 §9 가 요구하는 관측 항목이라 예외다 — 내용이 아니다.
  assert.doesNotMatch(s, /log\([^;]*[^a-zA-Z]prompt\s*[,}]/);
  assert.match(s, /promptTokenCount/, "input token 수는 남겨야 한다");
  assert.doesNotMatch(s, /console\.log\(text\)|log\([^;]*\braw\s*[,}]/);
});

test("★NEXT_PUBLIC 계열로 key 를 노출하지 않는다", () => {
  for (const src of [ENDPOINT, HELPER, CLIENT]) {
    assert.doesNotMatch(src, /NEXT_PUBLIC_[A-Z_]*(GEMINI|AI_)/);
  }
});

// ── migration ────────────────────────────────────────────────────────────────
test("★migration 을 건드리지 않았다 — 041 이 마지막", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.length, 42);   // 042 place_reports 추가됨
  // 042(place_reports)는 AI 와 무관한 별도 작업이다. 그 밖의 migration 은 없어야 한다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^042_place_reports\.sql$/, `예상치 못한 migration: ${f}`);
  }
});

// ── 같은 흐름 안의 중복 차단 ─────────────────────────────────────────────────
//
// 주의: 여기서 보장하는 건 "같은 JS 흐름 안에서 같은 키로 두 번 나가지 않는다"
// 뿐이다. 페이지를 새로 열면 새 흐름이라 다시 나간다 — 그건 사용자의 새 요청이다.
// Cloudflare 인스턴스 전역 exactly-once 는 보장하지 않는다(저장소가 없다).
test("★같은 흐름에서 같은 요청은 한 번만 서버로 나간다", async () => {
  const mod = await import("../../planner/personalize-client.ts");
  mod.__resetPersonalizeCache();

  let fetchCount = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount++;
    await new Promise(r => setTimeout(r, 30));
    return new Response(JSON.stringify({ profile: null, ai_status: "disabled" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const req = {
    city: "Busan", locale: "en", start_date: "2026-09-01", end_date: "2026-09-03",
    travel_style: "Couple", travelers: "2", pace: "normal",
    selected_place_ids: ["1", "2"], liked_place_ids: [], selected_places: [],
  };
  try {
    // 동시에 세 번 — 실제로는 한 번만 나가야 한다
    await Promise.all([
      mod.fetchPersonalizationProfile(req),
      mod.fetchPersonalizationProfile(req),
      mod.fetchPersonalizationProfile({ ...req, selected_place_ids: ["2", "1"] }), // 정렬되므로 같은 키
    ]);
    assert.equal(fetchCount, 1, `같은 키로 ${fetchCount}번 나갔다`);
  } finally {
    globalThis.fetch = orig;
    mod.__resetPersonalizeCache();
  }
});

test("★요청 키는 여행 조건으로만 만든다 — 개인정보가 들어가지 않는다", async () => {
  const mod = await import("../../planner/personalize-client.ts");
  const k = mod.personalizationRequestKey({
    city: "Busan", locale: "en", start_date: "2026-09-01", end_date: "2026-09-03",
    travel_style: "Couple", travelers: "2", pace: "normal",
    selected_place_ids: ["b", "a"], liked_place_ids: [], selected_places: [],
  });
  assert.match(k, /Busan\|2026-09-01\|2026-09-03\|Couple\|2\|normal\|a,b/);
  assert.doesNotMatch(k, /@|device|user_id/);
});

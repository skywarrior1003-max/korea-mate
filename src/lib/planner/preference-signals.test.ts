// 취향 신호(Saved·Copy)와 Route Coherence 계약 고정.
//
// 이 테스트가 막는 것 세 가지
//   ① Saved 가 "반드시 방문" 으로 승격되는 것 — Saved 는 취향일 뿐이다
//   ② AI 선호가 실제 이동거리를 이기는 것 — 사람은 텔레포트하지 않는다
//   ③ 후보가 많은 카테고리가 저절로 취향이 되는 것
//      실측(2026-08-07): 부산 restaurant 327 vs attraction 48 →
//      기존 자르기로는 top30 의 80~93% 가 식당이었다. 사용자는 그런 말을 한 적이 없다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectLikedSignals, mergePreferenceIds, MAX_LIKED_PLACES,
} from "./saved-signals.ts";
import { diversifyByCategory, MIN_RECALL_PER_CATEGORY } from "../near-me/candidate-diversity.ts";
import { profileBias, PROFILE_MAX_BONUS } from "../scheduler/profile-bias.ts";
import type { PersonalizationProfile } from "../scheduler/ai/personalization-profile.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/** 주석을 걷어낸 실제 코드만 본다 — 설명문이 자기 자신을 걸지 않게 한다 */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const saved = (id: number, over: Record<string, unknown> = {}) =>
  ({ sourceKey: `city_spot:${id}`, city: "busan", type: "restaurant", ...over });

function profile(over: Partial<PersonalizationProfile> = {}): PersonalizationProfile {
  return {
    profile_version: 1, category_weights: {}, preferred_place_ids: [],
    time_preferences: {}, pace_bias: 0, day_density_preference: "balanced",
    cluster_preference: "balanced", meal_preference: "flexible",
    preference_summary: "", source: "ai", ...over,
  };
}

// ── Saved 신호 (§17) ─────────────────────────────────────────────────────────

test("★S1 Saved 가 실제로 liked_place_ids 로 전달된다", () => {
  const out = collectLikedSignals([saved(101), saved(102)], "busan");
  assert.deepEqual(out.liked_place_ids, ["101", "102"]);
  assert.deepEqual(out.liked_places, [
    { place_id: "101", category: "restaurant" },
    { place_id: "102", category: "restaurant" },
  ]);
  // 클라이언트가 실제로 보내는지 — 예전에는 `liked_place_ids: []` 하드코딩이었다
  const page = read("src", "app", "itinerary", "page.tsx");
  assert.doesNotMatch(page, /liked_place_ids:\s*\[\]/);
  assert.match(page, /liked_place_ids:\s*likedSignals\.liked_place_ids/);
});

test("★S2·S3 Saved 는 Selected 가 아니다 — cart 로 승격되지 않는다", () => {
  const src = code("src", "lib", "planner", "saved-signals.ts");
  assert.doesNotMatch(src, /addToCart|koreamate_cart|999/);
  // personalize 요청에서 두 신호가 서로 다른 필드로 나간다
  const client = read("src", "lib", "planner", "personalize-client.ts");
  assert.match(client, /selected_place_ids:\s*string\[\]/);
  assert.match(client, /liked_place_ids:\s*string\[\]/);
});

test("★S4·S5 중복 제거와 상한", () => {
  assert.deepEqual(collectLikedSignals([saved(7), saved(7), saved(8)], "busan").liked_place_ids, ["7", "8"]);
  const many = Array.from({ length: 100 }, (_, i) => saved(1000 + i));
  assert.equal(collectLikedSignals(many, "busan").liked_place_ids.length, MAX_LIKED_PLACES);
  assert.equal(MAX_LIKED_PLACES, 40);
});

test("★S6 malformed·비 city_spots 는 제외된다", () => {
  const out = collectLikedSignals([
    saved(1), { sourceKey: "local_info:busan:24", city: "busan" },
    { sourceKey: "user_spot:abc", city: "busan" }, { city: "busan" }, null as never, "x" as never,
  ], "busan");
  assert.deepEqual(out.liked_place_ids, ["1"]);
});

test("★S7 다른 도시 Saved 는 제외, 도시 미기록은 통과", () => {
  const out = collectLikedSignals([
    saved(1, { city: "seoul" }), saved(2, { city: "busan" }), saved(3, { city: undefined }),
  ], "busan");
  assert.deepEqual(out.liked_place_ids, ["2", "3"]);
});

test("★S8 category 는 안전한 값만 통과한다", () => {
  const out = collectLikedSignals([
    saved(1, { type: "nature" }),
    saved(2, { type: "이 장소는 아주 좋은 곳입니다 라는 문장" }),
    saved(3, { type: "x".repeat(50) }),
  ], "busan");
  assert.deepEqual(out.liked_places, [
    { place_id: "1", category: "nature" }, { place_id: "2" }, { place_id: "3" },
  ]);
});

test("★S9 Saved 0 개면 기존 동작이 그대로다", () => {
  assert.deepEqual(collectLikedSignals([], "busan"), { liked_place_ids: [], liked_places: [] });
  // 취향 신호는 Selected 로만 구성돼 예전과 같은 집합이 된다
  assert.deepEqual(mergePreferenceIds([], ["c1", "c2"]), ["c1", "c2"]);
});

test("★S10 신호를 합쳐도 상한을 넘지 않는다", () => {
  const liked = Array.from({ length: 30 }, (_, i) => `L${i}`);
  const sel   = Array.from({ length: 30 }, (_, i) => `S${i}`);
  const merged = mergePreferenceIds(liked, sel);
  assert.equal(merged.length, MAX_LIKED_PLACES);
  assert.deepEqual(mergePreferenceIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);   // dedupe
});

// ── Route Coherence (§16) ────────────────────────────────────────────────────

test("★RC1·RC3 큰 이동이 필요하면 최대 취향도 이기지 못한다", () => {
  const maxPref = profile({ category_weights: { attraction: 1 }, preferred_place_ids: ["far"] });
  const bias = profileBias(maxPref, { place_id: "far", category: "attraction", startMinutes: 600 });
  assert.equal(bias, PROFILE_MAX_BONUS);            // 최대 보정이 30 을 넘지 못한다
  // 연속 이동 페널티는 최대 90 — 먼 후보는 30 을 받아도 가까운 후보를 이기지 못한다
  const engine = read("src", "lib", "scheduler", "engine.ts");
  assert.match(engine, /consecutiveDistancePenalty\(travelMin\)/);
  assert.equal(PROFILE_MAX_BONUS, 30);
});

test("★RC2·RC5 zone 보너스가 bias 와 함께 적용되고 순서가 유지된다", () => {
  const engine = read("src", "lib", "scheduler", "engine.ts");
  // zoneBonus·거리 페널티·profileBias 가 같은 식에서 합산된다
  assert.match(engine, /c\.score \+ zoneBonus - consecutiveDistancePenalty\(travelMin\)[\s\S]{0,120}profileBias/);
});

test("★RC3·RC6 AI 보정은 hard constraint 를 통과한 뒤에만 얹힌다", () => {
  const engine = read("src", "lib", "scheduler", "engine.ts");
  // import 문이 아니라 **호출 지점**을 기준으로 본다
  const hc3 = engine.indexOf("hc3TravelFits(travelMin");
  const hc4 = engine.indexOf("hc4StayFits(travelMin");
  assert.ok(hc3 > 0 && hc4 > 0);

  // 보정 지점은 단 하나여야 한다. 하나라도 더 생기면 HC 앞에서 쓰일 수 있다.
  const calls = [...engine.matchAll(/profileBias\(/g)].map(m => m.index!);
  assert.equal(calls.length, 1, "profileBias 호출은 점수 계산 한 곳뿐이어야 한다");
  assert.ok(hc3 < calls[0], "HC-3 이 bias 보다 먼저 와야 한다");
  assert.ok(hc4 < calls[0], "HC-4 가 bias 보다 먼저 와야 한다");
  // 그 한 곳은 adjusted_score 계산식 안이어야 한다
  assert.ok(engine.indexOf("adjusted_score:") < calls[0]);
});

test("★RC4 Selected 는 AI 최대 선호 filler 를 항상 이긴다", () => {
  // Selected 최저(999-90=909) vs NearMe 최고(≈205) + 최대 bias(30) = 235
  const SELECTED_FLOOR = 999 - 90;
  const NEARME_MAX     = 205;
  assert.ok(SELECTED_FLOOR > NEARME_MAX + PROFILE_MAX_BONUS,
    "AI 보정이 Selected 를 밀어낼 수 있으면 계약이 깨진다");
});

test("★RC4-b Saved·Copy 라는 이유만으로 hard constraint 를 우회하지 못한다", () => {
  // Saved 는 preferred_place_ids 로만 들어오고, 그 최대 기여는 10 이다
  const p = profile({ preferred_place_ids: ["saved-far"] });
  assert.equal(profileBias(p, { place_id: "saved-far", category: "food", startMinutes: 600 }), 10);
  // Saved 를 넣는 경로 어디에도 cart/999/hard-constraint 우회가 없다
  const src = code("src", "lib", "planner", "saved-signals.ts");
  assert.doesNotMatch(src, /score|addToCart|preferred_items|exclude_place_ids/i);
});

// ── candidate volume ≠ preference (§10·§11) ─────────────────────────────────

test("★RC6-vol 후보 풀은 소수 카테고리를 굶기지 않는다 — 비율은 정하지 않는다", () => {
  // 이 테스트의 의도가 바뀌었다.
  //   예전: 풀을 카테고리별로 균등하게 잘라 식당을 1/3 로 맞췄다.
  //   지금: 풀은 **최소 recall 개수**만 보장하고, 하루에 식당이 몇 개 들어가는지는
  //         meal-opportunity.ts 가 실제 식사 기회로 정한다.
  //   즉 `후보 풀 비율 ≠ 일정 비율` 이다.
  //
  // 부산 실측 분포 재현: 같은 거리대에 식당이 8배 많다.
  const mk = (cat: string, n: number, per: number) =>
    Array.from({ length: n }, (_, i) => ({ category: cat, score: 120 - Math.floor(i / per) }));
  const pool = [...mk("food", 168, 8), ...mk("attraction", 21, 1), ...mk("walking", 9, 1)];

  const before = [...pool].sort((a, b) => b.score - a.score).slice(0, 30);
  assert.ok(before.filter(c => c.category === "food").length >= 24,
    "순수 점수 자르기는 식당 편중이라는 사실이 재현돼야 한다");

  const after = diversifyByCategory(pool, 30);
  assert.equal(after.length, 30);
  // 소수 카테고리가 후보에서 통째로 사라지지 않는다 — 하루를 채울 재료가 있어야 한다
  assert.ok(after.filter(c => c.category === "attraction").length >= MIN_RECALL_PER_CATEGORY);
  assert.ok(after.filter(c => c.category === "walking").length >= MIN_RECALL_PER_CATEGORY);
  // 나머지는 점수 순이다 — 균등 분배가 아니므로 식당이 여전히 다수여도 정상이다
  assert.ok(after.filter(c => c.category === "food").length > MIN_RECALL_PER_CATEGORY,
    "최소치만 채우고 나머지를 점수로 채우면 공급이 많은 식당이 다수인 것이 정상이다");
  assert.equal(MIN_RECALL_PER_CATEGORY, 5);
});

test("★다양화는 기존 동작을 깨지 않는다", () => {
  const pool = [{ category: "food", score: 3 }, { category: "food", score: 1 }, { category: "food", score: 2 }];
  // 카테고리가 하나면 정렬+자르기와 완전히 같다
  assert.deepEqual(diversifyByCategory(pool, 2), [{ category: "food", score: 3 }, { category: "food", score: 2 }]);
  // limit 이상이면 전부 반환(정렬만)
  assert.equal(diversifyByCategory(pool, 10).length, 3);
  assert.deepEqual(diversifyByCategory([], 5), []);
  assert.deepEqual(diversifyByCategory(pool, 0), []);
  // 결정론
  assert.deepEqual(diversifyByCategory(pool, 2), diversifyByCategory(pool, 2));
  // 점수 내림차순 유지
  const out = diversifyByCategory([{ category: "a", score: 1 }, { category: "b", score: 9 }], 2);
  assert.deepEqual(out.map(c => c.score), [9, 1]);
});

test("★후보 다양화가 실제 두 경로에 모두 배선돼 있다", () => {
  assert.match(read("src", "lib", "near-me", "near-me-engine.ts"), /diversifyByCategory\(scored, limit\)/);
  assert.match(read("functions", "api", "trip", "plan.ts"), /diversifyByCategory\(scored as any, input\.limit\)/);
});

// ── Copy (§18) ───────────────────────────────────────────────────────────────

test("★C1·C2 Copy 계약에 회귀가 없다", () => {
  const copy = read("functions", "api", "itinerary", "copy.ts");
  assert.match(copy, /copy_of:\s*shareId/);
  assert.match(copy, /copied_at/);
  assert.match(copy, /increment_copy_count/);
});

test("★C5·C6 Copy 가 Selected 를 덮어쓰거나 route 를 우회하지 않는다", () => {
  // 복사본은 레코드를 그대로 로드한다. 개인화 입력에 copy 전용 경로가 없다.
  const client = read("src", "lib", "planner", "personalize-client.ts");
  assert.doesNotMatch(client, /copy|copied/i);
  const saved = read("src", "lib", "planner", "saved-signals.ts");
  assert.doesNotMatch(saved, /copy_of|copied_at/);
});

test("★C8 다른 소유자의 private 일정을 취향 원천으로 읽지 않는다", () => {
  const src = read("src", "lib", "planner", "saved-signals.ts")
            + read("src", "lib", "planner", "personalize-client.ts");
  assert.doesNotMatch(src, /is_public|device_id|owner|\/api\/itinerar(y|ies)/);
});

// ── 개인정보·비용 (§13·§19) ─────────────────────────────────────────────────

test("★P1 AI 입력에 좌표·주소·가격을 넣지 않는다", () => {
  const fn = [
    read("functions", "api", "trip", "personalize.ts"),
    read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts"),
    read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts"),
  ].join("\n");
  // prompt 가 **값을 꺼내 쓰는** 자리를 본다.
  // "do NOT invent addresses/prices" 같은 금지 문구는 있어야 정상이므로 문자열 검색이 아니라
  // 속성 접근·보간을 검사한다.
  const promptFn = fn.slice(fn.indexOf("function buildPrompt"), fn.indexOf("function extractJson"));
  assert.doesNotMatch(promptFn, /[bp]\.(lat|lng|address|price|entry_fee|coordinate)\b/);
  assert.doesNotMatch(promptFn, /\$\{[^}]*\b(lat|lng|address|price)\b[^}]*\}/);
  const saved = code("src", "lib", "planner", "saved-signals.ts");
  assert.doesNotMatch(saved, /\blat\b|\blng\b|address|price|device_id|email/i);
});

test("★P2 Route Coherence Contract 가 prompt 에 실제로 들어간다", () => {
  const fn = [
    read("functions", "api", "trip", "personalize.ts"),
    read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts"),
    read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts"),
  ].join("\n");
  assert.match(fn, /You are NOT the route planner/);
  assert.match(fn, /Preference never outranks route coherence/);
  assert.match(fn, /same or adjacent area/);
  assert.match(fn, /backtracks/);
  assert.match(fn, /spread across days — never dropped/);
  assert.match(fn, /Filler places should stay near/);
  assert.match(fn, /rank below route coherence/);
  assert.match(fn, /do NOT output any place_id that is not listed above/);
  assert.match(fn, /do NOT try to change fixed events, arrival, or departure/);
  assert.match(fn, /coordinates/);
});

test("★P3 비용 안전장치가 그대로다", () => {
  const fn = [
    read("functions", "api", "trip", "personalize.ts"),
    read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts"),
    read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts"),
  ].join("\n");
  assert.match(fn, /MAX_ATTEMPTS|정확히 1회/);
  assert.doesNotMatch(fn, /for\s*\([^)]*attempt|while\s*\([^)]*attempt|retry/i);
  // provider 호출 지점은 하나뿐이다. canary 가 요청마다 자기 fetch 를 넘길 수
  // 있게 주입 경계를 뒀을 뿐, 지점 수와 재시도 0 은 그대로다.
  assert.equal((fn.match(/await providerFetch\(/g) ?? []).length, 1);
  assert.equal((fn.match(/await fetch\(/g) ?? []).length, 0);   // 주입을 우회하는 호출 없음
  assert.match(fn, /TIMEOUT_MS/);
  assert.match(fn, /maxOutputTokens:\s*MAX_OUTPUT_TOKENS/);
  assert.match(fn, /slice\(0, MAX_PROMPT_CHARS\)/);
  assert.match(fn, /MAX_PROFILE_PLACES/);
  // 모드 기본값은 off — 모르는 값도 off
  const mod = read("src", "lib", "scheduler", "ai", "personalization-profile.ts");
  assert.match(mod, /includes\(v\) \? \(v as AiMode\) : "off"/);
});

test("★P4 Saved 가 많아도 prompt 가 무한히 커지지 않는다", () => {
  const fn = [
    read("functions", "api", "trip", "personalize.ts"),
    read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts"),
    read("src", "lib", "scheduler", "ai", "profile-gemini-provider.ts"),
  ].join("\n");
  assert.match(fn, /body\.liked_places\s*\)\s*\n?\s*\?\s*body\.liked_places\.slice\(0, MAX_PROFILE_PLACES\)/);
  assert.match(fn, /liked\.slice\(0, MAX_PROFILE_PLACES\)/);
});

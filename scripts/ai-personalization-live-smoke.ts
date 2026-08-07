#!/usr/bin/env node --experimental-strip-types
/**
 * 실제 Gemini 호출 검증 — **돈이 나가는 유일한 스크립트다.**
 *
 *   미리보기(호출 0):  node --experimental-strip-types scripts/ai-personalization-live-smoke.ts
 *   실제 호출:         ... --live --confirm=GEMINI-STAGING-LIVE-3
 *
 * 왜 필요한가
 *   지금까지 AI 는 mock 과 unit test 로만 검증됐다. 실제 모델이 무엇을 돌려주는지,
 *   스키마를 지키는지, 토큰을 얼마나 쓰는지 아무도 본 적이 없다.
 *
 * 어떻게 안전을 지키나
 *   · 기본 실행은 provider 를 부르지 않는다. --live 와 confirm 토큰이 **둘 다** 필요하다.
 *   · MAX_PROVIDER_CALLS = 3. 코드 상한이라 CLI 로 늘릴 수 없다.
 *   · 시나리오당 정확히 1회. 재시도 0. 실패하면 그 자리에서 멈춘다.
 *   · 실제 배포 handler(functions/api/trip/personalize.ts)를 그대로 부른다.
 *     가짜 Gemini 호출 코드를 따로 만들지 않는다 — 그러면 배포 코드가 검증되지 않는다.
 *   · Production Cloudflare env 는 건드리지 않는다. staging-live 는 이 프로세스에만 준다.
 *   · prompt 에는 공개 장소 신호(place_id·category)만 넣는다. 사용자 데이터 0.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { onRequestPost } from "../functions/api/trip/personalize.ts";
import type { PersonalizationProfile } from "../src/lib/scheduler/ai/personalization-profile.ts";
import {
  MAX_PROVIDER_CALLS, LIVE_MODE, isLiveAuthorized, boundedScenarios,
} from "../src/lib/scheduler/ai/live-smoke-contract.ts";

// 상한·확인 토큰은 순수 모듈에 있다 — 테스트로 고정하기 위해서다.
export {
  MAX_PROVIDER_CALLS, CONFIRM_TOKEN, LIVE_MODE, isLiveAuthorized, boundedScenarios,
} from "../src/lib/scheduler/ai/live-smoke-contract.ts";

// ── 시나리오 — 공개 부산 장소 id 만 쓴다 ────────────────────────────────────
// 실제 운영 city_spots id 이지만 개인 데이터가 아니다. 좌표·주소는 넣지 않는다.

export interface Scenario {
  name: string;
  body: Record<string, unknown>;
}

const trip = {
  city: "busan", locale: "en",
  start_date: "2026-09-01", end_date: "2026-09-03",
  travelers: "2", pace: "normal",
};

export const SCENARIOS: readonly Scenario[] = [
  {
    name: "LIVE-1 neutral",
    body: {
      ...trip, travel_style: "Couple",
      selected_place_ids: ["1", "25", "26"],
      selected_places: [
        { place_id: "1",  category: "attraction", name: "Haeundae Beach" },
        { place_id: "25", category: "attraction", name: "Haedong Yonggungsa Temple" },
        { place_id: "26", category: "attraction", name: "Beomeosa Temple" },
      ],
      liked_place_ids: [], liked_places: [],
    },
  },
  {
    name: "LIVE-2 food-oriented",
    body: {
      ...trip, travel_style: "Friends",
      selected_place_ids: ["99"],
      selected_places: [{ place_id: "99", category: "restaurant", name: "Mandeuri Gondeurebap" }],
      liked_place_ids: ["100", "103", "107", "109", "111"],
      liked_places: [
        { place_id: "100", category: "restaurant" }, { place_id: "103", category: "restaurant" },
        { place_id: "107", category: "restaurant" }, { place_id: "109", category: "restaurant" },
        { place_id: "111", category: "restaurant" },
      ],
    },
  },
  {
    name: "LIVE-3 nature/attraction-oriented",
    body: {
      ...trip, travel_style: "Solo",
      selected_place_ids: ["16", "17"],
      selected_places: [
        { place_id: "16", category: "nature", name: "Gwangalli Beach" },
        { place_id: "17", category: "nature", name: "Songjeong Beach" },
      ],
      liked_place_ids: ["26", "31", "34"],
      liked_places: [
        { place_id: "26", category: "attraction" },
        { place_id: "31", category: "nature" }, { place_id: "34", category: "nature" },
      ],
    },
  },
];

// ── 실행 ─────────────────────────────────────────────────────────────────────

function geminiKey(): string {
  const raw = (() => { try { return readFileSync(path.join(process.cwd(), ".env.local"), "utf8"); } catch { return ""; } })();
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^GEMINI_API_KEY=(.+)$/);
    if (m) return m[1].trim();
  }
  return process.env.GEMINI_API_KEY ?? "";
}

export interface CallResult {
  name:        string;
  httpStatus:  number;
  latencyMs:   number;
  aiStatus:    string;
  profile:     PersonalizationProfile | null;
  usage:       Record<string, unknown> | null;
  allowedIds:  string[];
  violations:  string[];
}

async function runScenario(sc: Scenario, key: string): Promise<CallResult> {
  const req = new Request("https://local.test/api/trip/personalize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sc.body, request_id: sc.name }),
  });
  // handler 는 usage 를 응답에 담지 않고 로그로만 남긴다.
  // 배포 코드를 검증하려는 것이므로 handler 를 고치지 않고 로그를 가로챈다.
  const logs: Record<string, unknown>[] = [];
  const realLog = console.log;
  console.log = (...a: unknown[]) => {
    try { const j = JSON.parse(String(a[0])); if (j?.action === "trip-personalize") logs.push(j); }
    catch { /* 우리 로그가 아니다 */ }
  };

  const started = Date.now();
  let res: Response;
  try {
    // 실제 배포 handler. 환경 변수는 이 호출에만 준다.
    res = await onRequestPost({
      request: req,
      env: { AI_PERSONALIZATION_MODE: LIVE_MODE, GEMINI_API_KEY: key },
    } as never);
  } finally {
    console.log = realLog;
  }
  const latencyMs = Date.now() - started;
  const body = await res.json() as { profile: PersonalizationProfile | null; ai_status: string };

  const allowedIds = [
    ...(sc.body.selected_place_ids as string[] ?? []),
    ...(sc.body.liked_place_ids as string[] ?? []),
  ];
  const violations: string[] = [];
  const p = body.profile;
  if (p) {
    for (const id of p.preferred_place_ids) {
      if (!allowedIds.includes(id)) violations.push(`후보 밖 place_id: ${id}`);
    }
    if (p.profile_version !== 1) violations.push(`profile_version ${p.profile_version}`);
    for (const [k, v] of Object.entries(p.category_weights)) {
      if (typeof v !== "number" || v < 0 || v > 1) violations.push(`category_weight ${k}=${v}`);
    }
    // 스키마에 없는 필드를 모델이 밀어 넣었는지 (validator 통과 후에도 확인)
    const allowed = new Set(["profile_version", "category_weights", "preferred_place_ids",
      "time_preferences", "pace_bias", "day_density_preference", "cluster_preference",
      "meal_preference", "preference_summary", "source"]);
    for (const k of Object.keys(p)) if (!allowed.has(k)) violations.push(`스키마 밖 필드: ${k}`);
  }
  // handler 가 남긴 진단값을 **통째로** 넘긴다.
  // 예전엔 몇 개만 골라 담아서 finishReason·thoughtsTokens 를 잡아놓고도 버렸다.
  // 호출 예산이 3회뿐이라 한 번 놓치면 다시 얻을 수 없다.
  const last = logs.at(-1) ?? null;
  const usage = last ? { ...last, action: undefined, requestId: undefined } : null;
  if (logs.length > 1) violations.push(`provider 로그 ${logs.length}건 — 호출이 1회를 넘었을 수 있다`);
  return { name: sc.name, httpStatus: res.status, latencyMs, aiStatus: body.ai_status,
           profile: p, usage, allowedIds, violations };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const authorized = isLiveAuthorized(argv);
  const scenarios  = boundedScenarios(SCENARIOS);
  const key        = geminiKey();

  console.log("── AI personalization LIVE smoke ─────────────────────────");
  console.log(` 시나리오        : ${scenarios.length} (코드 상한 ${MAX_PROVIDER_CALLS})`);
  console.log(` 모드            : ${LIVE_MODE} (이 프로세스에만 적용)`);
  console.log(` credential      : ${key ? "present" : "MISSING"}`);
  console.log(` 실제 호출 승인   : ${authorized}`);
  if (!authorized) {
    console.log("\nPREFLIGHT ONLY — provider 호출 0. --live 와 confirm 토큰이 둘 다 필요하다.");
    return;
  }
  if (!key) { console.error("GEMINI credential 없음 — 중단"); process.exit(1); }

  const results: CallResult[] = [];
  for (const sc of scenarios) {
    const r = await runScenario(sc, key);
    results.push(r);
    console.log(`\n[${r.name}] HTTP ${r.httpStatus} · ${r.latencyMs}ms · ai_status=${r.aiStatus}`);
    if (r.profile) {
      console.log(`  category_weights : ${JSON.stringify(r.profile.category_weights)}`);
      console.log(`  meal_preference  : ${r.profile.meal_preference}`);
      console.log(`  cluster/density  : ${r.profile.cluster_preference} / ${r.profile.day_density_preference}`);
      console.log(`  pace_bias        : ${r.profile.pace_bias}`);
      console.log(`  preferred_ids    : ${JSON.stringify(r.profile.preferred_place_ids)}`);
      console.log(`  time_preferences : ${JSON.stringify(r.profile.time_preferences)}`);
      console.log(`  summary          : ${r.profile.preference_summary}`);
    } else {
      console.log("  profile: null (fallback)");
    }
    console.log(`  usage            : ${JSON.stringify(r.usage)}`);
    console.log(`  스키마 위반      : ${r.violations.length ? r.violations.join(" | ") : "없음"}`);

    // 실패하면 즉시 멈춘다. 다음 시나리오를 부르지 않는다.
    if (r.aiStatus !== "applied") {
      console.error(`\n중단: ${r.name} 이 applied 가 아니다 (${r.aiStatus}). 재시도하지 않는다.`);
      process.exit(1);
    }
  }
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const inTok  = results.reduce((a, r) => a + num(r.usage?.inputTokens), 0);
  const outTok = results.reduce((a, r) => a + num(r.usage?.outputTokens), 0);
  const attempts = results.reduce((a, r) => a + num(r.usage?.attempts), 0);
  console.log(`\n실제 provider 호출 = ${results.length} / 상한 ${MAX_PROVIDER_CALLS}`);
  console.log(`attempts 합계 = ${attempts} (재시도가 있으면 호출 수보다 크다)`);
  console.log(`total input = ${inTok} · total output = ${outTok} · total = ${inTok + outTok}`);
  console.log(`평균 latency = ${Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length)}ms`
            + ` · 최대 = ${Math.max(...results.map(r => r.latencyMs))}ms`);
}

const invokedDirectly = process.argv[1]?.includes("ai-personalization-live-smoke");
if (invokedDirectly) main().catch(e => { console.error(String(e?.message ?? e)); process.exit(1); });

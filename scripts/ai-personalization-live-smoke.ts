#!/usr/bin/env node --experimental-strip-types
/**
 * 실제 Gemini 호출 검증 — **돈이 나가는 유일한 스크립트다.**
 *
 *   미리보기(호출 0):  node --experimental-strip-types scripts/ai-personalization-live-smoke.ts
 *   시나리오 지정:     ... --only="LIVE-1 seoul"
 *   실제 호출(1회):    ... --only="LIVE-1 seoul" --live --confirm=GEMINI-STAGING-LIVE-3
 *
 * 왜 필요한가
 *   AI 가 mock 과 unit test 로만 검증돼 왔다. 실제 모델이 무엇을 돌려주는지,
 *   스키마를 지키는지, 그 결과가 스케줄러를 어떻게 움직이는지 봐야 한다.
 *
 * 어떻게 안전을 지키나
 *   · 기본 실행은 provider 를 부르지 않는다. --live 와 confirm 토큰이 **둘 다** 필요하다.
 *   · `--only` 없이는 live 로 가지 않는다. 대상을 도구가 대신 고르지 않는다.
 *   · MAX_PROVIDER_CALLS = 1. 코드 상한이라 CLI 로 늘릴 수 없다.
 *   · 정확히 1회. 재시도 0. 성공이든 실패든 두 번째 요청을 만들지 않는다.
 *   · Production 과 **같은 prompt core, 같은 provider, 같은 parser, 같은 validator**
 *     를 쓴다. 배포 route 를 import 하지 않는 대신 그 route 가 쓰는 조각을
 *     그대로 부른다 — 검증한 것과 실제로 나가는 것이 달라지면 검증이 아니다.
 *   · 이 스크립트는 orchestration 만 한다. prompt·요청 본문·파서를 복사하지 않는다.
 *   · prompt 에는 공개 장소 신호(place_id·category·name)만 넣는다. 사용자 데이터 0.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildPrompt, extractJson,
} from "../src/lib/scheduler/ai/profile-personalization-core.ts";
import { callProfileProvider } from "../src/lib/scheduler/ai/profile-gemini-provider.ts";
import {
  validateProfile, MAX_PROFILE_PLACES,
  type PersonalizationProfile,
} from "../src/lib/scheduler/ai/personalization-profile.ts";
import { runScheduler } from "../src/lib/scheduler/engine.ts";
import { estimateTravelMinutes } from "../src/lib/scheduler/travel-time-estimator.ts";
import { planDayAnchors, mergeDayHints } from "../src/lib/trip-fixed/anchor-build.ts";
import {
  MAX_PROVIDER_CALLS, LIVE_MODE, isLiveAuthorized, selectLiveScenario, readOnlyFlag,
} from "../src/lib/scheduler/ai/live-smoke-contract.ts";

// 상한·확인 토큰은 순수 모듈에 있다 — 테스트로 고정하기 위해서다.
export {
  MAX_PROVIDER_CALLS, CONFIRM_TOKEN, LIVE_MODE, isLiveAuthorized,
  boundedScenarios, selectLiveScenario, readOnlyFlag,
} from "../src/lib/scheduler/ai/live-smoke-contract.ts";

// ── 시나리오 — 공개 장소 신호만 쓴다 ────────────────────────────────────────
// 좌표는 스케줄러 검증용 합성값이고 prompt 로 나가지 않는다.

export interface ScenarioPlace {
  place_id: string; name: string; category: string;
  /** 스케줄러 전용. prompt 에는 들어가지 않는다. */
  lat: number; lng: number;
  fixed?: { date: string; startTime: string; durationMinutes: number };
}

export interface Scenario {
  name: string;
  body: Record<string, unknown>;
  places: ScenarioPlace[];
  tripDate: string;
}

const SEOUL = { lat: 37.5665, lng: 126.9780 };
const at = (dLat: number, dLng: number) => ({ lat: SEOUL.lat + dLat, lng: SEOUL.lng + dLng });
const DAY2 = "2026-10-17";

const PLACES: ScenarioPlace[] = [
  { place_id: "1",  name: "Gyeongbokgung Palace", category: "attraction", ...at(0.010, 0.005) },
  { place_id: "2",  name: "Gwangjang Market",     category: "restaurant", ...at(0.012, 0.010) },
  { place_id: "3",  name: "Seongsu Cafe Street",  category: "cafe",       ...at(0.030, 0.070) },
  { place_id: "4",  name: "Namsan Seoul Tower",   category: "attraction", ...at(0.006, 0.002) },
  { place_id: "5",  name: "Bukchon Hanok Village", category: "attraction", ...at(0.045, 0.090) },
  { place_id: "6",  name: "Hangang Park",         category: "nature",     ...at(-0.060, 0.050) },
  { place_id: "7",  name: "Ikseon-dong Alley",    category: "attraction", ...at(0.080, -0.070) },
  { place_id: "user_spot:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "My Seongsu Spot", category: "cafe", ...at(0.031, 0.071) },
  { place_id: "meet", name: "Friend Meetup", category: "event", ...at(0.029, 0.068),
    fixed: { date: DAY2, startTime: "15:00", durationMinutes: 60 } },
  { place_id: "gig",  name: "K-pop Concert", category: "event", ...at(0.032, 0.072),
    fixed: { date: DAY2, startTime: "19:00", durationMinutes: 180 } },
];

export const SCENARIOS: readonly Scenario[] = [
  {
    name: "LIVE-1 seoul",
    tripDate: DAY2,
    places: PLACES,
    body: {
      city: "seoul", locale: "en",
      start_date: "2026-10-16", end_date: "2026-10-18",
      travel_style: "Solo", travelers: "1", pace: "relaxed",
      interests: [
        "k-pop", "cafe hopping", "first time in Seoul",
        "not too packed", "sightseeing and local atmosphere",
      ],
      selected_place_ids: PLACES.map(p => p.place_id),
      selected_places: PLACES.map(p => ({
        place_id: p.place_id, category: p.category, name: p.name,
      })),
      liked_place_ids: [],
      liked_places:    [],
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

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h! * 60 + m!; };

/** 실제 호출은 이 함수 안에서만 일어난다. 호출 뒤에 다시 부르는 길이 없다. */
async function runOnce(sc: Scenario, key: string) {
  const body: Record<string, unknown> = { ...sc.body, request_id: sc.name };
  const selected = (body.selected_place_ids as string[]) ?? [];
  const liked    = (body.liked_place_ids as string[]) ?? [];
  const allowedIds = [...new Set([...selected, ...liked])].slice(0, MAX_PROFILE_PLACES);

  // Production 과 같은 prompt core
  const prompt = buildPrompt(
    body as never,
    (body.selected_places as never[]).slice(0, MAX_PROFILE_PLACES),
    (body.liked_places as never[]) ?? [],
  );

  // Production 과 같은 provider — 정확히 1회
  const call = await callProfileProvider({ prompt, apiKey: key });

  if (!call.ok) {
    return { ok: false as const, kind: call.kind, latencyMs: call.latencyMs,
             httpStatus: call.kind === "http" ? call.httpStatus : null };
  }

  // Production 과 같은 parser / validator
  const parsed  = extractJson(call.text);
  const profile = validateProfile(parsed, allowedIds);

  return {
    ok: true as const, latencyMs: call.latencyMs,
    jsonParsed: parsed !== null,
    profile,
    finishReason: call.raw.candidates?.[0]?.finishReason ?? "provider_not_returned",
    usage: call.raw.usageMetadata ?? null,
    promptChars: prompt.length,
  };
}

/** 같은 profile 로 결정론 스케줄러를 돌려 hard rule 을 확인한다. provider 호출 없음. */
function scheduleWith(sc: Scenario, profile: PersonalizationProfile | null) {
  const hints = sc.places.map(p => ({ place_id: p.place_id, lat: p.lat, lng: p.lng, fixed: p.fixed ?? null }));
  const plan   = planDayAnchors(hints, sc.tripDate, null, null);
  const merged = mergeDayHints(hints, plan);
  const byId = new Map(sc.places.map(p => [p.place_id, p]));

  const r = runScheduler({
    trip_date: sc.tripDate, start_time: "09:00", end_time: "21:00",
    base_coordinate: SEOUL, pace: "relaxed",
    candidates: merged.map(h => ({
      place_id: h.place_id, category: byId.get(h.place_id)!.category,
      coordinate: { lat: h.lat, lng: h.lng }, zone_id: 1, distance_m: 500, score: 999,
    })),
    anchors: plan.anchors,
    personalization_profile: profile,
  } as never) as { success: boolean; error?: { code: string }; data?: { items: never[] } };

  const items = ((r.data?.items ?? []) as {
    place_id?: string; start_time: string; end_time: string; is_fixed: boolean; item_type: string;
  }[]).filter(i => i.place_id && i.item_type !== "affiliate");

  const teleports: string[] = [];
  for (let k = 0; k < items.length - 1; k++) {
    const a = items[k]!, b = items[k + 1]!;
    const pa = byId.get(a.place_id!)!, pb = byId.get(b.place_id!)!;
    const need = estimateTravelMinutes({ lat: pa.lat, lng: pa.lng }, { lat: pb.lat, lng: pb.lng });
    const have = toMin(b.start_time) - toMin(a.end_time);
    if (have < need) teleports.push(`${a.place_id}→${b.place_id} 여유 ${have} / 필요 ${need}`);
  }
  const placed = new Set(items.map(i => i.place_id));
  return {
    ok: r.success, code: r.error?.code, items, teleports,
    unplaced: hints.filter(h => !placed.has(h.place_id)).map(h => h.place_id),
    fixedUnplaced: hints.filter(h => h.fixed && !placed.has(h.place_id)).map(h => h.place_id),
    lateAuto: items.filter(i => !i.is_fixed && i.end_time > "21:00").map(i => i.place_id),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = isLiveAuthorized(argv);
  const pick = selectLiveScenario(argv, SCENARIOS);

  console.log("── AI personalization live smoke ──");
  console.log(` provider 상한   : ${MAX_PROVIDER_CALLS} (코드 상한, CLI 로 못 올린다)`);
  console.log(` 재시도          : 0`);
  console.log(` 모드            : ${LIVE_MODE}`);
  console.log(` --only          : ${readOnlyFlag(argv) ?? "(없음)"}`);
  console.log(` 시나리오 목록   : ${SCENARIOS.map(s => s.name).join(", ")}`);
  console.log(` key capability  : ${geminiKey() ? "AVAILABLE" : "UNAVAILABLE"}`);

  if (!pick.ok) {
    console.log(`\n시나리오가 정해지지 않았다 (${pick.reason}). --only="<이름>" 이 필요하다.`);
  }

  if (!live || !pick.ok) {
    console.log("\nPREFLIGHT ONLY — provider 호출 0. --only 와 --live 와 confirm 토큰이 모두 필요하다.");
    return;
  }

  const key = geminiKey();
  if (!key) { console.log("\nkey 가 없다. 호출하지 않는다."); return; }

  const sc = pick.scenario;
  console.log(`\nLIVE ▶ ${sc.name} — provider 호출 1회 시작`);
  const res = await runOnce(sc, key);   // ← 실제 호출은 여기 한 번뿐

  if (!res.ok) {
    console.log(`  실패: ${res.kind}${res.httpStatus ? ` (http ${res.httpStatus})` : ""} / ${res.latencyMs}ms`);
    console.log("  재호출하지 않는다.");
    return;
  }

  console.log(`  http 200 / ${res.latencyMs}ms / finishReason=${res.finishReason}`);
  console.log(`  prompt ${res.promptChars} chars / usage ${JSON.stringify(res.usage)}`);
  console.log(`  jsonParsed=${res.jsonParsed} validatorPassed=${res.profile !== null}`);

  if (res.profile) {
    const p = res.profile;
    // 원문을 찍지 않는다. 해석된 신호만 요약한다.
    const top = Object.entries(p.category_weights ?? {})
      .filter(([, v]) => typeof v === "number" && (v as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 4)
      .map(([k, v]) => `${k}=${v}`);
    console.log(`  weights: ${top.join(", ") || "(없음)"}`);
    console.log(`  pace_bias=${p.pace_bias} density=${p.day_density_preference} cluster=${p.cluster_preference}`);
    console.log(`  preferred_place_ids=${(p.preferred_place_ids ?? []).length}건`);
  }

  const s = scheduleWith(sc, res.profile);
  console.log("\n── Scheduler E2E (provider 호출 없음) ──");
  console.log(`  success=${s.ok}${s.code ? ` (${s.code})` : ""}`);
  for (const i of s.items) {
    console.log(`    ${i.start_time}–${i.end_time} ${i.place_id}${i.is_fixed ? "  [사용자 지정]" : ""}`);
  }
  const meet = s.items.find(i => i.place_id === "meet");
  const gig  = s.items.find(i => i.place_id === "gig");
  console.log(`  meet 15:00-16:00 : ${meet ? `${meet.start_time}-${meet.end_time}` : "미배치"}`);
  console.log(`  gig  19:00-22:00 : ${gig  ? `${gig.start_time}-${gig.end_time}`   : "미배치"}`);
  console.log(`  21:00 이후 자동 추천 : ${s.lateAuto.length}건`);
  console.log(`  텔레포트 : ${s.teleports.length}건 ${s.teleports.join(" / ")}`);
  console.log(`  미배치 : ${s.unplaced.join(", ") || "없음"} (그중 사용자 지정 ${s.fixedUnplaced.length}건)`);
  console.log(`  My Place identity : ${[...s.items.map(i => i.place_id), ...s.unplaced].some(k => String(k).startsWith("user_spot:")) ? "유지" : "소실"}`);
}

const invokedDirectly = process.argv[1]?.includes("ai-personalization-live-smoke");
if (invokedDirectly) { void main(); }

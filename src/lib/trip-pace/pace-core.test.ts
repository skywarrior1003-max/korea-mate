// 여행 속도가 무엇을 바꾸고 무엇을 바꾸지 않는가.
//
// 이 파일이 지키는 선은 하나다 — **`active` 는 `packed` 가 아니다.**
// 활동적인 여행을 고른 사람에게 "쉬는 시간 20% 삭감"을 주면 안 된다.
// 그래서 같은 장소의 체류시간이 balanced 와 active 에서 정확히 같은지를 본다.
//
// 두 번째 선은 동행과 속도의 분리다. 커플·가족이라고 자동으로 느긋해지지
// 않는다. 사용자가 고르지 않은 것을 우리가 정하지 않는다.
//
// 실행: node --experimental-strip-types src/lib/trip-pace/pace-core.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ACTIVE_WALKING_BONUS, DEFAULT_TRIP_PACE, TRIP_PACE_CHOICES,
  isTripPaceChoice, normalizeTripPace, paceBonus, toSchedulerPace,
} from "./pace-core.ts";
import { PACE_MULTIPLIER, CATEGORY_STAY_MINUTES } from "../scheduler/constants.ts";
import { resolveStayMinutes } from "../scheduler/slot-allocator.ts";
import { TRIP_DRAFT_KEY, readTripDraft, writeTripDraft } from "../trip-draft/trip-draft-core.ts";
import { buildItineraryGenerationUrl, tripDraftGenerationContext } from "../trip-generation/itinerary-url.ts";
import type { NearMeCandidate, SchedulerInput } from "../scheduler/types.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const CORE   = strip(read("src", "lib", "trip-pace", "pace-core.ts"));
const SCORER = strip(read("src", "lib", "near-me", "scorer.ts"));
// 플래너 코드는 PLANNER-SPOTS-SEPARATION-V1 에서 /planner 로 이사했다 — 검사 대상은 동일 코드다.
const HOME = strip(read("src", "app", "planner", "PlannerClient.tsx"));
const ITIN = strip(read("src", "app", "itinerary", "page.tsx"));

const TRIP = { city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27" };

// ── A. 기본값과 분리 ─────────────────────────────────────────────────────────

test("★고르지 않았으면 balanced 다", () => {
  assert.equal(DEFAULT_TRIP_PACE, "balanced");
  assert.equal(normalizeTripPace(undefined), "balanced");
  assert.equal(normalizeTripPace(""), "balanced");
  assert.equal(normalizeTripPace("packed"), "balanced", "★packed 가 값으로 통과했다");
  assert.deepEqual([...TRIP_PACE_CHOICES], ["relaxed", "balanced", "active"]);
  assert.equal(isTripPaceChoice("normal"), false);
});

test("★★동행에서 속도를 유추하지 않는다", () => {
  // 예전 toPace 는 couple/family 를 relaxed 로, adventure 를 packed 로 바꿨다.
  assert.doesNotMatch(ITIN, /includes\("couple"\)|includes\("family"\)|includes\("adventure"\)/,
    "★동행 문자열로 속도를 유추하는 코드가 남아 있다");
  assert.match(ITIN, /function toPace\(paceParam: string\)/, "toPace 가 pace 를 받지 않는다");
  assert.match(ITIN, /toSchedulerPace\(normalizeTripPace\(paceParam\)\)/);
});

test("★★Home 은 속도를 사용자에게 직접 묻는다", () => {
  assert.match(HOME, /useState<TripPaceChoice>\(DEFAULT_TRIP_PACE\)/, "기본값이 balanced 가 아니다");
  assert.match(HOME, /TRIP_PACE_CHOICES\.map/, "3택 UI 가 없다");
  assert.match(HOME, /aria-pressed=\{tripPace === p\}/, "선택 상태를 알 수 없다");
  // 여행자 수 입력은 그대로 남는다.
  assert.match(HOME, /setTravelers/, "여행자 수 입력이 사라졌다");
});

test("★★사용자에게 내부 용어를 보여주지 않는다", () => {
  const ui = HOME.slice(HOME.indexOf('role="group" aria-label={tPace("title")}'));
  const block = ui.slice(0, 900);
  assert.doesNotMatch(block, /packed|normal|dwell|multiplier|score/i,
    "★내부 용어가 화면에 나온다");
  // Solo/Couple/Family/Group 을 Pace 옵션으로 되돌리지 않는다.
  assert.doesNotMatch(block, /Solo|Couple|Family|Group/);
});

// ── B. 체류시간 — 여기가 핵심이다 ────────────────────────────────────────────

const stayFor = (pace: "relaxed" | "normal" | "packed") => {
  const c = { place_id: "x", category: "attraction", coordinate: { lat: 35, lng: 129 },
              zone_id: 1, score: 100 } as NearMeCandidate;
  return resolveStayMinutes(c, { pace } as SchedulerInput).stay_minutes;
};

test("★★active 의 체류시간은 balanced 와 정확히 같다", () => {
  assert.equal(toSchedulerPace("active"), "normal");
  assert.equal(toSchedulerPace("balanced"), "normal");
  assert.equal(stayFor(toSchedulerPace("active")), stayFor(toSchedulerPace("balanced")),
    "★active 가 체류시간을 바꿨다");
});

test("★★active 는 어떤 경로로도 packed 가 되지 않는다", () => {
  for (const c of TRIP_PACE_CHOICES) {
    assert.notEqual(toSchedulerPace(c), "packed", `★${c} 가 packed 로 갔다`);
  }
  assert.doesNotMatch(CORE, /"packed"/, "★core 가 packed 를 값으로 돌려줄 수 있다");
  assert.equal(PACE_MULTIPLIER.packed, 0.8, "packed 계약 자체는 그대로여야 한다");
});

test("★relaxed 는 기존 1.3 배 계약 그대로다", () => {
  assert.equal(toSchedulerPace("relaxed"), "relaxed");
  assert.equal(PACE_MULTIPLIER.relaxed, 1.3);
  const base = CATEGORY_STAY_MINUTES.attraction ?? 60;
  assert.equal(stayFor("relaxed"), Math.round(base * 1.3));
  assert.equal(stayFor("normal"),  Math.round(base * 1.0));
});

test("★★일정 종료시각·식사·이동 buffer 를 속도가 건드리지 않는다", () => {
  // pace 를 읽는 곳은 체류시간 하나뿐이어야 한다.
  const alloc = strip(read("src", "lib", "scheduler", "slot-allocator.ts"));
  assert.match(alloc, /PACE_MULTIPLIER\[input\.pace\]/);
  for (const f of ["engine", "constraint-validator", "timeline-builder", "meal-opportunity"]) {
    const src = strip(read("src", "lib", "scheduler", `${f}.ts`));
    assert.doesNotMatch(src, /input\.pace|\.pace\b/, `★${f} 가 pace 를 읽는다`);
  }
});

// ── C. Active 후보 선호 ──────────────────────────────────────────────────────


test("★★active 는 걷는 후보에만 가산점을 준다", () => {
  assert.equal(paceBonus("active", "walking"), ACTIVE_WALKING_BONUS);
  assert.equal(paceBonus("active", "food"), 0, "★걷지 않는 후보에도 붙었다");
  assert.equal(paceBonus("active", "attraction"), 0);
});

test("★★balanced·relaxed 는 후보 점수를 바꾸지 않는다", () => {
  for (const p of ["balanced", "relaxed"] as const) {
    assert.equal(paceBonus(p, "walking"), 0, `★${p} 가 후보 점수를 바꿨다`);
    assert.equal(paceBonus(p, "food"), 0);
  }
  // pace 를 모르면(예전 주소·예전 클라이언트) 기존 점수 그대로다.
  assert.equal(paceBonus(normalizeTripPace(undefined), "walking"), 0);
});

test("★★F8 이 실제 총점에 더해진다", () => {
  // scorer 는 확장자 없는 import 라 여기서 직접 실행할 수 없다. 대신 그 한 줄이
  // 총점 식에 실제로 들어가 있는지, 그리고 pace 를 어디서 읽는지를 고정한다.
  assert.match(SCORER, /\+ paceBonus\(normalizeTripPace\(input\.pace\), candidate\.category\)/,
    "★F8 이 총점에 더해지지 않는다 — 전달이 끊겼다");
  const total = SCORER.slice(SCORER.indexOf("export function computeTotalScore"));
  assert.ok(total.indexOf("paceBonus") < total.indexOf("}"), "총점 식 밖에 있다");
});

test("★★active 가산점 크기가 다른 신호를 덮지 않는다", () => {
  // F5 선호 50 · F6 인접 25 · F4 격차(food 20 − walking 14 = 6).
  // 6 을 넘겨 동급 경쟁에서 앞서되, 25·50 은 넘지 않는다.
  assert.ok(ACTIVE_WALKING_BONUS > 6,  "동급 식당을 넘지 못한다");
  assert.ok(ACTIVE_WALKING_BONUS < 25, "F6 인접(25)보다 커서 동선을 흔든다");
  assert.ok(ACTIVE_WALKING_BONUS < 50, "F5 선호(50)보다 커서 사용자 취향을 덮는다");
  // This Trip 은 score 999 로 들어온다 — 근처도 못 간다.
  assert.ok(ACTIVE_WALKING_BONUS < 999);
});

test("★★이름·설명으로 활동성을 추측하지 않는다", () => {
  // 판정 함수 본문만 본다 — 여기에 장소 이름·설명이 끼어들면 안 된다.
  const fn = CORE.slice(CORE.indexOf("export function paceBonus"));
  const body = fn.slice(0, fn.indexOf("}") + 1);
  assert.doesNotMatch(body, /name|description|title|keyword|match|includes/i,
    "★구조적 분류가 아니라 문자열을 보고 있다");
  assert.match(body, /category === "walking"/, "구조 신호를 쓰지 않는다");
  // 외부 조회·AI 분류도 없다.
  assert.doesNotMatch(CORE, /fetch\s*\(|gemini|openai|classif/i, "★외부 분류에 기댄다");
});

// ── D. 저장과 전달 ───────────────────────────────────────────────────────────

const base = { city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", now: 1 };

test("★tripPace 저장 → 복원", () => {
  store.clear();
  writeTripDraft({ ...base, tripPace: "active" });
  assert.equal(readTripDraft()?.tripPace, "active");
});

test("★★새 필드를 모르던 draft 도 그대로 열린다", () => {
  store.clear();
  store.set(TRIP_DRAFT_KEY, JSON.stringify({ city: "Busan", startDate: "2026-10-24",
    endDate: "2026-10-27", updatedAt: 1, travelers: "2" }));
  const d = readTripDraft()!;
  assert.equal(d.tripPace, undefined, "없는 값을 지어냈다");
  assert.equal(d.travelers, "2", "기존 필드가 깨졌다");
  assert.equal(normalizeTripPace(d.tripPace), "balanced");
});

test("★생략은 유지, 잘못된 값은 무시", () => {
  store.clear();
  writeTripDraft({ ...base, tripPace: "relaxed" });
  writeTripDraft({ ...base, now: 2 });
  assert.equal(readTripDraft()?.tripPace, "relaxed", "생략했더니 지워졌다");
  writeTripDraft({ ...base, tripPace: "packed" as never, now: 3 });
  assert.notEqual(readTripDraft()?.tripPace, "packed", "★packed 가 저장됐다");
});

test("★★생성 주소로 전달된다", () => {
  store.clear();
  writeTripDraft({ ...base, tripPace: "active" });
  const ctx = tripDraftGenerationContext(readTripDraft()!);
  assert.equal(ctx.tripPace, "active");
  assert.ok(buildItineraryGenerationUrl(ctx)!.includes("pace=active"));
  // 고르지 않았으면 주소에 넣지 않는다 — 예전 주소와 같은 모양이다.
  store.clear();
  writeTripDraft({ ...base, now: 9 });
  assert.ok(!buildItineraryGenerationUrl(tripDraftGenerationContext(readTripDraft()!))!.includes("pace="));
});

test("★★Home 이 TripDraft 를 SSOT 로 쓴다", () => {
  assert.match(HOME, /if \(d\.tripPace\)\s+setTripPace\(d\.tripPace\)/, "복원하지 않는다");
  assert.match(HOME, /stay:\s*stayMode === "exact" \? stayDetail : null,\s*\n\s*tripPace,/, "저장하지 않는다");
  // 별도 전역 저장소를 새로 만들지 않는다.
  assert.doesNotMatch(HOME, /sessionStorage\.setItem\("km_trip_pace/, "★새 전역 key 를 만들었다");
});

// ── E. legacy 는 그대로 ──────────────────────────────────────────────────────

test("★★legacy travelStyle 을 지우지 않았다", () => {
  assert.match(HOME, /sessionStorage\.getItem\("km_travel_style"\)/, "legacy 저장이 사라졌다");
  assert.match(HOME, /travelStyle:\s*effectiveStyle/, "생성에서 travelStyle 이 빠졌다");
  assert.match(ITIN, /setTravelStyle\(record\.travel_style\)/, "저장 여행 재현이 깨졌다");
  assert.match(ITIN, /travel_style: tstyle/, "저장 payload 에서 빠졌다");
});

test("★★일정 화면이 trip_pace 를 실제로 보낸다", () => {
  // 운영 QA 에서 이 한 줄이 빠져 F8 이 한 번도 발동하지 않았다.
  // 체류시간용 `pace` 와 후보 선택용 `trip_pace` 는 둘 다 실려야 한다.
  const body = ITIN.slice(ITIN.indexOf("const basePlanBody = {"));
  const head = body.slice(0, body.indexOf("};"));
  assert.match(head, /trip_pace: paceChoice,/, "★trip_pace 가 요청에 실리지 않는다");
  assert.match(head, /[\s\S]\s{6}pace,/, "체류시간용 pace 가 빠졌다");
});

test("★예전 주소로 열어도 지금까지와 같다", () => {
  // pace 파라미터가 없으면 balanced → normal.
  assert.equal(toSchedulerPace(normalizeTripPace(null)), "normal");
  assert.match(ITIN, /normalizeTripPace\(searchParams\.get\("pace"\)\)/);
});

console.log(`\n  ${passed} passed`);

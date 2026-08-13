// This Trip 고정 일정 — 입력 규칙 · 날짜 분리 · 스케줄러 hard constraint.
//
// 무엇을 지키는가
//   사용자가 "10월 17일 19시" 라고 적었으면 그 시각에 있어야 한다. 취향 보정도
//   거리 최적화도 식사 보장도 그것을 밀어내지 못한다. 대신 그 주변에 넣는
//   장소는 물리적으로 갈 수 있어야 하고, 갈 수 없으면 **고정을 옮기는 대신
//   그 후보를 거절**한다.
//
//   그리고 잘못된 입력을 조용히 버리지 않는다. 사용자가 지정한 약속이 일정에
//   들어간 줄 알게 되는 것이 가장 나쁜 실패다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runScheduler } from "../scheduler/engine.ts";
import { estimateTravelMinutes } from "../scheduler/travel-time-estimator.ts";
import {
  validateFixedDraft, fixedEndTime, fixedFitsDayWindow, hasFixedOverlap,
  tripDates, timeToMinutes, FIXED_MAX_DURATION_MINUTES,
} from "./fixed-core.ts";
import { planDayAnchors, mergeDayHints } from "./anchor-build.ts";

const DAYS = tripDates("2026-10-16", 3);   // 10-16, 10-17, 10-18

const BASE = { lat: 35.1587, lng: 129.1603 };
const at = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h! * 60 + m!; };

const cand = (id: string, cat: string, n: number, score: number, stay?: number) => ({
  place_id: id, category: cat, coordinate: at(n), zone_id: 1 as const,
  distance_m: 300, score, ...(stay ? { stay_minutes_override: stay } : {}),
});

function run(extra: Record<string, unknown>) {
  const r = runScheduler({
    trip_date: "2026-10-17", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: [], ...extra,
  } as never) as {
    success: boolean;
    error?: { code: string };
    data?: { items: { place_id?: string; start_time: string; end_time: string;
                      is_fixed: boolean; item_type: string }[] };
  };
  return {
    ok: r.success, code: r.error?.code,
    items: (r.data?.items ?? []).filter(i => i.item_type !== "affiliate"),
    id: (x: string) => (r.data?.items ?? []).find(i => i.place_id === x),
  };
}

// ── 입력 validation (§6) ─────────────────────────────────────────────────────

test("입력 — 빠진 값과 잘못된 값을 조용히 넘기지 않는다", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ date: "",           startTime: "19:00", durationMinutes: 120 }, "missingDate"],
    [{ date: DAYS[1]!,     startTime: "",      durationMinutes: 120 }, "missingTime"],
    [{ date: DAYS[1]!,     startTime: "25:00", durationMinutes: 120 }, "missingTime"],
    [{ date: DAYS[1]!,     startTime: "19:00", durationMinutes: null }, "missingDuration"],
    [{ date: DAYS[1]!,     startTime: "19:00", durationMinutes: 0 },    "missingDuration"],
    [{ date: DAYS[1]!,     startTime: "19:00", durationMinutes: -30 },  "missingDuration"],
    [{ date: DAYS[1]!,     startTime: "19:00", durationMinutes: FIXED_MAX_DURATION_MINUTES + 1 }, "durationTooLong"],
    [{ date: "2026-12-25", startTime: "19:00", durationMinutes: 120 },  "dateOutOfTrip"],
    [{ date: DAYS[1]!,     startTime: "23:30", durationMinutes: 120 },  "endsPastMidnight"],
  ];
  for (const [draft, expected] of cases) {
    const r = validateFixedDraft(draft as never, DAYS);
    assert.equal(r.ok, false, `${JSON.stringify(draft)} 는 거부되어야 한다`);
    assert.equal((r as { error: string }).error, expected, JSON.stringify(draft));
  }
});

test("입력 — 올바른 값은 그대로 보존된다", () => {
  const r = validateFixedDraft({ date: DAYS[1]!, startTime: "19:00", durationMinutes: 150 }, DAYS);
  assert.ok(r.ok);
  assert.deepEqual(r.value, { date: DAYS[1]!, startTime: "19:00", durationMinutes: 150 });
});

// ── C. duration → end_time ───────────────────────────────────────────────────

test("C 종료시각은 사용자 소요시간으로만 계산한다", () => {
  assert.equal(fixedEndTime({ date: DAYS[1]!, startTime: "19:00", durationMinutes: 150 }), "21:30");
  assert.equal(fixedEndTime({ date: DAYS[1]!, startTime: "09:05", durationMinutes: 25 }),  "09:30");
});

test("C 추천 체류시간이 사용자 duration 을 덮어쓰지 않는다", () => {
  // 후보에는 stay_minutes_override 120 이 있지만 고정은 90분으로 지정됐다.
  const plan = planDayAnchors(
    [{ place_id: "gig", lat: at(2).lat, lng: at(2).lng,
       fixed: { date: "2026-10-17", startTime: "19:00", durationMinutes: 90 } }],
    "2026-10-17", "09:00", "21:00",
  );
  assert.equal(plan.anchors[0]!.start_time, "19:00");
  assert.equal(plan.anchors[0]!.end_time,   "20:30");

  const r = run({
    candidates: [{ ...cand("gig", "event", 2, 999), stay_minutes_override: 120 }],
    anchors: plan.anchors,
  });
  const gig = r.id("gig");
  assert.ok(gig);
  assert.equal(gig!.end_time, "20:30", "추천 120분이 아니라 사용자 90분이어야 한다");
});

// ── D. 날짜 분리 ─────────────────────────────────────────────────────────────

test("D 2일차 고정은 1일차 anchors 에 들어가지 않고, 1일차 후보에서도 빠진다", () => {
  const hints = [
    { place_id: "d2gig", lat: at(2).lat, lng: at(2).lng,
      fixed: { date: DAYS[1]!, startTime: "19:00", durationMinutes: 120 } },
    { place_id: "plain", lat: at(3).lat, lng: at(3).lng, fixed: null },
  ];

  const day1 = planDayAnchors(hints, DAYS[0]!, "09:00", "21:00");
  assert.equal(day1.anchors.length, 0, "1일차 anchors 는 비어야 한다");
  assert.deepEqual(day1.drop.map(h => h.place_id), ["d2gig"],
    "다른 날 고정 장소는 1일차 후보에서 빠져야 한다 — 먼저 소비되면 정작 그날 못 쓴다");
  const day1Hints = mergeDayHints(hints, day1);
  assert.deepEqual(day1Hints.map(h => h.place_id), ["plain"]);

  const day2 = planDayAnchors(hints, DAYS[1]!, "09:00", "21:00");
  assert.deepEqual(day2.anchors.map(a => a.place_id), ["d2gig"]);
  assert.equal(day2.drop.length, 0);
});

// ── K. 좌표 유지 ─────────────────────────────────────────────────────────────

test("K 거리 필터가 걸러내도 오늘 고정 장소의 hint 는 남는다", () => {
  const far = { place_id: "fargig", lat: at(300).lat, lng: at(300).lng,
                fixed: { date: DAYS[1]!, startTime: "19:00", durationMinutes: 120 } };
  const near = { place_id: "near", lat: at(1).lat, lng: at(1).lng, fixed: null };
  const plan = planDayAnchors([far, near], DAYS[1]!, "09:00", "21:00");

  // 거리 필터가 far 를 떨어뜨린 상황을 만든다
  const merged = mergeDayHints([near], plan);
  assert.ok(merged.some(h => h.place_id === "fargig"),
    "좌표가 빠지면 엔진이 위치를 몰라 그 앞뒤를 통째로 비운다");
});

test("K 좌표가 남아 있으면 고정 앞 후보의 이동 가능성이 검증된다", () => {
  // c1 은 공연장에서 14.9km. 진입+체류만 보면 들어가지만 갈 수 없다.
  const r = run({
    candidates: [
      { ...cand("c1", "attraction", 20, 500), stay_minutes_override: 90 },
      cand("blocker", "attraction", 1, 1),
      cand("gig", "event", 150, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "gig",     start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.id("c1"), undefined, "공연 시작까지 갈 수 없는 후보는 거절한다");
  assert.equal(r.id("gig")!.start_time, "19:00", "고정을 옮기지 않는다");
});

// ── B. 정확한 날짜/시간 ──────────────────────────────────────────────────────

test("B 고정 장소는 지정한 시각 그대로 배치된다", () => {
  const r = run({
    candidates: [cand("gig", "event", 2, 1), cand("x", "attraction", 3, 300)],
    anchors: [{ place_id: "gig", start_time: "19:00", end_time: "20:30", is_fixed: true }],
  });
  assert.ok(r.ok);
  const gig = r.id("gig");
  assert.ok(gig);
  assert.equal(gig!.start_time, "19:00");
  assert.equal(gig!.end_time,   "20:30");
  assert.equal(gig!.is_fixed,   true);
});

// ── F. AI / profileBias ──────────────────────────────────────────────────────

test("F profileBias 가 고정을 움직이지 못한다", () => {
  const profile = {
    profile_version: 1, category_weights: { attraction: 1, nature: 1, restaurant: 0 },
    preferred_place_ids: [], time_preferences: { evening: 1 }, pace_bias: 0,
    day_density_preference: "balanced", cluster_preference: "balanced",
    meal_preference: "flexible", preference_summary: "", source: "ai",
  };
  const r = run({
    candidates: [cand("gig", "event", 2, 1), cand("a", "attraction", 3, 900), cand("b", "attraction", 4, 880)],
    anchors: [{ place_id: "gig", start_time: "19:00", end_time: "20:30", is_fixed: true }],
    personalization_profile: profile,
  });
  assert.ok(r.ok);
  const gig = r.id("gig");
  assert.equal(gig!.start_time, "19:00");
  assert.equal(gig!.end_time,   "20:30");
});

// ── G. 여러 Fixed ────────────────────────────────────────────────────────────

test("G 서로 겹치지 않는 다중 고정은 모두 배치된다", () => {
  const r = run({
    candidates: [cand("m", "attraction", 1, 1), cand("e", "event", 2, 1)],
    anchors: [
      { place_id: "m", start_time: "10:00", end_time: "11:00", is_fixed: true },
      { place_id: "e", start_time: "19:00", end_time: "20:30", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.id("m")!.start_time, "10:00");
  assert.equal(r.id("e")!.start_time, "19:00");
});

// ── H. Fixed 충돌 ────────────────────────────────────────────────────────────

test("H 겹치는 고정은 한쪽을 조용히 옮기지 않고 실패한다", () => {
  const r = run({
    candidates: [cand("a", "event", 1, 1), cand("b", "event", 2, 1)],
    anchors: [
      { place_id: "a", start_time: "19:00", end_time: "21:00", is_fixed: true },
      { place_id: "b", start_time: "20:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.equal(r.ok, false, "충돌은 성공으로 처리하면 안 된다");
  assert.equal(r.code, "HC-5");
});

test("H 입력 단계에서도 같은 날 겹침을 잡아낸다", () => {
  const overlap = [
    { date: DAYS[1]!, startTime: "19:00", durationMinutes: 120 },
    { date: DAYS[1]!, startTime: "20:00", durationMinutes: 60 },
  ];
  const apart = [
    { date: DAYS[1]!, startTime: "10:00", durationMinutes: 60 },
    { date: DAYS[1]!, startTime: "19:00", durationMinutes: 60 },
  ];
  const otherDay = [
    { date: DAYS[0]!, startTime: "19:00", durationMinutes: 120 },
    { date: DAYS[1]!, startTime: "19:00", durationMinutes: 120 },
  ];
  assert.equal(hasFixedOverlap(overlap),  true);
  assert.equal(hasFixedOverlap(apart),    false);
  assert.equal(hasFixedOverlap(otherDay), false, "다른 날끼리는 겹치지 않는다");
});

// ── E·J. 고정 전후 삽입 / supplemental ───────────────────────────────────────

test("E·J 고정 주변 후보는 물리적으로 가능할 때만 들어간다", () => {
  const r = run({
    candidates: [
      { ...cand("ok", "attraction", 149, 400), stay_minutes_override: 60 },
      cand("blocker", "attraction", 1, 1),
      cand("gig", "event", 150, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "gig",     start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  const ok = r.id("ok");
  assert.ok(ok, "진입 40 + 체류 60 + 퇴장 8 = 108 ≤ 120 이면 들어가야 한다");
  const need = estimateTravelMinutes(at(149), at(150));
  assert.ok(toMin(ok!.end_time) + need <= toMin("19:00"),
    "체류 종료 후 공연장까지 갈 시간이 남아야 한다");
});

// ── L. 좌표 미확인 fail-closed ───────────────────────────────────────────────

test("L 고정 장소 좌표를 알 수 없으면 그 앞 gap 에 넣지 않는다", () => {
  // gig 를 candidates 에서 빼 좌표를 해석할 수 없게 만든다.
  const r = run({
    candidates: [
      { ...cand("c1", "attraction", 20, 500), stay_minutes_override: 90 },
      cand("blocker", "attraction", 1, 1),
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "gig",     start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.id("c1"), undefined, "가짜 이동시간을 만드는 대신 비워 둔다");
});

// ── M. preferred vs fixed 독립 ───────────────────────────────────────────────

test("M preferred_time_slot 은 고정을 만들지 않는다", () => {
  // preferred 만 있고 anchors 가 없으면 hard constraint 가 아니다.
  const r = run({
    candidates: [cand("p", "attraction", 1, 999, 60)],
    preferred_items: [{ place_id: "p", preferred_time_slot: "evening" }],
  });
  assert.ok(r.ok);
  const p = r.id("p");
  if (p) assert.equal(p.is_fixed, false, "preferred 는 soft 다 — is_fixed 가 되면 안 된다");
});

test("M 고정은 preferred_time_slot 과 무관하게 그 시각을 지킨다", () => {
  const r = run({
    candidates: [cand("gig", "event", 2, 999, 60)],
    anchors: [{ place_id: "gig", start_time: "10:00", end_time: "11:00", is_fixed: true }],
    preferred_items: [{ place_id: "gig", preferred_time_slot: "evening" }],
  });
  assert.ok(r.ok);
  assert.equal(r.id("gig")!.start_time, "10:00", "저녁 선호가 고정 10시를 움직이면 안 된다");
});

// ── A. Fixed 없음 회귀 ───────────────────────────────────────────────────────

test("A 고정이 하나도 없으면 anchors 는 비고 후보도 그대로다", () => {
  const hints = [
    { place_id: "a", lat: at(1).lat, lng: at(1).lng },
    { place_id: "b", lat: at(2).lat, lng: at(2).lng, fixed: null },
  ];
  const plan = planDayAnchors(hints, DAYS[0]!, "09:00", "21:00");
  assert.deepEqual(plan.anchors, []);
  assert.deepEqual(plan.drop, []);
  assert.deepEqual(plan.keep, []);
  assert.deepEqual(mergeDayHints(hints, plan).map(h => h.place_id), ["a", "b"]);
});

// ── 하루 창 밖 ───────────────────────────────────────────────────────────────

test("하루 창 밖 고정은 anchor 로 보내지 않고 이름을 남긴다", () => {
  const hints = [{ place_id: "late", lat: at(1).lat, lng: at(1).lng,
                   fixed: { date: DAYS[1]!, startTime: "22:00", durationMinutes: 60 } }];
  const plan = planDayAnchors(hints, DAYS[1]!, "09:00", "21:00");
  assert.deepEqual(plan.anchors, [], "창 밖이면 배치하지 않는다");
  assert.deepEqual(plan.outOfWindow.map(h => h.place_id), ["late"], "조용히 사라지면 안 된다");
  assert.equal(fixedFitsDayWindow({ date: DAYS[1]!, startTime: "22:00", durationMinutes: 60 }, "09:00", "21:00"), false);
  assert.equal(fixedFitsDayWindow({ date: DAYS[1]!, startTime: "19:00", durationMinutes: 120 }, "09:00", "21:00"), true);
});

// ── I. My Place 경로 ─────────────────────────────────────────────────────────

test("I My Place 를 This Trip 에 넣고 고정하면 anchor 로 이어진다", () => {
  // 이 키는 place-identity 의 userSpotSourceKey 형식이다. city_spot 만 숫자로
  // 바뀌고 그 밖의 소스는 원문이 그대로 hint key 가 된다.
  const key = "user_spot:11111111-2222-3333-4444-555555555555";
  const hints = [{ place_id: key, lat: at(2).lat, lng: at(2).lng,
                   fixed: { date: DAYS[1]!, startTime: "19:00", durationMinutes: 90 } }];

  const plan = planDayAnchors(hints, DAYS[1]!, "09:00", "21:00");
  assert.deepEqual(plan.anchors.map(a => a.place_id), [key],
    "anchor 의 place_id 는 cart hint key 와 같아야 중복 배치가 걸러진다");
  assert.equal(plan.anchors[0]!.end_time, "20:30");
  assert.deepEqual(mergeDayHints([], plan).map(h => h.place_id), [key],
    "좌표 해석을 위해 hint 에 남아야 한다");

  const r = run({
    candidates: [cand(key, "event", 2, 999, 90), cand("x", "attraction", 3, 300)],
    anchors: plan.anchors,
  });
  assert.ok(r.ok);
  const mine = r.id(key);
  assert.ok(mine, "My Place 가 일정에 들어가야 한다");
  assert.equal(mine!.start_time, "19:00");
  assert.equal(mine!.end_time,   "20:30");
  assert.equal(mine!.is_fixed,   true);
  // 같은 장소가 greedy 로 한 번 더 놓이지 않는다
  assert.equal(r.items.filter(i => i.place_id === key).length, 1);
});

test("I My Places 전체가 자동 후보화되는 경로는 여전히 없다", () => {
  const dir = join(import.meta.dirname, "..", "scheduler");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const src = readFileSync(join(dir, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");
    assert.ok(!/user_spots?\b/.test(src),
      `${f}: 스케줄러가 My Places 를 직접 알면 안 된다`);
  }
});

// ── 날짜 산술 ────────────────────────────────────────────────────────────────

test("여행 날짜는 로컬 문자열로만 더한다 — 월말·윤년", () => {
  assert.deepEqual(tripDates("2026-10-30", 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(tripDates("2024-02-28", 3), ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(tripDates("2026-12-31", 2), ["2026-12-31", "2027-01-01"]);
  assert.deepEqual(tripDates("bad", 3), []);
  assert.equal(timeToMinutes("19:30"), 1170);
});

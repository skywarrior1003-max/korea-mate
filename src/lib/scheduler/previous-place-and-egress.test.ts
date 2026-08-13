// 스케줄러가 오래 지키지 못한 두 가지 물리 계약.
//
// 무엇을 막는가
//   ① "직전 장소" 가 그날 가장 늦게 배치된 항목이었다. gap 은 greedyLoop 진입 시
//      한 번만 계산되고 바깥 while 이 그것을 최대 20회 다시 부르기 때문에,
//      2회차부터는 오전 gap 을 채우면서 오후 항목을 기준으로 거리를 쟀다.
//      TASK-057-A 의 거리 페널티가 첫 pass 에서만 의도대로 동작했다는 뜻이다.
//   ② 고정 일정 앞에 놓는 후보가 그 고정 장소까지 이동할 시간을 확보하지 않았다.
//      19:00 공연인데 18:59 까지 다른 동네에 있는 일정이 나올 수 있었다.
//
// 어떻게 고쳤나
//   gap 마다 predecessor 를 시간축으로 찾고, 다음 항목이 고정이면 후보에서
//   그 장소까지의 이동시간까지 gap 안에 들어가는지 본다. 좌표를 알 수 없으면
//   검사를 건너뛴다 — 모르는 이동시간을 지어내지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runScheduler } from "./engine.ts";

/** 부산 해운대 근방을 기준점으로 쓴다. */
const BASE = { lat: 35.1587, lng: 129.1603 };
/** n 이 커질수록 BASE 에서 멀어진다. 1 ≈ 90m, 100 ≈ 9km. */
const at = (n: number) => ({ lat: BASE.lat + n * 0.0008, lng: BASE.lng + n * 0.0008 });

const cand = (id: string, n: number, score = 100, cat = "attraction") => ({
  place_id: id, category: cat, coordinate: at(n),
  zone_id: 1 as const, distance_m: 300, score,
});

function run(extra: Record<string, unknown>) {
  const r = runScheduler({
    trip_date: "2026-09-01", start_time: "09:00", end_time: "21:00",
    base_coordinate: BASE, pace: "normal", candidates: [], ...extra,
  } as never);
  return r as {
    success: boolean;
    data?: { items: { item_type: string; place_id?: string; event_id?: string;
                      start_time: string; end_time: string; is_fixed: boolean;
                      travel_minutes_from_prev: number }[] };
  };
}

const placesOf = (r: ReturnType<typeof run>) =>
  (r.data?.items ?? []).filter(i => i.item_type === "place");
const byId = (r: ReturnType<typeof run>, id: string) =>
  (r.data?.items ?? []).find(i => i.place_id === id || i.event_id === id);

// ── A. 일반 previous-place ───────────────────────────────────────────────────

test("A 직전 장소가 바로 앞 항목이다 — 이동시간이 그 거리로 계산된다", () => {
  // 후보 둘 다 BASE 에서 멀지만 서로 붙어 있다. 첫 장소가 놓이고 나면
  // 두 번째 장소의 travel 은 BASE 가 아니라 첫 장소 기준이어야 한다.
  const r = run({ candidates: [cand("p1", 60, 200), cand("p2", 61, 190)] });
  assert.ok(r.success);
  const items = placesOf(r).sort((a, b) => a.start_time.localeCompare(b.start_time));
  assert.ok(items.length >= 2, `두 곳 이상 배치되어야 한다 (실제 ${items.length})`);

  const first = items[0]!, second = items[1]!;
  // BASE→p1 은 약 6.8km 라 먼 이동이고, p1→p2 는 100m 도 안 된다.
  assert.ok(first.travel_minutes_from_prev > second.travel_minutes_from_prev,
    `직전 장소 기준이면 두 번째 이동이 더 짧아야 한다 ` +
    `(첫 ${first.travel_minutes_from_prev}분 / 두번째 ${second.travel_minutes_from_prev}분)`);
  assert.ok(second.travel_minutes_from_prev <= 8,
    `붙어 있는 두 장소 사이 이동은 도보권이어야 한다 (실제 ${second.travel_minutes_from_prev}분)`);
});

// ── B·C. 미래 고정 항목이 직전 장소를 오염시키지 않는다 ──────────────────────

test("B·C 저녁 고정 일정이 있어도 오전 후보의 기준은 오전 직전 항목이다", () => {
  // 19:00 고정은 BASE 에서 아주 멀다(≈18km). 오전 후보는 BASE 바로 옆이다.
  // 기준점이 오염되면 오전 후보의 travel 이 그 먼 거리로 계산된다.
  const near1 = cand("m1", 1, 200);
  const near2 = cand("m2", 2, 190);
  const far   = cand("evening", 200, 180);

  const withFixed = run({
    candidates: [near1, near2, far],
    anchors: [{ place_id: "evening", start_time: "19:00", end_time: "20:30", is_fixed: true }],
  });
  assert.ok(withFixed.success);

  const morning = placesOf(withFixed)
    .filter(i => i.place_id === "m1" || i.place_id === "m2")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  assert.ok(morning.length >= 1, "오전 후보가 배치되어야 한다");

  for (const m of morning) {
    assert.ok(m.travel_minutes_from_prev <= 8,
      `${m.place_id}: BASE 근처끼리의 이동인데 ${m.travel_minutes_from_prev}분 — ` +
      `미래 고정 항목(약 18km)이 기준점으로 새어 들어갔다`);
  }

  // 고정 항목 자체는 그대로 있어야 한다
  const fixed = byId(withFixed, "evening");
  assert.ok(fixed, "고정 항목이 일정에 있어야 한다");
  assert.equal(fixed!.start_time, "19:00");
  assert.equal(fixed!.is_fixed, true);
});

test("B multi-iteration — 늦은 항목이 이미 있어도 이른 gap 의 기준은 시간축 직전이다", () => {
  // 한 gap 에는 pass 당 하나만 놓인다. 남는 앞부분은 다음 iteration 에서 채워지고,
  // 그때는 이미 뒤쪽 항목이 placed 에 있다. 그 상황에서도 기준이 흔들리면 안 된다.
  const pool = [
    cand("a", 1, 300), cand("b", 2, 290), cand("c", 3, 280),
    cand("d", 4, 270), cand("e", 5, 260), cand("f", 6, 250),
  ];
  const r = run({ candidates: pool });
  assert.ok(r.success);

  const items = placesOf(r).sort((a, b) => a.start_time.localeCompare(b.start_time));
  assert.ok(items.length >= 3, `여러 곳이 배치되어야 한다 (실제 ${items.length})`);

  // 모든 후보가 서로 500m 안에 있으므로, 기준점이 옳다면 첫 항목을 뺀
  // 나머지의 이동시간은 전부 도보권이다.
  for (const it of items.slice(1)) {
    assert.ok(it.travel_minutes_from_prev <= 8,
      `${it.place_id} (${it.start_time}): 이웃한 후보인데 ${it.travel_minutes_from_prev}분`);
  }
});

// ── D. TASK-057-A 거리 페널티 계약 ───────────────────────────────────────────

test("D 점수가 같으면 가까운 후보가 먼 후보를 이긴다 — 거리 페널티", () => {
  // 동점 후보 둘. 하나는 BASE 옆, 하나는 약 9km. 페널티가 없으면 순서가
  // 점수만으로 정해져 먼 쪽이 먼저 나올 수 있다.
  const r = run({ candidates: [cand("far", 100, 100), cand("near", 1, 100)] });
  assert.ok(r.success);
  const items = placesOf(r).sort((a, b) => a.start_time.localeCompare(b.start_time));
  assert.ok(items.length >= 1);
  assert.equal(items[0]!.place_id, "near",
    "동점이면 거리 페널티가 적은 가까운 후보가 먼저 배치되어야 한다");
});

test("D 아주 먼 후보는 페널티만큼 점수가 깎인다 — 상수 계약", () => {
  const engine = readFileSync(join(import.meta.dirname, "engine.ts"), "utf8");
  // 페널티 계단이 사라지거나 0 으로 무력화되지 않았는지 본다.
  assert.match(engine, /consecutiveDistancePenalty/,
    "거리 페널티 함수가 있어야 한다");
  assert.match(engine, /adjusted_score:[\s\S]{0,200}-\s*consecutiveDistancePenalty/,
    "adjusted_score 에서 페널티가 실제로 차감되어야 한다");
});

// ── E·F. 고정 일정 직전 이동시간(egress) ─────────────────────────────────────

/**
 * 09:00–17:00 을 고정 항목으로 막아 gap 을 17:00–19:00(120분) 하나로 만들고,
 * 19:00 에 공연을 둔다. 후보 하나만 이 gap 을 노린다.
 *
 * 이동시간 표는 500m 이하 8분 / 3km 이하 20분 / 7km 이하 30분 / 그 이상 40분이다.
 */
function egressCase(candidateAt: number, stayOverride: number) {
  return run({
    start_time: "09:00", end_time: "21:00",
    candidates: [
      { ...cand("c1", candidateAt, 500), stay_minutes_override: stayOverride },
      { place_id: "blocker", category: "attraction", coordinate: at(1),
        zone_id: 1 as const, distance_m: 300, score: 1 },
      { place_id: "concert", category: "event", coordinate: at(150),
        zone_id: 1 as const, distance_m: 300, score: 1 },
    ],
    anchors: [
      { place_id: "blocker", start_time: "09:00", end_time: "17:00", is_fixed: true },
      { place_id: "concert", start_time: "19:00", end_time: "21:00", is_fixed: true },
    ],
  });
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};

test("E 다음 고정까지 이동시간을 포함해도 들어가면 배치한다", () => {
  // c1 = at(149) — 공연장 at(150) 에서 115m.
  //   진입 blocker(at 1) → c1 = 17.0km → 40분
  //   체류 60분  /  egress c1 → concert = 115m → 8분
  //   40 + 60 + 8 = 108 ≤ 120  → 배치 가능
  const r = egressCase(149, 60);
  assert.ok(r.success);
  const c1 = byId(r, "c1");
  assert.ok(c1, "공연장 옆 후보는 17:00–19:00 사이에 들어가야 한다");
  assert.ok(toMin(c1!.end_time) + 8 <= toMin("19:00"),
    `체류 종료(${c1!.end_time}) 후 공연장까지 이동할 8분이 남아야 한다`);
});

test("F 다음 고정까지 이동시간을 더하면 넘치는 후보는 배치하지 않는다", () => {
  // c1 = at(20) — 공연장에서 14.9km 떨어져 있다.
  //   진입 blocker(at 1) → c1 = 2.2km → 20분
  //   체류 90분  → 20 + 90 = 110 ≤ 120 이라 기존 검사는 통과한다
  //   egress c1 → concert = 14.9km → 40분
  //   110 + 40 = 150 > 120  → 배치되면 안 된다
  const r = egressCase(20, 90);
  assert.ok(r.success);
  assert.equal(byId(r, "c1"), undefined,
    "진입+체류만 보면 들어가지만 공연 시작까지 이동할 수 없다 — 배치 금지");

  // 고정 항목은 그대로다
  const concert = byId(r, "concert");
  assert.ok(concert);
  assert.equal(concert!.start_time, "19:00");
  assert.equal(concert!.end_time, "21:00");
});

// ── G. 고정 항목 불변 ────────────────────────────────────────────────────────

test("G profileBias·zone·거리 점수가 고정 항목을 움직이지 못한다", () => {
  const profile = {
    profile_version: 1,
    category_weights: { attraction: 1, nature: 1, restaurant: 0 },
    preferred_place_ids: [], time_preferences: {}, pace_bias: 0,
    day_density_preference: "balanced", cluster_preference: "balanced",
    meal_preference: "flexible", preference_summary: "", source: "ai",
  };
  const r = run({
    candidates: [cand("x", 1, 900), cand("y", 2, 880), cand("evening", 200, 870)],
    anchors: [{ place_id: "evening", start_time: "19:00", end_time: "20:30", is_fixed: true }],
    personalization_profile: profile,
  });
  assert.ok(r.success);
  const fixed = byId(r, "evening");
  assert.ok(fixed, "고정 항목이 사라지면 안 된다");
  assert.equal(fixed!.start_time, "19:00", "시작 시각이 바뀌면 안 된다");
  assert.equal(fixed!.end_time, "20:30", "종료 시각이 바뀌면 안 된다");
  assert.equal(fixed!.is_fixed, true);
  // 고정 항목은 한 번만 나타난다 — greedy 가 같은 장소를 또 놓지 않는다
  const all = (r.data?.items ?? []).filter(i => i.place_id === "evening");
  assert.equal(all.length, 1, "고정 장소가 중복 배치되면 안 된다");
});

// ── H. 기존 non-fixed 일정 회귀 ──────────────────────────────────────────────

test("H 고정 항목이 없으면 egress 검사가 아무것도 바꾸지 않는다", () => {
  const pool = Array.from({ length: 8 }, (_, i) => cand(`p${i}`, 1 + i * 0.5, 200 - i));
  const r = run({ candidates: pool });
  assert.ok(r.success);
  const n = placesOf(r).length;
  assert.ok(n >= 3, `고정이 없는 하루는 평소대로 여러 곳이 채워져야 한다 (실제 ${n})`);
  // 모든 항목이 하루 창 안에 있다
  for (const it of placesOf(r)) {
    assert.ok(it.start_time >= "09:00" && it.end_time <= "21:00",
      `${it.place_id} ${it.start_time}~${it.end_time} 이 하루 창을 벗어났다`);
  }
});

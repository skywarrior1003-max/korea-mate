// TASK-SCHEDULER-V2-P1-ROUTE-QUALITY-CLOSURE-V2 — detector semantics · determinism · protected-stop contract · reason codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScheduler, repairAcceptable, protectedSignature, MEAL_DEFER_FILL_FIRST_MINUTES } from "./engine.ts";
import { buildClusters, auditDayRoute, computeScheduleConfidence, CLUSTER_RADIUS_M, LOCAL_ZIGZAG_MIN_SAVING_M, type AuditStop } from "./route-quality.ts";
import { MEAL_TIME_RANGES } from "./meal-opportunity.ts";
import { haversineDistance } from "./utils.ts";
import type { SchedulerInput, SchedulerResult } from "./types.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const at = (lat: number, lng: number) => ({ lat, lng });
const A = at(35.1600, 129.1600), B = at(35.1600, 129.1250);                    // 두 권역, 3.2 km
const near = (base: { lat: number; lng: number }, i: number) => at(base.lat + (i % 3) * 0.0015, base.lng + Math.floor(i / 3) * 0.0015);
const cand = (id: string, c: { lat: number; lng: number }, score: number, category = "attraction") => ({ place_id: id, category, coordinate: c, zone_id: 1 as const, score });

// ── 1. detector: 자동 식당은 JUSTIFIED 가 아니다 ───────────────────────────────
test("★AUTO_MEAL 끝점의 왕복은 UNJUSTIFIED(AUTO_MEAL_BACKTRACK); dataset 증명(NO_LOCAL_FEASIBLE_MEAL) 이 있을 때만 JUSTIFIED", () => {
  const FAR = at(35.1600, 129.1900);
  const { clusters, clusterOf } = buildClusters([{ key: "a", coordinate: A }, { key: "r", coordinate: FAR }, { key: "c", coordinate: near(A, 1) }]);
  const stop = (key: string, coordinate: { lat: number; lng: number }, extra: Partial<AuditStop> = {}): AuditStop => ({ key, coordinate, pinned: false, clusterId: clusterOf.get(key), ...extra });
  const auto = auditDayRoute([stop("a", A), stop("r", FAR, { meal: true }), stop("c", near(A, 1))], clusters);
  assert.ok(auto.unjustifiedBacktracks >= 1, JSON.stringify(auto.backtracks));
  assert.ok(auto.backtracks.every(b => !b.justified && b.reason === "AUTO_MEAL_BACKTRACK"));
  const gap = auditDayRoute([stop("a", A), stop("r", FAR, { meal: true, mealLocality: "MEAL_SUPPLY_GAP" }), stop("c", near(A, 1))], clusters);
  assert.ok(gap.backtracks.every(b => !b.justified && b.reason === "MEAL_SUPPLY_GAP"), "공급 결함은 UNJUSTIFIED");
  const none = auditDayRoute([stop("a", A), stop("r", FAR, { meal: true, mealLocality: "NO_LOCAL_FEASIBLE_MEAL" }), stop("c", near(A, 1))], clusters);
  assert.equal(none.unjustifiedBacktracks, 0); assert.ok(none.backtracks.every(b => b.justified && b.reason === "NO_LOCAL_FEASIBLE_MEAL"));
  const user = auditDayRoute([stop("a", A), stop("r", FAR, { meal: true, pinned: true, pinKind: "USER_SELECTED" }), stop("c", near(A, 1))], clusters);
  assert.ok(user.backtracks.every(b => b.justified && b.reason === "USER_SELECTED"), "사용자가 고른 식당은 보호 식사");
});

// ── 2. better-order: 자동 식당은 식사 창 안에서만 움직인다 ───────────────────────
test("★better feasible order — 자동 식당은 핀이 아니지만 식사 창 밖으로 나가는 순서는 feasible 이 아니다", () => {
  const [ls, le] = MEAL_TIME_RANGES.lunch;
  const P = at(35.1600, 129.1600), R = at(35.1600, 129.1700), Q = at(35.1600, 129.1800), Z = at(35.1600, 129.1900);   // 일직선 P–R–Q–Z (각 ~900 m)
  // 현재 순서 P → Q(점심) → R → Z : Q 까지 갔다가 R 로 돌아온다. R 을 먼저 들르면 더 짧다 — 점심이 창 안에 남으면 허용
  const base = [
    { key: "p", coordinate: P, pinned: true, pinKind: "ANCHOR" as const, startMinutes: ls - 60, stayMinutes: 30 },
    { key: "q", coordinate: Q, pinned: false, meal: true, mealWindow: [ls, le] as [number, number], startMinutes: ls, stayMinutes: 60 },
    { key: "r", coordinate: R, pinned: false, startMinutes: ls + 75, stayMinutes: 90 },
    { key: "z", coordinate: Z, pinned: true, pinKind: "ANCHOR" as const, startMinutes: le + 120, stayMinutes: 30 },
  ];
  const m = auditDayRoute(base);
  assert.ok(m.betterOrderRatio > 0, `자동 식당을 창 안에서 옮기면 더 짧다: ${JSON.stringify(m)}`);
  // 점심 창이 좁으면(R 을 먼저 들르면 점심이 창 뒤로 밀린다) 현재 순서가 최선이다 — 자동 식당은 창 밖으로 나가지 않는다
  const narrow = base.map(s => s.key === "q" ? { ...s, mealWindow: [ls, ls + 80] as [number, number] } : s);
  assert.equal(auditDayRoute(narrow).betterOrderRatio, 0);
});

// ── 3. local zigzag ────────────────────────────────────────────────────────────
test("★local zigzag — 800 m 미만 leg 의 A→B→A 는 잡고, 골목 도보의 작은 방향 변화는 잡지 않는다", () => {
  const O = at(35.1600, 129.1600), E = at(35.1600, 129.1650), W = at(35.1600, 129.1567);      // O 기준 동 450 m · 서 300 m (모든 leg < 800 m)
  const s = (key: string, coordinate: { lat: number; lng: number }): AuditStop => ({ key, coordinate, pinned: false });
  const zig = auditDayRoute([s("o", O), s("e", E), s("w", W), s("e2", at(35.1602, 129.1652)), s("end", at(35.1605, 129.1656))]);
  assert.equal(zig.backtracks.length, 0, "legs < 800 m 라 기존 detector 는 조용하다");
  assert.ok(zig.localZigzags.length >= 1, `local zigzag 를 잡아야 한다: ${JSON.stringify(zig.localZigzags)}`);
  assert.ok(zig.localZigzags[0]!.currentMeters - zig.localZigzags[0]!.bestMeters >= LOCAL_ZIGZAG_MIN_SAVING_M);
  const alley = auditDayRoute([s("a", O), s("b", at(35.1608, 129.1606)), s("c", at(35.1612, 129.1600)), s("d", at(35.1620, 129.1610)), s("e", at(35.1626, 129.1604))]);
  assert.equal(alley.localZigzags.length, 0, "100 m 단위 방향 변화는 zigzag 가 아니다");
  const conf = computeScheduleConfidence({ metrics: zig, coordinateFailures: 0, hardConstraintViolations: 0 });
  assert.equal(conf.status, "REVIEW"); assert.ok(conf.reasonCodes.includes("LOCAL_ZIGZAG"));
});

// ── 4. confidence 규칙 ─────────────────────────────────────────────────────────
test("★confidence — unjustified 1 은 최소 REVIEW, 좌표 불확실은 REVIEW, 하드 위반은 FAIL, 정상은 GOOD (cluster coherence 포함)", () => {
  const s = (key: string, coordinate: { lat: number; lng: number }, clusterId: number): AuditStop => ({ key, coordinate, pinned: false, clusterId });
  const good = auditDayRoute([s("a", A, 0), s("b", near(A, 1), 0), s("c", near(A, 2), 0)]);
  const g = computeScheduleConfidence({ metrics: good, coordinateFailures: 0, hardConstraintViolations: 0 });
  assert.equal(g.status, "GOOD"); assert.equal(g.clusterCoherence, 100); assert.deepEqual(g.reasonCodes, []);
  const u = computeScheduleConfidence({ metrics: good, coordinateFailures: 0, hardConstraintViolations: 0, uncertainCoordinates: 1 });
  assert.equal(u.status, "REVIEW"); assert.ok(u.reasonCodes.includes("COORDINATE_UNCERTAINTY"));
  const one = auditDayRoute([s("a", A, 0), s("b", B, 1), s("c", near(A, 1), 0)]);
  assert.equal(one.unjustifiedBacktracks >= 1, true);
  const r = computeScheduleConfidence({ metrics: one, coordinateFailures: 0, hardConstraintViolations: 0 });
  assert.equal(r.status, "REVIEW"); assert.ok(r.reasonCodes.includes("UNJUSTIFIED_BACKTRACK") && r.reasonCodes.includes("CLUSTER_REENTRY"));
  assert.ok(r.clusterCoherence < 100);
  assert.equal(computeScheduleConfidence({ metrics: good, coordinateFailures: 0, hardConstraintViolations: 1 }).status, "FAIL");
});

// ── 5. clustering determinism · 과결합 ─────────────────────────────────────────
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffled<T>(arr: T[], seed: number): T[] { const a = [...arr], r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }
const sig = (pts: { key: string; coordinate: { lat: number; lng: number }; score?: number }[]) => buildClusters(pts).clusters.map(c => [...c.members].sort().join(",")).sort().join("|");

test("★권역은 입력 순서에 독립이다 — 20회 deterministic shuffle 모두 같은 membership (동점 포함)", () => {
  const pts = Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, coordinate: at(35.15 + (i % 8) * 0.004, 129.12 + Math.floor(i / 8) * 0.006), score: 100 - (i % 5) }));  // 동점 다수
  const base = sig(pts);
  for (let k = 1; k <= 20; k++) assert.equal(sig(shuffled(pts, k)), base, `shuffle ${k}`);
});

test("★과결합 없음 — 900 m 씩 이어진 사슬은 하나의 권역이 되지 않는다 (지름 ≤ 2×반경)", () => {
  const chain = Array.from({ length: 6 }, (_, i) => ({ key: `c${i}`, coordinate: at(35.1600, 129.1600 + i * 0.0099), score: 100 - i }));  // 인접 ~900 m
  const { clusters } = buildClusters(chain);
  assert.ok(clusters.length >= 3, `6 점 사슬(4.5 km)은 3개 이상 권역: ${clusters.length}`);
  for (const c of clusters) for (const m of c.members) assert.ok(haversineDistance(c.leader, chain.find(p => p.key === m)!.coordinate) <= CLUSTER_RADIUS_M, "멤버는 항상 리더 반경 안");
});

// ── 6. 엔진 결정성 · 식사 tiering · 보호 계약 ─────────────────────────────────
const input: SchedulerInput = {
  trip_date: "2026-09-10", start_time: "09:00", end_time: "21:00", base_coordinate: A, pace: "normal",
  candidates: [
    ...Array.from({ length: 9 }, (_, i) => cand(`a${i}`, near(A, i), 120 - i)),
    cand("afood1", near(A, 1), 100, "food"), cand("afood2", near(A, 4), 95, "food"), cand("afood3", near(A, 7), 90, "food"),
    cand("b1", near(B, 0), 205), cand("b2", near(B, 1), 200), cand("b3", near(B, 2), 198), cand("bfood", near(B, 4), 150, "food"),
  ] as never,
};

test("★같은 후보 집합이면 입력 순서와 무관하게 같은 일정이다 (20회 shuffle)", () => {
  const seq = (r: SchedulerResult) => r.success ? r.data.items.filter(it => it.item_type !== "affiliate").map(it => `${it.place_id ?? it.event_id}@${it.start_time}`).join(">") : "fail";
  const base = seq(runScheduler(input));
  for (let k = 1; k <= 20; k++) assert.equal(seq(runScheduler({ ...input, candidates: shuffled(input.candidates as never[], k) as never })), base, `shuffle ${k}`);
  assert.match(read("./engine.ts"), /b\.adjusted_score - a\.adjusted_score \|\| a\.place_id\.localeCompare\(b\.place_id\)/, "동점 tie-break = place_id");
});

test("★자동 저녁은 오후 권역(직전 권역)에서 고른다 — 아침에 떠난 권역으로 되돌아가지 않는다 (재진입 0)", () => {
  const r = runScheduler(input);
  assert.ok(r.success);
  const q = r.data.quality!;
  assert.equal(q.clusterReentries, 0, JSON.stringify(q));
  assert.equal(q.unjustifiedBacktracks, 0, JSON.stringify(q));
  assert.equal(q.localZigzags, 0, JSON.stringify(q));
  assert.ok(Array.isArray(q.reasonCodes));
  assert.ok(MEAL_DEFER_FILL_FIRST_MINUTES >= 45);
});

test("★보호 stop 계약 — repair 는 픽·고정·anchor 가 하나라도 빠지거나 시각이 바뀌면 채택되지 않는다", () => {
  const withPick: SchedulerInput = { ...input, candidates: [...input.candidates, cand("pick", near(B, 5), 999)] as never, fixed_events: [{ event_id: "show", start_time: "14:00", end_time: "15:00", coordinate: B, zone_id: 1 }] as never };
  const first = runScheduler(withPick);
  assert.ok(first.success);
  const sigFirst = protectedSignature(first, withPick);
  assert.ok(sigFirst.some(s => s.startsWith("pick@")) && sigFirst.some(s => s.startsWith("show@14:00")), JSON.stringify(sigFirst));
  // 픽을 지운 "더 짧은" 결과 → 거부
  const dropped: SchedulerResult = { ...first, data: { ...first.data, items: first.data.items.filter(it => it.place_id !== "pick"), quality: { ...first.data.quality!, totalMinutes: 0, unjustifiedBacktracks: 0, localZigzags: 0, clusterReentries: 0 } } };
  assert.equal(repairAcceptable(first, dropped, withPick).accept, false);
  // 고정 시각을 옮긴 결과 → 거부
  const moved: SchedulerResult = { ...first, data: { ...first.data, items: first.data.items.map(it => it.event_id === "show" ? { ...it, start_time: "16:00", end_time: "17:00" } : it), quality: { ...first.data.quality!, totalMinutes: 0, unjustifiedBacktracks: 0, localZigzags: 0, clusterReentries: 0 } } };
  assert.equal(repairAcceptable(first, moved, withPick).accept, false);
  // 보호 stop 은 그대로인데 결함이 늘거나 이동이 5% 넘게 나빠지면 → 거부; 결함이 줄면 → 채택
  const worse: SchedulerResult = { ...first, data: { ...first.data, quality: { ...first.data.quality!, unjustifiedBacktracks: first.data.quality!.unjustifiedBacktracks + 1 } } };
  assert.equal(repairAcceptable(first, worse, withPick).accept, false);
  const q1 = { ...first.data.quality!, unjustifiedBacktracks: 2, clusterReentries: 1, localZigzags: 0, totalMinutes: 100 };
  const q2 = { ...q1, unjustifiedBacktracks: 0, clusterReentries: 0, totalMinutes: 104 };
  const f1: SchedulerResult = { ...first, data: { ...first.data, quality: q1 } }, f2: SchedulerResult = { ...first, data: { ...first.data, quality: q2 } };
  const v = repairAcceptable(f1, f2, withPick);
  assert.equal(v.accept, true); assert.ok(v.codes.includes("REENTRY_REPAIRED") && v.codes.includes("BACKTRACK_REPAIRED"));
  assert.equal(repairAcceptable(f1, { ...f2, data: { ...f2.data, quality: { ...q2, totalMinutes: 120 } } }, withPick).accept, false, "이동 +20% 는 채택 안 함");
  // 엔진 소스: placed >= n-1 만으로 채택하지 않는다
  assert.match(read("./engine.ts"), /const verdict = repairAcceptable\(first, second, input\);/);
});

// ── 7. explainability · 노출 금지 · 로그 ───────────────────────────────────────
test("★reason code 는 내부 전용 — page.tsx 는 렌더하지 않고 plan.ts 는 로그에만 남긴다 (source guard)", () => {
  const page = read("../../app/itinerary/page.tsx");
  assert.ok(!/reasonCodes|localZigzags|clusterCoherence|scheduleConfidence/.test(page));
  const plan = read("../../../functions/api/trip/plan.ts");
  assert.match(plan, /zigzag: _q\.localZigzags, repaired: _q\.repaired, codes: _q\.reasonCodes/);
  const rq = read("./route-quality.ts");
  for (const code of ["SAME_CLUSTER", "ADJACENT_CLUSTER", "NEXT_ANCHOR_DIRECTION", "USER_SELECTED", "USER_FIXED", "LOCAL_MEAL", "NO_LOCAL_FEASIBLE_MEAL", "MEAL_SUPPLY_GAP", "AUTO_MEAL_BACKTRACK"]) assert.ok(rq.includes(code), code);
  const eng = read("./engine.ts");
  for (const code of ["REENTRY_REPAIRED", "LOCAL_ZIGZAG_REPAIRED", "BACKTRACK_REPAIRED"]) assert.ok(eng.includes(code), code);
  assert.ok(!/fetch\(|openai|gemini|anthropic/i.test(rq), "LLM 호출 없음");
});

// ── 8. 주 권역 점수 질량 동률 — 입력 순서와 무관하게 같은 일정 (release closure: 실측 부산 Day 6 c2 = c5) ──
test("★primary cluster 질량이 동률이어도 후보 순서에 따라 일정이 바뀌지 않는다 (20회 shuffle)", () => {
  const C1 = at(35.1600, 129.1600), C2 = at(35.1600, 129.1350);   // 두 권역, 각각 같은 점수 합
  const tie: SchedulerInput = {
    trip_date: "2026-09-10", start_time: "09:00", end_time: "21:00", base_coordinate: at(35.1600, 129.1475), pace: "normal",
    candidates: [
      ...Array.from({ length: 6 }, (_, i) => cand(`p${i}`, near(C1, i), 100)), cand("pfood", near(C1, 7), 100, "food"),
      ...Array.from({ length: 6 }, (_, i) => cand(`q${i}`, near(C2, i), 100)), cand("qfood", near(C2, 7), 100, "food"),
    ] as never,
  };
  const seq = (r: SchedulerResult) => r.success ? r.data.items.filter(it => it.item_type !== "affiliate").map(it => `${it.place_id}@${it.start_time}`).join(">") : "fail";
  const base = seq(runScheduler(tie));
  for (let k = 1; k <= 20; k++) assert.equal(seq(runScheduler({ ...tie, candidates: shuffled(tie.candidates as never[], 100 + k) as never })), base, `shuffle ${k}`);
  assert.match(read("./engine.ts"), /mass === primaryMass && primaryCluster !== undefined && cid < primaryCluster/);
});

// ── 9. 권역 경계의 짧은 이동은 재진입이 아니다 (release closure: 실측 광안리 50 m 경계 hop) ──
test("★권역 경계를 800 m 미만 leg 로 넘나드는 것은 재진입/전환으로 세지 않는다; 800 m 이상이면 그대로 센다", () => {
  const s = (key: string, coordinate: { lat: number; lng: number }, clusterId: number): AuditStop => ({ key, coordinate, pinned: false, clusterId });
  const P = at(35.1642, 129.1182), Q = at(35.1638, 129.1181), R = at(35.1579, 129.1138);        // P→Q 50 m (다른 권역 id), Q→R 760 m (P 의 권역으로 복귀)
  const hop = auditDayRoute([s("p", P, 3), s("q", Q, 2), s("r", R, 3), s("t", at(35.1555, 129.1173), 3)]);
  assert.equal(hop.clusterReentries, 0, JSON.stringify(hop.backtracks)); assert.equal(hop.clusterSwitches, 0);
  const real = auditDayRoute([s("a", A, 0), s("b", B, 1), s("c", near(A, 1), 0)]);                 // 3.2 km 왕복
  assert.equal(real.clusterReentries, 1); assert.equal(real.clusterSwitches, 2);
});

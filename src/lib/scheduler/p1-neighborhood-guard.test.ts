// TASK-SCHEDULER-V2-P1-NEIGHBORHOOD-ROUTE-QUALITY-V1 — engine-level + source guards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScheduler, CLUSTER_WEIGHTS_DEFAULT, CLUSTER_WEIGHTS_STRICT } from "./engine.ts";
import type { SchedulerInput } from "./types.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const at = (lat: number, lng: number) => ({ lat, lng });
// 두 권역: A(해운대 중심 근방) 와 B(3.2 km 서쪽). B 에 고점수 후보 몇 개, A 에 중간 점수 다수.
const A = at(35.1600, 129.1600), B = at(35.1600, 129.1250);
const near = (base: { lat: number; lng: number }, i: number) => at(base.lat + (i % 3) * 0.0015, base.lng + Math.floor(i / 3) * 0.0015);
const cand = (id: string, c: { lat: number; lng: number }, score: number, category = "attraction") => ({ place_id: id, category, coordinate: c, zone_id: 1 as const, score });
const input: SchedulerInput = {
  trip_date: "2026-09-10", start_time: "09:00", end_time: "21:00", base_coordinate: A, pace: "normal",
  candidates: [
    ...Array.from({ length: 9 }, (_, i) => cand(`a${i}`, near(A, i), 120 - i)),
    cand("afood1", near(A, 1), 100, "food"), cand("afood2", near(A, 4), 95, "food"),
    cand("b1", near(B, 0), 205), cand("b2", near(B, 1), 200), cand("bfood", near(B, 2), 210, "food"),
  ] as never,
};

test("★권역 일관성 — 고점수 원거리 후보가 하루를 A→B→A 로 찢지 않는다 (unjustified backtrack/재진입 0)", () => {
  const r = runScheduler(input);
  assert.ok(r.success);
  const q = r.data.quality!;
  assert.ok(q, "quality 블록이 있다");
  assert.equal(q.clusterReentries, 0, JSON.stringify(q));
  assert.equal(q.unjustifiedBacktracks, 0, JSON.stringify(q));
  assert.ok(["GOOD", "REVIEW"].includes(q.status));
  assert.ok(r.data.items.filter(it => it.item_type === "place").length >= 5, "장소를 충분히 놓는다");
});

test("★고정 일정 때문에 권역을 넘는 왕복은 JUSTIFIED 로 분류된다", () => {
  const withFixed: SchedulerInput = { ...input, fixed_events: [{ event_id: "show", start_time: "14:00", end_time: "15:00", coordinate: B, zone_id: 1 }] as never };
  const r = runScheduler(withFixed);
  assert.ok(r.success);
  const q = r.data.quality!;
  const show = r.data.items.find(it => it.event_id === "show");
  assert.ok(show && show.start_time === "14:00" && show.is_fixed, "고정 일정은 그대로");
  assert.equal(q.hardConstraintFeasibility, 100);
  // B 로 갔다 오는 것은 고정 때문 → unjustified 로 세지 않는다 (justified 만 허용)
  assert.equal(q.unjustifiedBacktracks, 0, JSON.stringify(q));
});

test("★This Trip 픽(999)은 권역 가중치와 무관하게 놓이고 사라지지 않는다", () => {
  const withPick: SchedulerInput = { ...input, candidates: [...input.candidates, cand("pick", near(B, 5), 999)] as never };
  const r = runScheduler(withPick);
  assert.ok(r.success);
  assert.ok(r.data.items.some(it => it.place_id === "pick"), "픽이 조용히 빠지지 않는다");
});

test("★confidence 는 내부 필드다 — 사용자 화면 문자열로 노출하지 않는다 (source guard)", () => {
  const page = read("../../app/itinerary/page.tsx");
  assert.ok(!/scheduleConfidence|routeQuality|backtrackingQuality/.test(page), "page.tsx 가 confidence 를 렌더한다");
  const plan = read("../../../functions/api/trip/plan.ts");
  assert.match(plan, /\[plan-timing\][\s\S]*quality:/, "품질 요약은 로그로만 남긴다");
  assert.match(plan, /const DEFAULT_LIMIT = 60;/);
  assert.match(plan, /buildNearMeCandidates\(rawRows as any, \{/);
});

test("★가중치 상수는 도시 이름 없이 좌표 규칙만 쓴다 (source guard)", () => {
  const eng = read("./engine.ts"); const rq = read("./route-quality.ts"); const sup = read("../near-me/candidate-supply.ts");
  // 주석은 실측 사례를 적어도 된다 — 코드에 도시/동네 이름이 없어야 한다
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const src of [eng, rq, sup]) assert.ok(!/해운대|Haeundae|센텀|Centum|청사포|광안리|Busan|Seoul|Jeju/.test(codeOnly(src)), "권역 코드에 도시/동네 이름이 있다");
  assert.ok(CLUSTER_WEIGHTS_STRICT.reentry > CLUSTER_WEIGHTS_DEFAULT.reentry);
  assert.match(rq, /export const CLUSTER_RADIUS_M\s*=\s*1_000;/);
  assert.match(rq, /export const ADJACENT_RADIUS_M = 2 \* CLUSTER_RADIUS_M;/);
  assert.match(eng, /const localMeals = scored\.filter\(/, "meal-aware 선택");
  assert.match(eng, /const second = scheduleOnce\(input, CLUSTER_WEIGHTS_STRICT\);/, "repair 는 정확히 1회");
  assert.ok(!/while \(.*quality/.test(eng), "품질 재시도 루프가 없다");
});

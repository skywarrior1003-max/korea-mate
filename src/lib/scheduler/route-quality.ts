// GoKoreaMate — Scheduler V2 P1: neighborhood clusters · backtracking detector · route-quality metrics · minimal confidence
// (TASK-SCHEDULER-V2-P1-NEIGHBORHOOD-ROUTE-QUALITY-V1; closure semantics TASK-SCHEDULER-V2-P1-ROUTE-QUALITY-CLOSURE-V2).
// Pure functions — no I/O, no city names, no LLM.
//
// 권역(cluster) 은 도시 이름이나 동네 목록을 모른다. 좌표만으로 만든다:
//   leader clustering — 점수순으로 훑으며 반경 CLUSTER_RADIUS_M 안의 기존 리더에 붙이고, 없으면 새 리더가 된다.
//   반경 1,000 m 는 TRAVEL_TIME_TABLE 의 "≤1 km = 15분(short ride)" 경계와 같다 — 한 권역 안은 걷거나 한 정거장이다.
//   도시마다 다르게 튜닝하지 않는다. 5도시 모두 같은 규칙이다.
//   입력 순서 독립: 점수 내림차순 + key 사전순 타이브레이크로 정렬한 뒤 훑으므로 같은 집합이면 같은 권역이다.
//   과결합 없음: 멤버는 항상 자기 리더의 반경 안(권역 지름 ≤ 2×반경) — 연쇄 연결(chain bridging)로 커지지 않는다.
// 인접 권역 = 리더 사이 거리 ≤ ADJACENT_RADIUS_M (= 2×반경 = 2 km). pairwise 관계이며 추이적으로 넓히지 않는다.
//
// backtracking 판정(P1 detector, closure V2 의미):
//   · 방향 반전: 연속 두 leg 가 모두 MIN_LEG_M 이상이고 방향 코사인 < −0.5
//   · 권역 재진입: 이미 떠난 권역으로 다시 들어옴
//   JUSTIFIED 는 **pinned stop(고정 · This Trip 사용자 선택 · anchor/도착·출발 목적지)** 이 그 이동의 끝점일 때만이다.
//   자동 식당(AUTO_MEAL)은 식사 창에 놓였다는 이유로 JUSTIFIED 가 되지 않는다. 자동 식당이 끝점이면
//   AUTO_MEAL_BACKTRACK 이고, 호출자가 "전체 dataset 에도 인근 feasible 식당이 없었다"(NO_LOCAL_FEASIBLE_MEAL) 를
//   증명해 넘길 때만 JUSTIFIED 다. 공급에서만 빠진 경우(MEAL_SUPPLY_GAP) 는 스케줄러 공급 결함 = UNJUSTIFIED.
//   단순히 방향이 반대라는 이유로 실패시키지 않는다 — 두 leg 모두 의미 있는 거리일 때만 센다.
//
// local zigzag(closure V2 §6): 800 m 미만 leg 로 이어지는 권역 안 A→B→A 를 놓치지 않기 위해, 4–5 stop 창(window) 안에서
//   "현재 순서 미터" 와 "보호 핀은 그대로 두고 창 내부만 바꾼 feasible 순서 미터" 를 비교한다. 절감이 창 미터의
//   LOCAL_ZIGZAG_MIN_RATIO 이상이고 LOCAL_ZIGZAG_MIN_SAVING_M 이상일 때만 zigzag 다 — 골목 도보의 작은 방향 변화는
//   절감이 작아 걸리지 않는다. threshold 를 낮추는 방식이 아니다.
//
// better feasible order: 핀(고정·사용자·anchor·구간 양끝)만 고정하고 나머지를 재정렬한 최선 순서. 자동 식당은 **자기 식사 창
//   안에서만** 움직일 수 있다(시각을 앞에서부터 다시 계산해 창 밖이면 그 순서는 infeasible).
//
// confidence 는 설명 가능한 규칙 점수다(0–100). 사용자 화면에 노출하지 않는다(내부 QA/로그/게이트).

import type { Coordinate } from "./types.ts";
import { haversineDistance } from "./utils.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";

export const CLUSTER_RADIUS_M  = 1_000;
export const ADJACENT_RADIUS_M = 2 * CLUSTER_RADIUS_M; // 리더가 클러스터 반경의 2배 안이면 맞닿은 권역(2 km) — 3 km(20분 ride)는 이미 "다른 동네"다
export const MIN_LEG_M         = 800;
export const BETTER_ORDER_REVIEW_RATIO = 0.20;
/** local zigzag: 창 내부 재정렬로 창 미터의 30% 이상 **그리고** 400 m(≈5분 도보) 이상 줄 때만 의미 있는 지그재그다 */
export const LOCAL_ZIGZAG_MIN_RATIO    = 0.30;
export const LOCAL_ZIGZAG_MIN_SAVING_M = 400;
export const LOCAL_ZIGZAG_WINDOW       = 4;   // A,B,C,D — 내부 B,C 재정렬 (창 5 = 내부 3 도 본다)
export const BRUTE_FORCE_MAX           = 7;

export interface ClusterPoint { key: string; coordinate: Coordinate; score?: number }
export interface Cluster { id: number; leader: Coordinate; members: string[] }

/** 좌표만으로 권역을 만든다(점수 높은 순으로 리더 선정). 결정적이며 O(n·k). 입력 순서에 독립이다(정렬 타이브레이크 = key). */
export function buildClusters(points: ReadonlyArray<ClusterPoint>, radiusM: number = CLUSTER_RADIUS_M): { clusters: Cluster[]; clusterOf: Map<string, number> } {
  const sorted = [...points].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.key.localeCompare(b.key));
  const clusters: Cluster[] = []; const clusterOf = new Map<string, number>();
  for (const p of sorted) {
    if (!Number.isFinite(p.coordinate.lat) || !Number.isFinite(p.coordinate.lng)) continue;
    let best: Cluster | null = null, bd = Infinity;
    for (const c of clusters) { const d = haversineDistance(c.leader, p.coordinate); if (d <= radiusM && d < bd) { best = c; bd = d; } }
    if (!best) { best = { id: clusters.length, leader: p.coordinate, members: [] }; clusters.push(best); }
    best.members.push(p.key); clusterOf.set(p.key, best.id);
  }
  return { clusters, clusterOf };
}

export function clustersAdjacent(a: Cluster, b: Cluster, radiusM: number = ADJACENT_RADIUS_M): boolean {
  return a.id === b.id || haversineDistance(a.leader, b.leader) <= radiusM;
}

// ── Day sequence audit ──────────────────────────────────────────────────────

/** 핀의 종류 — 왜 이 stop 을 옮길 수 없는가 */
export type PinKind = "USER_FIXED" | "USER_SELECTED" | "ANCHOR";
/**
 * 자동 식당의 locality 판정 — 호출자가 채운다. 엔진은 공급(supply) 기준까지만 알 수 있고(LOCAL_MEAL / AUTO_MEAL_SELECTION /
 * NO_LOCAL_IN_SUPPLY), dataset 전체 기준(MEAL_SUPPLY_GAP vs NO_LOCAL_FEASIBLE_MEAL)은 QA harness 가 증명한다.
 */
export type MealLocality = "LOCAL_MEAL" | "AUTO_MEAL_SELECTION" | "NO_LOCAL_IN_SUPPLY" | "MEAL_SUPPLY_GAP" | "NO_LOCAL_FEASIBLE_MEAL";

export interface AuditStop {
  key: string;
  coordinate: Coordinate;
  /** 고정·사용자 픽·도착/출발 목적지·숙소 등 스케줄러가 옮길 수 없는 항목 */
  pinned: boolean;
  pinKind?: PinKind;
  /** 식사 창에 놓인 식당. pinned 가 아니면 AUTO_MEAL 이다 */
  meal?: boolean;
  mealLocality?: MealLocality;
  /** 자동 식당이 움직일 수 있는 식사 창 [start, end) — 분. 없으면 자동 식당은 재정렬에서 고정으로 본다 */
  mealWindow?: [number, number];
  startMinutes?: number;
  stayMinutes?: number;
  clusterId?: number;
  /** 주소 수준(street) 좌표 등 불확실한 좌표 — GOOD 판정을 막는다 */
  coordinateUncertain?: boolean;
}

export type BacktrackReason = PinKind | "NO_LOCAL_FEASIBLE_MEAL" | "AUTO_MEAL_BACKTRACK" | "MEAL_SUPPLY_GAP" | "UNJUSTIFIED_ROUTE";
export interface Backtrack { at: number; kind: "reversal" | "cluster_reentry"; justified: boolean; reason: BacktrackReason; from: string; to: string }
export interface LocalZigzag { at: number; keys: string[]; currentMeters: number; bestMeters: number; savingRatio: number }
export type LegReason = "SAME_CLUSTER" | "ADJACENT_CLUSTER" | "CLUSTER_SWITCH" | "CLUSTER_REENTRY" | "NEXT_ANCHOR_DIRECTION" | "UNKNOWN_CLUSTER";
export interface LegExplanation { from: string; to: string; meters: number; minutes: number; reason: LegReason }

export interface DayRouteMetrics {
  stops: number;
  totalMeters: number;
  totalMinutes: number;
  longestLegMeters: number;
  distinctClusters: number;
  clusterSwitches: number;
  clusterReentries: number;
  backtracks: Backtrack[];
  unjustifiedBacktracks: number;
  justifiedBacktracks: number;
  /** 800 m 미만 leg 의 권역 내 지그재그(창 재정렬 비교) — backtracks 와 별도로 센다 */
  localZigzags: LocalZigzag[];
  /** 핀만 고정하고(자동 식당은 식사 창 안에서 이동 가능) 나머지를 재정렬한 최선 순서의 분 — 스케줄러 비용함수 기준 */
  bestFeasibleMinutes: number;
  betterOrderRatio: number;
  /** 이동마다 "왜 이 순서가 허용됐는가" — explainability (LLM 없음) */
  legs: LegExplanation[];
  /** 자동 식당 locality 코드 모음 */
  mealCodes: MealLocality[];
}

function bearingVec(a: Coordinate, b: Coordinate): [number, number] {
  return [b.lat - a.lat, (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)];
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((x, i) => { for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]); });
  return out;
}

export const isAutoMeal = (s: AuditStop): boolean => Boolean(s.meal) && !s.pinned;

type Unit = "minutes" | "meters";
const legCost = (a: Coordinate, b: Coordinate, unit: Unit) => unit === "minutes" ? estimateTravelMinutes(a, b) : haversineDistance(a, b);

/**
 * 구간 [A, ord..., B] 를 시각과 함께 시뮬레이션한다. 자동 식당이 자기 식사 창 밖에 놓이거나(창 시작 전이면 기다린다)
 * 다음 핀 B 의 시작 시각을 넘기면 infeasible(Infinity). 시각 정보가 없으면 거리만 본다.
 */
function simulate(A: AuditStop, ord: ReadonlyArray<AuditStop>, B: AuditStop | null, unit: Unit): number {
  let cost = 0, prev = A.coordinate;
  let t = A.startMinutes !== undefined ? A.startMinutes + (A.stayMinutes ?? 0) : undefined;
  for (const p of ord) {
    const travel = estimateTravelMinutes(prev, p.coordinate);
    cost += legCost(prev, p.coordinate, unit);
    if (t !== undefined) {
      let start = t + travel;
      if (isAutoMeal(p) && p.mealWindow) { if (start < p.mealWindow[0]) start = p.mealWindow[0]; if (start >= p.mealWindow[1]) return Infinity; }
      t = start + (p.stayMinutes ?? 0);
    }
    prev = p.coordinate;
  }
  if (B) {
    const travel = estimateTravelMinutes(prev, B.coordinate);
    cost += legCost(prev, B.coordinate, unit);
    if (t !== undefined && B.startMinutes !== undefined && t + travel > B.startMinutes + 1) return Infinity;
  }
  return cost;
}
function simulateLoose(A: AuditStop, ord: ReadonlyArray<AuditStop>, B: AuditStop | null, unit: Unit): number {
  let cost = 0, prev = A.coordinate;
  for (const p of ord) { cost += legCost(prev, p.coordinate, unit); prev = p.coordinate; }
  if (B) cost += legCost(prev, B.coordinate, unit);
  return cost;
}

/** 내부 순서를 바꾼 최선 비용(전수 ≤ BRUTE_FORCE_MAX, 그 위는 2-opt). 현재 순서가 infeasible 로 계산되면 현재 비용은 거리만으로 잰다. */
function bestInterior(A: AuditStop, seg: AuditStop[], B: AuditStop | null, unit: Unit): { current: number; best: number } {
  const sim = simulate(A, seg, B, unit);
  const current = Number.isFinite(sim) ? sim : simulateLoose(A, seg, B, unit);
  if (seg.length < 2) return { current, best: current };
  let best = current;
  if (seg.length <= BRUTE_FORCE_MAX) {
    for (const ord of permutations(seg)) { const c = simulate(A, ord, B, unit); if (c < best) best = c; }
    return { current, best };
  }
  let order = seg, improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) for (let k = i + 1; k < order.length; k++) {
      const cand = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
      const c = simulate(A, cand, B, unit);
      if (c < best) { best = c; order = cand; improved = true; }
    }
  }
  return { current, best };
}

function justify(a: AuditStop, b: AuditStop): { justified: boolean; reason: BacktrackReason } {
  const pin = a.pinned ? a : b.pinned ? b : null;
  if (pin) return { justified: true, reason: pin.pinKind ?? "ANCHOR" };
  const meal = isAutoMeal(a) ? a : isAutoMeal(b) ? b : null;
  if (meal) {
    if (meal.mealLocality === "NO_LOCAL_FEASIBLE_MEAL") return { justified: true, reason: "NO_LOCAL_FEASIBLE_MEAL" };
    if (meal.mealLocality === "MEAL_SUPPLY_GAP") return { justified: false, reason: "MEAL_SUPPLY_GAP" };
    return { justified: false, reason: "AUTO_MEAL_BACKTRACK" };
  }
  return { justified: false, reason: "UNJUSTIFIED_ROUTE" };
}

export function auditDayRoute(stops: ReadonlyArray<AuditStop>, clusters?: Cluster[]): DayRouteMetrics {
  const pts = stops.filter(s => Number.isFinite(s.coordinate.lat) && Number.isFinite(s.coordinate.lng));
  const legsM: number[] = [], legsMin: number[] = [];
  for (let i = 1; i < pts.length; i++) { legsM.push(haversineDistance(pts[i - 1]!.coordinate, pts[i]!.coordinate)); legsMin.push(estimateTravelMinutes(pts[i - 1]!.coordinate, pts[i]!.coordinate)); }
  const totalMeters = legsM.reduce((a, b) => a + b, 0), totalMinutes = legsMin.reduce((a, b) => a + b, 0);
  const backtracks: Backtrack[] = [];
  // 방향 반전
  for (let i = 1; i < pts.length - 1; i++) {
    if (legsM[i - 1]! < MIN_LEG_M || legsM[i]! < MIN_LEG_M) continue;
    const v1 = bearingVec(pts[i - 1]!.coordinate, pts[i]!.coordinate), v2 = bearingVec(pts[i]!.coordinate, pts[i + 1]!.coordinate);
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2); if (!n1 || !n2) continue;
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
    if (cos < -0.5) backtracks.push({ at: i, kind: "reversal", ...justify(pts[i]!, pts[i + 1]!), from: pts[i]!.key, to: pts[i + 1]!.key });
  }
  // 권역 전환 · 재진입 · leg explainability
  let clusterSwitches = 0, clusterReentries = 0;
  const seen: number[] = []; const legs: LegExplanation[] = [];
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i]!.clusterId;
    if (i > 0) {
      const p = pts[i - 1]!, q = pts[i]!; const pc = p.clusterId;
      let reason: LegReason = "UNKNOWN_CLUSTER";
      if (c !== undefined && pc !== undefined) {
        if (pc === c) reason = "SAME_CLUSTER";
        else if (seen.includes(c)) reason = "CLUSTER_REENTRY";
        else if (clusters && clusters[pc] && clusters[c] && clustersAdjacent(clusters[pc]!, clusters[c]!)) reason = "ADJACENT_CLUSTER";
        else reason = "CLUSTER_SWITCH";
      }
      if (q.pinned && reason !== "SAME_CLUSTER") reason = "NEXT_ANCHOR_DIRECTION";
      legs.push({ from: p.key, to: q.key, meters: Math.round(legsM[i - 1]!), minutes: legsMin[i - 1]!, reason });
    }
    if (c === undefined) continue;
    const last = seen.length ? seen[seen.length - 1]! : undefined;
    if (last === undefined || last !== c) {
      if (last !== undefined) clusterSwitches++;
      if (seen.includes(c)) { clusterReentries++; backtracks.push({ at: i - 1, kind: "cluster_reentry", ...justify(pts[Math.max(0, i - 1)]!, pts[i]!), from: pts[Math.max(0, i - 1)]!.key, to: pts[i]!.key }); }
      seen.push(c);
    }
  }
  const distinctClusters = new Set(pts.map(p => p.clusterId).filter(c => c !== undefined)).size;
  // 최선 feasible 순서 (핀·구간 양끝 고정, 자동 식당은 식사 창 안에서만 이동)
  let bestFeasibleMinutes = 0, i = 0;
  const isPin = (s: AuditStop, idx: number) => s.pinned || idx === 0 || idx === pts.length - 1;
  while (i < pts.length - 1) {
    let j = i + 1; while (j < pts.length && !isPin(pts[j]!, j)) j++;
    const seg = pts.slice(i + 1, j); const A = pts[i]!, B = j < pts.length ? pts[j]! : null;
    bestFeasibleMinutes += bestInterior(A, seg, B, "minutes").best; i = j;
  }
  const betterOrderRatio = totalMinutes > 0 ? Math.max(0, (totalMinutes - bestFeasibleMinutes) / totalMinutes) : 0;
  // local zigzag — 4–5 stop 창, 내부만 재정렬(핀은 창 내부에 두지 않는다), 한 stop 은 한 창에만 센다
  const localZigzags: LocalZigzag[] = []; const usedInterior = new Set<number>();
  for (const W of [LOCAL_ZIGZAG_WINDOW, LOCAL_ZIGZAG_WINDOW + 1]) {
    for (let a = 0; a + W - 1 < pts.length; a++) {
      const interiorIdx = Array.from({ length: W - 2 }, (_, k) => a + 1 + k);
      if (interiorIdx.some(k => pts[k]!.pinned || usedInterior.has(k))) continue;
      const A = pts[a]!, B = pts[a + W - 1]!, seg = interiorIdx.map(k => pts[k]!);
      const { current, best } = bestInterior(A, seg, B, "meters");
      if (current <= 0) continue;
      const saving = current - best;
      if (saving >= LOCAL_ZIGZAG_MIN_SAVING_M && saving / current >= LOCAL_ZIGZAG_MIN_RATIO) {
        localZigzags.push({ at: a, keys: [A.key, ...seg.map(s => s.key), B.key], currentMeters: Math.round(current), bestMeters: Math.round(best), savingRatio: Math.round((saving / current) * 1000) / 1000 });
        interiorIdx.forEach(k => usedInterior.add(k));
      }
    }
  }
  const mealCodes = pts.filter(isAutoMeal).map(s => s.mealLocality).filter((m): m is MealLocality => Boolean(m));
  return {
    stops: pts.length, totalMeters: Math.round(totalMeters), totalMinutes, longestLegMeters: Math.round(Math.max(0, ...legsM)),
    distinctClusters, clusterSwitches, clusterReentries, backtracks,
    unjustifiedBacktracks: backtracks.filter(b => !b.justified).length, justifiedBacktracks: backtracks.filter(b => b.justified).length,
    localZigzags, bestFeasibleMinutes, betterOrderRatio: Math.round(betterOrderRatio * 1000) / 1000, legs, mealCodes,
  };
}

// ── Minimal schedule confidence ─────────────────────────────────────────────

export type ConfidenceStatus = "GOOD" | "REVIEW" | "FAIL";
export type ConfidenceReasonCode =
  | "INVALID_COORDINATES" | "HARD_CONSTRAINT_VIOLATION" | "COORDINATE_UNCERTAINTY"
  | "BETTER_ORDER_EXISTS" | "UNJUSTIFIED_BACKTRACK" | "LOCAL_ZIGZAG" | "CLUSTER_REENTRY" | "LOW_CONFIDENCE"
  | "MEAL_SUPPLY_GAP" | "AUTO_MEAL_BACKTRACK" | "NO_LOCAL_FEASIBLE_MEAL";
export interface ScheduleConfidence {
  coordinateQuality: number;
  hardConstraintFeasibility: number;
  routeQuality: number;
  backtrackingQuality: number;
  clusterCoherence: number;
  scheduleConfidence: number;
  status: ConfidenceStatus;
  reasons: string[];
  reasonCodes: ConfidenceReasonCode[];
}

/**
 * 규칙:
 *   hard violation / invalid coordinate                → FAIL
 *   unjustified backtrack ≥1 · local zigzag ≥1 · ≥20% better order · uncertain coordinate → 최소 REVIEW
 *   그 외 정상 route                                   → GOOD
 * 사용자 화면에 노출하지 않는다.
 */
export function computeScheduleConfidence(input: { metrics: DayRouteMetrics; coordinateFailures: number; hardConstraintViolations: number; uncertainCoordinates?: number }): ScheduleConfidence {
  const { metrics, coordinateFailures, hardConstraintViolations } = input; const uncertain = input.uncertainCoordinates ?? 0;
  const reasons: string[] = []; const codes: ConfidenceReasonCode[] = [];
  const coordinateQuality = coordinateFailures > 0 ? 0 : uncertain > 0 ? 70 : 100;
  const hardConstraintFeasibility = hardConstraintViolations > 0 ? 0 : 100;
  // 대안 순서 대비 초과분: 0% → 100, 20%(REVIEW 기준) → 60, ≥50% → 0
  const r = metrics.betterOrderRatio;
  const routeQuality = Math.round(100 * Math.max(0, 1 - Math.min(1, r / 0.5)));
  const unexplainedReentries = metrics.backtracks.filter(b => b.kind === "cluster_reentry" && !b.justified).length;
  const backtrackingQuality = Math.max(0, 100 - 30 * metrics.unjustifiedBacktracks - 20 * metrics.localZigzags.length);
  // 권역 일관성: 설명 안 되는 재진입, 권역 수보다 많은 전환(권역을 들락거림)
  const clusterCoherence = Math.max(0, 100 - 30 * unexplainedReentries - 10 * Math.max(0, metrics.clusterSwitches - Math.max(0, metrics.distinctClusters - 1)));
  let scheduleConfidence: number;
  let status: ConfidenceStatus;
  if (coordinateQuality === 0 || hardConstraintFeasibility === 0) {
    scheduleConfidence = 0; status = "FAIL";
    if (coordinateQuality === 0) { reasons.push(`invalid coordinates: ${coordinateFailures}`); codes.push("INVALID_COORDINATES"); }
    if (hardConstraintFeasibility === 0) { reasons.push(`hard constraint violations: ${hardConstraintViolations}`); codes.push("HARD_CONSTRAINT_VIOLATION"); }
  } else {
    scheduleConfidence = Math.round(0.4 * routeQuality + 0.4 * backtrackingQuality + 0.2 * clusterCoherence);
    if (r >= BETTER_ORDER_REVIEW_RATIO) { reasons.push(`a ≥${Math.round(BETTER_ORDER_REVIEW_RATIO * 100)}% better feasible order exists (${Math.round(r * 100)}%)`); codes.push("BETTER_ORDER_EXISTS"); }
    if (metrics.unjustifiedBacktracks > 0) { reasons.push(`unjustified backtracks: ${metrics.unjustifiedBacktracks} (${metrics.backtracks.filter(b => !b.justified).map(b => b.reason).join(",")})`); codes.push("UNJUSTIFIED_BACKTRACK"); }
    if (unexplainedReentries > 0) codes.push("CLUSTER_REENTRY");
    if (metrics.localZigzags.length > 0) { reasons.push(`local zigzag windows: ${metrics.localZigzags.length}`); codes.push("LOCAL_ZIGZAG"); }
    if (uncertain > 0) { reasons.push(`uncertain coordinates: ${uncertain}`); codes.push("COORDINATE_UNCERTAINTY"); }
    for (const m of metrics.mealCodes) if ((m === "MEAL_SUPPLY_GAP" || m === "NO_LOCAL_FEASIBLE_MEAL") && !codes.includes(m)) codes.push(m);
    if (metrics.backtracks.some(b => b.reason === "AUTO_MEAL_BACKTRACK")) codes.push("AUTO_MEAL_BACKTRACK");
    const defect = r >= BETTER_ORDER_REVIEW_RATIO || metrics.unjustifiedBacktracks >= 1 || metrics.localZigzags.length >= 1 || uncertain > 0;
    if (!defect && scheduleConfidence < 60) codes.push("LOW_CONFIDENCE");
    status = (defect || scheduleConfidence < 60) ? "REVIEW" : "GOOD";
  }
  return { coordinateQuality, hardConstraintFeasibility, routeQuality, backtrackingQuality, clusterCoherence, scheduleConfidence, status, reasons, reasonCodes: codes };
}

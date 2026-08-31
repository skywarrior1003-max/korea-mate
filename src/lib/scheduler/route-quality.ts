// GoKoreaMate — Scheduler V2 P1: neighborhood clusters · backtracking detector · route-quality metrics · minimal confidence
// (TASK-SCHEDULER-V2-P1-NEIGHBORHOOD-ROUTE-QUALITY-V1). Pure functions — no I/O, no city names.
//
// 권역(cluster) 은 도시 이름이나 동네 목록을 모른다. 좌표만으로 만든다:
//   leader clustering — 점수순으로 훑으며 반경 CLUSTER_RADIUS_M 안의 기존 리더에 붙이고, 없으면 새 리더가 된다.
//   반경 1,000 m 는 TRAVEL_TIME_TABLE 의 "≤1 km = 15분(short ride)" 경계와 같다 — 한 권역 안은 걷거나 한 정거장이다.
//   도시마다 다르게 튜닝하지 않는다. 5도시 모두 같은 규칙이다.
// 인접 권역 = 리더 사이 거리 ≤ ADJACENT_RADIUS_M (= 2×반경 = 2 km: 두 권역이 맞닿는 거리. 3 km(20분 ride)는 다른 동네로 본다).
//
// backtracking 판정(P1 정식 detector — P0 QA 휴리스틱을 대체):
//   · 방향 반전: 연속 두 leg 가 모두 MIN_LEG_M 이상이고 방향 코사인 < −0.5
//   · 권역 재진입: 이미 떠난 권역으로 다시 들어옴
//   둘 다 "그 이동의 목적지 또는 출발점이 핀(고정·사용자·도착/출발 목적지)" 이면 JUSTIFIED, 아니면 UNJUSTIFIED.
//   단순히 방향이 반대라는 이유로 실패시키지 않는다 — 두 leg 모두 의미 있는 거리일 때만 센다.
//
// confidence 는 설명 가능한 규칙 점수다(0–100). 정확한 상수는 2026-08-30 부산 10일 실측(P0 감사)에서 나온
// "≥20% 더 나은 feasible 순서 = 품질 문제" 기준을 그대로 쓴다. 사용자 화면에 노출하지 않는다(내부 QA/로그/게이트).

import type { Coordinate } from "./types.ts";
import { haversineDistance } from "./utils.ts";
import { estimateTravelMinutes } from "./travel-time-estimator.ts";

export const CLUSTER_RADIUS_M  = 1_000;
export const ADJACENT_RADIUS_M = 2 * CLUSTER_RADIUS_M; // 리더가 클러스터 반경의 2배 안이면 맞닿은 권역(2 km) — 3 km(20분 ride)는 이미 "다른 동네"다
export const MIN_LEG_M         = 800;
export const BETTER_ORDER_REVIEW_RATIO = 0.20;

export interface ClusterPoint { key: string; coordinate: Coordinate; score?: number }
export interface Cluster { id: number; leader: Coordinate; members: string[] }

/** 좌표만으로 권역을 만든다(점수 높은 순으로 리더 선정). 결정적이며 O(n·k). */
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

export interface AuditStop {
  key: string;
  coordinate: Coordinate;
  /** 고정·사용자 픽·도착/출발 목적지·숙소 등 스케줄러가 옮길 수 없는 항목 */
  pinned: boolean;
  /** 식사 창에 놓인 자동 식당 — 재정렬 시 식사 창 안에서만 움직일 수 있다 */
  meal?: boolean;
  clusterId?: number;
}

export interface Backtrack { at: number; kind: "reversal" | "cluster_reentry"; justified: boolean; from: string; to: string }

export interface DayRouteMetrics {
  stops: number;
  totalMeters: number;
  totalMinutes: number;
  longestLegMeters: number;
  clusterSwitches: number;
  clusterReentries: number;
  backtracks: Backtrack[];
  unjustifiedBacktracks: number;
  justifiedBacktracks: number;
  /** 핀·식당을 그대로 두고 나머지만 재정렬한 최선 순서의 분(≤7 전수) — 스케줄러 비용함수 기준 */
  bestFeasibleMinutes: number;
  betterOrderRatio: number;
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
    if (cos < -0.5) backtracks.push({ at: i, kind: "reversal", justified: Boolean(pts[i]!.pinned || pts[i + 1]!.pinned), from: pts[i]!.key, to: pts[i + 1]!.key });
  }
  // 권역 재진입
  let clusterSwitches = 0, clusterReentries = 0;
  const seen: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i]!.clusterId; if (c === undefined) continue;
    const last = seen.length ? seen[seen.length - 1]! : undefined;
    if (last === undefined || last !== c) {
      if (last !== undefined) clusterSwitches++;
      if (seen.includes(c)) { clusterReentries++; backtracks.push({ at: i - 1, kind: "cluster_reentry", justified: Boolean(pts[i]!.pinned || (i > 0 && pts[i - 1]!.pinned)), from: pts[Math.max(0, i - 1)]!.key, to: pts[i]!.key }); }
      seen.push(c);
    }
  }
  // 최선 feasible 순서 (핀·식당 고정, 구간 ≤7 전수)
  let bestFeasibleMinutes = 0, i = 0;
  const isPin = (s: AuditStop, idx: number) => s.pinned || s.meal || idx === 0 || idx === pts.length - 1;
  while (i < pts.length - 1) {
    let j = i + 1; while (j < pts.length && !isPin(pts[j]!, j)) j++;
    const seg = pts.slice(i + 1, j); const A = pts[i]!, B = j < pts.length ? pts[j]! : null;
    const cost = (ord: AuditStop[]) => { let m = 0, prev = A.coordinate; for (const p of ord) { m += estimateTravelMinutes(prev, p.coordinate); prev = p.coordinate; } if (B) m += estimateTravelMinutes(prev, B.coordinate); return m; };
    let bc = cost(seg);
    if (seg.length >= 2 && seg.length <= 7) for (const ord of permutations(seg)) { const c = cost(ord); if (c < bc) bc = c; }
    bestFeasibleMinutes += bc; i = j;
  }
  const betterOrderRatio = totalMinutes > 0 ? Math.max(0, (totalMinutes - bestFeasibleMinutes) / totalMinutes) : 0;
  void clusters;
  return { stops: pts.length, totalMeters: Math.round(totalMeters), totalMinutes, longestLegMeters: Math.round(Math.max(0, ...legsM)), clusterSwitches, clusterReentries, backtracks, unjustifiedBacktracks: backtracks.filter(b => !b.justified).length, justifiedBacktracks: backtracks.filter(b => b.justified).length, bestFeasibleMinutes, betterOrderRatio: Math.round(betterOrderRatio * 1000) / 1000 };
}

// ── Minimal schedule confidence ─────────────────────────────────────────────

export type ConfidenceStatus = "GOOD" | "REVIEW" | "FAIL";
export interface ScheduleConfidence {
  coordinateQuality: number;
  hardConstraintFeasibility: number;
  routeQuality: number;
  backtrackingQuality: number;
  scheduleConfidence: number;
  status: ConfidenceStatus;
  reasons: string[];
}

export function computeScheduleConfidence(input: { metrics: DayRouteMetrics; coordinateFailures: number; hardConstraintViolations: number }): ScheduleConfidence {
  const { metrics, coordinateFailures, hardConstraintViolations } = input;
  const reasons: string[] = [];
  const coordinateQuality = coordinateFailures > 0 ? 0 : 100;
  const hardConstraintFeasibility = hardConstraintViolations > 0 ? 0 : 100;
  // 대안 순서 대비 초과분: 0% → 100, 20%(REVIEW 기준) → 60, ≥50% → 0
  const r = metrics.betterOrderRatio;
  const routeQuality = Math.round(100 * Math.max(0, 1 - Math.min(1, r / 0.5)));
  const backtrackingQuality = Math.max(0, 100 - 30 * metrics.unjustifiedBacktracks - 15 * Math.max(0, metrics.clusterReentries - metrics.backtracks.filter(b => b.kind === "cluster_reentry" && b.justified).length));
  let scheduleConfidence: number;
  let status: ConfidenceStatus;
  if (coordinateQuality === 0 || hardConstraintFeasibility === 0) {
    scheduleConfidence = 0; status = "FAIL";
    if (coordinateQuality === 0) reasons.push(`invalid coordinates: ${coordinateFailures}`);
    if (hardConstraintFeasibility === 0) reasons.push(`hard constraint violations: ${hardConstraintViolations}`);
  } else {
    scheduleConfidence = Math.round(0.5 * routeQuality + 0.5 * backtrackingQuality);
    if (r >= BETTER_ORDER_REVIEW_RATIO) reasons.push(`a ≥${Math.round(BETTER_ORDER_REVIEW_RATIO * 100)}% better feasible order exists (${Math.round(r * 100)}%)`);
    if (metrics.unjustifiedBacktracks > 0) reasons.push(`unjustified backtracks: ${metrics.unjustifiedBacktracks}`);
    status = (r >= BETTER_ORDER_REVIEW_RATIO || metrics.unjustifiedBacktracks >= 2 || scheduleConfidence < 60) ? "REVIEW" : "GOOD";
  }
  return { coordinateQuality, hardConstraintFeasibility, routeQuality, backtrackingQuality, scheduleConfidence, status, reasons };
}

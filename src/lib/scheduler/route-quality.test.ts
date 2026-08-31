import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClusters, clustersAdjacent, auditDayRoute, computeScheduleConfidence, CLUSTER_RADIUS_M } from "./route-quality.ts";

const H = { lat: 35.1587, lng: 129.1603 }, MIPO = { lat: 35.1580, lng: 129.1717 }, MARINE = { lat: 35.1560, lng: 129.1437 }, CENTUM = { lat: 35.1690, lng: 129.1310 }, CHEONGSAPO = { lat: 35.1585, lng: 129.1905 };

test("★권역은 좌표만으로 만든다 — 1km 리더 반경, 점수순 리더, 결정적", () => {
  const pts = [{ key: "h1", coordinate: H, score: 90 }, { key: "h2", coordinate: { lat: 35.1592, lng: 129.1612 }, score: 50 }, { key: "mipo", coordinate: MIPO, score: 70 }, { key: "centum", coordinate: CENTUM, score: 80 }, { key: "marine", coordinate: MARINE, score: 60 }];
  const { clusters, clusterOf } = buildClusters(pts);
  assert.equal(clusterOf.get("h1"), clusterOf.get("h2"), "200m 떨어진 두 곳은 같은 권역");
  assert.notEqual(clusterOf.get("h1"), clusterOf.get("centum"), "센텀(3km)은 다른 권역");
  assert.notEqual(clusterOf.get("h1"), clusterOf.get("marine"), "마린시티(1.5km)는 다른 권역");
  assert.ok(clusters.length >= 3);
  assert.equal(clustersAdjacent(clusters[clusterOf.get("h1")!]!, clusters[clusterOf.get("marine")!]!), true, "1.5km 리더 거리는 인접");
  assert.ok(CLUSTER_RADIUS_M === 1000);
  const again = buildClusters([...pts].reverse());
  assert.deepEqual([...again.clusterOf.entries()].sort(), [...clusterOf.entries()].sort(), "입력 순서와 무관하게 같은 결과");
});

test("★backtracking detector — 자동 추천끼리의 반전/재진입은 UNJUSTIFIED, 핀이 끼면 JUSTIFIED", () => {
  const { clusterOf } = buildClusters([{ key: "a", coordinate: H }, { key: "b", coordinate: CHEONGSAPO }, { key: "c", coordinate: { lat: 35.1590, lng: 129.1610 } }, { key: "d", coordinate: CENTUM }]);
  const stop = (key: string, coordinate: { lat: number; lng: number }, pinned = false) => ({ key, coordinate, pinned, clusterId: clusterOf.get(key) });
  // 해운대 → 청사포 → 해운대 → 센텀 (모두 자동)
  const m = auditDayRoute([stop("a", H), stop("b", CHEONGSAPO), stop("c", { lat: 35.1590, lng: 129.1610 }), stop("d", CENTUM)]);
  assert.ok(m.unjustifiedBacktracks >= 1, JSON.stringify(m.backtracks));
  assert.equal(m.clusterReentries, 1);
  assert.ok(m.betterOrderRatio > 0, "더 짧은 feasible 순서가 존재");
  // 청사포가 고정(fixed) 이면 그 왕복은 JUSTIFIED
  const j = auditDayRoute([stop("a", H), stop("b", CHEONGSAPO, true), stop("c", { lat: 35.1590, lng: 129.1610 }), stop("d", CENTUM)]);
  assert.equal(j.unjustifiedBacktracks, 0);
  assert.ok(j.justifiedBacktracks >= 1);
});

test("★짧은 이동(800m 미만)의 방향 반전은 세지 않는다", () => {
  const m = auditDayRoute([{ key: "a", coordinate: H, pinned: false }, { key: "b", coordinate: { lat: 35.1592, lng: 129.1620 }, pinned: false }, { key: "c", coordinate: { lat: 35.1585, lng: 129.1600 }, pinned: false }]);
  assert.equal(m.backtracks.length, 0);
});

test("★confidence — 하드 제약/좌표 실패는 FAIL, ≥20% 대안 또는 반복 왕복은 REVIEW, 정상은 GOOD", () => {
  const good = auditDayRoute([{ key: "a", coordinate: H, pinned: true }, { key: "b", coordinate: { lat: 35.1592, lng: 129.1620 }, pinned: false }, { key: "c", coordinate: MIPO, pinned: false }]);
  const c1 = computeScheduleConfidence({ metrics: good, coordinateFailures: 0, hardConstraintViolations: 0 });
  assert.equal(c1.status, "GOOD"); assert.ok(c1.scheduleConfidence >= 60);
  const c2 = computeScheduleConfidence({ metrics: good, coordinateFailures: 1, hardConstraintViolations: 0 });
  assert.equal(c2.status, "FAIL"); assert.equal(c2.scheduleConfidence, 0);
  const bad = auditDayRoute([{ key: "a", coordinate: H, pinned: false }, { key: "b", coordinate: CHEONGSAPO, pinned: false }, { key: "c", coordinate: MARINE, pinned: false }, { key: "d", coordinate: CHEONGSAPO, pinned: false }, { key: "e", coordinate: MARINE, pinned: false }]);
  const c3 = computeScheduleConfidence({ metrics: bad, coordinateFailures: 0, hardConstraintViolations: 0 });
  assert.equal(c3.status, "REVIEW", JSON.stringify(c3));
});

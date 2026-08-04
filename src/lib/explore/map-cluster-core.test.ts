import test from "node:test";
import assert from "node:assert/strict";
import {
  planDisplay, planSpotKeys, displayMode, shouldShowLabels, labelText, escapeHtml,
  metersPerPixel, spotKey, zoomAfterClusterClick, displayWidth,
  CLUSTER_MAX_ZOOM, LABEL_MIN_ZOOM, LABEL_MAX_WIDTH_UNITS, MAX_ZOOM,
} from "./map-cluster-core.ts";

type S = { id: number; lat: number; lng: number; sourceKey?: string; name?: string };

const spot = (id: number, lat: number, lng: number, sourceKey?: string): S =>
  ({ id, lat, lng, sourceKey });

// 부산 도심 근처에 결정론적으로 흩뿌린 표본
function sample(n: number, spreadDeg = 0.09): S[] {
  const out: S[] = [];
  for (let i = 0; i < n; i++) {
    // 무작위 대신 황금비 기반 — 실행마다 같은 좌표가 나온다
    const a = (i * 0.6180339887) % 1;
    const b = (i * 0.7548776662) % 1;
    out.push(spot(i + 1, 35.1587 + (a - 0.5) * spreadDeg, 129.1604 + (b - 0.5) * spreadDeg, `city_spot:${i + 1}`));
  }
  return out;
}

// ── 표시 모드 ────────────────────────────────────────────────────────────────
test("낮은 줌은 cluster, 높은 줌은 individual", () => {
  assert.equal(displayMode(11), "cluster");
  assert.equal(displayMode(13), "cluster");            // 운영 초기 줌
  assert.equal(displayMode(CLUSTER_MAX_ZOOM), "cluster");
  assert.equal(displayMode(CLUSTER_MAX_ZOOM + 1), "individual");
  assert.equal(displayMode(18), "individual");
});

test("이름 pill 은 LABEL_MIN_ZOOM 이상에서만 보인다", () => {
  assert.equal(shouldShowLabels(LABEL_MIN_ZOOM - 1), false);
  assert.equal(shouldShowLabels(LABEL_MIN_ZOOM), true);
  assert.equal(shouldShowLabels(18), true);
});

test("개별 전환 줌과 이름 표시 줌이 어긋나지 않는다", () => {
  // 어긋나면 "마커는 흩어졌는데 이름은 없는" 구간이 생긴다
  assert.equal(LABEL_MIN_ZOOM, CLUSTER_MAX_ZOOM + 1);
});

// ── 누락 0 · 중복 0 ──────────────────────────────────────────────────────────
test("★모든 장소가 cluster 또는 marker 중 하나로 반드시 표현된다", () => {
  const s = sample(94);
  for (let z = 10; z <= 18; z++) {
    const keys = planSpotKeys(planDisplay(s, z));
    assert.equal(keys.length, 94, `zoom ${z} 에서 누락/중복`);
    assert.equal(new Set(keys).size, 94, `zoom ${z} 에서 sourceKey 중복`);
  }
});

test("★cluster count 는 실제 포함 장소 수와 같다", () => {
  const s = sample(94);
  for (let z = 10; z <= CLUSTER_MAX_ZOOM; z++) {
    const p = planDisplay(s, z);
    for (const c of p.clusters) assert.equal(c.count, c.members.length);
    const total = p.clusters.reduce((n, c) => n + c.count, 0) + p.singles.length;
    assert.equal(total, 94, `zoom ${z} 합계 불일치`);
  }
});

test("★count 가 1 인 cluster 는 만들지 않는다", () => {
  const s = sample(94);
  for (let z = 10; z <= CLUSTER_MAX_ZOOM; z++)
    for (const c of planDisplay(s, z).clusters)
      assert.ok(c.count >= 2, `zoom ${z} 에 1개짜리 cluster`);
});

test("★individual 모드에서는 모든 장소가 개별 마커다 — 2~4개로 제한하지 않는다", () => {
  const s = sample(94);
  const p = planDisplay(s, 17);
  assert.equal(p.mode, "individual");
  assert.equal(p.clusters.length, 0);
  assert.equal(p.singles.length, 94);
});

test("줌을 올릴수록 cluster 로 접히는 장소가 줄어든다", () => {
  const s = sample(94);
  const folded = (z: number) => planDisplay(s, z).clusters.reduce((n, c) => n + c.count, 0);
  assert.ok(folded(11) >= folded(13), "11 -> 13");
  assert.ok(folded(13) >= folded(15), "13 -> 15");
  assert.equal(folded(16), 0, "16 에서는 접히지 않는다");
});

test("cluster 와 개별 marker 에 같은 장소가 동시에 들어가지 않는다", () => {
  const p = planDisplay(sample(94), 12);
  const inCluster = new Set(p.clusters.flatMap(c => c.members.map(spotKey)));
  for (const s of p.singles) assert.ok(!inCluster.has(spotKey(s)));
});

// ── 필터 결과 반영 ───────────────────────────────────────────────────────────
test("필터로 줄어든 결과만 계산에 들어간다", () => {
  const all = sample(94);
  const filtered = all.slice(0, 21);
  const p = planDisplay(filtered, 12);
  assert.equal(planSpotKeys(p).length, 21);
  const total = p.clusters.reduce((n, c) => n + c.count, 0) + p.singles.length;
  assert.equal(total, 21);
});

test("빈 결과는 cluster 0 · marker 0", () => {
  for (const z of [11, 13, 17]) {
    const p = planDisplay([] as S[], z);
    assert.equal(p.clusters.length, 0);
    assert.equal(p.singles.length, 0);
  }
});

test("좌표 없는 장소는 지도에 올리지 않는다 — 기존 정책 유지", () => {
  const s: S[] = [spot(1, 35.1, 129.1), { id: 2, lat: 0, lng: 0 }, { id: 3, lat: NaN, lng: 129.2 }];
  assert.equal(planSpotKeys(planDisplay(s, 17)).length, 1);
  assert.equal(planSpotKeys(planDisplay(s, 12)).length, 1);
});

test("sourceKey 가 없으면 id 로 떨어진다 — 기존 선택 키 계약", () => {
  assert.equal(spotKey({ id: 7, lat: 1, lng: 1 }), "7");
  assert.equal(spotKey({ id: 7, lat: 1, lng: 1, sourceKey: "city_spot:7" }), "city_spot:7");
});

test("같은 숫자 id 라도 다른 소스면 따로 센다", () => {
  const s: S[] = [spot(5, 35.10, 129.10, "city_spot:5"), spot(5, 35.11, 129.11, "user_spot:5")];
  const keys = planSpotKeys(planDisplay(s, 12));
  assert.equal(new Set(keys).size, 2);
});

// ── 선택 state ───────────────────────────────────────────────────────────────
test("★선택 장소가 결과에 남아 있으면 어느 줌에서도 표현에서 사라지지 않는다", () => {
  const s = sample(94);
  const target = spotKey(s[42]);
  for (let z = 10; z <= 18; z++)
    assert.ok(planSpotKeys(planDisplay(s, z)).includes(target), `zoom ${z} 에서 선택 장소 소실`);
});

test("선택 장소가 필터에서 빠지면 표현에서도 빠진다", () => {
  const s = sample(94);
  const removed = spotKey(s[42]);
  const keys = planSpotKeys(planDisplay(s.filter((_, i) => i !== 42), 12));
  assert.ok(!keys.includes(removed));
});

// ── 결정론 ───────────────────────────────────────────────────────────────────
test("같은 입력·같은 줌이면 항상 같은 결과 — 지도를 흔들어도 묶음이 안 바뀐다", () => {
  const s = sample(94);
  const a = planDisplay(s, 13);
  const b = planDisplay([...s].reverse(), 13);
  const sum = (p: typeof a) => p.clusters.map(c => `${c.key}=${c.count}`).sort().join("|");
  assert.equal(sum(a), sum(b));
});

// ── label ────────────────────────────────────────────────────────────────────
test("짧은 이름은 그대로", () => {
  assert.equal(labelText("Haeundae Beach"), "Haeundae Beach");
});

test("긴 이름은 1줄 말줄임 — 축약형을 지어내지 않는다", () => {
  const long = "Cheongsapo Daritdol Skywalk Observatory Deck";
  const out = labelText(long);
  assert.ok(displayWidth(out) <= LABEL_MAX_WIDTH_UNITS);
  assert.ok(out.endsWith("…"));
  assert.ok(long.startsWith(out.slice(0, -1).trimEnd()), "원문 접두사를 유지한다");
});

test("label 은 줄바꿈·중복 공백을 접어 1줄을 보장한다", () => {
  assert.equal(labelText("Gamcheon\n  Culture   Village"), "Gamcheon Culture Village");
});

test("★CJK 는 글자당 2폭으로 세어 EN 과 같은 실제 폭에서 잘린다", () => {
  // 짧은 이름은 그대로
  assert.equal(labelText("해운대해수욕장"), "해운대해수욕장");
  // 14자(=28폭)까지는 통과, 15자부터는 잘린다 — 라틴 28자와 같은 폭
  const ko14 = "가".repeat(14);
  assert.equal(labelText(ko14), ko14);
  const ko20 = "가".repeat(20);
  const cut = labelText(ko20);
  assert.ok(cut.endsWith("…"));
  assert.ok(displayWidth(cut) <= LABEL_MAX_WIDTH_UNITS, `폭 ${displayWidth(cut)}`);
  assert.ok(ko20.startsWith(cut.slice(0, -1)), "원문 접두사를 유지한다");
  for (const s of ["海雲台ビーチと周辺のとても長い名前のスポットです",
                   "海云台海水浴场以及周边非常长的地点名称示例"]) {
    const out = labelText(s);
    assert.ok(out.endsWith("…"), s);
    assert.ok(displayWidth(out) <= LABEL_MAX_WIDTH_UNITS, s);
  }
});

test("displayWidth — 전각 2 · 반각 1", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("가나다"), 6);
  assert.equal(displayWidth("a가"), 3);
});

test("빈 이름은 빈 문자열 — 대체 문구를 지어내지 않는다", () => {
  assert.equal(labelText("   "), "");
});

test("장소명은 마커 HTML 에 넣기 전 이스케이프된다", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("Tom & Jerry's"), "Tom &amp; Jerry&#39;s");
});

// ── 축척·줌 동작 ─────────────────────────────────────────────────────────────
test("픽셀당 미터는 줌이 1 오를 때마다 절반", () => {
  const a = metersPerPixel(35.16, 13);
  const b = metersPerPixel(35.16, 14);
  assert.ok(Math.abs(a / b - 2) < 1e-9);
  assert.ok(a > 15 && a < 16, `z13 실측 15.6 m/px 근처여야 한다 (${a})`);
});

test("cluster 클릭 줌은 올라가되 상한을 넘지 않는다", () => {
  assert.ok(zoomAfterClusterClick(12) > 12);
  assert.equal(zoomAfterClusterClick(MAX_ZOOM), MAX_ZOOM);
  assert.equal(zoomAfterClusterClick(MAX_ZOOM - 1), MAX_ZOOM);
});

test("경계 줌에서 모드가 한 번만 바뀐다 — 깜빡임 방지", () => {
  const seq = [14, 15, 16, 17].map(displayMode);
  assert.deepEqual(seq, ["cluster", "cluster", "individual", "individual"]);
});

// ── 대량 표본 smoke ──────────────────────────────────────────────────────────
test("★synthetic 1,500개에서도 누락 0 · 중복 0", () => {
  const s = sample(1500, 0.4);
  for (const z of [10, 12, 13, 15, 16, 18]) {
    const keys = planSpotKeys(planDisplay(s, z));
    assert.equal(keys.length, 1500, `zoom ${z} 누락`);
    assert.equal(new Set(keys).size, 1500, `zoom ${z} 중복`);
  }
});

test("1,500개 계산이 한 줌당 50ms 안에 끝난다", () => {
  const s = sample(1500, 0.4);
  const t0 = performance.now();
  for (const z of [10, 12, 13, 15, 16, 18]) planDisplay(s, z);
  const per = (performance.now() - t0) / 6;
  assert.ok(per < 50, `한 줌당 ${per.toFixed(1)}ms`);
});

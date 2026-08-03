// Explore 지도 마커 선택 테스트
// 실행: node --experimental-strip-types src/lib/explore/map-selection-core.test.ts
//
// Naver SDK 는 마커 클릭을 자체 이벤트 계층에서 처리해 브라우저 자동화가
// 도달하지 못한다(합성 클릭 6종 전부 실패, 운영 실측). 그래서 SDK 의
// Event.addListener 를 흉내 내 등록된 콜백을 잡아 두고, 화면이 쓰는 것과
// 같은 판정 함수를 통과시켜 A→B 갱신·필터 제외를 확인한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectionKey, resolveClickedSpot, resolveSelection, clickTarget,
  type SelectableSpot,
} from "./map-selection-core.ts";

// ── SDK mock ─────────────────────────────────────────────────────────────────
//
// 실제 NaverMap 이 하는 일과 같은 모양: 마커마다 click 리스너를 등록하고,
// 나중에 그 콜백을 실행한다. 테스트 파일 안에만 존재한다.

interface FakeMarker { key: string; spot: Spot }

class FakeNaverEvent {
  private handlers = new Map<FakeMarker, () => void>();
  addListener(marker: FakeMarker, ev: string, fn: () => void) {
    if (ev === "click") this.handlers.set(marker, fn);
  }
  /** 실제 사용자가 마커를 누른 것과 같은 경로 */
  clickMarker(marker: FakeMarker) {
    const fn = this.handlers.get(marker);
    assert.ok(fn, `마커 ${marker.key} 에 click 리스너가 없다`);
    fn!();
  }
  count() { return this.handlers.size; }
}

interface Spot extends SelectableSpot {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  sourceKey?: string;
}

const A: Spot = { id: 24, name: "Haeundae Beach",    lat: 35.158, lng: 129.160, sourceKey: "city_spot:24" };
const B: Spot = { id: 31, name: "Gamcheon Village",  lat: 35.097, lng: 129.010, sourceKey: "city_spot:31" };
// A 와 같은 숫자 id 를 쓰는 다른 소스 — 좌표로 구분되어야 한다
const A2: Spot = { id: 24, name: "Local 24",         lat: 35.200, lng: 129.200, sourceKey: "local_info:busan:24" };

/** 화면(ExploreCity)의 마커 클릭 처리와 같은 순서로 동작하는 테스트용 하네스 */
function mountMap(spots: Spot[], viewMode: "list" | "map") {
  const ev = new FakeNaverEvent();
  const state = { pickedKey: null as string | null, modalSpot: null as Spot | null };
  const markers: FakeMarker[] = spots
    .filter(s => s.lat != null && s.lng != null)
    .map(s => {
      const marker: FakeMarker = { key: selectionKey(s), spot: s };
      ev.addListener(marker, "click", () => {
        const resolved = resolveClickedSpot(spots, marker.spot);
        if (!resolved) return;
        if (clickTarget(viewMode) === "card") state.pickedKey = selectionKey(resolved);
        else state.modalSpot = resolved;
      });
      return marker;
    });
  return { ev, markers, state, card: (list: Spot[] = spots) => resolveSelection(list, state.pickedKey) };
}

// ── 1. A 선택 → 카드 A ────────────────────────────────────────────────────────
test("마커 A 를 누르면 하단 카드가 A 를 가리킨다", () => {
  const m = mountMap([A, B], "map");
  m.ev.clickMarker(m.markers[0]);
  assert.equal(m.card()?.name, "Haeundae Beach");
  assert.equal(m.state.modalSpot, null, "Map 모드에서는 상세 모달이 열리지 않는다");
});

// ── 2. B 선택 → 같은 카드가 B 로 갱신 ─────────────────────────────────────────
test("★A 다음 B 를 누르면 카드가 두 장 쌓이지 않고 B 로 갱신된다", () => {
  const m = mountMap([A, B], "map");
  m.ev.clickMarker(m.markers[0]);
  const first = m.card();
  m.ev.clickMarker(m.markers[1]);
  const second = m.card();
  assert.equal(first?.sourceKey, "city_spot:24");
  assert.equal(second?.sourceKey, "city_spot:31");
  // 선택은 항상 하나다 — 키가 하나이므로 카드가 겹쳐 쌓일 수 없다
  assert.equal(typeof m.state.pickedKey, "string");
  assert.notEqual(first?.sourceKey, second?.sourceKey);
});

// ── 3. 같은 숫자 id, 다른 소스 ────────────────────────────────────────────────
test("같은 숫자 id 의 다른 소스를 눌러도 좌표로 구분된다", () => {
  const m = mountMap([A, A2], "map");
  m.ev.clickMarker(m.markers[1]);          // A2
  assert.equal(m.card()?.name, "Local 24");
  assert.equal(m.state.pickedKey, "local_info:busan:24");
});

// ── 4. 필터에서 빠지면 카드가 닫힌다 ──────────────────────────────────────────
test("★선택한 장소가 검색·카테고리 결과에서 빠지면 카드가 닫힌다", () => {
  const m = mountMap([A, B], "map");
  m.ev.clickMarker(m.markers[1]);          // B 선택
  assert.equal(m.card()?.name, "Gamcheon Village");
  // 검색어가 바뀌어 결과가 A 만 남은 상황
  assert.equal(m.card([A]), null, "B 가 결과에서 빠지면 카드는 null");
});

test("필터가 되돌아오면 선택도 되살아난다 — 상태를 지우지 않기 때문", () => {
  const m = mountMap([A, B], "map");
  m.ev.clickMarker(m.markers[1]);
  assert.equal(m.card([A]), null);
  assert.equal(m.card([A, B])?.name, "Gamcheon Village");
});

// ── 5. viewMode 분기 ──────────────────────────────────────────────────────────
test("List 모드·데스크톱 split 에서는 기존 상세 모달을 연다", () => {
  const m = mountMap([A, B], "list");
  m.ev.clickMarker(m.markers[0]);
  assert.equal(m.state.pickedKey, null, "하단 카드는 열리지 않는다");
  assert.equal(m.state.modalSpot?.name, "Haeundae Beach");
});

test("clickTarget 은 Map 에서만 카드다", () => {
  assert.equal(clickTarget("map"), "card");
  assert.equal(clickTarget("list"), "modal");
});

// ── 6. 좌표 없는 장소는 마커가 없다 ───────────────────────────────────────────
test("좌표 없는 장소에는 마커를 만들지 않는다 — 기존 제외 정책 유지", () => {
  const noCoord: Spot = { id: 99, name: "No Coord", lat: null, lng: null, sourceKey: "local_info:busan:99" };
  const m = mountMap([A, noCoord, B], "map");
  assert.equal(m.markers.length, 2);
  assert.equal(m.ev.count(), 2);
  assert.ok(!m.markers.some(x => x.key === "local_info:busan:99"));
});

// ── 7. selectionKey fallback ──────────────────────────────────────────────────
test("sourceKey 가 없던 시절 항목은 id 로 떨어진다", () => {
  assert.equal(selectionKey({ id: 7 }), "7");
  assert.equal(selectionKey({ id: 7, sourceKey: "city_spot:7" }), "city_spot:7");
});

test("선택 키가 없으면 카드도 없다", () => {
  assert.equal(resolveSelection([A, B], null), null);
  assert.equal(resolveSelection([], "city_spot:24"), null);
});

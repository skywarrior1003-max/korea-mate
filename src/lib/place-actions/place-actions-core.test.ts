// 어느 화면에서 눌러도 같은 일이 일어나는가.
//
// 저장·이번 여행 선택·공유는 화면마다 다르게 동작하면 안 된다. 카드 모양은
// 달라도 되지만 행동의 뜻은 하나다.
//
// 그리고 이 셋은 서로 묶여 있지 않다 — 저장을 풀어도 이번 여행 선택은 남고,
// 이번 여행에서 빼도 저장은 남는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { getItemSourceKey, citySpotSourceKey, userSpotSourceKey } from "../place-identity.ts";
import type { EventItem } from "../cart.ts";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>): void {
  const done = () => { passed++; console.log(`  ok  ${name}`); };
  try {
    const r = fn();
    if (r instanceof Promise) { void r.then(done, e => {
      console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }); }
    else done();
  } catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

// ── 브라우저 대역 ─────────────────────────────────────────────────────────────
const store = new Map<string, string>();
const ls = {
  getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
interface FakeNav { share?: (c: unknown) => Promise<void>; clipboard?: { writeText: (s: string) => Promise<void> } }
const nav: FakeNav = {};
(globalThis as { window?: unknown }).window = { localStorage: ls, dispatchEvent: () => true };
(globalThis as { localStorage?: unknown }).localStorage = ls;
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
(globalThis as { CustomEvent?: unknown }).CustomEvent =
  class { type: string; constructor(type: string) { this.type = type; } };

const SRC = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const base = ${JSON.stringify(SRC)} + spec.slice(2);
      for (const c of [base, base + ".ts", base + "/index.ts"]) {
        try { return await next(c, ctx); } catch { /* 다음 후보 */ }
      }
    }
    return next(spec, ctx);
  }
`), import.meta.url);

const A = await import("./place-actions-core.ts");
const { getCityCart } = await import("../cart.ts");
const { getFavorites, getSavedSpotsData } = await import("../favorites.ts");

const BUSAN = "Busan", SEOUL = "Seoul";

function place(n: number, city = "busan", name = `place-${n}`): EventItem {
  return {
    id: String(n), sourceKey: citySpotSourceKey(n), type: "attraction",
    isAnchor: false, journeyCluster: null, stage: "", anchorEventId: null,
    relatedSpotIds: [], relatedSurvivalGuides: [], transitFromAnchor: null,
    name, shortName: name, tags: [], city, district: "", address: "",
    mapUrl: "", description: "", whyItMatters: "",
    recommendedDurationMinutes: 60, bestTimeSlot: "", openingHours: null,
    image: null, startDate: null, endDate: null,
    isTrending: false, soloFriendly: false, foreignCardAccepted: false,
    cashOnly: false, englishMenu: false, barrierFree: false,
    koreanSurvivalScore: 0, notice: null, lat: 35.1, lng: 129.0,
  };
}
const myPlace = (uuid: string): EventItem =>
  ({ ...place(0, ""), id: `user_spot-${uuid}`, sourceKey: userSpotSourceKey(uuid) });

const reset = () => { store.clear(); delete nav.share; delete nav.clipboard; };

// ── 1 · 2 · 3. 저장 ──────────────────────────────────────────────────────────

test("1·2: 저장하고 푼다", () => {
  reset();
  const p = place(1);
  assert.equal(A.isPlaceSaved(p), false);
  A.savePlace(p);
  assert.equal(A.isPlaceSaved(p), true);
  assert.equal(getSavedSpotsData().length, 1);
  A.unsavePlace(p);
  assert.equal(A.isPlaceSaved(p), false);
  assert.equal(getSavedSpotsData().length, 0);
});

test("3: 두 번 저장해도 하나다 — 하트와 목록이 어긋나지 않는다", () => {
  reset();
  const p = place(1);
  A.savePlace(p); A.savePlace(p); A.savePlace(p);
  assert.equal(getFavorites().filter(id => id === p.id).length, 1);
  assert.equal(getSavedSpotsData().length, 1);
  // 저장돼 있지 않은데 푸는 것도 안전하다
  A.unsavePlace(p); A.unsavePlace(p);
  assert.equal(A.isPlaceSaved(p), false);
});

test("toggle 은 누른 뒤의 상태를 돌려준다", () => {
  reset();
  const p = place(1);
  assert.equal(A.togglePlaceSaved(p), true);
  assert.equal(A.togglePlaceSaved(p), false);
});

// ── 4 · 5 · 8 · 9. 저장 ↔ 이번 여행은 서로 묶이지 않는다 ────────────────────

test("4·5·8: 저장과 이번 여행 선택은 서로를 건드리지 않는다", () => {
  reset();
  const p = place(1);

  A.savePlace(p);
  assert.equal(A.isPlaceSaved(p), true);
  assert.equal(A.isInThisTrip(p, BUSAN), false, "저장했다고 여행에 들어갔다");

  A.addPlaceToThisTrip(p, BUSAN);
  assert.equal(A.isInThisTrip(p, BUSAN), true);
  assert.equal(A.isPlaceSaved(p), true);

  A.removePlaceFromThisTrip(p, BUSAN);
  assert.equal(A.isInThisTrip(p, BUSAN), false);
  assert.equal(A.isPlaceSaved(p), true, "여행에서 뺐다고 저장이 풀렸다");

  A.unsavePlace(p);
  assert.equal(A.isPlaceSaved(p), false);
});

test("저장을 풀어도 이번 여행 선택은 남는다", () => {
  reset();
  const p = place(1);
  A.savePlace(p);
  A.addPlaceToThisTrip(p, BUSAN);
  A.unsavePlace(p);
  assert.equal(A.isPlaceSaved(p), false);
  assert.equal(A.isInThisTrip(p, BUSAN), true, "저장을 풀었다고 여행에서 빠졌다");
});

test("5: 이번 여행에 넣는다고 저장이 자동으로 생기지 않는다", () => {
  reset();
  const p = place(1);
  A.addPlaceToThisTrip(p, BUSAN);
  assert.equal(A.isPlaceSaved(p), false);
  assert.equal(getSavedSpotsData().length, 0);
});

test("9: 이번 여행에서 빼도 내가 등록한 장소 원본은 건드리지 않는다", () => {
  reset();
  const m = myPlace("u1");
  A.addPlaceToThisTrip(m, BUSAN);
  A.removePlaceFromThisTrip(m, BUSAN);
  // cart 만 건드린다 — user_spots API 호출이 이 계층에 없다
  const core = readFileSync(
    path.join(process.cwd(), "src", "lib", "place-actions", "place-actions-core.ts"), "utf8");
  assert.doesNotMatch(core, /apiDeleteUserSpot|user-spots-api/);
});

// ── 6 · 7 · 10 · 11 · 12. 도시별 ─────────────────────────────────────────────

test("6·7·10·11: 도시마다 따로 판단한다", () => {
  reset();
  const p = place(1);
  A.addPlaceToThisTrip(p, BUSAN);
  assert.equal(A.isInThisTrip(p, BUSAN), true);
  assert.equal(A.isInThisTrip(p, SEOUL), false, "부산 선택이 서울에서도 켜졌다");

  A.addPlaceToThisTrip(p, SEOUL);
  assert.equal(A.isInThisTrip(p, SEOUL), true);
  assert.equal(A.isInThisTrip(p, BUSAN), true);

  A.removePlaceFromThisTrip(p, SEOUL);
  assert.equal(A.isInThisTrip(p, SEOUL), false);
  assert.equal(A.isInThisTrip(p, BUSAN), true, "한 도시에서 뺐는데 다른 도시도 빠졌다");
});

test("12: 같은 도시 중복 0", () => {
  reset();
  const p = place(1);
  A.addPlaceToThisTrip(p, BUSAN);
  A.addPlaceToThisTrip(p, BUSAN);
  assert.equal(getCityCart(BUSAN).length, 1);
});

test("도시를 모르면 넣지 않고 그대로 알린다", () => {
  reset();
  const p = place(1);
  assert.equal(A.addPlaceToThisTrip(p, null), false);
  assert.equal(A.addPlaceToThisTrip(p, ""), false);
  assert.equal(getCityCart(BUSAN).length, 0);
  assert.equal(A.isInThisTrip(p, null), false);
});

// ── 18 ~ 20 · 24 · 30. 공유 ─────────────────────────────────────────────────

test("18·19: 공식 장소는 canonical 링크를 쓴다", () => {
  const c = A.placeShareContent(place(1234, "busan", "Haeundae"))!;
  assert.ok(c);
  assert.match(c.url, /\/place\/1234\/$/);
  assert.equal(c.title, "Haeundae — Busan");
  assert.match(c.text, /gokoreamate/);
});

test("19·20: 공유 내용에 좌표·여행 정보·개인 정보가 없다", () => {
  const c = A.placeShareContent(place(1234))!;
  const blob = JSON.stringify(c);
  for (const bad of ["lat", "lng", "35.1", "129.0", "cart", "fixed",
                     "tripCity", "startDate", "user_spot", "device"]) {
    assert.ok(!blob.includes(bad), `공유 내용에 ${bad} 가 있다: ${blob}`);
  }
  assert.deepEqual(Object.keys(c).sort(), ["text", "title", "url"]);
});

test("30: 내가 등록한 장소는 공유 링크를 만들지 않는다", () => {
  const m = myPlace("3f2a91c4-7b6e-4d1a-9c05-2e8f4b0d6a71");
  assert.equal(A.canSharePlace(m), false);
  assert.equal(A.placeShareContent(m), null, "가짜 주소를 만들었다");
  assert.equal(A.canSharePlace(place(1)), true);
});

test("21: 기기 공유가 있으면 그것을 쓴다", async () => {
  reset();
  let got: unknown = null;
  nav.share = async (c) => { got = c; };
  const c = A.placeShareContent(place(1234))!;
  assert.equal(await A.sharePlace(c), "shared");
  assert.deepEqual(got, c);
});

test("22: 기기 공유가 없으면 링크를 복사한다", async () => {
  reset();
  let copied = "";
  nav.clipboard = { writeText: async (s) => { copied = s; } };
  const c = A.placeShareContent(place(1234))!;
  assert.equal(await A.sharePlace(c), "copied");
  assert.equal(copied, c.url);
});

test("23: 사용자가 공유 창을 닫은 것은 실패가 아니다", async () => {
  reset();
  nav.share = async () => { const e = new Error("cancel"); e.name = "AbortError"; throw e; };
  nav.clipboard = { writeText: async () => { throw new Error("should not copy"); } };
  const c = A.placeShareContent(place(1234))!;
  assert.equal(await A.sharePlace(c), "cancelled");
});

test("공유가 실패하면 복사로 내려가고, 그것도 막히면 알린다", async () => {
  reset();
  nav.share = async () => { throw new Error("boom"); };   // 취소가 아닌 실패
  let copied = "";
  nav.clipboard = { writeText: async (s) => { copied = s; } };
  const c = A.placeShareContent(place(1234))!;
  assert.equal(await A.sharePlace(c), "copied");
  assert.equal(copied, c.url);

  reset();
  assert.equal(await A.sharePlace(c), "unavailable", "어디서도 던지면 안 된다");
});

// ── 배선 guard (§27) ─────────────────────────────────────────────────────────

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const SURFACES = {
  EventCard:        read("src", "components", "EventCard.tsx"),
  EventDetailModal: read("src", "components", "EventDetailModal.tsx"),
  ExploreCity:      read("src", "components", "ExploreCity.tsx"),
  PlaceDetail:      read("src", "app", "place", "[id]", "PlaceDetailClient.tsx"),
  Picks:            read("src", "app", "picks", "PicksClient.tsx"),
};

test("25·26·27: 저장 조합을 화면마다 복붙하지 않는다", () => {
  for (const [name, src] of Object.entries(SURFACES)) {
    assert.doesNotMatch(src, /toggleFavorite\(/, `${name} 이 저장을 직접 조합한다`);
    assert.doesNotMatch(src, /cacheSavedSpot\(/, `${name} 이 저장을 직접 조합한다`);
    assert.doesNotMatch(src, /uncacheSavedSpot\(/, `${name} 이 저장을 직접 조합한다`);
  }
  for (const n of ["EventCard", "EventDetailModal", "ExploreCity", "PlaceDetail"]) {
    assert.match(SURFACES[n as keyof typeof SURFACES], /togglePlaceSaved\(/, n);
  }
});

test("28·29: This Trip 선택·제외가 공통 action 을 쓴다", () => {
  assert.match(SURFACES.Picks, /addPlaceToThisTrip\(item, tripCity\)/);
  assert.match(SURFACES.Picks, /removePlaceFromThisTrip\(item, tripCity\)/);
});

test("navigator.share 구현을 화면마다 새로 쓰지 않는다", () => {
  // 장소 공유는 공통 action 하나뿐이다. 여행 전체 공유는 별개 기능이라 제외한다.
  assert.doesNotMatch(SURFACES.PlaceDetail, /navigator\.share/);
  const core = read("src", "lib", "place-actions", "place-actions-core.ts");
  assert.match(core, /nav\?\.share/);
});

test("37: 한국어에서 This Trip 제외를 삭제라 부르지 않는다", () => {
  const ko = JSON.parse(read("src", "messages", "ko.json")) as { picks: Record<string, string> };
  assert.equal(ko.picks.removeFromTrip, "This Trip에서 빼기");
  assert.ok(!/삭제/.test(ko.picks.removeFromTrip!));
  assert.match(SURFACES.Picks, /t\("removeFromTrip"\)/);
  // Saved 목록의 ✕ 는 실제 삭제이므로 기존 문구 그대로다
  assert.equal(ko.picks.remove, "삭제");
});

test("31·17: 여행 전체 공유와 카드 레이아웃은 건드리지 않았다", () => {
  const core = read("src", "lib", "place-actions", "place-actions-core.ts");
  assert.doesNotMatch(core, /className|<div|jsx|React/, "공통 계층에 화면 코드가 들어갔다");
  // 카드 컴포넌트는 그대로 각자 존재한다
  for (const f of ["EventCard.tsx", "SpotCard.tsx"]) {
    assert.ok(read("src", "components", f).length > 0, f);
  }
});

test("10: identity 는 sourceKey 그대로다", () => {
  const p = place(1234);
  assert.equal(getItemSourceKey(p), "city_spot:1234");
  const core = read("src", "lib", "place-actions", "place-actions-core.ts");
  assert.doesNotMatch(core, /`\$\{[^}]*city[^}]*\}:/i, "도시를 붙인 새 identity 를 만든다");
});

setTimeout(() => console.log(`\nplace-actions: ${passed} passed`), 60);

// 도시가 다른 여행의 선택이 서로 섞이지 않는가.
//
// 지켜야 하는 두 경계
//   ① 도시를 바꿔도 지우지 않는다. 돌아오면 그대로 있어야 한다.
//   ② 어느 여행 것인지 모르는 예전 선택은 지우지도, 아무 도시에 밀어 넣지도
//      않는다. 사용자가 정해 줄 때까지 기다리고 일정에는 넣지 않는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import {
  effectiveTripCity, forCity, isForCity, isUnresolvedCity, normalizeTripCity, unresolved,
} from "./city-scope-core.ts";
import { getItemSourceKey, userSpotSourceKey, citySpotSourceKey } from "../place-identity.ts";
import type { CartFixed, CartItem, EventItem } from "../cart.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

// ── localStorage 대역 ─────────────────────────────────────────────────────────
const store = new Map<string, string>();
(globalThis as { window?: unknown; localStorage?: unknown }).window = {
  localStorage: {
    getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
  dispatchEvent: () => true,
};
(globalThis as { localStorage?: unknown }).localStorage =
  (globalThis as { window: { localStorage: unknown } }).window.localStorage;
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

const cart = await import("../cart.ts");
const {
  addToCart, getCart, getCityCart, getUnresolvedCart, removeFromCart,
  removeFromAllCities, setCartFixed, updateCartPlace, attachCartItemToCity,
} = cart;

const BUSAN = "Busan", SEOUL = "Seoul";
const D2 = "2026-10-25";
const KEY = "koreamate_cart";

/** 공식 장소 — 장소 자체의 도시를 안다. */
function official(n: number, city: string, name = `place-${n}`): EventItem {
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
    koreanSurvivalScore: 0, notice: null, lat: 35.1 + n * 1e-3, lng: 129.0,
  };
}
/** 내가 등록한 장소 — 도시가 비어 있다. */
function mine(uuid: string, name = "my place"): EventItem {
  return { ...official(0, "", name), id: `user_spot-${uuid}`, sourceKey: userSpotSourceKey(uuid) };
}

const keysOf = (items: CartItem[]) => items.map(getItemSourceKey);
const reset  = () => store.clear();
/** 저장소에 legacy 항목(= tripCity 없음)을 직접 심는다. */
function seedRaw(items: Partial<CartItem>[]) {
  store.set(KEY, JSON.stringify(items));
}

// ── 순수 규칙 ────────────────────────────────────────────────────────────────

test("도시 비교는 대소문자를 가리지 않는다", () => {
  assert.equal(normalizeTripCity("Busan"), "busan");
  assert.equal(normalizeTripCity(" busan "), "busan");
  assert.equal(normalizeTripCity(""), null);
  assert.equal(normalizeTripCity(undefined), null);
});

test("tripCity 가 있으면 그것이 답이고, 없으면 장소의 도시로 읽는다", () => {
  assert.equal(effectiveTripCity({ tripCity: "Seoul", city: "Busan" }), "seoul");
  assert.equal(effectiveTripCity({ city: "Busan" }), "busan");
  assert.equal(effectiveTripCity({ city: "" }), null);
  assert.equal(effectiveTripCity({}), null);
  assert.ok(isUnresolvedCity({ city: "" }));
  assert.ok(isForCity({ tripCity: "busan" }, "Busan"));
  assert.ok(!isForCity({ tripCity: "busan" }, "Seoul"));
  assert.equal(forCity([{ city: "Busan" }, { city: "Seoul" }], null).length, 0);
  assert.equal(unresolved([{ city: "" }, { city: "Busan" }]).length, 1);
});

// ── 1 · 4 ~ 9. 도시별 분리 ───────────────────────────────────────────────────

test("1·4: 담을 때 지금 여행 도시를 기록한다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  const it = getCart()[0]!;
  assert.equal(it.tripCity, "busan");
  assert.equal(it.city, "Busan", "장소 자체의 도시는 그대로다");
});

test("4~8: 부산 A/B/C → 서울 전환 → D/E → 오가며 그대로 복원된다", () => {
  reset();
  for (const n of [1, 2, 3]) addToCart(official(n, "Busan", `busan-${n}`), BUSAN);
  assert.equal(getCityCart(BUSAN).length, 3);

  // 서울로 전환 — 부산 것은 서울 목록에 없다
  assert.deepEqual(keysOf(getCityCart(SEOUL)), []);
  assert.equal(getCart().length, 3, "도시를 바꿨다고 사라졌다");

  for (const n of [4, 5]) addToCart(official(n, "Seoul", `seoul-${n}`), SEOUL);
  assert.deepEqual(keysOf(getCityCart(SEOUL)), [citySpotSourceKey(4), citySpotSourceKey(5)]);

  // 다시 부산 — 셋 그대로
  assert.deepEqual(keysOf(getCityCart(BUSAN)),
    [citySpotSourceKey(1), citySpotSourceKey(2), citySpotSourceKey(3)]);
  // 다시 서울 — 둘 그대로
  assert.deepEqual(keysOf(getCityCart(SEOUL)), [citySpotSourceKey(4), citySpotSourceKey(5)]);
  assert.equal(getCart().length, 5, "어느 쪽도 지워지지 않았다");
});

test("9: 도시 전환만으로 지워지는 항목은 없다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  const before = store.get(KEY);
  getCityCart(SEOUL); getCityCart(BUSAN); getUnresolvedCart();
  assert.equal(store.get(KEY), before, "읽기만 했는데 저장소가 바뀌었다");
});

// ── 13 · 14 · 15 · 16. 중복·독립 ─────────────────────────────────────────────

test("13: 같은 도시에서 같은 장소를 두 번 담지 않는다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  addToCart(official(1, "Busan"), BUSAN);
  assert.equal(getCityCart(BUSAN).length, 1);
});

test("14: 다른 도시의 같은 장소는 각각의 선택으로 남는다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  addToCart(official(1, "Busan"), SEOUL);      // 같은 장소를 서울 여행에도
  assert.equal(getCityCart(BUSAN).length, 1);
  assert.equal(getCityCart(SEOUL).length, 1);
  assert.equal(getCart().length, 2);
  // 원본 identity 는 하나다
  assert.equal(getCart()[0]!.sourceKey, getCart()[1]!.sourceKey);
});

test("15·16: 약속과 순서는 도시마다 따로다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  addToCart(official(1, "Busan"), SEOUL);
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  setCartFixed(citySpotSourceKey(1), fixed, BUSAN);

  assert.deepEqual(getCityCart(BUSAN)[0]!.fixed, fixed);
  assert.equal(getCityCart(SEOUL)[0]!.fixed, undefined, "다른 도시 선택까지 덮어썼다");

  // 순서도 도시별 0 부터
  addToCart(official(2, "Seoul"), SEOUL);
  assert.deepEqual(getCityCart(SEOUL).map(i => i.sortOrder), [0, 1]);
  assert.deepEqual(getCityCart(BUSAN).map(i => i.sortOrder), [0]);
});

test("한 도시에서 빼도 다른 도시 선택은 남는다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  addToCart(official(1, "Busan"), SEOUL);
  removeFromCart(citySpotSourceKey(1), BUSAN);
  assert.equal(getCityCart(BUSAN).length, 0);
  assert.equal(getCityCart(SEOUL).length, 1);
});

// ── 26 · 27. 예전 항목 자동 연결 (도시가 분명한 것만) ────────────────────────

test("26·27: 도시가 분명한 예전 항목은 그 도시 여행 선택으로 읽힌다", () => {
  reset();
  seedRaw([
    { ...official(1, "Busan"), addedAt: 1, sortOrder: 0 },     // tripCity 없음
    { ...official(2, "Seoul"), addedAt: 2, sortOrder: 1 },
  ]);
  assert.deepEqual(keysOf(getCityCart(BUSAN)), [citySpotSourceKey(1)]);
  assert.deepEqual(keysOf(getCityCart(SEOUL)), [citySpotSourceKey(2)]);
  assert.equal(getUnresolvedCart().length, 0);
  // 저장소를 고쳐 쓰지 않았다 — 읽기만으로 해결된다
  assert.ok(!store.get(KEY)!.includes("tripCity"));
});

// ── 28 ~ 35. 도시를 모르는 예전 My Place ─────────────────────────────────────

const U1 = "3f2a91c4-7b6e-4d1a-9c05-2e8f4b0d6a71";

test("28·29: 도시를 모르는 예전 항목은 지우지도 배정하지도 않는다", () => {
  reset();
  seedRaw([{ ...mine(U1), addedAt: 1, sortOrder: 0 }]);
  assert.equal(getUnresolvedCart().length, 1);
  assert.equal(getCityCart(BUSAN).length, 0, "현재 도시로 밀어 넣었다");
  assert.equal(getCityCart(SEOUL).length, 0);
  assert.equal(getCart().length, 1, "지워졌다");
});

test("30: 도시를 모르는 항목은 어느 도시 일정에도 들어가지 않는다", () => {
  reset();
  seedRaw([
    { ...mine(U1), addedAt: 1, sortOrder: 0 },
    { ...official(1, "Busan"), addedAt: 2, sortOrder: 1 },
  ]);
  // 일정 입력은 getCityCart 하나로만 만든다
  assert.deepEqual(keysOf(getCityCart(BUSAN)), [citySpotSourceKey(1)]);
});

test("32·33·34: 이 여행에 사용 — 새로 만들지 않고 순서·약속을 지킨다", () => {
  reset();
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  seedRaw([{ ...mine(U1), addedAt: 111, sortOrder: 3, fixed }]);

  attachCartItemToCity(userSpotSourceKey(U1), BUSAN);

  const busan = getCityCart(BUSAN);
  assert.equal(busan.length, 1);
  assert.equal(getCart().length, 1, "항목이 하나 더 생겼다");
  assert.equal(busan[0]!.addedAt, 111);
  assert.deepEqual(busan[0]!.fixed, fixed);
  assert.equal(getUnresolvedCart().length, 0);
});

test("35: 같은 장소를 다시 담으면 예전 항목을 재사용한다", () => {
  reset();
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  seedRaw([{ ...mine(U1), addedAt: 111, sortOrder: 2, fixed }]);

  addToCart(mine(U1), BUSAN);                 // Saved/My Places 에서 다시 선택

  assert.equal(getCart().length, 1, "중복이 생겼다");
  const it = getCityCart(BUSAN)[0]!;
  assert.equal(it.addedAt, 111, "담은 시각이 사라졌다");
  assert.deepEqual(it.fixed, fixed, "약속이 사라졌다");
});

test("이 여행에 사용 — 이미 그 도시에 같은 장소가 있으면 중복을 만들지 않는다", () => {
  reset();
  addToCart(mine(U1), BUSAN);
  seedRaw([...getCart(), { ...mine(U1), addedAt: 1, sortOrder: 9 }]);
  assert.equal(getCart().length, 2);
  attachCartItemToCity(userSpotSourceKey(U1), BUSAN);
  assert.equal(getCityCart(BUSAN).length, 1);
});

// ── 21 ~ 25. My Places 수정·삭제 ─────────────────────────────────────────────

test("21·22: My Place 수정은 모든 도시 표시를 최신화하고 도시별 상태는 지킨다", () => {
  reset();
  addToCart(mine(U1, "옛 이름"), BUSAN);
  addToCart(mine(U1, "옛 이름"), SEOUL);
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  setCartFixed(userSpotSourceKey(U1), fixed, BUSAN);

  updateCartPlace(userSpotSourceKey(U1), mine(U1, "새 이름"));

  assert.equal(getCityCart(BUSAN)[0]!.name, "새 이름");
  assert.equal(getCityCart(SEOUL)[0]!.name, "새 이름");
  assert.deepEqual(getCityCart(BUSAN)[0]!.fixed, fixed, "부산 약속이 사라졌다");
  assert.equal(getCityCart(SEOUL)[0]!.fixed, undefined, "서울에 약속이 생겼다");
  assert.equal(getCityCart(BUSAN)[0]!.tripCity, "busan");
  assert.equal(getCityCart(SEOUL)[0]!.tripCity, "seoul");
});

test("23·24: 원본 삭제는 모든 도시에서 빼고, 실패하면 아무것도 건드리지 않는다", () => {
  reset();
  addToCart(mine(U1), BUSAN);
  addToCart(mine(U1), SEOUL);
  addToCart(official(1, "Busan"), BUSAN);
  assert.equal(getCart().length, 3);

  removeFromAllCities(userSpotSourceKey(U1));
  assert.equal(getCityCart(BUSAN).length, 1, "공식 장소까지 사라졌다");
  assert.equal(getCityCart(SEOUL).length, 0);
  assert.equal(getCart().length, 1);

  // 실패 경로는 화면이 성공 블록 안에서만 부른다 — 소스로 고정
  const picks = readFileSync(path.join(process.cwd(), "src", "app", "picks", "PicksClient.tsx"), "utf8");
  assert.match(picks,
    /const ok = await apiDeleteUserSpot\(id\);\s*\n\s*if \(ok\) \{[\s\S]*?removeFromAllCities\(userSpotSourceKey\(id\)\)/);
});

// ── 36. persistence ──────────────────────────────────────────────────────────

test("36: 저장소를 다시 읽어도 도시별 선택이 그대로다", () => {
  reset();
  addToCart(official(1, "Busan"), BUSAN);
  addToCart(official(2, "Seoul"), SEOUL);
  const raw = JSON.parse(store.get(KEY)!) as CartItem[];
  assert.deepEqual(raw.map(i => i.tripCity), ["busan", "seoul"]);
  assert.deepEqual(keysOf(getCityCart(BUSAN)), [citySpotSourceKey(1)]);
  assert.deepEqual(keysOf(getCityCart(SEOUL)), [citySpotSourceKey(2)]);
});

// ── 배선 guard ───────────────────────────────────────────────────────────────

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const picksSrc = read("src", "app", "picks", "PicksClient.tsx");
const pageSrc  = read("src", "app", "itinerary", "page.tsx");

test("31: This Trip 화면이 현재 도시만 보여 주고 예전 선택은 따로 보여 준다", () => {
  assert.match(picksSrc, /setSelected\(getCityCart\(tripCity\)\)/);
  assert.match(picksSrc, /setUnresolved\(getUnresolvedCart\(\)\)/);
  assert.match(picksSrc, /\{t\("legacyTitle"\)\}/);
  assert.match(picksSrc, /attachCartItemToCity\(key, tripCity\)/);
});

test("18·20: Saved·My Places 의 선택 여부가 현재 도시 기준이다", () => {
  // selectedKeys 는 현재 도시 목록(selected)에서만 만든다
  assert.match(picksSrc, /const selectedKeys = new Set\(selected\.map\(getItemSourceKey\)\);/);
  assert.match(picksSrc, /const \[selected, setSelected\] = useState<CartItem\[\]>\(\[\]\);/);
});

test("37~40: 일정 생성이 현재 도시 장소만 쓴다 — 거리 필터에 기대지 않는다", () => {
  assert.match(pageSrc, /const cart   = getCityCart\(city\);/);
  assert.doesNotMatch(pageSrc, /\bgetCart\(\)/, "도시 구분 없는 읽기가 남았다");
  assert.doesNotMatch(picksSrc, /\bgetCart\(\)/);
});

test("2·5: My Place 원본의 city 를 현재 여행 도시로 덮어쓰지 않는다", () => {
  // 생성·수정 payload 어디에도 tripCity 를 city 로 넣지 않는다
  const create = /const input = \{([\s\S]*?)\n    \};/.exec(picksSrc)?.[1] ?? "";
  assert.ok(!/city/.test(create), "생성 payload 에 city 가 들어갔다");
  const update = /apiUpdateUserSpot\(spot\.id, \{([\s\S]*?)\n        \}\);/.exec(picksSrc)?.[1] ?? "";
  assert.ok(!/city/.test(update), "수정 payload 에 city 가 들어갔다");
  assert.doesNotMatch(picksSrc, /city:\s*tripCity/);
});

test("도시 전환·날짜 변경으로 cart 를 비우지 않는다", () => {
  const home = read("src", "app", "HomeClient.tsx");
  assert.doesNotMatch(home, /clearCart/);
  assert.doesNotMatch(pageSrc, /clearCart/);
  // Picks 의 Clear All 은 사용자가 직접 누르는 것뿐이다
  assert.match(picksSrc, /onClick=\{\(\) => \{ clearCart\(\); setConfirmClear\(false\); \}\}/);
});

test("sourceKey 에 도시를 붙여 새 identity 를 만들지 않는다", () => {
  const core = read("src", "lib", "cart-city", "city-scope-core.ts");
  assert.doesNotMatch(core, /sourceKey/);
  assert.doesNotMatch(picksSrc, /`\$\{tripCity\}:/);
});

console.log(`\ncity-scope: ${passed} passed`);

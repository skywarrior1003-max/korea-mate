// My Places 에서 고치거나 지우면 This Trip 에도 반영되는가.
//
// 반대 방향은 그대로다 — This Trip 에서 빼는 것은 장소를 지우는 것이 아니다.
//
// 지켜야 하는 경계
//   장소 정보만 최신화한다. 사용자가 이번 여행에서 정한 순서와 약속 시각은
//   장소의 속성이 아니므로 건드리지 않는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { isValidCoordinate } from "../geo.ts";
import { getItemSourceKey, userSpotSourceKey } from "../place-identity.ts";
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

// cart.ts 는 `@/config/...` 별칭을 쓴다. node 는 그 별칭을 모르므로 이 테스트
// 안에서만 풀어 준다 — 규칙을 옮겨 적지 않고 **실제 함수**를 돌리기 위해서다.
const SRC = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;
register(
  "data:text/javascript," + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec.startsWith("@/")) {
        const base = ${JSON.stringify(SRC)} + spec.slice(2);
        for (const cand of [base, base + ".ts", base + "/index.ts"]) {
          try { return await next(cand, ctx); } catch { /* 다음 후보 */ }
        }
      }
      return next(spec, ctx);
    }
  `),
  import.meta.url,
);

const cart = await import("../cart.ts");
const { addToCart, getCart, removeFromCart, setCartFixed, updateCartPlace } = cart;

const UUID  = "3f2a91c4-7b6e-4d1a-9c05-2e8f4b0d6a71";
const OTHER = "9a1b7c2d-4e5f-4a3b-8c7d-1f2e3d4c5b6a";
const GAMCHEON = { lat: 35.0975, lng: 129.0106 };
const YEONGDO  = { lat: 35.0748, lng: 129.0862 };
const D2 = "2026-10-25";

/** PicksClient 의 userSpotToEvent 와 같은 규칙 — 화면 컴포넌트라 직접 import 할 수 없다. */
function userSpotToEvent(
  s: { id: string; category?: string; city?: string; address?: string; note?: string;
       lat?: unknown; lng?: unknown },
  displayName: string,
): EventItem {
  const hasCoord = isValidCoordinate(s.lat, s.lng);
  return {
    ...(hasCoord ? { lat: s.lat as number, lng: s.lng as number } : {}),
    id: `user_spot-${s.id}`, sourceKey: `user_spot:${s.id}`,
    type: s.category || "attraction",
    isAnchor: false, journeyCluster: null, stage: "", anchorEventId: null,
    relatedSpotIds: [], relatedSurvivalGuides: [], transitFromAnchor: null,
    name: displayName, shortName: displayName, tags: [],
    city: s.city ?? "", district: "", address: s.address ?? "",
    mapUrl: "", description: s.note ?? "", whyItMatters: "",
    recommendedDurationMinutes: 60, bestTimeSlot: "", openingHours: null,
    image: null, startDate: null, endDate: null,
    isTrending: false, soloFriendly: false, foreignCardAccepted: false,
    cashOnly: false, englishMenu: false, barrierFree: false,
    koreanSurvivalScore: 0, notice: null,
  };
}

const spotOf = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, category: "attraction", city: "Busan", address: "old address",
     note: "old note", lat: GAMCHEON.lat, lng: GAMCHEON.lng, ...over });

/** cart 를 비우고 지정한 장소들을 담는다. */
function seed(...events: EventItem[]) {
  store.clear();
  for (const e of events) addToCart(e);
}
const find = (key: string): CartItem | undefined =>
  getCart().find(i => getItemSourceKey(i) === key);

const KEY = userSpotSourceKey(UUID);

// ── 1 · 2 · 5 · 6. 이름·표시정보 최신화 ───────────────────────────────────────

test("1: 이름을 고치면 This Trip 의 같은 장소도 최신 이름이 된다", () => {
  seed(userSpotToEvent(spotOf(UUID), "옛 이름"));
  assert.equal(find(KEY)!.name, "옛 이름");

  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "새 이름"));
  assert.equal(find(KEY)!.name, "새 이름");
  assert.equal(find(KEY)!.shortName, "새 이름");
});

test("2: 메모·주소·분류도 최신화된다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  updateCartPlace(KEY, userSpotToEvent(
    spotOf(UUID, { note: "새 메모", address: "새 주소", category: "restaurant" }), "이름"));
  const it = find(KEY)!;
  assert.equal(it.description, "새 메모");
  assert.equal(it.address, "새 주소");
  assert.equal(it.type, "restaurant");
});

test("5: identity 는 그대로다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "새 이름"));
  const it = find(KEY)!;
  assert.equal(it.id, `user_spot-${UUID}`);
  assert.equal(it.sourceKey, KEY);
  assert.equal(getItemSourceKey(it), KEY);
});

test("6: 같은 sourceKey 항목이 둘로 늘지 않는다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  for (let i = 0; i < 3; i++) updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), `이름${i}`));
  assert.equal(getCart().filter(i => getItemSourceKey(i) === KEY).length, 1);
  assert.equal(getCart().length, 1);
});

// ── 3 · 4. 좌표 ──────────────────────────────────────────────────────────────

test("3: 좌표를 고치면 This Trip 좌표도 새 좌표가 된다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  assert.equal(find(KEY)!.lat, GAMCHEON.lat);
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID, { lat: YEONGDO.lat, lng: YEONGDO.lng }), "이름"));
  assert.equal(find(KEY)!.lat, YEONGDO.lat);
  assert.equal(find(KEY)!.lng, YEONGDO.lng);
});

test("4: 좌표가 없어지면 예전 좌표가 남지 않는다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID, { lat: undefined, lng: undefined }), "이름"));
  const it = find(KEY)!;
  assert.equal(it.lat, undefined, "예전 좌표가 남았다");
  assert.equal(it.lng, undefined);
  assert.equal("lat" in it, false);
});

test("4: 무효 좌표도 좌표 없음으로 다뤄지고 지어내지 않는다", () => {
  for (const bad of [[NaN, 129], [0, 0], [91, 129], ["35", "129"]]) {
    seed(userSpotToEvent(spotOf(UUID), "이름"));
    updateCartPlace(KEY, userSpotToEvent(spotOf(UUID, { lat: bad[0], lng: bad[1] }), "이름"));
    const it = find(KEY)!;
    assert.equal("lat" in it, false, `${JSON.stringify(bad)} 가 좌표로 들어갔다`);
    assert.ok(it, "장소 자체가 사라졌다");
  }
});

// ── 7 · 8 · 9 · 10. 이번 여행 전용 상태 보존 ──────────────────────────────────

test("7·8: sortOrder 와 addedAt 이 유지된다", () => {
  seed(
    userSpotToEvent(spotOf(OTHER), "다른 장소"),
    userSpotToEvent(spotOf(UUID), "이름"),
  );
  const before = find(KEY)!;
  assert.equal(before.sortOrder, 1);
  const addedAt = before.addedAt;

  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "새 이름"));
  const after = find(KEY)!;
  assert.equal(after.sortOrder, 1, "순서가 바뀌었다");
  assert.equal(after.addedAt, addedAt, "담은 시각이 바뀌었다");
  assert.deepEqual(getCart().map(i => getItemSourceKey(i)),
    [userSpotSourceKey(OTHER), KEY], "목록 순서가 바뀌었다");
});

test("9·10: 고정 시각이 유지된다 — D2 14:00-16:00", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  setCartFixed(KEY, fixed);
  assert.deepEqual(find(KEY)!.fixed, fixed);

  updateCartPlace(KEY, userSpotToEvent(
    spotOf(UUID, { lat: YEONGDO.lat, lng: YEONGDO.lng }), "완전히 다른 이름"));

  const it = find(KEY)!;
  assert.deepEqual(it.fixed, fixed, "약속이 사라지거나 바뀌었다");
  assert.equal(it.fixed!.date, D2);
  assert.equal(it.fixed!.startTime, "14:00");
  assert.equal(it.fixed!.durationMinutes, 120);   // 종료 16:00 의 의미
  assert.equal(it.name, "완전히 다른 이름");
  assert.equal(it.lat, YEONGDO.lat);
});

test("고정이 없던 장소에는 fixed 가 생기지 않는다", () => {
  seed(userSpotToEvent(spotOf(UUID), "이름"));
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "새 이름"));
  assert.equal(find(KEY)!.fixed, undefined);
});

// ── 11 · 12. 삭제 ────────────────────────────────────────────────────────────

test("11: 삭제 성공이면 This Trip 에서도 빠진다", () => {
  seed(userSpotToEvent(spotOf(UUID), "지울 장소"), userSpotToEvent(spotOf(OTHER), "남을 장소"));
  removeFromCart(userSpotSourceKey(UUID));
  assert.equal(find(KEY), undefined);
  assert.ok(find(userSpotSourceKey(OTHER)), "다른 장소까지 사라졌다");
});

test("12: 삭제가 실패하면 This Trip 은 그대로다 — 성공했을 때만 뺀다", () => {
  const picks = readFileSync(
    path.join(process.cwd(), "src", "app", "picks", "PicksClient.tsx"), "utf8");
  assert.match(picks,
    /const ok = await apiDeleteUserSpot\(id\);\s*\n\s*if \(ok\) \{[\s\S]*?removeFromAllCities\(userSpotSourceKey\(id\)\)/,
    "삭제 성공 확인 밖에서 cart 를 건드린다");
});

// ── 13 · 14 · 15. 경계 ───────────────────────────────────────────────────────

test("13: This Trip 에서 빼도 My Places 삭제 API 를 부르지 않는다", () => {
  const picks = readFileSync(
    path.join(process.cwd(), "src", "app", "picks", "PicksClient.tsx"), "utf8");
  // This Trip 카드의 ✕ 는 cart 만 건드린다
  assert.match(picks, /onClick=\{\(\) => removeFromCart\(key\)\}/);
  // 그 자리에서 삭제 API 를 부르지 않는다
  assert.doesNotMatch(picks, /removeFromCart\(key\)[^}]*apiDeleteUserSpot/);
});

test("14: 담기지 않은 장소를 고쳐도 새로 담기지 않는다", () => {
  store.clear();
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "이름"));
  assert.equal(getCart().length, 0, "담지 않은 장소가 생겼다");
});

test("14·15: 다른 장소와 Saved 는 건드리지 않는다", () => {
  const officialKey = "city_spot:1234";
  const official = { ...userSpotToEvent(spotOf("x"), "공식 장소"),
                     id: "1234", sourceKey: officialKey } as EventItem;
  seed(official, userSpotToEvent(spotOf(OTHER), "다른 My Place"), userSpotToEvent(spotOf(UUID), "대상"));

  const beforeOfficial = JSON.stringify(find(officialKey));
  const beforeOther    = JSON.stringify(find(userSpotSourceKey(OTHER)));

  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID), "새 이름"));

  assert.equal(JSON.stringify(find(officialKey)), beforeOfficial, "공식 장소가 바뀌었다");
  assert.equal(JSON.stringify(find(userSpotSourceKey(OTHER))), beforeOther, "다른 My Place 가 바뀌었다");
});

// ── 16. persistence ──────────────────────────────────────────────────────────

test("16: 저장소를 다시 읽어도 최신 정보가 남아 있다", () => {
  seed(userSpotToEvent(spotOf(UUID), "옛 이름"));
  setCartFixed(KEY, { date: D2, startTime: "14:00", durationMinutes: 120 });
  updateCartPlace(KEY, userSpotToEvent(spotOf(UUID, { lat: YEONGDO.lat, lng: YEONGDO.lng }), "새 이름"));

  const raw = JSON.parse(store.get("koreamate_cart")!) as CartItem[];
  const it = raw.find(i => getItemSourceKey(i) === KEY)!;
  assert.equal(it.name, "새 이름");
  assert.equal(it.lat, YEONGDO.lat);
  assert.equal(it.fixed!.startTime, "14:00");
  assert.equal(raw.filter(i => getItemSourceKey(i) === KEY).length, 1);
});

// ── 배선 guard ───────────────────────────────────────────────────────────────

const picksSrc = readFileSync(
  path.join(process.cwd(), "src", "app", "picks", "PicksClient.tsx"), "utf8");

test("수정 성공 후 서버 값으로 This Trip 을 맞춘다 — userSpotToEvent 재사용", () => {
  assert.match(picksSrc, /const fresh = rows\.find\(r => r\.id === syncCartFor\);/);
  assert.match(picksSrc, /updateCartPlace\(\s*\n?\s*userSpotSourceKey\(fresh\.id\),\s*\n?\s*userSpotToEvent\(fresh,/);
  assert.match(picksSrc, /loadMine\(spot\.id\)/, "수정 성공 경로가 동기화를 요청하지 않는다");
});

test("마운트할 때는 맞추지 않는다 — 목록이 비어 오면 담아 둔 장소가 지워진다", () => {
  assert.match(picksSrc, /useEffect\(\(\) => \{ loadMine\(\); \}, \[loadMine\]\);/);
});

test("18: 외부 AI 노출 guard 가 그대로다", () => {
  const page = readFileSync(
    path.join(process.cwd(), "src", "app", "itinerary", "page.tsx"), "utf8");
  assert.match(page,
    /const personalizableHints = cartHints\.filter\(h => !isUserSpotSource\(h\.source_key\)\);/);
  assert.match(page, /selected_places:\s*personalizableHints\.map/);
  const aiCore = readFileSync(
    path.join(process.cwd(), "src", "lib", "scheduler", "ai", "profile-personalization-core.ts"), "utf8");
  assert.doesNotMatch(aiCore, /display_title|display_memo/);
});

test("17: 좌표 보존 계약이 그대로다", () => {
  assert.match(picksSrc, /const hasCoord = isValidCoordinate\(s\.lat, s\.lng\);/);
  const page = readFileSync(
    path.join(process.cwd(), "src", "app", "itinerary", "page.tsx"), "utf8");
  assert.match(page, /\.filter\(item => isSchedulableCoordinate\(item\.lat, item\.lng\)\)/);
});

test("도시별 This Trip 을 만들지 않았다 — cart 자동 삭제 없음", () => {
  assert.doesNotMatch(picksSrc, /city !== |cityChanged|clearCart\(\)\s*;?\s*\/\/.*도시/);
  const home = readFileSync(path.join(process.cwd(), "src", "app", "HomeClient.tsx"), "utf8");
  assert.doesNotMatch(home, /clearCart/, "도시·날짜 변경으로 cart 를 지운다");
});

console.log(`\nthis-trip-sync: ${passed} passed`);

// My Places 의 좌표가 This Trip 을 거쳐 스케줄러까지 살아 가는가,
// 그리고 그렇게 되면서 외부 AI 로 나가는 것이 늘지는 않았는가.
//
// 이 결함은 데이터가 없어서 생긴 것이 아니다. 원본에 좌표가 있는데 변환 코드가
// 그것을 버리고 있었다. 그래서 사용자가 직접 등록한 장소를 This Trip 에 담아도
// 일정에서 통째로 빠졌다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isValidCoordinate } from "../geo.ts";
import { isUserSpotSource, userSpotSourceKey, getItemSourceKey } from "../place-identity.ts";
import { planDayAnchors, mergeDayHints } from "../trip-fixed/anchor-build.ts";
import { runScheduler } from "../scheduler/engine.ts";
import { tripDraftDates } from "../trip-draft/trip-draft-core.ts";
import type { NearMeCandidate } from "../scheduler/types.ts";
import type { CartFixed } from "../cart.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const picksSrc = read("src", "app", "picks", "PicksClient.tsx");
const pageSrc  = read("src", "app", "itinerary", "page.tsx");

const UUID = "3f2a91c4-7b6e-4d1a-9c05-2e8f4b0d6a71";
const GAMCHEON = { lat: 35.0975, lng: 129.0106 };
const YEONGDO  = { lat: 35.0748, lng: 129.0862 };
const D1 = "2026-10-24", D2 = "2026-10-25", D3 = "2026-10-26";

/**
 * PicksClient 의 `userSpotToEvent` 와 같은 규칙.
 *
 * 화면 컴포넌트라 node 로 import 할 수 없어 규칙만 옮겨 두고, 배선 자체는
 * 아래 소스 guard 로 고정한다.
 */
function mapSpot(s: { id: string; lat?: unknown; lng?: unknown; category?: string; city?: string }) {
  const ok = isValidCoordinate(s.lat, s.lng);
  return {
    ...(ok ? { lat: s.lat as number, lng: s.lng as number } : {}),
    id:        `user_spot-${s.id}`,
    sourceKey: `user_spot:${s.id}`,
    type:      s.category || "attraction",
    city:      s.city ?? "",
  };
}

// ── 1 · 6. 좌표 보존과 identity ───────────────────────────────────────────────

test("1: 유효한 좌표는 그대로 옮겨진다", () => {
  const ev = mapSpot({ id: UUID, lat: GAMCHEON.lat, lng: GAMCHEON.lng });
  assert.equal(ev.lat, GAMCHEON.lat);
  assert.equal(ev.lng, GAMCHEON.lng);
});

test("6: id 와 sourceKey 는 예전 그대로다 — 좌표 때문에 새 identity 를 만들지 않는다", () => {
  const ev = mapSpot({ id: UUID, lat: GAMCHEON.lat, lng: GAMCHEON.lng });
  assert.equal(ev.id, `user_spot-${UUID}`);
  assert.equal(ev.sourceKey, userSpotSourceKey(UUID));
  assert.equal(getItemSourceKey(ev), `user_spot:${UUID}`);
  // 좌표가 없어도 identity 는 같다
  assert.equal(mapSpot({ id: UUID }).sourceKey, `user_spot:${UUID}`);
});

test("2: cart 에 저장되는 모양 그대로 직렬화·복원해도 좌표가 남는다", () => {
  const ev = mapSpot({ id: UUID, lat: GAMCHEON.lat, lng: GAMCHEON.lng });
  const back = JSON.parse(JSON.stringify({ ...ev, addedAt: 1, sortOrder: 0 }));
  assert.equal(back.lat, GAMCHEON.lat);
  assert.equal(back.lng, GAMCHEON.lng);
  assert.ok(isValidCoordinate(back.lat, back.lng));
});

// ── 4 · 5. 없거나 잘못된 좌표 ─────────────────────────────────────────────────

test("4: 좌표가 없으면 만들어 내지 않는다", () => {
  const ev = mapSpot({ id: UUID });
  assert.equal("lat" in ev, false, "없는 좌표에 값이 생겼다");
  assert.equal("lng" in ev, false);
});

test("5: 잘못된 좌표는 좌표 없음으로 다룬다", () => {
  const bad: unknown[][] = [
    [NaN, 129], [35, Infinity], ["35", "129"], [null, null],
    [91, 129], [-91, 129], [35, 181], [35, -181], [0, 0],
  ];
  for (const [lat, lng] of bad) {
    const ev = mapSpot({ id: UUID, lat, lng });
    assert.equal("lat" in ev, false, `${JSON.stringify([lat, lng])} 가 통과했다`);
  }
  // 경계값은 살아 있어야 한다
  assert.ok(isValidCoordinate(90, 180));
  assert.ok(isValidCoordinate(-90, -180));
});

test("4: 좌표가 없다고 장소를 지우지 않는다 — 항목은 그대로 남는다", () => {
  const ev = mapSpot({ id: UUID });
  assert.equal(ev.id, `user_spot-${UUID}`);
  assert.ok(ev.type);
});

// ── 3. 스케줄러 진입 ──────────────────────────────────────────────────────────

test("3: 좌표가 있는 My Place 는 좌표 없음으로 걸러지지 않는다", () => {
  const withCoord = mapSpot({ id: UUID, lat: GAMCHEON.lat, lng: GAMCHEON.lng });
  const without   = mapSpot({ id: "no-coord" });
  const cart = [withCoord, without];

  // page.tsx 의 두 갈래와 같은 판정
  const hints   = cart.filter(i => isValidCoordinate((i as { lat?: unknown }).lat, (i as { lng?: unknown }).lng));
  const skipped = cart.filter(i => !isValidCoordinate((i as { lat?: unknown }).lat, (i as { lng?: unknown }).lng));

  assert.deepEqual(hints.map(h => h.id), [`user_spot-${UUID}`]);
  assert.deepEqual(skipped.map(h => h.id), ["user_spot-no-coord"]);
});

test("3: 위도 0 이 좌표 없음으로 오판되지 않는다 — truthy 검사가 아니다", () => {
  assert.ok(isValidCoordinate(0, 129.01), "적도 위 좌표가 버려진다");
  assert.ok(!isValidCoordinate(0, 0), "(0,0) 은 좌표 없음이다");
});

// ── 7 · 8 · 9. fixed 계약과 HC ────────────────────────────────────────────────

const hint = (id: string, c: { lat: number; lng: number }, fixed: CartFixed | null) =>
  ({ place_id: id, lat: c.lat, lng: c.lng, fixed });

test("7: 시각을 지정하지 않은 My Place 는 timed anchor 가 아니다", () => {
  const hints = [hint(`user_spot:${UUID}`, GAMCHEON, null)];
  const plan = planDayAnchors(hints, D2, null, null);
  assert.equal(plan.anchors.length, 0);
  assert.deepEqual(mergeDayHints(hints, plan).map(h => h.place_id), [`user_spot:${UUID}`]);
});

test("8: Date/Start/End 를 넣은 My Place 는 기존 fixed 파이프라인을 그대로 탄다", () => {
  assert.deepEqual(tripDraftDates({ city: "Busan", startDate: D1, endDate: D3, updatedAt: 0 }),
    [D1, D2, D3]);
  const fixed: CartFixed = { date: D2, startTime: "14:00", durationMinutes: 120 };
  const plan = planDayAnchors([hint(`user_spot:${UUID}`, YEONGDO, fixed)], D2, null, null);
  assert.deepEqual(plan.anchors[0], {
    place_id: `user_spot:${UUID}`, start_time: "14:00", end_time: "16:00", is_fixed: true,
  });
});

test("9: HC-8 · HC-9 가 My Place anchor 에도 그대로 적용된다", () => {
  const cands: NearMeCandidate[] = [
    { place_id: `user_spot:${UUID}`, category: "event", coordinate: YEONGDO, zone_id: 3, score: 999 },
    { place_id: "far", category: "attraction", coordinate: { lat: 35.1589, lng: 129.16 }, zone_id: 1, score: 500 },
  ];
  const anchors = [{ place_id: `user_spot:${UUID}`, start_time: "14:00", end_time: "16:00", is_fixed: true as const }];

  const ok = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: YEONGDO, pace: "normal", candidates: cands, anchors,
  });
  assert.ok(ok.success);
  const a = ok.data.items.find(it => it.place_id === `user_spot:${UUID}`);
  assert.equal(a?.start_time, "14:00");

  // HC-8: 13:40 부터 남은 창에서는 40분 거리의 far 를 약속 앞에 넣지 못한다
  const tight = runScheduler({
    trip_date: D2, start_time: "13:40", end_time: "21:00",
    base_coordinate: { lat: 35.1589, lng: 129.16 }, pace: "normal", candidates: cands, anchors,
  });
  assert.ok(tight.success);
  assert.equal(
    tight.data.items.filter(it => it.place_id === "far" && it.start_time < "14:00").length, 0);

  // HC-9: 갈 수 없는 두 약속
  const clash = runScheduler({
    trip_date: D2, start_time: "09:00", end_time: "21:00",
    base_coordinate: YEONGDO, pace: "normal", candidates: cands,
    anchors: [
      { place_id: "far", start_time: "13:00", end_time: "13:50", is_fixed: true },
      ...anchors,
    ],
  });
  assert.ok(!clash.success);
  assert.equal(clash.error.code, "HC-9");
});

// ── 11 ~ 14. 외부 AI 노출 delta = 0 ───────────────────────────────────────────

test("isUserSpotSource 가 개인 장소만 가려낸다", () => {
  assert.ok(isUserSpotSource(`user_spot:${UUID}`));
  assert.ok(!isUserSpotSource("city_spot:1234"));
  assert.ok(!isUserSpotSource("local_info:busan:12"));
  assert.ok(!isUserSpotSource(null));
  assert.ok(!isUserSpotSource(undefined));
});

test("11~14: 개인화 요청은 개인 장소를 뺀 목록으로 만든다", () => {
  assert.match(pageSrc,
    /const personalizableHints = cartHints\.filter\(h => !isUserSpotSource\(h\.source_key\)\);/);
  assert.match(pageSrc, /selected_place_ids: personalizableHints\.map/);
  assert.match(pageSrc, /selected_places:\s*personalizableHints\.map/);
  assert.doesNotMatch(pageSrc, /selected_place_ids: cartHints\.map/, "cart 전체가 그대로 나간다");
  assert.doesNotMatch(pageSrc, /selected_places:\s*cartHints\.map/, "cart 전체가 그대로 나간다");
});

test("11~14: 스케줄러는 개인 장소를 그대로 받는다 — 줄인 것은 외부로 나가는 쪽뿐", () => {
  assert.match(pageSrc, /cart_coord_hints:\s*todayCartHints/, "스케줄러 힌트가 바뀌었다");
  assert.doesNotMatch(pageSrc, /personalizableHints[\s\S]{0,40}cart_coord_hints/,
    "스케줄러가 줄어든 목록을 받는다");
});

test("12·13: display_title / display_memo 가 요청 경로에 없다", () => {
  const aiCore = read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts");
  const client = read("src", "lib", "planner", "personalize-client.ts");
  for (const [n, s] of [["ai-core", aiCore], ["client", client]] as const) {
    assert.doesNotMatch(s, /display_title|display_memo/, `${n} 에 개인 필드가 있다`);
  }
  // page.tsx 는 화면이라 다른 맥락에서 이 이름을 언급할 수 있다. 막아야 하는
  // 것은 **요청 payload** 이므로 그 블록만 본다.
  const call = /fetchPersonalizationProfile\(\{([\s\S]*?)\n  \}\);/.exec(pageSrc)?.[1];
  assert.ok(call, "개인화 요청 블록을 찾지 못했다");
  assert.doesNotMatch(call, /display_title|display_memo/, "요청 payload 에 개인 필드가 있다");
  assert.doesNotMatch(call, /\blat\b|\blng\b|coordinate/, "요청 payload 에 좌표가 있다");
});

test("14: provider 요청 스키마를 넓히지 않았다 — 좌표 필드 0", () => {
  const aiCore = read("src", "lib", "scheduler", "ai", "profile-personalization-core.ts");
  assert.match(aiCore, /export interface PlaceHint \{ place_id: string; name\?: string; category\?: string \}/);
  assert.doesNotMatch(aiCore, /^\s*(lat|lng)\??:/m);
});

// ── 15 · 16. 공유 계약 ────────────────────────────────────────────────────────

test("15: My Places 공유·CRUD 를 막지 않았다", () => {
  assert.match(picksSrc, /apiCreateUserSpot|apiUpdateUserSpot|apiDeleteUserSpot/);
  assert.match(picksSrc, /addToSelected\(ev, "mine"\)/, "This Trip 담기가 사라졌다");
});

test("16: 공개 공유에 raw 좌표를 새로 노출하지 않았다", () => {
  // 이번 변경은 cart(로컬)과 개인화 payload 만 건드렸다.
  assert.doesNotMatch(pageSrc, /public[\s\S]{0,60}\blat\b\s*:/i);
});

// ── 17 · 18. 문구와 배선 ──────────────────────────────────────────────────────

test("17: skipped 안내의 하드코딩 영문이 사라졌다", () => {
  assert.doesNotMatch(pageSrc, /Some selected places could not be scheduled/);
  assert.doesNotMatch(pageSrc, /These places are still saved in your cart/);
  assert.match(pageSrc, /\{t\("skippedTitle"\)\}/);
  assert.match(pageSrc, /\{t\("skippedNote"\)\}/);
});

test("18: 네 언어가 같은 키를 갖는다", () => {
  const locs = ["en", "ko", "ja", "zh"] as const;
  for (const l of locs) {
    const o = JSON.parse(read("src", "messages", `${l}.json`)) as { itin: Record<string, string> };
    for (const k of ["skippedTitle", "skippedNote"]) {
      assert.ok(typeof o.itin[k] === "string" && o.itin[k].trim().length > 0, `${l}.itin.${k} 없음`);
    }
  }
  // 영어 문구를 다른 언어에 복사해 두지 않았는지
  const en = JSON.parse(read("src", "messages", "en.json")) as { itin: Record<string, string> };
  const ko = JSON.parse(read("src", "messages", "ko.json")) as { itin: Record<string, string> };
  assert.notEqual(ko.itin.skippedTitle, en.itin.skippedTitle);
});

test("PicksClient: mapper 가 좌표를 유효할 때만 넘긴다", () => {
  assert.match(picksSrc, /const hasCoord = isValidCoordinate\(s\.lat, s\.lng\);/);
  assert.match(picksSrc, /\.\.\.\(hasCoord \? \{ lat: s\.lat, lng: s\.lng \} : \{\}\)/);
});

test("itinerary: 좌표 판정이 truthy 가 아니라 유효성이다", () => {
  assert.doesNotMatch(pageSrc, /!item\.lat \|\| !item\.lng/, "truthy 판정이 남았다");
  assert.match(pageSrc, /\.filter\(item => isValidCoordinate\(item\.lat, item\.lng\)\)/);
  assert.match(pageSrc, /\.filter\(item => !isValidCoordinate\(item\.lat, item\.lng\)\)/);
});

console.log(`\ncoordinate-preservation: ${passed} passed`);

// commerce-surfaces 단위 테스트
// 실행: node --experimental-strip-types src/config/commerce-surfaces.test.ts
//
// 검증 핵심 두 가지
//   1. 게이트 기본값이 안전한 쪽인가 — 모르면 끈다
//   2. 상업 키가 일정 경로 데이터에서 완전히 사라지는가

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRIP_FLOW_COMMERCE_ENABLED,
  POST_PLAN_COMMERCE_ENABLED,
  isEditorialAffiliateEnabled,
  isCommerceAllowedOnSurface,
  stripTripCommerceKeys,
  findTripCommerceKeys,
  FORBIDDEN_TRIP_COMMERCE_KEYS,
} from "./commerce-surfaces.ts";

// ── 1. 게이트 기본값 ─────────────────────────────────────────────────────────

test("Trip-Flow 게이트 기본값은 false", () => {
  assert.equal(TRIP_FLOW_COMMERCE_ENABLED, false);
});

test("Post-Plan 게이트 기본값은 false", () => {
  assert.equal(POST_PLAN_COMMERCE_ENABLED, false);
});

// ── 2. Editorial allowlist ───────────────────────────────────────────────────

test("승인된 표면만 true — city-landing · blog", () => {
  assert.equal(isEditorialAffiliateEnabled("city-landing"), true);
  assert.equal(isEditorialAffiliateEnabled("blog"), true);
});

test("survival-guide 는 미승인 — 가시 고지 부족", () => {
  assert.equal(isEditorialAffiliateEnabled("survival-guide"), false);
});

test("shared-itinerary 는 Editorial 이 아니다", () => {
  assert.equal(isEditorialAffiliateEnabled("shared-itinerary"), false);
});

test("미분류 신규 표면은 false", () => {
  for (const s of ["explore", "place-detail", "home", "new-page", "itinerary"]) {
    assert.equal(isEditorialAffiliateEnabled(s), false, `${s} 가 통과했다`);
  }
});

test("오타·undefined·null·비문자열은 전부 false", () => {
  for (const v of ["City-Landing", "city landing", "citylanding", " blog", "blog ",
                   undefined, null, 0, 1, true, {}, [], NaN]) {
    assert.equal(isEditorialAffiliateEnabled(v), false, `${String(v)} 가 통과했다`);
  }
});

test("빈 문자열도 false", () => {
  assert.equal(isEditorialAffiliateEnabled(""), false);
});

// ── 3. 표면 판정 통합 ────────────────────────────────────────────────────────

test("shared-itinerary 는 Trip-Flow 게이트를 따른다", () => {
  assert.equal(isCommerceAllowedOnSurface("shared-itinerary"), TRIP_FLOW_COMMERCE_ENABLED);
  assert.equal(isCommerceAllowedOnSurface("shared-itinerary"), false);
});

test("city-landing · blog 는 Editorial 판정을 따른다", () => {
  assert.equal(isCommerceAllowedOnSurface("city-landing"), true);
  assert.equal(isCommerceAllowedOnSurface("blog"), true);
});

// ── 4. 상업 키 제거 ──────────────────────────────────────────────────────────

const LEGACY_CART_ITEM = {
  id: "local-16",
  name: "Gwangalli Beach",
  city: "busan",
  lat: 35.1532,
  lng: 129.1186,
  recommendedDurationMinutes: 120,
  tags: ["beach", "night"],
  addedAt: 1750000000000,
  sortOrder: 0,
  userNote: "친구가 추천한 곳",
  commerce: {
    affiliateType: "booking",
    hasAffiliate: true,
    affiliatePartner: "PartnerX",
    affiliateUrl: "https://aff.example/SECRET",
    hasMerchandise: false,
    hasTicketing: true,
    bookingUrl: "https://book.example/DEEP",
  },
};

test("legacy Cart 항목에서 상업 키를 전부 제거한다", () => {
  const clean = stripTripCommerceKeys(LEGACY_CART_ITEM);
  assert.deepEqual(findTripCommerceKeys(clean), []);
  const s = JSON.stringify(clean);
  assert.ok(!s.includes("SECRET"));
  assert.ok(!s.includes("PartnerX"));
  assert.ok(!s.includes("DEEP"));
});

test("정리 후 사용자 데이터는 그대로 보존된다", () => {
  const c = stripTripCommerceKeys(LEGACY_CART_ITEM) as typeof LEGACY_CART_ITEM;
  assert.equal(c.id, "local-16");
  assert.equal(c.name, "Gwangalli Beach");
  assert.equal(c.lat, 35.1532);
  assert.equal(c.recommendedDurationMinutes, 120);
  assert.deepEqual(c.tags, ["beach", "night"]);
  assert.equal(c.addedAt, 1750000000000);
  assert.equal(c.sortOrder, 0);
  assert.equal(c.userNote, "친구가 추천한 곳");
});

test("배열과 중첩 객체 안쪽까지 재귀 제거한다", () => {
  const nested = {
    days: [
      { places: [{ id: "a", affiliate_url: "https://a/X1" }] },
      { places: [{ id: "b", deep: { booking_url: "https://b/X2" } }] },
    ],
  };
  const clean = stripTripCommerceKeys(nested);
  assert.deepEqual(findTripCommerceKeys(clean), []);
  const s = JSON.stringify(clean);
  assert.ok(!s.includes("X1"));
  assert.ok(!s.includes("X2"));
  assert.equal((clean.days[0].places[0] as { id: string }).id, "a");
});

test("정리는 idempotent — 두 번 돌려도 결과가 같다", () => {
  const once = stripTripCommerceKeys(LEGACY_CART_ITEM);
  const twice = stripTripCommerceKeys(once);
  assert.deepEqual(twice, once);
});

test("이미 깨끗한 객체는 findTripCommerceKeys 가 빈 배열을 준다 — 재저장 불필요 판정", () => {
  const clean = { id: "local-1", name: "X", lat: 1, lng: 2, addedAt: 1, sortOrder: 0 };
  assert.deepEqual(findTripCommerceKeys(clean), []);
  assert.deepEqual(stripTripCommerceKeys(clean), clean);
});

test("순환 참조에서 멈춘다", () => {
  const a: Record<string, unknown> = { id: "x" };
  a.self = a;
  assert.deepEqual(findTripCommerceKeys(a), []);
});

test("금지 키 목록이 실제로 제거된다 — 전수", () => {
  const obj: Record<string, unknown> = { keep: "yes" };
  for (const k of FORBIDDEN_TRIP_COMMERCE_KEYS) obj[k] = "REMOVE_ME";
  const clean = stripTripCommerceKeys(obj) as Record<string, unknown>;
  assert.equal(clean.keep, "yes");
  assert.equal(Object.keys(clean).length, 1);
  assert.ok(!JSON.stringify(clean).includes("REMOVE_ME"));
});

test("넓은 키 offer 단독은 금지 목록에 없다 — 오탐 방지", () => {
  assert.ok(!FORBIDDEN_TRIP_COMMERCE_KEYS.includes("offer"));
  const kept = stripTripCommerceKeys({ offer: "일반 데이터", offerId: "X" }) as Record<string, unknown>;
  assert.equal(kept.offer, "일반 데이터");
  assert.ok(!("offerId" in kept));
});

test("원시값·null 은 그대로 반환한다", () => {
  assert.equal(stripTripCommerceKeys(null), null);
  assert.equal(stripTripCommerceKeys(42), 42);
  assert.equal(stripTripCommerceKeys("x"), "x");
  assert.deepEqual(findTripCommerceKeys(null), []);
  assert.deepEqual(findTripCommerceKeys("commerce"), []);
});

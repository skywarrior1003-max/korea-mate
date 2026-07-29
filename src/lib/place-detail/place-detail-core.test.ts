// place-detail-core 단위 테스트
// 실행: node --experimental-strip-types src/lib/place-detail/place-detail-core.test.ts
//
// 검증 대상은 "없는 값을 만들어내지 않는가" 와 "상업 문맥이 일정 입력에
// 섞이지 않는가" 두 가지다. 나머지는 그 파생이다.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickLocalized,
  resolvePlaceText,
  resolveOneLiner,
  resolveProvenance,
  resolveMapLinks,
  toItineraryEvent,
  hasCommercialContext,
  placeEventId,
  placeSchemaType,
  placeUrl,
  buildPlaceJsonLd,
  buildBreadcrumbJsonLd,
  buildShareContent,
  toPlaceView,
  PROVENANCE_MESSAGE_KEY,
} from "./place-detail-core.ts";
import type { CitySpotRow } from "@/lib/city-spots";

// ── 픽스처 ───────────────────────────────────────────────────────────────────

function spot(over: Partial<CitySpotRow> = {}): CitySpotRow {
  return {
    id: 1, city: "busan", name: "Haeundae Beach", name_l10n: null,
    category: "attraction", subcategory: null, district: "Haeundae-gu",
    address: "264 Haeundae-ro", description: "A famous beach. Very popular.",
    desc_l10n: null, why_it_matters: null, why_l10n: null,
    image_url: "https://example.com/a.jpg", map_url: null, naver_map_url: null,
    lat: 35.1587, lng: 129.1604, duration_minutes: 90, best_time_slot: "afternoon",
    opening_hours: null, tags: ["beach"], solo_friendly: true,
    foreign_card_accepted: true, cash_only: false, source_type: "manual",
    external_id: null, rating: null, official_url: null,
    affiliate_url: null, affiliate_provider: null, entry_fee: null, difficulty: null,
    created_at: "2026-01-01", updated_at: "2026-01-01",
    ...over,
  } as CitySpotRow;
}

// ── 0. 클라이언트 전달 projection ────────────────────────────────────────────

test("PlaceView: 상업 필드가 클라이언트로 나가지 않는다", () => {
  const v = toPlaceView(spot({ affiliate_url: "https://aff.example/SECRET", affiliate_provider: "PartnerX" }));
  assert.ok(!("affiliate_url" in v));
  assert.ok(!("affiliate_provider" in v));
  const s = JSON.stringify(v);
  assert.ok(!s.includes("SECRET"));
  assert.ok(!s.includes("PartnerX"));
});

test("PlaceView: 화면에 안 쓰는 내부 필드도 빠진다", () => {
  const v = toPlaceView(spot({ rating: 4.5 }));
  for (const k of ["rating", "difficulty", "created_at", "updated_at"]) {
    assert.ok(!(k in v), `${k} 가 남아 있다`);
  }
});

test("PlaceView: 화면이 쓰는 필드는 전부 남는다", () => {
  const v = toPlaceView(spot());
  for (const k of ["id", "city", "name", "name_l10n", "category", "subcategory", "district",
                   "address", "description", "desc_l10n", "why_it_matters", "why_l10n",
                   "image_url", "map_url", "naver_map_url", "lat", "lng", "duration_minutes",
                   "best_time_slot", "opening_hours", "tags", "solo_friendly",
                   "foreign_card_accepted", "cash_only", "source_type", "external_id",
                   "official_url", "entry_fee"]) {
    assert.ok(k in v, `${k} 가 빠졌다`);
  }
});

test("PlaceView: 허용 목록 방식이라 새 컬럼이 자동으로 새 나가지 않는다", () => {
  const withNewCol = { ...spot(), some_future_secret_column: "LEAK" } as unknown as CitySpotRow;
  const v = toPlaceView(withNewCol);
  assert.ok(!JSON.stringify(v).includes("LEAK"));
});

// ── 1. locale fallback ───────────────────────────────────────────────────────

test("pickLocalized: locale 값이 있으면 그것을 쓴다", () => {
  assert.equal(pickLocalized({ ja: "海雲台" }, "ja", "Haeundae"), "海雲台");
});

test("pickLocalized: l10n 객체가 null 이면 fallback", () => {
  assert.equal(pickLocalized(null, "ja", "Haeundae"), "Haeundae");
});

test("pickLocalized: locale 키가 없으면 fallback", () => {
  assert.equal(pickLocalized({ ko: "해운대" }, "ja", "Haeundae"), "Haeundae");
});

test("pickLocalized: 빈 문자열은 없는 것으로 본다", () => {
  assert.equal(pickLocalized({ ja: "" }, "ja", "Haeundae"), "Haeundae");
});

test("pickLocalized: 공백만인 값은 없는 것으로 본다", () => {
  assert.equal(pickLocalized({ ja: "   " }, "ja", "Haeundae"), "Haeundae");
});

test("pickLocalized: 미지원 locale 도 fallback 으로 안전하게 떨어진다", () => {
  assert.equal(pickLocalized({ ja: "海雲台" }, "de", "Haeundae"), "Haeundae");
});

test("pickLocalized: fallback 까지 없으면 null", () => {
  assert.equal(pickLocalized(null, "en", null), null);
  assert.equal(pickLocalized(null, "en", "  "), null);
});

test("pickLocalized: 배열은 l10n 객체로 취급하지 않는다", () => {
  assert.equal(pickLocalized(["x"], "0", "Haeundae"), "Haeundae");
});

test("pickLocalized: 앞뒤 공백을 제거한다", () => {
  assert.equal(pickLocalized({ ja: "  海雲台  " }, "ja", null), "海雲台");
});

test("resolvePlaceText: l10n 전부 NULL 이어도 영어가 회귀하지 않는다", () => {
  const t = resolvePlaceText(spot(), "ja");
  assert.equal(t.name, "Haeundae Beach");
  assert.equal(t.description, "A famous beach. Very popular.");
  assert.equal(t.whyItMatters, null);
});

test("resolvePlaceText: l10n 이 채워지면 locale 값을 쓴다", () => {
  const t = resolvePlaceText(
    spot({ name_l10n: { ja: "海雲台ビーチ" } as never, desc_l10n: { ja: "有名なビーチ" } as never }),
    "ja",
  );
  assert.equal(t.name, "海雲台ビーチ");
  assert.equal(t.description, "有名なビーチ");
});

// ── 2. 한 줄 소개 ────────────────────────────────────────────────────────────

test("resolveOneLiner: why_it_matters 를 우선한다", () => {
  const t = { name: "x", description: "Long text.", whyItMatters: "The reason." };
  assert.equal(resolveOneLiner(t), "The reason.");
});

test("resolveOneLiner: why 가 없으면 설명 첫 문장", () => {
  const t = { name: "x", description: "A famous beach. Very popular.", whyItMatters: null };
  assert.equal(resolveOneLiner(t), "A famous beach.");
});

test("resolveOneLiner: 마침표가 없으면 설명 전체", () => {
  const t = { name: "x", description: "No period here", whyItMatters: null };
  assert.equal(resolveOneLiner(t), "No period here");
});

test("resolveOneLiner: 둘 다 없으면 null (빈 셸 금지)", () => {
  assert.equal(resolveOneLiner({ name: "x", description: null, whyItMatters: null }), null);
});

// ── 3. provenance 분류 ───────────────────────────────────────────────────────

test("provenance: manual 은 curated — 공식 기관 정보로 표시하지 않는다", () => {
  assert.equal(resolveProvenance(spot({ source_type: "manual" })), "curated");
});

test("provenance: tourapi + external_id 는 official", () => {
  assert.equal(resolveProvenance(spot({ source_type: "tourapi", external_id: "12345" })), "official");
});

test("provenance: tourapi 인데 external_id 가 없으면 추측하지 않고 catalog", () => {
  assert.equal(resolveProvenance(spot({ source_type: "tourapi", external_id: null })), "catalog");
});

test("provenance: user 는 승인을 거친 community 제보", () => {
  assert.equal(resolveProvenance(spot({ source_type: "user", external_id: "uuid" })), "community");
});

test("provenance: 분류 불가 값은 catalog 로 fallback", () => {
  assert.equal(resolveProvenance(spot({ source_type: "google" as never })), "catalog");
});

test("provenance: official_url 도메인만으로 official 이 되지 않는다", () => {
  const s = spot({ source_type: "manual", official_url: "https://visitbusan.net/x" });
  assert.equal(resolveProvenance(s), "curated");
});

test("provenance: 4종 전부 메시지 키를 가진다", () => {
  for (const k of ["official", "curated", "community", "catalog"] as const) {
    assert.equal(typeof PROVENANCE_MESSAGE_KEY[k], "string");
    assert.ok(PROVENANCE_MESSAGE_KEY[k].length > 0);
  }
});

// ── 4. 지도 링크 (Naver 우선) ────────────────────────────────────────────────

test("지도: 검증된 naver exact URL 을 최우선으로 쓴다", () => {
  const m = resolveMapLinks(spot({ naver_map_url: "https://naver.me/abc" }), "Haeundae Beach");
  assert.equal(m.naver, "https://naver.me/abc");
});

test("지도: naver exact 가 없으면 이름+주소 검색 URL 을 만든다", () => {
  const m = resolveMapLinks(spot(), "Haeundae Beach");
  assert.ok(m.naver?.startsWith("https://map.naver.com/p/search/"));
  assert.ok(m.naver?.includes(encodeURIComponent("Haeundae Beach 264 Haeundae-ro")));
});

test("지도: google exact URL 이 있으면 그것을 쓴다", () => {
  const m = resolveMapLinks(spot({ map_url: "https://maps.app.goo.gl/x" }), "Haeundae Beach");
  assert.equal(m.google, "https://maps.app.goo.gl/x");
});

test("지도: 이름이 없고 좌표만 있으면 좌표 검색으로 떨어진다", () => {
  const m = resolveMapLinks(
    spot({ name: "", address: null, lat: 35.1, lng: 129.1 }) as CitySpotRow,
    null,
  );
  assert.equal(m.naver, null);
  assert.ok(m.google?.includes("35.1,129.1"));
});

test("지도: 이름·주소·좌표가 전부 없으면 둘 다 null (버튼 미표시)", () => {
  const m = resolveMapLinks(
    spot({ name: "", address: null, lat: null, lng: null }) as CitySpotRow,
    null,
  );
  assert.equal(m.naver, null);
  assert.equal(m.google, null);
});

// ── 5. 일정 입력 어댑터 — 상업 문맥 차단 ─────────────────────────────────────

test("일정 어댑터: commerce 가 전부 비어 있다", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/x", affiliate_provider: "PartnerX" }));
  assert.equal(e.commerce.affiliateUrl, null);
  assert.equal(e.commerce.affiliatePartner, null);
  assert.equal(e.commerce.affiliateType, null);
  assert.equal(e.commerce.bookingUrl, null);
  assert.equal(e.commerce.hasAffiliate, false);
  assert.equal(e.commerce.hasTicketing, false);
  assert.equal(e.commerce.hasMerchandise, false);
});

test("일정 어댑터: hasCommercialContext 가 false", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/x", affiliate_provider: "PartnerX" }));
  assert.equal(hasCommercialContext(e), false);
});

test("일정 어댑터: 직렬화 결과 문자열에 affiliate 흔적이 없다", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/SECRET", affiliate_provider: "PartnerX" }));
  const s = JSON.stringify(e);
  assert.ok(!s.includes("SECRET"));
  assert.ok(!s.includes("PartnerX"));
  assert.ok(!s.includes("aff.example"));
});

test("일정 어댑터: 일정 편성에 필요한 필드는 유지된다", () => {
  const e = toItineraryEvent(spot());
  assert.equal(e.id, "local-1");
  assert.equal(e.name, "Haeundae Beach");
  assert.equal(e.city, "busan");
  assert.equal(e.lat, 35.1587);
  assert.equal(e.lng, 129.1604);
  assert.equal(e.recommendedDurationMinutes, 90);
  assert.equal(e.bestTimeSlot, "afternoon");
  assert.equal(e.district, "Haeundae-gu");
});

test("일정 어댑터: 확인되지 않은 편의 정보를 참으로 만들지 않는다", () => {
  const e = toItineraryEvent(spot());
  assert.equal(e.englishMenu, false);
  assert.equal(e.barrierFree, false);
  assert.equal(e.isTrending, false);
});

test("일정 어댑터: locale 텍스트가 있으면 그 이름을 쓴다", () => {
  const t = resolvePlaceText(spot({ name_l10n: { ja: "海雲台ビーチ" } as never }), "ja");
  const e = toItineraryEvent(spot({ name_l10n: { ja: "海雲台ビーチ" } as never }), t);
  assert.equal(e.name, "海雲台ビーチ");
  assert.equal(e.shortName, "海雲台ビーチ");
});

test("일정 어댑터: id 는 Saved·Explore 와 같은 체계여서 중복 추가가 감지된다", () => {
  assert.equal(placeEventId(7), "local-7");
  assert.equal(toItineraryEvent(spot({ id: 7 })).id, placeEventId(7));
});

test("hasCommercialContext: 상업 값이 있으면 true 로 잡아낸다", () => {
  const e = toItineraryEvent(spot());
  e.commerce.affiliateUrl = "https://aff.example/x";
  assert.equal(hasCommercialContext(e), true);
});

// ── 6. JSON-LD ───────────────────────────────────────────────────────────────

test("schema type: restaurant → Restaurant", () => {
  assert.equal(placeSchemaType("restaurant"), "Restaurant");
});

test("schema type: attraction·nature → TouristAttraction", () => {
  assert.equal(placeSchemaType("attraction"), "TouristAttraction");
  assert.equal(placeSchemaType("nature"), "TouristAttraction");
});

test("schema type: 애매한 category → Place", () => {
  assert.equal(placeSchemaType("event"), "Place");
  assert.equal(placeSchemaType("accommodation"), "Place");
  assert.equal(placeSchemaType("unknown-thing"), "Place");
});

test("JSON-LD: 이름이 없으면 만들지 않는다", () => {
  const s = spot({ name: "" }) as CitySpotRow;
  assert.equal(buildPlaceJsonLd(s, { name: null, description: null, whyItMatters: null }), null);
});

test("JSON-LD: 없는 필드를 생성하지 않는다", () => {
  const s = spot({ address: null, district: null, lat: null, lng: null, image_url: null, official_url: null, description: null });
  const ld = buildPlaceJsonLd(s, resolvePlaceText(s, "en"))!;
  assert.ok(!("address" in ld));
  assert.ok(!("geo" in ld));
  assert.ok(!("image" in ld));
  assert.ok(!("sameAs" in ld));
  assert.ok(!("description" in ld));
});

test("JSON-LD: 평점·리뷰수·가격대를 절대 만들지 않는다", () => {
  const ld = buildPlaceJsonLd(spot({ rating: 4.5 }), resolvePlaceText(spot({ rating: 4.5 }), "en"))!;
  const s = JSON.stringify(ld);
  assert.ok(!s.includes("aggregateRating"));
  assert.ok(!s.includes("reviewCount"));
  assert.ok(!s.includes("priceRange"));
  assert.ok(!s.includes("4.5"));
});

test("JSON-LD: url 이 canonical 과 일치한다", () => {
  const ld = buildPlaceJsonLd(spot({ id: 42 }), resolvePlaceText(spot({ id: 42 }), "en"))!;
  assert.equal(ld.url, placeUrl(42));
  assert.equal(ld.url, "https://gokoreamate.com/place/42/");
});

test("JSON-LD: 있는 값은 정확히 반영한다", () => {
  const ld = buildPlaceJsonLd(spot(), resolvePlaceText(spot(), "en"))!;
  assert.equal(ld["@type"], "TouristAttraction");
  assert.equal(ld.name, "Haeundae Beach");
  assert.deepEqual(ld.geo, { "@type": "GeoCoordinates", latitude: 35.1587, longitude: 129.1604 });
  const addr = ld.address as Record<string, unknown>;
  assert.equal(addr.addressCountry, "KR");
  assert.equal(addr.streetAddress, "264 Haeundae-ro");
});

test("Breadcrumb: 3단계이며 마지막이 canonical", () => {
  const b = buildBreadcrumbJsonLd(spot(), "Haeundae Beach");
  const items = b.itemListElement as Record<string, unknown>[];
  assert.equal(items.length, 3);
  assert.equal(items[0].position, 1);
  assert.equal(items[2].item, "https://gokoreamate.com/place/1/");
  assert.equal(items[1].item, "https://gokoreamate.com/explore/busan/");
});

// ── 7. 공유 ──────────────────────────────────────────────────────────────────

test("공유: url 이 canonical 과 같다", () => {
  assert.equal(buildShareContent(spot({ id: 9 }), "Haeundae Beach").url, "https://gokoreamate.com/place/9/");
});

test("공유: affiliate URL 이나 개인 데이터가 들어가지 않는다", () => {
  const c = buildShareContent(spot({ affiliate_url: "https://aff.example/SECRET" }), "Haeundae Beach");
  const s = JSON.stringify(c);
  assert.ok(!s.includes("SECRET"));
  assert.ok(!s.includes("aff.example"));
  assert.ok(!s.includes("device"));
});

test("공유: locale 이름이 있으면 그것을 쓴다", () => {
  assert.ok(buildShareContent(spot(), "海雲台ビーチ").title.includes("海雲台ビーチ"));
});

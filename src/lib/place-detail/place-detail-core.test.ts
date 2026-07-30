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
  isInternalMemo,
  resolvePublicPlaceSummary,
  firstPublicText,
  resolveDisplayImage,
  resolvePublicMetadataImage,
  stripCommercialKeys,
  findCommercialKeys,
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

test("일정 어댑터: commerce 키를 만들지 않는다 (null 로 채우지 않는다)", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/x", affiliate_provider: "PartnerX" }));
  assert.equal(e.commerce, undefined);
  assert.ok(!Object.keys(e).includes("commerce"));
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

test("hasCommercialContext: 상업 키가 다시 생기면 true 로 잡아낸다", () => {
  const e = toItineraryEvent(spot()) as unknown as Record<string, unknown>;
  e.commerce = { affiliateUrl: "https://aff.example/x" };
  assert.equal(hasCommercialContext(e as never), true);
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
  // image 는 항상 존재한다 — 죽은 원격 URL 대신 우리가 만든 OG 이미지로 떨어진다.
  // 크롤러에는 onError fallback 이 없으므로 "생략" 보다 "안전한 대체" 가 옳다.
  assert.equal(ld.image, "https://gokoreamate.com/og/busan/opengraph-image");
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

// ── 8. 내부 운영 메모 차단 ───────────────────────────────────────────────────

const REAL_MEMOS = [
  "High value nightlife and accommodation zone for affiliate traffic",
  "High food tour and local experience affiliate value",
  "Paid observatory plus Nampo hotel and tour conversion potential",
  "Essential Busan nature landmark with tour bus and cruise upsell potential",
  "Top nightlife and taxi tour conversion spot near Seomyeon and Gwangalli",
  "One of Busan's best paid attraction products for affiliate conversion",
  "Best commercial base for hotel nightlife and restaurant affiliate funnels",
  "Premium accommodation affiliate anchor for high value travelers",
  "Strategic route for accommodation shopping and family travel monetization",
  "Completes the Songdo paid attraction funnel after cable car purchase",
];

test("내부 메모: 운영 DB 실측 19건 패턴을 전부 탐지한다", () => {
  for (const m of REAL_MEMOS) assert.equal(isInternalMemo(m), true, `놓침: ${m}`);
});

test("내부 메모: 정상 장소 설명을 오탐하지 않는다", () => {
  const safe = [
    "A lively beach facing Gwangan Bridge with cafes bars and night scenery",
    "Busan's landmark seafood market near Nampo and BIFF Square",
    "A high rise observatory inside LCT with wide views of Haeundae and the sea",
    "Paid entry required for the observatory deck",
    "A cable car crossing the sea between Songdo Beach and Amnam Park",
    "The main rail gateway to Busan and a practical itinerary starting point",
  ];
  for (const s of safe) assert.equal(isInternalMemo(s), false, `오탐: ${s}`);
});

test("내부 메모: paid 단독으로는 차단하지 않는다", () => {
  assert.equal(isInternalMemo("Paid observatory with city views"), false);
});

test("공개 요약: 안전한 why_it_matters 는 그대로 통과", () => {
  const t = { name: "x", description: "Desc.", whyItMatters: "A quiet coastal walk." };
  assert.equal(resolvePublicPlaceSummary(t), "A quiet coastal walk.");
});

test("공개 요약: 내부 메모면 description 첫 문장으로 fallback", () => {
  const t = {
    name: "x",
    description: "A lively beach facing Gwangan Bridge. More text here.",
    whyItMatters: "High value nightlife and accommodation zone for affiliate traffic",
  };
  assert.equal(resolvePublicPlaceSummary(t), "A lively beach facing Gwangan Bridge.");
});

test("공개 요약: 내부 메모 + description 없음 → null (생략)", () => {
  const t = { name: "x", description: null, whyItMatters: "Strong affiliate conversion value" };
  assert.equal(resolvePublicPlaceSummary(t), null);
});

test("공개 요약: description 도 내부 메모면 null", () => {
  const t = { name: "x", description: "Best commercial base for affiliate funnels", whyItMatters: null };
  assert.equal(resolvePublicPlaceSummary(t), null);
});

test("공개 요약: 사실을 지어내지 않는다 — 없으면 없다", () => {
  assert.equal(resolvePublicPlaceSummary({ name: "x", description: null, whyItMatters: null }), null);
});

// ── 9. metadata 이미지 ───────────────────────────────────────────────────────

test("이미지: 죽은 source.unsplash.com 은 화면에서도 시도하지 않는다", () => {
  assert.equal(resolveDisplayImage("https://source.unsplash.com/featured/?busan"), null);
});

test("이미지: 살아있는 images.unsplash.com 은 사용한다", () => {
  const u = "https://images.unsplash.com/photo-1507525428034?w=600";
  assert.equal(resolveDisplayImage(u), u);
});

test("이미지: NULL·빈 문자열은 null", () => {
  assert.equal(resolveDisplayImage(null), null);
  assert.equal(resolveDisplayImage("   "), null);
});

test("metadata 이미지: 죽은 호스트면 도시 OG 로 떨어진다", () => {
  const r = resolvePublicMetadataImage("busan", "https://source.unsplash.com/x");
  assert.equal(r, "https://gokoreamate.com/og/busan/opengraph-image");
});

test("metadata 이미지: 도시 OG 가 없으면 사이트 OG", () => {
  const r = resolvePublicMetadataImage("daegu", "https://source.unsplash.com/x");
  assert.equal(r, "https://gokoreamate.com/opengraph-image");
});

test("metadata 이미지: 항상 절대 URL", () => {
  for (const c of ["busan", "seoul", "jeju", "gyeongju", "daegu", ""]) {
    assert.ok(resolvePublicMetadataImage(c, null).startsWith("https://gokoreamate.com/"));
  }
});

test("metadata 이미지: 살아있는 원격 URL 은 그대로 쓴다", () => {
  const u = "https://images.unsplash.com/photo-1?w=600";
  assert.equal(resolvePublicMetadataImage("busan", u), u);
});

test("metadata 이미지: 죽은 URL 이 결과에 절대 포함되지 않는다", () => {
  for (const c of ["busan", "seoul", "daegu"]) {
    assert.ok(!resolvePublicMetadataImage(c, "https://source.unsplash.com/x").includes("source.unsplash.com"));
  }
});

// ── 10. Cart 상업 키 완전 제거 ───────────────────────────────────────────────

test("Cart: 반환 객체에 commerce 키 자체가 없다", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/x", affiliate_provider: "P" }));
  assert.ok(!("commerce" in e));
});

test("Cart: 재귀 key 검사에서 금지 키 0건", () => {
  const e = toItineraryEvent(spot({ affiliate_url: "https://aff.example/x", affiliate_provider: "P" }));
  assert.deepEqual(findCommercialKeys(e), []);
});

test("Cart: JSON.stringify 결과에 금지 키 문자열이 없다", () => {
  const s = JSON.stringify(toItineraryEvent(spot({ affiliate_url: "https://a/x", affiliate_provider: "P" })));
  for (const k of ["commerce", "affiliateUrl", "affiliatePartner", "bookingUrl",
                   "hasAffiliate", "hasTicketing", "affiliate_url", "booking_url"]) {
    assert.ok(!s.includes(k), `${k} 가 남아 있다`);
  }
});

test("Cart: 기존 상업 키를 가진 항목도 저장 직전 projection 으로 제거된다", () => {
  const legacy = {
    id: "local-9", name: "X", lat: 1, lng: 2,
    commerce: { hasAffiliate: true, affiliateUrl: "https://a/SECRET", affiliatePartner: "P",
                affiliateType: "booking", bookingUrl: "https://b/x",
                hasTicketing: true, hasMerchandise: false },
    nested: { deep: { affiliate_url: "https://a/DEEP" } },
  };
  const clean = stripCommercialKeys(legacy);
  assert.deepEqual(findCommercialKeys(clean), []);
  const s = JSON.stringify(clean);
  assert.ok(!s.includes("SECRET"));
  assert.ok(!s.includes("DEEP"));
  assert.equal((clean as typeof legacy).id, "local-9");
  assert.equal((clean as typeof legacy).lat, 1);
});

test("Cart: projection 이 비상업 필드를 보존한다", () => {
  const clean = stripCommercialKeys(toItineraryEvent(spot()));
  assert.equal(clean.id, "local-1");
  assert.equal(clean.name, "Haeundae Beach");
  assert.equal(clean.city, "busan");
  assert.equal(clean.lat, 35.1587);
  assert.equal(clean.lng, 129.1604);
  assert.equal(clean.recommendedDurationMinutes, 90);
  assert.equal(clean.type, "attraction");
});

test("Cart: findCommercialKeys 가 순환 참조에서 멈춘다", () => {
  const a: Record<string, unknown> = { id: "x" };
  a.self = a;
  assert.deepEqual(findCommercialKeys(a), []);
});

test("hasCommercialContext: 키 없는 객체는 false", () => {
  assert.equal(hasCommercialContext(toItineraryEvent(spot())), false);
});

test("PlaceView: 내부 메모는 props 로도 넘어가지 않는다", () => {
  const v = toPlaceView(spot({ why_it_matters: "Premium accommodation affiliate anchor for high value travelers" }));
  assert.equal(v.why_it_matters, null);
  assert.ok(!JSON.stringify(v).toLowerCase().includes("affiliate"));
});

test("PlaceView: 안전한 why_it_matters 는 그대로 넘어간다", () => {
  const v = toPlaceView(spot({ why_it_matters: "A quiet coastal walk with sea views" }));
  assert.equal(v.why_it_matters, "A quiet coastal walk with sea views");
});

test("PlaceView: l10n 은 내부 메모인 locale 값만 제거하고 나머지는 보존", () => {
  const v = toPlaceView(spot({
    why_l10n: { en: "Strong affiliate conversion value", ja: "静かな海辺の散歩道" } as never,
  }));
  assert.deepEqual(v.why_l10n, { ja: "静かな海辺の散歩道" });
});

test("PlaceView: l10n 전 값이 내부 메모면 null", () => {
  const v = toPlaceView(spot({ why_l10n: { en: "High value affiliate funnel" } as never }));
  assert.equal(v.why_l10n, null);
});

test("PlaceView: description 이 내부 메모여도 제거된다", () => {
  const v = toPlaceView(spot({ description: "Best commercial base for affiliate funnels" }));
  assert.equal(v.description, null);
});

// ── firstPublicText — 일정 표시 경로 방어 (GUARD-FIX-V1) ────────────────────
//
// 이 함수가 하는 일은 하나다: 후보 중 공개해도 되는 첫 번째를 원문 그대로 고른다.
// 후보 순서는 호출부가 정한다. 여기서 검증하는 것은 (1) 판정이 SSOT 와 같은가,
// (2) 통과한 문구를 손대지 않는가 두 가지다.

test("firstPublicText: 첫 후보가 안전하면 원문 그대로 반환한다", () => {
  assert.equal(
    firstPublicText("A marina side night view and dining complex near Haeundae", "second"),
    "A marina side night view and dining complex near Haeundae",
  );
});

test("firstPublicText: 첫 후보가 affiliate 메모면 두 번째 후보", () => {
  assert.equal(firstPublicText("High value zone for affiliate traffic", "A lively beach"), "A lively beach");
});

test("firstPublicText: conversion 메모면 건너뛴다", () => {
  assert.equal(firstPublicText("Strong hotel conversion driver", "A hillside village"), "A hillside village");
});

test("firstPublicText: commercial value 메모면 건너뛴다", () => {
  assert.equal(
    firstPublicText("High commercial value for nightlife hotel and food spending routes", "A marina complex"),
    "A marina complex",
  );
});

test("firstPublicText: monetization·upsell·funnel 메모를 건너뛴다", () => {
  for (const memo of ["Key monetization anchor", "Good upsell point for tours", "Top of the booking funnel"]) {
    assert.equal(firstPublicText(memo, "A coastal trail"), "A coastal trail", memo);
  }
});

test("firstPublicText: revenue·ARPU·CTR 메모를 건너뛴다", () => {
  for (const memo of ["Highest revenue per visitor", "Best ARPU segment", "Strong CTR on cards"]) {
    assert.equal(firstPublicText(memo, "A city park"), "A city park", memo);
  }
});

test("firstPublicText: null·undefined 후보를 건너뛴다", () => {
  assert.equal(firstPublicText(null, undefined, "A quiet temple"), "A quiet temple");
  assert.equal(firstPublicText(undefined, "A quiet temple"), "A quiet temple");
});

test("firstPublicText: 빈 문자열·공백만인 후보를 건너뛴다", () => {
  assert.equal(firstPublicText("", "   ", "A quiet temple"), "A quiet temple");
});

test("firstPublicText: 후보가 전부 내부 메모면 빈 문자열", () => {
  assert.equal(firstPublicText("affiliate anchor", "Best commercial base for affiliate funnels"), "");
});

test("firstPublicText: 후보가 하나도 없으면 빈 문자열", () => {
  assert.equal(firstPublicText(), "");
  assert.equal(firstPublicText(null, undefined, "", "  "), "");
});

test("firstPublicText: 여행자용 사실 정보는 차단하지 않는다", () => {
  // 유료 관광지·입장료는 내부 수익화 메모가 아니라 여행자가 알아야 할 사실이다.
  for (const s of [
    "A paid attraction with an observation deck",
    "PaidAttraction",
    "Entry fee is 27,000 KRW",
    "A high rise observatory inside LCT with wide views of Haeundae and the sea",
    "Busan's central shopping nightlife and transit district",
  ]) {
    assert.equal(firstPublicText(s, "fallback"), s, s);
  }
});

test("firstPublicText: 대소문자를 가리지 않고 차단한다", () => {
  for (const s of ["AFFILIATE hub", "Affiliate Hub", "aFfIlIaTe hub"]) {
    assert.equal(firstPublicText(s, "A park"), "A park", s);
  }
});

test("firstPublicText: 다문장 원문을 자르지 않는다 — 요약 함수가 아니다", () => {
  const long = "A 1.8km white-sand stretch in Haeundae-gu, open year-round. Street food stalls line the promenade. Busiest in August.";
  assert.equal(firstPublicText(long), long);
  // resolvePublicPlaceSummary 는 반대로 첫 문장만 준다 — 두 함수의 역할이 다르다
  assert.equal(
    resolvePublicPlaceSummary({ name: null, description: long, whyItMatters: null }),
    "A 1.8km white-sand stretch in Haeundae-gu, open year-round.",
  );
});

test("firstPublicText: 마침표를 추가하지 않는다", () => {
  assert.equal(firstPublicText("A lively beach facing Gwangan Bridge with cafes bars and night scenery"),
               "A lively beach facing Gwangan Bridge with cafes bars and night scenery");
});

test("firstPublicText: 앞뒤 공백이 있어도 원문 그대로 반환한다 — 판정에만 trim 을 쓴다", () => {
  assert.equal(firstPublicText("  A marina complex  "), "  A marina complex  ");
});

test("firstPublicText: 후보 세 개의 순서를 보존한다", () => {
  assert.equal(firstPublicText("first", "second", "third"), "first");
  assert.equal(firstPublicText(null, "second", "third"), "second");
  assert.equal(firstPublicText(null, null, "third"), "third");
  // 순서를 뒤집으면 결과도 뒤집힌다 = 순서를 호출부가 정한다는 계약
  assert.equal(firstPublicText("desc", "why"), "desc");
  assert.equal(firstPublicText("why", "desc"), "why");
});

test("firstPublicText: 세 번째 후보(tips)도 안전성 검사를 받는다", () => {
  assert.equal(firstPublicText(null, null, "High commercial value for hotel conversion"), "");
  assert.equal(firstPublicText("affiliate memo", "conversion memo", "A safe tip"), "A safe tip");
});

test("firstPublicText: 원본 입력을 변경하지 않는다", () => {
  const arr = ["High value affiliate zone", "A lively beach"];
  const copy = [...arr];
  firstPublicText(...arr);
  assert.deepEqual(arr, copy);
});

test("firstPublicText: 판정이 isInternalMemo 와 일치한다 — 정책 SSOT 단일", () => {
  const samples = [
    "A safe line", "High value affiliate zone", "Strong CTR on cards",
    "Entry fee is 27,000 KRW", "Best commercial base for affiliate funnels",
    "A paid attraction with an observation deck",
  ];
  for (const s of samples) {
    assert.equal(firstPublicText(s), isInternalMemo(s) ? "" : s, s);
  }
});

// ── 네 호출부의 후보 순서 고정 ───────────────────────────────────────────────
//
// 순서가 조용히 바뀌면 안전한 사용자 문구까지 전부 교체된다(실측 86/86행).
// 각 경로의 순서를 테스트로 못박는다.

test("호출부 순서: addPlaceFromSpot 은 whyItMatters 먼저", () => {
  const spot = { whyItMatters: "The curated line.", description: "The long description." };
  assert.equal(firstPublicText(spot.whyItMatters, spot.description), "The curated line.");
});

test("호출부 순서: addCartItemToDay 는 description 먼저", () => {
  const item = { whyItMatters: "The curated line.", description: "The long description." };
  assert.equal(firstPublicText(item.description, item.whyItMatters), "The long description.");
});

test("호출부 순서: cartSnapshot 소비는 whyItMatters → description → tips", () => {
  const snap = { whyItMatters: "why", description: "desc" };
  const tips = "tips";
  assert.equal(firstPublicText(snap.whyItMatters, snap.description, tips), "why");
  assert.equal(firstPublicText(undefined, snap.description, tips), "desc");
  assert.equal(firstPublicText(undefined, undefined, tips), "tips");
});

test("인위적 오염: 오염된 후보는 건너뛰고 안전한 후보가 남는다", () => {
  const DESC = "A marina-side night view and dining complex.";
  const MEMO = "High commercial value for hotel conversion.";
  // why-first 경로
  assert.equal(firstPublicText(MEMO, DESC), DESC);
  // description-first 경로
  assert.equal(firstPublicText(DESC, MEMO), DESC);
  // 두 후보 모두 오염 → 안전한 세 번째
  assert.equal(firstPublicText(MEMO, MEMO, "A safe tip"), "A safe tip");
  // 전부 오염 → 빈 문자열
  assert.equal(firstPublicText(MEMO, MEMO, MEMO), "");
});

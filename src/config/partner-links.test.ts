// PHASE 10 파트너 링크 계약 (Owner 승인 2026-09-13)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAgodaCitySearch, buildTripcomHotels, buildKlookCitySearch, buildKkday,
  offersFor, stayOfferFor, stayOffersFor, isLegacyAffiliateUrl,
  AGODA_CID, TRIP_ALLIANCE_ID, TRIP_SID, TRIP_SUB3, KLOOK_AID, KLOOK_AFF_ADID, KKDAY_CID,
  type PartnerLocale,
} from "./partner-links.ts";

const LOCALES: PartnerLocale[] = ["en", "ko", "ja", "zh"];

test("★Agoda — Owner 원본과 파라미터 동일(부산), 4언어 hl, 미확보 도시는 null", () => {
  const u = new URL(buildAgodaCitySearch("busan", "en")!);
  assert.equal(u.host + u.pathname, "www.agoda.com/partners/partnersearch.aspx");
  assert.equal(u.searchParams.get("pcs"), "1");
  assert.equal(u.searchParams.get("cid"), AGODA_CID);
  assert.equal(u.searchParams.get("hl"), "en-us");
  assert.equal(u.searchParams.get("city"), "17172");
  assert.equal(new URL(buildAgodaCitySearch("Busan", "ja")!).searchParams.get("hl"), "ja-jp");
  assert.equal(new URL(buildAgodaCitySearch("busan", "ko")!).searchParams.get("hl"), "ko-kr");
  assert.equal(new URL(buildAgodaCitySearch("busan", "zh")!).searchParams.get("hl"), "zh-cn");
  for (const c of ["seoul", "jeju", "gyeongju", "jeonju", "tokyo"]) {
    assert.equal(buildAgodaCitySearch(c, "en"), null, `${c}: 도시 ID 추측 금지`);
  }
});

test("★Trip.com — Owner 원본과 동일(경주·전주), 검증 도메인만, zh/미확보 도시 null", () => {
  const g = new URL(buildTripcomHotels("gyeongju", "ko")!);
  assert.equal(g.host, "kr.trip.com");
  assert.equal(g.pathname, "/hotels/gyeongju-hotels-list-3675/");
  assert.equal(g.searchParams.get("Allianceid"), TRIP_ALLIANCE_ID);
  assert.equal(g.searchParams.get("SID"), TRIP_SID);
  assert.equal(g.searchParams.get("trip_sub1"), "gkm_hotel_gyeongju");
  assert.equal(g.searchParams.get("trip_sub3"), TRIP_SUB3);
  assert.equal(new URL(buildTripcomHotels("jeonju", "en")!).host, "www.trip.com");
  assert.equal(new URL(buildTripcomHotels("jeonju", "ja")!).host, "jp.trip.com");
  assert.match(buildTripcomHotels("jeonju", "ja")!, /jeonju-si-hotels-list-61380/);
  assert.equal(buildTripcomHotels("gyeongju", "zh"), null, "zh(간체) 규격 미확인 — hk 는 번체");
  // v2: 부산/서울/제주 목록 ID 는 공식 페이지 실측+착지 교차검증으로 확보됨
  assert.match(buildTripcomHotels("busan", "ko")!, /busan-hotels-list-253/);
  assert.match(buildTripcomHotels("seoul", "en")!, /seoul-hotels-list-274/);
  assert.match(buildTripcomHotels("jeju", "ja")!, /jeju-hotels-list-737/);
  assert.equal(buildTripcomHotels("tokyo", "ko"), null, "미확보 도시 추측 금지");
});

test("★Klook — k_site 1회 인코딩·원본 파라미터, 검증 locale(ko)만, 활성 매트릭스 밖", () => {
  const url = buildKlookCitySearch("부산", "ko")!;
  const u = new URL(url);
  assert.equal(u.searchParams.get("aid"), KLOOK_AID);
  assert.equal(u.searchParams.get("aff_adid"), KLOOK_AFF_ADID);
  const dest = new URL(u.searchParams.get("k_site")!); // URLSearchParams 가 디코딩 1회
  assert.equal(dest.host + dest.pathname, "www.klook.com/ko/search/result/");
  assert.equal(dest.searchParams.get("query"), "부산");
  assert.equal(buildKlookCitySearch("부산", "en"), null, "미검증 locale 추측 금지");
});

test("★KKday — cid/ud 규격, ud2 는 영숫자만·test 거부", () => {
  const u = new URL(buildKkday("/en/country/south-korea", "busanactivity")!);
  assert.equal(u.searchParams.get("cid"), KKDAY_CID);
  assert.equal(u.searchParams.get("ud1"), "gokoreamate");
  assert.equal(u.searchParams.get("ud2"), "busanactivity");
  assert.equal(buildKkday("/en", "test"), null, "시험 태그 운영 금지");
  assert.equal(buildKkday("/en", "busan-activity"), null, "영숫자 외 거부");
});

test("★활성 매트릭스 v2 — stay: 부산=Agoda추천+Trip대안(en/ja/ko)·zh는 Agoda만, 4도시=Trip 단독(en/ja/ko), zh 4도시 숨김", () => {
  // 부산: 추천 Agoda(4locale) + 검증된 대안 Trip.com(en/ja/ko)
  for (const l of LOCALES) assert.equal(stayOffersFor("busan", l)[0]?.partner, "agoda", `busan/${l} 추천`);
  for (const l of ["en", "ko", "ja"] as const) {
    assert.equal(stayOffersFor("busan", l)[1]?.partner, "tripcom", `busan/${l} 대안`);
    assert.match(stayOffersFor("busan", l)[1]!.href, /busan-hotels-list-253/);
  }
  assert.equal(stayOffersFor("busan", "zh").length, 1, "zh 는 Trip 간체 미확보 — 대안 없음");
  // 서울/제주: Trip.com 단독(신규 검증 253/274/737 계열)
  for (const l of ["en", "ko", "ja"] as const) {
    assert.equal(stayOffersFor("seoul", l)[0]?.partner, "tripcom");
    assert.match(stayOffersFor("seoul", l)[0]!.href, /seoul-hotels-list-274/);
    assert.equal(stayOffersFor("jeju", l)[0]?.partner, "tripcom");
    assert.match(stayOffersFor("jeju", l)[0]!.href, /jeju-hotels-list-737/);
    assert.equal(stayOffersFor("gyeongju", l)[0]?.partner, "tripcom");
    assert.equal(stayOffersFor("jeonju", l)[0]?.partner, "tripcom");
    assert.equal(stayOffersFor("seoul", l).length, 1, "대안 없음(하나면 하나만)");
  }
  // zh: Agoda 확보 도시(부산)만 — 나머지는 숨김(hk.trip=번체라 간체 UI 와 불일치)
  for (const c of ["seoul", "jeju", "gyeongju", "jeonju"]) {
    assert.equal(stayOffersFor(c, "zh").length, 0, `${c}/zh 숨김`);
  }
  assert.equal(stayOffersFor("tokyo", "en").length, 0);
  // esim/transport/activity 는 여전히 어떤 도시·언어에서도 활성 0 (Klook·KKday 착지 미확인)
  for (const l of LOCALES) for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    const purposes = new Set(offersFor(c, l).map(o => o.purpose));
    for (const p of ["esim", "transport", "activity"]) assert.ok(!purposes.has(p as never), `${c}/${l}/${p}`);
  }
});

test("★구세대 차단 — 활성 전 조합의 URL 에 41763/단축링크 0 + 감지기 동작", () => {
  assert.ok(isLegacyAffiliateUrl("https://affiliate.klook.com/redirect?aid=41763&x=1"));
  assert.ok(isLegacyAffiliateUrl("https://affiliate.klook.com/sl/KiT3U74"));
  for (const l of LOCALES) for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    for (const o of offersFor(c, l)) {
      assert.ok(!isLegacyAffiliateUrl(o.href), `${c}/${l}: ${o.href}`);
      assert.ok(o.href.includes(AGODA_CID) || o.href.includes(TRIP_ALLIANCE_ID), "승인 ID 미포함");
    }
  }
});

test("★게이트 불변 — TRIP_FLOW/POST_PLAN 은 여전히 false, 신규 표면 2개만 승인 추가", () => {
  const src = readFileSync(join(process.cwd(), "src/config/commerce-surfaces.ts"), "utf8");
  assert.match(src, /TRIP_FLOW_COMMERCE_ENABLED = false/);
  assert.match(src, /POST_PLAN_COMMERCE_ENABLED = false/);
  assert.match(src, /"city-hub-essentials", "my-trip-prep"/);
});

test("★배선 — 두 표면이 PartnerOfferRow 를 쓰고, 고지·sponsored·문맥 추적이 있다", () => {
  const hub = readFileSync(join(process.cwd(), "src/components/quiet/CityHubClient.tsx"), "utf8");
  assert.match(hub, /PartnerOfferRow surface="city-hub-essentials"/);
  const it = readFileSync(join(process.cwd(), "src/app/itinerary/page.tsx"), "utf8");
  assert.match(it, /PartnerOfferRow surface="my-trip-prep"/);
  assert.match(it, /\{!shareId && !isPastTrip && \(/, "본인·미래 여행 한정 조건");
  const row = readFileSync(join(process.cwd(), "src/components/PartnerOfferRow.tsx"), "utf8");
  assert.match(row, /isEditorialAffiliateEnabled\(surface\)/);
  assert.match(row, /partnerSponsored/, "가시 고지 누락");
  assert.match(row, /isLegacyAffiliateUrl/);
  const link = readFileSync(join(process.cwd(), "src/components/AffiliateLink.tsx"), "utf8");
  assert.match(link, /rel=\{isAffiliate \? "noopener noreferrer sponsored"/);
  assert.match(link, /surface \? \{ surface \}/);
});

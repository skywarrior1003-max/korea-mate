// PHASE 10 파트너 링크 계약 (Owner 승인 2026-09-13)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAgodaCitySearch, buildTripcomHotels, buildKlookCitySearch, buildKkday,
  buildKlookEsim, buildKlookRail, buildKlookBus,
  offersFor, stayOfferFor, stayOffersFor, activityOffersFor,
  esimOffersFor, railOffersFor, busOffersFor, offersByPurpose, isLegacyAffiliateUrl,
  AGODA_CID, TRIP_ALLIANCE_ID, TRIP_SID, TRIP_SUB3, KLOOK_AID, KKDAY_CID,
  type PartnerLocale,
} from "./partner-links.ts";

const LOCALES: PartnerLocale[] = ["en", "ko", "ja", "zh"];

test("★Agoda — Owner 원본과 파라미터 동일(부산), 4언어 hl, v5 도시 ID 5건, 미확보 null", () => {
  const u = new URL(buildAgodaCitySearch("busan", "en")!);
  assert.equal(u.host + u.pathname, "www.agoda.com/partners/partnersearch.aspx");
  assert.equal(u.searchParams.get("pcs"), "1");
  assert.equal(u.searchParams.get("cid"), AGODA_CID);
  assert.equal(u.searchParams.get("hl"), "en-us");
  assert.equal(u.searchParams.get("city"), "17172");
  assert.equal(new URL(buildAgodaCitySearch("Busan", "ja")!).searchParams.get("hl"), "ja-jp");
  assert.equal(new URL(buildAgodaCitySearch("busan", "ko")!).searchParams.get("hl"), "ko-kr");
  assert.equal(new URL(buildAgodaCitySearch("busan", "zh")!).searchParams.get("hl"), "zh-cn");
  // v5(2026-09-14): Agoda 자동완성 API 추출 + partnersearch 착지 실측 교차검증
  assert.equal(new URL(buildAgodaCitySearch("seoul", "en")!).searchParams.get("city"), "14690");
  assert.equal(new URL(buildAgodaCitySearch("jeju", "en")!).searchParams.get("city"), "16901");
  assert.equal(new URL(buildAgodaCitySearch("gyeongju", "en")!).searchParams.get("city"), "17179");
  assert.equal(new URL(buildAgodaCitySearch("jeonju", "en")!).searchParams.get("city"), "17831");
  assert.equal(buildAgodaCitySearch("tokyo", "en"), null, "미확보 도시 추측 금지");
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

test("★Klook V4 — 직접 aid 부착(공식), redirect/aff_adid 0, 검증 경로·locale 만", () => {
  // eSIM: 4 locale 전부 검증(2026-09-14 실브라우저) — dest_id=1010=대한민국
  for (const [l, seg] of [["en", "en-US"], ["ko", "ko"], ["ja", "ja"], ["zh", "zh-CN"]] as const) {
    const u = new URL(buildKlookEsim(l));
    assert.equal(u.host + u.pathname, `www.klook.com/${seg}/wifi-sim-card/`);
    assert.equal(u.searchParams.get("dest_id"), "1010");
    assert.equal(u.searchParams.get("aid"), KLOOK_AID);
  }
  // 도시 검색: 라우트 locale 축 검증, 검색어는 locale 표기
  const s = new URL(buildKlookCitySearch("busan", "ko")!);
  assert.equal(s.host + s.pathname, "www.klook.com/ko/search/result/");
  assert.equal(s.searchParams.get("query"), "부산");
  assert.equal(s.searchParams.get("aid"), KLOOK_AID);
  assert.equal(new URL(buildKlookCitySearch("seoul", "zh")!).pathname, "/zh-CN/search/result/");
  assert.equal(buildKlookCitySearch("tokyo", "en"), null, "미확보 도시 추측 금지");
  // rail: en 은 base 경로만 검증, ko 는 404(경로 부재) → null
  assert.equal(new URL(buildKlookRail("en")!).pathname, "/korea-rail/");
  assert.equal(new URL(buildKlookRail("ja")!).pathname, "/ja/korea-rail/");
  assert.equal(new URL(buildKlookRail("zh")!).pathname, "/zh-CN/korea-rail/");
  assert.equal(buildKlookRail("ko"), null, "/ko/ 404 — 발명 금지");
  // bus: en-US 검증, ko 404 → null
  assert.equal(new URL(buildKlookBus("en")!).pathname, "/en-US/korea-bus/");
  assert.equal(buildKlookBus("ko"), null);
  // 구세대 규격(redirect·aff_adid·단축링크)은 어떤 빌더도 생성하지 않는다
  for (const href of [buildKlookEsim("en"), buildKlookCitySearch("busan", "en")!, buildKlookRail("en")!, buildKlookBus("en")!]) {
    assert.ok(!href.includes("affiliate.klook.com"), "redirect 부활 금지");
    assert.ok(!href.includes("aff_adid"), "aff_adid 불요(공식)");
    assert.ok(!href.includes("s.klook.com"), "단축링크는 추적 불가");
  }
});

test("★KKday — cid/ud 규격, ud2 는 영숫자만·test 거부", () => {
  const u = new URL(buildKkday("/en/country/south-korea", "busanactivity")!);
  assert.equal(u.searchParams.get("cid"), KKDAY_CID);
  assert.equal(u.searchParams.get("ud1"), "gokoreamate");
  assert.equal(u.searchParams.get("ud2"), "busanactivity");
  assert.equal(buildKkday("/en", "test"), null, "시험 태그 운영 금지");
  assert.equal(buildKkday("/en", "busan-activity"), null, "영숫자 외 거부");
});

test("★활성 매트릭스 v5 — stay: 5도시=Agoda 추천(4locale)+Trip 대안(en/ja/ko), zh=Agoda 단독", () => {
  for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    // 추천 Agoda(4locale, zh 포함)
    for (const l of LOCALES) assert.equal(stayOffersFor(c, l)[0]?.partner, "agoda", `${c}/${l} 추천`);
    // 대안 Trip.com(검증 도메인 en/ja/ko)
    for (const l of ["en", "ko", "ja"] as const) {
      assert.equal(stayOffersFor(c, l)[1]?.partner, "tripcom", `${c}/${l} 대안`);
      assert.equal(stayOffersFor(c, l).length, 2);
    }
    // zh: Trip 간체 규격 미확인 — Agoda 단독
    assert.equal(stayOffersFor(c, "zh").length, 1, `${c}/zh Agoda 단독`);
  }
  assert.match(stayOffersFor("busan", "en")[1]!.href, /busan-hotels-list-253/);
  assert.match(stayOffersFor("seoul", "en")[1]!.href, /seoul-hotels-list-274/);
  assert.match(stayOffersFor("jeju", "ja")[1]!.href, /jeju-hotels-list-737/);
  assert.equal(stayOffersFor("tokyo", "en").length, 0);
});

test("★esim/rail/bus v4 — Klook 직접 aid, esim 4locale·rail/bus 는 en/ja/zh 만(ko 경로 부재)", () => {
  for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    for (const l of LOCALES) {
      const esim = esimOffersFor(c, l);
      assert.equal(esim.length, 1, `${c}/${l} esim`);
      assert.equal(esim[0]!.partner, "klook");
      assert.match(esim[0]!.href, /wifi-sim-card\/\?dest_id=1010&aid=123610/);
    }
    for (const l of ["en", "ja", "zh"] as const) {
      assert.equal(railOffersFor(c, l).length, 1, `${c}/${l} rail`);
      assert.equal(busOffersFor(c, l).length, 1, `${c}/${l} bus`);
    }
    assert.equal(railOffersFor(c, "ko").length, 0, `${c}/ko rail 렌더 0`);
    assert.equal(busOffersFor(c, "ko").length, 0, `${c}/ko bus 렌더 0`);
  }
  // 승인 5도시 밖에서는 전역 카테고리도 렌더하지 않는다
  assert.equal(esimOffersFor("tokyo", "en").length, 0);
  assert.equal(railOffersFor("tokyo", "en").length, 0);
});

test("★activity v4 — Klook 검색 추천 + KKday 도시 목적지 대안, 5도시×4locale", () => {
  for (const l of LOCALES) for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    const offers = activityOffersFor(c, l);
    assert.equal(offers.length, 2, `${c}/${l}: 추천+대안`);
    assert.equal(offers[0]!.partner, "klook", `${c}/${l} 추천=Klook(Owner 정책 순서)`);
    const k = new URL(offers[0]!.href);
    assert.match(k.pathname, /^\/(en-US|ko|ja|zh-CN)\/search\/result\/$/);
    assert.equal(k.searchParams.get("aid"), KLOOK_AID);
    assert.ok(k.searchParams.get("query"), "도시 검색어 필수");
    assert.equal(offers[1]!.partner, "kkday", `${c}/${l} 대안=KKday`);
    const u = new URL(offers[1]!.href);
    assert.equal(u.searchParams.get("cid"), KKDAY_CID);
    assert.equal(u.searchParams.get("ud1"), "gokoreamate");
    assert.equal(u.searchParams.get("ud2"), `${c}activity`, "ud2 영숫자 도시 태그");
    assert.match(u.pathname, new RegExp(`^/(en|ja|ko|zh-cn)/destination/kr-${c}$`));
  }
  assert.equal(new URL(activityOffersFor("busan", "zh")[1]!.href).pathname, "/zh-cn/destination/kr-busan", "zh 는 간체 경로");
  assert.equal(activityOffersFor("tokyo", "en").length, 0);
  // offersByPurpose 표면 계약 — stay → activity → esim → rail → bus 순서
  const by = offersByPurpose("busan", "en");
  assert.equal(by.stay[0]!.partner, "agoda");
  assert.equal(by.activity[0]!.partner, "klook");
  assert.equal(by.esim[0]!.partner, "klook");
  assert.equal(by.rail[0]!.partner, "klook");
  assert.equal(by.bus[0]!.partner, "klook");
});

test("★구세대 차단 — 활성 전 조합의 URL 에 41763/단축링크 0 + 감지기 동작", () => {
  assert.ok(isLegacyAffiliateUrl("https://affiliate.klook.com/redirect?aid=41763&x=1"));
  assert.ok(isLegacyAffiliateUrl("https://affiliate.klook.com/sl/KiT3U74"));
  for (const l of LOCALES) for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    for (const o of offersFor(c, l)) {
      assert.ok(!isLegacyAffiliateUrl(o.href), `${c}/${l}: ${o.href}`);
      assert.ok(
        o.href.includes(AGODA_CID) || o.href.includes(TRIP_ALLIANCE_ID)
          || o.href.includes(`cid=${KKDAY_CID}`) || o.href.includes(`aid=${KLOOK_AID}`),
        "승인 ID 미포함",
      );
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
  // 2026-09-17 Owner: 판별을 shareId → isOwner(owner-only GET 성공)로 강화 +
  // canonical 도시 확정 시에만 렌더. stale 단언을 현재 계약으로 동기화(LEGACY-CLEANUP-V1).
  assert.match(it, /\{isOwner && !isPastTrip && citySlugCanonical && \(/, "본인·미래 여행·canonical 도시 한정 조건");
  const row = readFileSync(join(process.cwd(), "src/components/PartnerOfferRow.tsx"), "utf8");
  assert.match(row, /isEditorialAffiliateEnabled\(surface\)/);
  assert.match(row, /partnerSponsored/, "가시 고지 누락");
  assert.match(row, /isLegacyAffiliateUrl/);
  const link = readFileSync(join(process.cwd(), "src/components/AffiliateLink.tsx"), "utf8");
  assert.match(link, /rel=\{isAffiliate \? "noopener noreferrer sponsored"/);
  assert.match(link, /surface \? \{ surface \}/);
});

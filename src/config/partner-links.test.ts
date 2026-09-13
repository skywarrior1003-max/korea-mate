// PHASE 10 파트너 링크 계약 (Owner 승인 2026-09-13)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAgodaCitySearch, buildTripcomHotels, buildKlookCitySearch, buildKkday,
  offersFor, stayOfferFor, isLegacyAffiliateUrl,
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
  assert.equal(buildTripcomHotels("gyeongju", "zh"), null, "zh 도메인 규격 미확인");
  for (const c of ["busan", "seoul", "jeju"]) {
    assert.equal(buildTripcomHotels(c, "ko"), null, `${c}: 목록 ID 추측 금지`);
  }
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

test("★활성 매트릭스 — 검증 조합만: stay(부산=Agoda 4언어·경주/전주=Trip 3언어), 그 외 0", () => {
  for (const l of LOCALES) {
    assert.equal(stayOfferFor("busan", l)?.partner, "agoda", `busan/${l}`);
  }
  for (const l of ["en", "ko", "ja"] as const) {
    assert.equal(stayOfferFor("gyeongju", l)?.partner, "tripcom");
    assert.equal(stayOfferFor("jeonju", l)?.partner, "tripcom");
  }
  assert.equal(stayOfferFor("gyeongju", "zh"), null, "zh 미검증 — 숨김");
  assert.equal(stayOfferFor("seoul", "en"), null);
  assert.equal(stayOfferFor("jeju", "en"), null);
  // esim/transport/activity 는 어떤 도시·언어에서도 활성 0 (Klook·KKday 착지 미확인)
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

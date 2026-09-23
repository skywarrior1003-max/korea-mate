// PARTNER-AFFILIATE-LEGACY-LINK-CLEANUP-V1 — 회귀 고정
// 실행: node --experimental-strip-types src/config/partner-legacy-cleanup-guard.test.ts
//
// 고정하는 계약:
//  ① 구세대 Klook URL(구 AID·단축링크)이 runtime source 에 존재하지 않는다.
//  ② 구세대 policy 는 전 상품 null — resolver 는 어떤 조합에서도 offer 0.
//  ③ Booking.com·Airalo·Viator 는 사용자 노출 링크를 만들지 않는다.
//  ④ Trip-Flow OFF 상태에서 plan route 는 client affiliate_context 를 무시한다.
//  ⑤ 신규 partner-links(승인 4사) 구조·ID·차단기는 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { REGISTRY, PARTNER_LABEL } from "./affiliate-registry.ts";
import { POLICY, choiceFor } from "./affiliate-policy.ts";
import {
  LEGACY_AFFILIATE_MARKERS, isLegacyAffiliateUrl, offersByPurpose,
  AGODA_CID, TRIP_ALLIANCE_ID, TRIP_SID, KLOOK_AID, KKDAY_CID,
  type PartnerLocale,
} from "./partner-links.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
// 이 테스트 파일 자신에도 금지 문자열 원문을 적지 않는다 — 조각으로 조립.
const OLD_AID   = ["aid=4", "1763"].join("");
const SL_ESIM   = ["KiT3", "U74"].join("");
const SL_TRANSFER = ["21Fk", "Avj"].join("");
const FORBIDDEN = [OLD_AID, SL_ESIM, SL_TRANSFER];

test("① runtime source 에 구세대 Klook 문자열 0 (registry·affiliates·partner-links)", () => {
  for (const p of [
    "src/config/affiliate-registry.ts",
    "src/config/affiliates.ts",
    "src/config/affiliate-policy.ts",
    "src/config/partner-links.ts",
    "src/lib/affiliate-resolve.ts",
    "src/components/KoreaReadySection.tsx",
    "src/data/blog/blog-posts-v1.ts",
  ]) {
    const src = read(p);
    for (const bad of FORBIDDEN) assert.ok(!src.includes(bad), `${p} 에 ${bad}`);
  }
});

test("① registry 는 전 상품 빈 표 — URL 자체가 없다", () => {
  for (const [product, table] of Object.entries(REGISTRY)) {
    assert.deepEqual(Object.keys(table), [], product);
  }
});

test("② policy 전 상품 null → resolver 는 모든 locale 에서 offer 0", () => {
  for (const product of Object.keys(POLICY) as (keyof typeof POLICY)[]) {
    for (const locale of ["en", "ko", "ja", "zh", "fr"]) {
      assert.equal(choiceFor(product, locale), null, `${product}/${locale}`);
    }
  }
  // resolveOffers 는 choice null 이면 즉시 [] — 그 경로가 소스에 고정돼 있다.
  // (alias import 라 여기서 직접 실행하지 않고 소스로 단언한다.)
  assert.match(read("src/lib/affiliate-resolve.ts"), /if \(!choice\) return \[\];/);
});

test("③ Booking·Airalo·Viator — 신규 활성 경로의 어떤 조합에도 등장하지 않는다", () => {
  const cities = ["busan", "seoul", "jeju", "gyeongju", "jeonju"];
  const locales: PartnerLocale[] = ["en", "ko", "ja", "zh"];
  for (const c of cities) for (const l of locales) {
    const by = offersByPurpose(c, l);
    for (const offers of Object.values(by)) {
      for (const o of offers) {
        assert.ok(["agoda", "tripcom", "klook", "kkday"].includes(o.partner), `${c}/${l}: ${o.partner}`);
        assert.ok(!/viator\.com|booking\.com|airalo/i.test(o.href), o.href);
        assert.ok(!isLegacyAffiliateUrl(o.href), o.href);
      }
    }
  }
  // PARTNER_LABEL 에 이름이 남는 것(브랜드 표기 상수)과 링크 생성은 별개다.
  assert.equal(PARTNER_LABEL.booking, "Booking.com");
});

test("③ blog 데이터에 affiliateCards 잔존 0", () => {
  const src = read("src/data/blog/blog-posts-v1.ts");
  assert.ok(!/affiliateCards:\s*\[\s*\{/.test(src), "blog 에 affiliateCards 항목 잔존");
});

test("④ plan route 2곳 — TRIP_FLOW OFF 에서 client affiliate_context 무시가 소스에 고정", () => {
  for (const p of ["functions/api/trip/plan.ts", "src/app/api/trip/plan/route.ts"]) {
    const src = read(p);
    // 게이트 상수가 body.affiliate_context 신뢰 여부를 직접 좌우해야 한다.
    assert.match(src, /TRIP_FLOW_COMMERCE_ENABLED\s*(&&|\?)[\s\S]{0,200}affiliate_context/, p);
  }
});

test("④ KoreaReadySection — 카드 0 이면 빈 껍데기 섹션도 렌더하지 않는다", () => {
  assert.match(read("src/components/KoreaReadySection.tsx"), /cards\.length === 0\) return null/);
});

test("⑤ 신규 4사 구조 보존 — ID·마커 런타임 값 불변", () => {
  assert.equal(AGODA_CID, "1972243");
  assert.equal(TRIP_ALLIANCE_ID, "9901788");
  assert.equal(TRIP_SID, "327852582");
  assert.equal(KLOOK_AID, "123610");
  assert.equal(KKDAY_CID, "26267");
  // 마커는 host 일반화로 바뀌었지만 차단 범위는 종전 이상이어야 한다:
  // 구 redirect(구 AID)·구 단축링크 모두 여전히 감지되고, 신규 공식 규격
  // (www.klook.com 직접 aid)은 감지되지 않는다.
  assert.deepEqual([...LEGACY_AFFILIATE_MARKERS], ["affiliate.klook.com/"]);
  assert.ok(isLegacyAffiliateUrl(`https://affiliate.klook.com/redirect?${OLD_AID}&x=1`));
  assert.ok(isLegacyAffiliateUrl(`https://affiliate.klook.com/sl/${SL_ESIM}`));
  assert.ok(!isLegacyAffiliateUrl(`https://www.klook.com/ko/search/result/?query=x&aid=${KLOOK_AID}`));
});

// city identity 계약 가드 — 실행: node --experimental-strip-types src/data/cities/resolve.test.ts
// (TRIP-CITY-CONTRACT-FINAL-CLOSEOUT-V1) resolver + 번역 동기 + 자동 제목 문구.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCitySlug, cityLabelKey, CITY_DISPLAY_NAMES, CITY_SLUGS, type CityLocale } from "./identity.ts";
import ko from "../../messages/ko.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import ja from "../../messages/ja.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

const bundles: Array<[CityLocale, { tripForm: Record<string, string>; itin: Record<string, string> }]> = [
  ["ko", ko as never], ["en", en as never], ["ja", ja as never], ["zh", zh as never],
];

test("canonical slug 5개 — 항등", () => {
  for (const s of CITY_SLUGS) assert.equal(resolveCitySlug(s), s);
});

test("identity 표시명 ↔ tripForm.city_* 번역 — 값 동기(드리프트 금지)", () => {
  for (const s of CITY_SLUGS) {
    for (const [loc, b] of bundles) {
      assert.equal(b.tripForm[cityLabelKey(s)], CITY_DISPLAY_NAMES[s][loc], `${loc} ${s}`);
    }
  }
});

test("4locale 표시명 20개 → slug", () => {
  for (const s of CITY_SLUGS) {
    for (const loc of ["ko", "en", "ja", "zh"] as const) {
      assert.equal(resolveCitySlug(CITY_DISPLAY_NAMES[s][loc]), s, `${loc}:${s}`);
    }
  }
});

test("Production 실측값(2026-09-17 감사: Busan/busan/seoul/서울) 전부 해석", () => {
  assert.equal(resolveCitySlug("Busan"), "busan");
  assert.equal(resolveCitySlug("busan"), "busan");
  assert.equal(resolveCitySlug("seoul"), "seoul");
  assert.equal(resolveCitySlug("서울"), "seoul");
});

test("영문 대소문자·앞뒤 공백 정규화", () => {
  assert.equal(resolveCitySlug("  BUSAN  "), "busan");
  assert.equal(resolveCitySlug("JEJU ISLAND"), "jeju");
  assert.equal(resolveCitySlug(" 부산 "), "busan");
});

test("unknown·빈 값·null → null / fuzzy·부분 문자열 미수용", () => {
  for (const v of ["", "   ", "Tokyo", "도쿄", "부산광역시", "busa", "Busan City", "서울시"]) {
    assert.equal(resolveCitySlug(v), null, JSON.stringify(v));
  }
  assert.equal(resolveCitySlug(null), null);
  assert.equal(resolveCitySlug(undefined), null);
});

// ── 자동 기본 제목(itin.autoTripTitle) — 5도시×4locale 완성 문장, 혼합 언어 0 ──
function fill(tpl: string, city: string): string { return tpl.replace("{city}", city); }

test("autoTripTitle — 4locale 키 존재·{city} placeholder", () => {
  for (const [loc, b] of bundles) {
    const tpl = b.itin?.autoTripTitle;
    assert.ok(tpl && tpl.includes("{city}"), `${loc} itin.autoTripTitle`);
  }
});

test("autoTripTitle × 5도시 — raw slug 노출 0 · 혼합 언어 0", () => {
  for (const s of CITY_SLUGS) {
    for (const [loc, b] of bundles) {
      const title = fill(b.itin.autoTripTitle, CITY_DISPLAY_NAMES[s][loc]);
      assert.ok(!title.toLowerCase().includes(s) || (loc === "en" && s !== "jeju" ? true : !title.includes(s)),
        `${loc}/${s} raw slug: ${title}`);
      // 혼합 판정: 비영어 locale 문장 틀에 영어 단어(My/Trip) 금지 · en 틀에 한글 금지
      if (loc !== "en") assert.ok(!/\bMy\b|\bTrip\b/.test(title), `${loc}/${s} 영어 틀 혼입: ${title}`);
      if (loc === "en") assert.ok(!/[가-힣]/.test(title), `en/${s} 한글 혼입: ${title}`);
      // 소문자 slug 원문 그대로("busan" 등) 미노출
      assert.ok(!new RegExp(`(?<![A-Za-z])${s}(?![A-Za-z])`).test(title), `${loc}/${s} slug 노출: ${title}`);
    }
  }
});

test("autoTripTitle 대표값 — Owner 기준(ko 부산 여행 / en My Busan Trip)", () => {
  assert.equal(fill((ko as never as { itin: Record<string, string> }).itin.autoTripTitle, "부산"), "부산 여행");
  assert.equal(fill((en as never as { itin: Record<string, string> }).itin.autoTripTitle, "Busan"), "My Busan Trip");
});

// city resolver 계약 가드 — 실행: node --experimental-strip-types src/data/cities/resolve.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCitySlug, cityLabelKey } from "./resolve.ts";
import { CITY_SLUGS } from "./index.ts";
import ko from "../../messages/ko.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import ja from "../../messages/ja.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

const bundles: Array<[string, { tripForm: Record<string, string> }]> = [
  ["ko", ko as never], ["en", en as never], ["ja", ja as never], ["zh", zh as never],
];

test("canonical slug 5개 — 항등", () => {
  for (const s of CITY_SLUGS) assert.equal(resolveCitySlug(s), s);
});

test("4개 locale 실제 라벨 → slug (registry 파생 — 발명 라벨 없음)", () => {
  for (const s of CITY_SLUGS) {
    for (const [loc, b] of bundles) {
      const label = b.tripForm[cityLabelKey(s)];
      assert.ok(label, `${loc} ${s} 라벨 존재`);
      assert.equal(resolveCitySlug(label), s, `${loc}:${label}`);
    }
  }
});

test("영문 대소문자·앞뒤 공백 정규화", () => {
  assert.equal(resolveCitySlug("Busan"), "busan");
  assert.equal(resolveCitySlug("  BUSAN  "), "busan");
  assert.equal(resolveCitySlug("JEJU ISLAND"), "jeju");
  assert.equal(resolveCitySlug(" 부산 "), "busan");
});

test("제주 계열 — 제품 실사용 라벨(제주도/Jeju Island/済州島/济州岛)", () => {
  assert.equal(resolveCitySlug("제주도"), "jeju");
  assert.equal(resolveCitySlug("Jeju Island"), "jeju");
  assert.equal(resolveCitySlug("済州島"), "jeju");
  assert.equal(resolveCitySlug("济州岛"), "jeju");
});

test("unknown·빈 값·null → null (임의 기본 도시 금지)", () => {
  assert.equal(resolveCitySlug(""), null);
  assert.equal(resolveCitySlug("   "), null);
  assert.equal(resolveCitySlug(null), null);
  assert.equal(resolveCitySlug(undefined), null);
  assert.equal(resolveCitySlug("Tokyo"), null);
  assert.equal(resolveCitySlug("도쿄"), null);
});

test("fuzzy·부분 문자열 미수용", () => {
  assert.equal(resolveCitySlug("부산광역시"), null);
  assert.equal(resolveCitySlug("busa"), null);
  assert.equal(resolveCitySlug("Busan City"), null);
  assert.equal(resolveCitySlug("서울시"), null);
});

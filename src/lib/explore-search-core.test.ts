// explore-search-core 단위 테스트
// 실행: node --experimental-strip-types src/lib/explore-search-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { exploreSearchTier, matchesExploreSearch, normalizeSearchQuery, spotSearchHaystack } from "./explore-search-core.ts";

const zm = {
  name: "ZM-ILLENNIAL",
  nameL10n: { ko: "지밀레니얼", en: "ZM-ILLENNIAL", ja: "ZM-ILLENNIAL", zh: "ZM-ILLENNIAL" },
  description: "ZM-ILLENNIAL (지밀레니얼) is a cafe in Daeyeon-dong, Nam-gu, Busan, run by the father of BTS's Jimin. It opened in 2019 as MAGNATE.",
  descriptionL10n: { ko: "지밀레니얼은 부산 남구 대연동에 있는 카페로, BTS 지민의 아버지가 운영합니다.", en: "…" },
  whyItMatters: "The cafe run by BTS Jimin's father (formerly MAGNATE).",
  whyItMattersL10n: { ko: "BTS 지민의 아버지가 운영하는 카페(전 MAGNATE)", ja: "BTSジミンの父が営むカフェ", zh: "BTS智旻父亲经营的咖啡馆" },
  tags: ["#Kpop", "#BTS", "#Cafe"],
  subcategory: "Cafe",
  district: "Nam-gu",
  // 내부값 — 검색되면 안 된다
  external_id: "busan:secret-K-00093", lat: 35.1388747, lng: 129.0801719, image_url: "https://gokoreamate.com/images/spots/x.webp",
};

test("한글 설명에만 있는 말(지민)로도 찾는다 — desc_l10n / why_l10n 이 haystack 에 있다", () => {
  for (const q of ["지민", "지밀레니얼", "ZM-ILLENNIAL", "magnate", "BTS", "Jimin", "ジミン", "智旻", "Nam-gu", "cafe", "kpop"]) {
    assert.ok(matchesExploreSearch(zm, normalizeSearchQuery(q)), q);
  }
});

test("내부값(external_id·좌표·이미지 URL)은 검색되지 않고, 빈 검색어는 전부 통과", () => {
  for (const q of ["secret", "35.1388", "129.08", "gokoreamate.com", "webp"]) {
    assert.equal(matchesExploreSearch(zm, normalizeSearchQuery(q)), false, q);
  }
  assert.equal(matchesExploreSearch(zm, normalizeSearchQuery("   ")), true);
  assert.ok(!spotSearchHaystack(zm).some(h => h.includes("secret")));
});

test("l10n 이 없거나 깨진 행도 예전과 같이 name/description/tags/district 로만 찾는다", () => {
  const legacy = { name: "Haeundae Beach", description: "The most famous beach.", tags: ["#Beach"], district: "Haeundae-gu" };
  assert.ok(matchesExploreSearch(legacy, "haeundae"));
  assert.ok(matchesExploreSearch(legacy, "famous"));
  assert.equal(matchesExploreSearch(legacy, "해운대"), false);
  assert.ok(matchesExploreSearch({ ...legacy, nameL10n: null, descriptionL10n: undefined }, "beach"));
});

test("순서 tier: 이름 일치 0 < 태그/구 1 < 설명 2, 빈 검색어는 전부 0", () => {
  const q = normalizeSearchQuery("지밀레니얼");
  assert.equal(exploreSearchTier(zm, q), 0);
  assert.equal(exploreSearchTier({ name: "Other", tags: ["#지밀레니얼"] }, q), 1);
  assert.equal(exploreSearchTier({ name: "Other", descriptionL10n: { ko: "지밀레니얼 옆 카페" } }, q), 2);
  assert.equal(exploreSearchTier({ name: "Other" }, q), 3);
  assert.equal(exploreSearchTier({ name: "Other" }, ""), 0);
});

test("ExploreCity 는 이 haystack 계약을 쓴다 — 장소별 특수 분기·stringify 검색 없음", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "components", "ExploreCity.tsx"), "utf8");
  assert.ok(src.includes("matchesExploreSearch("));
  assert.ok(!/JSON\.stringify\([^)]*\)\.toLowerCase\(\)\.includes/.test(src), "no stringify search");
  assert.ok(!/["']지민["']|id === 93/.test(src), "no place-specific hack");
});

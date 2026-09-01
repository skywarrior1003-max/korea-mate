// 2026-09-01 Fable 5 red-team same-task fixes — regression guard (code-side findings F1/F2/F3/F4/F6/F8/F9/F10/F11)
// 실행: node --experimental-strip-types src/lib/redteam-2026-09-01-ui-fixes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const LOCALES = ["ko", "en", "ja", "zh"] as const;

test("F3: placeholder SVG carries no English text (icon only)", () => {
  assert.ok(!/<text[\s>]/.test(read("public", "images", "placeholder-spot.svg")));
});

test("F1/F8/F2: new message keys exist in all 4 locales", () => {
  for (const l of LOCALES) {
    const m = JSON.parse(read("src", "messages", `${l}.json`));
    for (const k of ["free", "durationApprox"]) assert.ok(m.place[k], `${l}.place.${k}`);
    for (const k of ["foodGuideTitle", "foodGuideNew", "foodGuidePicks", "nearMe", "gpsActive"]) assert.ok(m.homeUi[k], `${l}.homeUi.${k}`);
    assert.ok(m.events.trendingBadge, `${l}.events.trendingBadge`);
    assert.ok(m.allSpots.foodGuideBanner, `${l}.allSpots.foodGuideBanner`);
    for (const c of ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]) assert.ok(m.tripForm[`city_${c}`], `${l}.tripForm.city_${c}`);
    for (const c of ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]) assert.ok(m.cityLinks[`desc${c}`], `${l}.cityLinks.desc${c}`);
  }
  // picks 빈 상태 안내는 더 이상 영어 nav 이름을 섞지 않는다(KO/JA/ZH)
  for (const l of ["ko", "ja", "zh"]) assert.ok(!/Explore|Saved/.test(JSON.parse(read("src", "messages", `${l}.json`)).picks.selectedEmptyHint), l);
});

test("F1/F8: Home · all-spots · picks no longer hardcode the English chrome strings", () => {
  const home = read("src", "app", "HomeClient.tsx");
  for (const s of ['"GPS Active"', '"Near Me"', ">2026 Busan Food Guide<", 'title="2026 Busan Food Guide"', "Michelin · Busan Mat · Taegshlang picks"]) assert.ok(!home.includes(s), s);
  assert.ok(!read("src", "app", "all-spots", "page.tsx").includes("2026 Busan Food Guide — Michelin"));
  assert.ok(read("src", "app", "picks", "PicksClient.tsx").includes("tCityName(`city_${c}`)"));
  assert.ok(!read("src", "components", "EventCard.tsx").includes("🔥 Trending"));
  assert.ok(read("src", "components", "home", "PremiumDiscoveryHome.tsx").includes('useTranslations("cityLinks")'));
});

test("F4: desktop nav on Home and Explore carries the language switcher", () => {
  for (const f of [["src", "app", "HomeClient.tsx"], ["src", "components", "ExploreCity.tsx"]]) {
    const src = read(...f); const navs = src.split("</nav>").length - 1;
    assert.ok((src.match(/<LanguageSwitcher variant="icon"/g) || []).length >= 1, f.join("/"));
    assert.ok(navs >= 1);
  }
});

test("F6/F9/F10: Explore skips V1 permanent static cards, passes the Korean name, localizes city fallback", () => {
  const ex = read("src", "components", "ExploreCity.tsx");
  assert.ok(ex.includes('.type === "permanent") continue;'));
  assert.ok(ex.includes("naverSearchKeyword: (() => { const ko = (spot.nameL10n"));
  assert.ok(ex.includes("{mapPickedSpot.district || tf(cityLabelKey(city))}"));
  const modal = read("src", "components", "EventDetailModal.tsx");
  assert.ok(modal.includes('event.stage !== "Standalone"') && modal.includes("{cityDisplay}") && modal.includes("{typeDisplay}") && modal.includes("{bestTimeDisplay}"));
  assert.ok(read("src", "components", "EventCard.tsx").includes("{cityDisplay}"));
});

test("F2/F11: place detail localizes category/fee/duration; <html lang> follows the locale", () => {
  const pd = read("src", "app", "place", "[id]", "PlaceDetailClient.tsx");
  assert.ok(pd.includes('tExplore(`categories.${spot.category}`)') && pd.includes('t("free")') && pd.includes('t("durationApprox", { n: spot.duration_minutes })'));
  assert.ok(!pd.includes("~{spot.duration_minutes} min"));
  assert.ok(read("src", "components", "I18nProvider.tsx").includes("document.documentElement.lang = locale"));
});

// HOME-SOCIAL-RELEASE-CLEANUP-V1 — 릴리스 정리 회귀 가드.
// 실행: node --experimental-strip-types src/lib/release-cleanup-guard.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

test("A: 제거 확정된 Home legacy 섹션이 돌아오지 않는다 (PLANNER-SPOTS-SEPARATION-V1 반영)", () => {
  const s = read("src", "app", "HomeClient.tsx");
  assert.ok(!s.includes('id="essential"'), "#essential 섹션 금지");
  assert.ok(!s.includes("<CityQuickLinks"), "CityQuickLinks Home 재장착 금지");
  assert.ok(!/Survival Guide Preview ─/.test(s), "Survival 다크 프리뷰 재장착 금지");
  // Owner 결정: #planner 는 /planner 로 분리, #spots-main 은 제거.
  assert.ok(!s.includes('id="planner"'), "planner 섹션은 Home 에 다시 넣지 않는다");
  assert.ok(!s.includes('id="spots-main"') && !s.includes('getElementById("spots-main'), "#spots-main 은 Home 에 다시 넣지 않는다");
  const pc = read("src", "app", "planner", "PlannerClient.tsx");
  assert.ok(pc.includes('id="planner"'), "플래너 기능은 /planner 에 보존된다");
  assert.ok(!pc.includes('id="spots-main"') && !pc.includes('getElementById("spots-main'), "#spots-main 은 플래너 페이지로도 이사하지 않는다");
});

test("A2: 7개 플래너 CTA 가 /planner 를 가리키고 legacy #planner 참조가 없다", () => {
  const surfaces: Array<[string[], RegExp]> = [
    [["src", "app", "my-trips", "page.tsx"], /href="\/planner"/],
    [["src", "app", "place", "[id]", "PlaceDetailClient.tsx"], /href="\/planner"/],
    [["src", "app", "trending", "page.tsx"], /href="\/planner"/],
    [["src", "components", "CartDrawer.tsx"], /router\.push\("\/planner"\)/],
    // city context 보존: ?city=slug 가 그대로 넘어간다 (§9)
    [["src", "components", "CityEntry.tsx"], /href=\{`\/planner\?city=\$\{city\.slug\}`\}/],
    [["src", "components", "ExploreCity.tsx"], /href=\{`\/planner\?city=\$\{city\.slug\}`\}/],
    [["src", "app", "HomeClient.tsx"], /href="\/planner"/],
  ];
  for (const [f, re] of surfaces) {
    const s = read(...f);
    assert.match(s, re, f.join("/"));
    assert.ok(!s.includes('"/#planner"') && !s.includes("#planner`"), `${f.join("/")} — legacy anchor 금지`);
  }
  // Home 은 legacy deep-link(/#planner·?city=·?ref=clone)를 /planner 로 승계한다
  const home = read("src", "app", "HomeClient.tsx");
  assert.match(home, /#planner"[\s\S]{0,120}router\.replace\(`\/planner\$\{window\.location\.search\}`\)/);
});

test("A3: 모바일 검색 트리거는 Anchored Inline Search 로 간다", () => {
  assert.match(read("src", "app", "HomeClient.tsx"), /getElementById\("qh-global-search"\)\?\.focus\(\)/);
  assert.match(read("src", "components", "quiet", "QuietSearch.tsx"), /id="qh-global-search"/);
});

test("A4: 플래너 이동에서 계약 보존 — clone·draft·생성 semantics 그대로", () => {
  const pc = read("src", "app", "planner", "PlannerClient.tsx");
  for (const must of ["resolveCityParam", 'p.get("ref") === "clone"', "readTripDraft", "writeTripDraft",
    "buildItineraryGenerationUrl", "handlePickVibeClick"]) {
    assert.ok(pc.includes(must), must);
  }
  // vibe Pick 은 기존 Explore 로 최소 retarget — 새 discovery flow 발명 금지
  assert.match(pc, /router\.push\(`\/explore\/\$\{cityConfigOf\(city\)\?\.slug \?\? "busan"\}`\)/);
});

test("B: 공개 Helpful UI 가 target surface 에 없다 (데이터와 별개)", () => {
  assert.ok(!read("src", "components", "TripCover.tsx").includes("found it helpful"));
  const tr = read("src", "app", "trending", "page.tsx");
  assert.ok(!tr.includes("👍"), "trending 👍 배지 금지");
  assert.ok(!tr.includes('tH("helpful"'), "trending helpful 카운트 노출 금지");
});

test("B2: 공개 copy count 노출 금지 (Copied× 배지)", () => {
  assert.ok(!/Copied \{copyCount\}/.test(read("src", "components", "TripCover.tsx")));
  assert.ok(!read("src", "app", "trending", "page.tsx").includes('tH("copies"'));
});

test("C: Helpful 데이터·서버 경로는 보존된다 — 삭제/마이그레이션 금지", () => {
  assert.ok(existsSync(path.join(ROOT, "functions", "api", "itinerary", "helpful", "[id].ts")));
  assert.ok(existsSync(path.join(ROOT, "supabase", "migrations", "010_helpful_count.sql")));
  assert.ok(read("src", "lib", "itinerary-api.ts").includes("apiHelpfulVote"), "복사자→원작자 helpful 채널 보존");
  // Helpful 을 Like 로 변환/복사하지 않는다
  assert.ok(!/helpful[\s\S]{0,80}content_likes|content_likes[\s\S]{0,80}helpful_count/i.test(
    read("functions", "api", "content-like.ts")), "helpful→likes 마이그레이션 금지");
});

test("D: 🔥 가 target public surface 에 없다 (새 flame 아이콘도 금지)", () => {
  for (const f of [
    ["src", "app", "trending", "page.tsx"],
    ["src", "app", "shared", "page.tsx"],
    ["src", "components", "EventCard.tsx"],
    ["src", "components", "EventDetailModal.tsx"],
    ["src", "components", "TripCover.tsx"],
  ]) assert.ok(!read(...f).includes("🔥"), f.join("/"));
});

test("E: TripStoryExport 액션/토스트 이모지 제거", () => {
  const s = read("src", "components", "TripStoryExport.tsx");
  for (const e of ["⬇️", "📥", "✅", "🔗", "📤", "🎴", "✨"]) assert.ok(!s.includes(e), e);
});

test("F2: 플래너 액션/타이틀 문자열에 ✨ 이모지가 없다 (4언어)", () => {
  for (const loc of ["en", "ko", "ja", "zh"]) {
    const tf = JSON.parse(read("src", "messages", `${loc}.json`)).tripForm;
    for (const k of ["title", "pickVibe", "generate"]) {
      assert.ok(!tf[k].includes("✨"), `${loc}.tripForm.${k}`);
      assert.ok(tf[k].trim().length > 0, `${loc}.tripForm.${k} 가 비면 안 된다`);
    }
  }
});

test("I: 060 마이그레이션 불변 — sha256 고정 (PRODUCTION APPLIED = NO 상태 유지)", () => {
  const buf = readFileSync(path.join(ROOT, "supabase", "migrations", "060_social_actions_foundation.sql"));
  assert.equal(createHash("sha256").update(buf).digest("hex"),
    "bb27138626fd23ed5c77de434e219083ff972b4551fffc0845a6214ba3105728");
});

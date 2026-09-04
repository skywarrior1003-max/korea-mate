// HOME-SOCIAL-RELEASE-CLEANUP-V1 — 릴리스 정리 회귀 가드.
// 실행: node --experimental-strip-types src/lib/release-cleanup-guard.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

test("A: 제거 확정된 Home legacy 섹션이 돌아오지 않는다", () => {
  const s = read("src", "app", "HomeClient.tsx");
  assert.ok(!s.includes('id="essential"'), "#essential 섹션 금지");
  assert.ok(!s.includes("<CityQuickLinks"), "CityQuickLinks Home 재장착 금지");
  assert.ok(!/Survival Guide Preview ─/.test(s), "Survival 다크 프리뷰 재장착 금지");
  // #planner 와 #spots-main 은 Owner 결정 전까지 의도적으로 유지된다(§planner 감사).
  assert.ok(s.includes('id="planner"'), "planner 는 유일한 일정 생성 진입 — 임의 삭제 금지");
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

test("I: 060 마이그레이션 불변 — sha256 고정 (PRODUCTION APPLIED = NO 상태 유지)", () => {
  const buf = readFileSync(path.join(ROOT, "supabase", "migrations", "060_social_actions_foundation.sql"));
  assert.equal(createHash("sha256").update(buf).digest("hex"),
    "bb27138626fd23ed5c77de434e219083ff972b4551fffc0845a6214ba3105728");
});

// Social Actions Foundation — 소스/스키마 가드.
// 실행: node --experimental-strip-types src/lib/social/social-foundation-guard.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

test("A: Heart 가 Save 로 쓰이는 quiet surface 가 없다 (하트 글리프는 Like 전용)", () => {
  for (const f of [["src", "components", "quiet", "PlacesAllClient.tsx"], ["src", "components", "quiet", "CityHubClient.tsx"], ["src", "components", "quiet", "QuietHome.tsx"]]) {
    const s = read(...f);
    assert.ok(!s.includes("♥") && !s.includes("♡"), f.join("/"));
  }
  // Like 버튼들은 하트 path 를 쓴다
  for (const f of [["src", "components", "PlaceLikeButton.tsx"], ["src", "components", "ContentLikeButton.tsx"]]) {
    assert.ok(read(...f).includes("M12 20.5s-7.2-4.7-9.3-9"), f.join("/"));
  }
});

test("B: Bookmark Save 회귀 없음 — 중앙 toggle 재사용·Saved 목적 불변", () => {
  const q = read("src", "components", "quiet", "PlacesAllClient.tsx");
  assert.ok(q.includes("togglePlaceSaved(item)") && q.includes("M6.5 4.5h11a1 1 0 011 1V20l-6.5-3.4L5.5 20V5.5a1 1 0 011-1z"));
  const core = read("src", "lib", "place-actions", "place-actions-core.ts");
  assert.ok(core.includes("toggleFavorite(place.id, getItemSourceKey(place))") && core.includes("cacheSavedSpot(place)"));
  assert.ok(core.includes("reportPlaceSaveSignal(place, true)") && core.includes("reportPlaceSaveSignal(place, false)"));
});

test("C/D/E: Like 표면 — Place 마운트·Trip/Story 는 content-like·공개 검증", () => {
  assert.ok(read("src", "app", "place", "[id]", "PlaceDetailClient.tsx").includes('<PlaceLikeButton targetType="city_spot"'));
  const shared = read("src", "app", "shared", "page.tsx");
  assert.ok(shared.includes('targetType="itinerary"') && shared.includes('targetType="story"'));
  const api = read("functions", "api", "content-like.ts");
  assert.ok(api.includes("is_public=eq.true") && api.includes("trip_moments?itinerary_id"), "공개 검증");
  assert.ok(api.includes("ins.status !== 409"), "중복은 멱등 처리(UNIQUE)");
});

test("F: Share — 대상 공개 검증·공개 count 미노출·GET 없음", () => {
  const api = read("functions", "api", "share-event.ts");
  assert.ok(api.includes("is_public=eq.true"));
  assert.ok(!api.includes("onRequestGet"), "share count 조회 API 없음");
  assert.ok(read("functions", "api", "place-save.ts").includes("onRequestPost") && !read("functions", "api", "place-save.ts").includes("onRequestGet"));
});

test("G: + My Trip — 기존 copy flow 재사용·copy_of 보존", () => {
  const copy = read("functions", "api", "itinerary", "copy.ts");
  assert.ok(copy.includes("copy_of") && copy.includes("increment_copy_count"));
  const shared = read("src", "app", "shared", "page.tsx");
  assert.ok(shared.includes("apiCopyItinerary") && !shared.includes("\u{1F4CB}"));
  // 표현만 + My Trip — API 내부 이름(copy)은 유지
  const en = JSON.parse(read("src", "messages", "en.json"));
  assert.equal(en.story.copyTrip, "+ My Trip");
});

test("H: Helpful 은 변환·삭제되지 않았다", () => {
  assert.ok(read("supabase", "migrations", "010_helpful_count.sql").includes("helpful_count"));
  const mig = read("supabase", "migrations", "060_social_actions_foundation.sql");
  assert.ok(!/drop\s+table/i.test(mig) && !/drop\s+column/i.test(mig));
  assert.ok(!/alter\s+table[\s\S]*?helpful/i.test(mig) && !/update\s+[\s\S]*?helpful/i.test(mig), "helpful 을 만지지 않는다");
});

test("I: 신규 social 테이블/API 는 raw device 를 저장하지 않는다", () => {
  const mig = read("supabase", "migrations", "060_social_actions_foundation.sql");
  assert.ok(!/device_id\s+(text|uuid)/i.test(mig), "테이블에 device 컬럼 없음");
  for (const k of ["liker_key", "saver_key", "actor_key"]) assert.ok(mig.includes(`char_length(${k}) = 64`), k);
  assert.ok(mig.includes("enable row level security"));
  for (const f of ["content-like.ts", "place-save.ts", "share-event.ts"]) {
    const s = read("functions", "api", f);
    assert.ok(s.includes("actorKey("), f);
    assert.ok(!/device_id\s*:/.test(s.replace(/x-device-id/g, "")), `${f} 가 device_id 를 body 로 저장하지 않음`);
  }
});

test("J: 공개 응답에 Save/Share/MyTripCopy count 미노출", () => {
  const like = read("functions", "api", "content-like.ts");
  assert.ok(!like.includes("place_saves") && !like.includes("share_events"));
  // Like GET 응답은 count/liked 뿐 (core 의 likeState 계약)
  assert.ok(read("src", "lib", "social", "social-actions-core.ts").includes("count: Math.max(0, count), liked"));
});

test("메시지: + My Trip 4개 언어 · Like 라벨 존재", () => {
  const want: Record<string, string> = { en: "+ My Trip", ko: "+ 내 여행", ja: "+ マイトリップ", zh: "+ 我的行程" };
  for (const l of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(read("src", "messages", `${l}.json`));
    assert.equal(m.story.copyTrip, want[l], l);
    assert.ok(m.like?.like && m.like?.liked, `${l}.like.*`);
  }
});

// ── CLOSEOUT (2026-09-04 Owner 확정): Save 는 V1 에서 Place 에만 존재한다.
// Place = Like/Save/Share · Story = Like/Share · 공유된 여행 일정 = Like/Share/+My Trip.
// 같은 아이콘 = 같은 의미이지만, 모든 콘텐츠에 모든 액션이 있어야 하는 것은 아니다.
const BOOKMARK_PATH = "M6.5 4.5h11";

test("CLOSEOUT C/D: Story·공유 여행 상세에 Bookmark Save 가 없다", () => {
  for (const f of [
    ["src", "app", "shared", "page.tsx"],
    ["src", "components", "story", "StorySummary.tsx"],
    ["src", "components", "story", "StoryJournal.tsx"],
    ["src", "components", "story", "StoryCover.tsx"],
  ]) {
    const s = read(...f);
    assert.ok(!s.includes(BOOKMARK_PATH) && !s.includes("togglePlaceSaved"), f.join("/"));
  }
});

test("CLOSEOUT E: Place Detail = Like + Save + Share", () => {
  const s = read("src", "app", "place", "[id]", "PlaceDetailClient.tsx");
  assert.ok(s.includes("<PlaceLikeButton"), "Like");
  assert.ok(s.includes("togglePlaceSaved"), "Save");
  assert.ok(s.includes("handleShare") && s.includes("reportShareEvent"), "Share");
});

test("CLOSEOUT F/G: 공유 여행 = Like/Share/+My Trip · Story 표면 = Like/Share", () => {
  const s = read("src", "app", "shared", "page.tsx");
  assert.ok(s.includes('targetType="itinerary"') && s.includes('targetType="story"'), "Like 두 표면");
  assert.ok(s.includes("apiCopyItinerary"), "+ My Trip(copy) 유지");
  assert.ok(s.includes("onShare") || s.includes("share"), "Share 유지");
  const en = JSON.parse(read("src", "messages", "en.json"));
  assert.equal(en.story.copyTrip, "+ My Trip");
});

test("CLOSEOUT H/I: Picks>Saved 는 Place 저장 그대로 — 새 Saved IA 없음", () => {
  const picks = read("src", "app", "picks", "PicksClient.tsx");
  assert.ok(picks.includes("getFavorites") || picks.includes("favorites"), "Place favorites 기반 유지");
  const appDirs = readdirSync(path.join(ROOT, "src", "app"));
  for (const bad of ["saved", "saved-stories", "saved-trips", "library"]) {
    assert.ok(!appDirs.includes(bad), `신규 Saved IA 라우트 금지: /${bad}`);
  }
  // 하단 내비 5탭 키 불변
  const nav = read("src", "components", "ui", "BottomNav.tsx");
  for (const k of ['key: "home"', 'key: "explore"', 'key: "picks"', 'key: "trips"', 'key: "more"']) assert.ok(nav.includes(k), k);
});

test("CLOSEOUT J: 060 은 Story/Trip Save 를 포함하지 않는다 — Save 대상은 city_spot 뿐", () => {
  const mig = read("supabase", "migrations", "060_social_actions_foundation.sql");
  assert.ok(mig.includes("check (target_type in ('city_spot'))"), "place_saves 는 city_spot 전용");
  for (const bad of ["story_saves", "trip_saves", "itinerary_saves", "saved_stories", "saved_trips"]) {
    assert.ok(!mig.includes(bad), `story/trip save 테이블 금지: ${bad}`);
  }
});

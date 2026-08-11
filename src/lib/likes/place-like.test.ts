// 장소 좋아요 계약 고정.
//
// 이 테스트가 지키는 것은 **의미의 분리**다.
//   Saved  = 내 기기에만 있는 개인 북마크
//   Like   = 공개 긍정 신호
//   Report = 데이터·현장 품질 신호
//   spot_reactions dislike = 기존 신뢰도 이슈 신호
// 넷을 자동으로 동기화하지 않고, 좋아요에서 신고를 빼는 점수도 만들지 않는다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LIKE_TARGET_TYPES, LIKE_ACTIONS, MAX_BODY_BYTES, LIKE_RATE_MAX,
  isValidLikeTargetType, isValidLikeTargetKey, isValidDeviceId,
  likerKey, likerKeyInput, validateLikeRequest, likeState,
} from "./place-like-core.ts";
import { reporterKey } from "../reports/place-report-core.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DEV  = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const DEV2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const body = (over: Record<string, unknown> = {}) =>
  ({ target_type: "city_spot", target_key: "99", action: "like", ...over });

// ── L1·L3·L4 like / unlike / re-like ────────────────────────────────────────

test("★L1 공개 장소 좋아요 요청은 통과한다", () => {
  const r = validateLikeRequest(body(), DEV);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value,
    { target_type: "city_spot", target_key: "99", action: "like", device_id: DEV });
});

test("★L3·L4 취소도 다시 누르기도 같은 계약이다", () => {
  assert.deepEqual([...LIKE_ACTIONS], ["like", "unlike"]);
  for (const a of LIKE_ACTIONS) assert.equal(validateLikeRequest(body({ action: a }), DEV).ok, true, a);
  for (const a of ["toggle", "LIKE", "", null, 1]) {
    const r = validateLikeRequest(body({ action: a }), DEV);
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, "invalid_action");
  }
  // 취소는 행을 지운다 → 나중에 다시 누를 수 있다. 영구 차단이 아니다.
  const fn = code("functions", "api", "place-like.ts");
  assert.match(fn, /rest\(env, "DELETE", `place_likes\?liker_key=eq\.\$\{lkey\}`/);
});

test("★L2 같은 기기의 중복 좋아요는 DB 유니크가 막고, 오류로 취급하지 않는다", () => {
  const m = read("supabase", "migrations", "043_place_likes.sql");
  assert.match(m, /create unique index if not exists uq_place_likes_liker_target/);
  assert.match(m, /\(liker_key, target_type, target_key\)/);
  const fn = code("functions", "api", "place-like.ts");
  assert.match(fn, /23505/);                      // 이미 눌러져 있음 = 정상
  // 중복이면 오류로 떨어지지 않고 정상 흐름을 그대로 탄다
  assert.match(fn, /const dup = ins\.status === 409/);
  assert.match(fn, /if \(!ins\.ok && !dup\)/);
});

test("★L5 다른 기기는 별개의 좋아요다", async () => {
  const a = await likerKey(DEV,  "city_spot", "99");
  const b = await likerKey(DEV2, "city_spot", "99");
  assert.notEqual(a, b);
});

// ── L6·L7 count / 내 상태 ───────────────────────────────────────────────────

test("★L6·L7 응답은 서버가 센 숫자와 내 상태뿐이다", () => {
  assert.deepEqual(likeState(0, false), { count: 0, liked: false });
  assert.deepEqual(likeState(7, true),  { count: 7, liked: true });
  assert.deepEqual(likeState(-3, false), { count: 0, liked: false });   // 음수가 새지 않는다
  const fn = code("functions", "api", "place-like.ts");
  // 클라이언트가 보낸 숫자를 믿지 않고 서버가 다시 센다
  assert.match(fn, /async function countLikes/);
  assert.match(fn, /count=exact/);
  assert.match(fn, /const count = await countLikes\(env, r\.target_type, r\.target_key\)/);
});

// ── L8~L10 대상 검증 ────────────────────────────────────────────────────────

test("★L8 잘못된 대상은 거부한다", () => {
  for (const t of ["restaurant", "", 1, null]) {
    const r = validateLikeRequest(body({ target_type: t }), DEV);
    assert.equal(r.ok, false, String(t));
  }
  for (const k of ["abc", "1; drop", "", "  ", "-1", "1".repeat(20)]) {
    assert.equal(validateLikeRequest(body({ target_key: k }), DEV).ok, false, k);
  }
  assert.equal(isValidLikeTargetKey("city_spot", "412"), true);
  assert.equal(isValidDeviceId("nope"), false);
  assert.equal(validateLikeRequest(body(), "nope").ok, false);
});

test("★L9 존재하지 않는 장소는 좋아요할 수 없다", () => {
  const fn = code("functions", "api", "place-like.ts");
  assert.match(fn, /async function targetExists/);
  assert.match(fn, /city_spots\?id=eq\./);
  assert.match(fn, /if \(!\(await targetExists\(env, r\.target_key\)\)\)/);
});

test("★L10 private user_spot 은 좋아요 대상이 아니다", () => {
  assert.deepEqual([...LIKE_TARGET_TYPES], ["city_spot"]);
  assert.equal(isValidLikeTargetType("user_spot"), false);
  assert.equal(isValidLikeTargetType("itinerary"), false);
  assert.equal(validateLikeRequest(body({ target_type: "user_spot" }), DEV).ok, false);
});

// ── L11~L14 개인정보·보안 ───────────────────────────────────────────────────

test("★L11 raw device_id 를 저장하지 않는다", async () => {
  const k = await likerKey(DEV, "city_spot", "99");
  assert.equal(k.length, 64);
  assert.doesNotMatch(k, /-/);
  assert.ok(!k.includes(DEV.slice(0, 8)));
  // 장소가 다르면 값도 다르다 — 한 사람의 취향 전체를 재구성할 수 없다
  assert.notEqual(k, await likerKey(DEV, "city_spot", "100"));
  assert.match(likerKeyInput(DEV, "city_spot", "99"), /\|like:city_spot:99$/);
  // 좋아요와 신고의 키가 서로 달라야 두 기록을 이어 붙일 수 없다
  assert.notEqual(k, await reporterKey(DEV, "city_spot", "99"));
  // 저장하는 컬럼에 device 원문이 없다
  const fn = code("functions", "api", "place-like.ts");
  assert.doesNotMatch(fn, /liker_key: (deviceId|r\.device_id)/);
  assert.match(fn, /liker_key: lkey/);
});

test("★L12 liker 식별값이 응답·로그에 나가지 않는다", () => {
  const fn = code("functions", "api", "place-like.ts");
  assert.doesNotMatch(fn, /json\([\s\S]{0,80}?(lkey|liker_key|deviceId)/);
  assert.doesNotMatch(fn, /log\(\{[^}]*(lkey|liker_key|deviceId|device_id)/);
  assert.match(fn, /return json\(likeState\(count, /);
});

test("★L13 raw row 를 아무나 읽을 수 없다", () => {
  const m = read("supabase", "migrations", "043_place_likes.sql");
  assert.match(m, /enable row level security/i);
  for (const role of ["anon", "authenticated", "public"]) {
    assert.match(m, new RegExp(`revoke all on public\\.place_likes from ${role}`, "i"), role);
  }
  assert.doesNotMatch(m, /create policy/i);
  assert.doesNotMatch(m, /grant (select|insert|update|delete)[^\n]*to (anon|authenticated|public)/i);
});

test("★L14 브라우저가 DB 에 직접 쓰지 않는다", () => {
  const ui = code("src", "components", "PlaceLikeButton.tsx");
  assert.doesNotMatch(ui, /supabase|createClient|rest\/v1|SERVICE_ROLE/i);
  assert.match(ui, /fetch\("\/api\/place-like"/);
  assert.match(code("functions", "api", "place-like.ts"), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(MAX_BODY_BYTES, 1024);
  assert.ok(LIKE_RATE_MAX > 0);
});

// ── L15~L19 다른 시스템을 건드리지 않는다 ───────────────────────────────────

test("★L15 Like 는 Saved 를 바꾸지 않는다", () => {
  const ui   = code("src", "components", "PlaceLikeButton.tsx");
  const core = code("src", "lib", "likes", "place-like-core.ts");
  for (const s of [ui, core]) {
    assert.doesNotMatch(s, /toggleFavorite|cacheSavedSpot|koreamate_favorites|getFavorites/);
  }
  // Saved 쪽도 좋아요를 모른다
  assert.doesNotMatch(code("src", "lib", "favorites.ts"), /place_like|likerKey/i);
});

test("★L16·L17 Like 는 Report·Helpful 과 무관하다", () => {
  const fn = code("functions", "api", "place-like.ts");
  assert.doesNotMatch(fn, /place_reports|helpful/i);
  assert.doesNotMatch(code("functions", "api", "place-report.ts"), /place_likes|likerKey/i);
});

test("★L18 기존 spot_reactions 를 건드리지 않는다", () => {
  const fn   = code("functions", "api", "place-like.ts");
  const core = code("src", "lib", "likes", "place-like-core.ts");
  for (const s of [fn, core]) assert.doesNotMatch(s, /spot_reactions/);
  // 043 은 기존 테이블을 변경하지 않는다
  const m = read("supabase", "migrations", "043_place_likes.sql");
  assert.doesNotMatch(m, /alter table public\.spot_reactions|alter table public\.city_spots/i);
});

test("★L19 AI scheduler 는 좋아요를 쓰지 않는다", () => {
  for (const f of [["src","lib","scheduler","engine.ts"], ["src","lib","scheduler","profile-bias.ts"],
                   ["src","lib","planner","saved-signals.ts"]]) {
    assert.doesNotMatch(read(...f), /place_like|likerKey/i, f.join("/"));
  }
});

test("★Like 와 Report 를 한 점수로 합치지 않는다", () => {
  const core = code("src", "lib", "likes", "place-like-core.ts");
  assert.doesNotMatch(core, /popularity|net_score|combined|report/i);
  assert.doesNotMatch(core, /like[^\n]*-[^\n]*report/i);
});

// ── L20~L22 UI ──────────────────────────────────────────────────────────────

// 이 가드는 원래 Place Detail 에 PlaceLikeButton 이 두 곳 있어야 한다고 요구했다.
// 그 뒤 4fa94ad "make Save the only action when a place is first seen" 로 장소
// 상세의 일반 Like 는 제품에서 빠졌다. 제거된 기능을 계속 요구하면 가드가
// 상시 빨간 상태가 되어 진짜 회귀를 가린다.
//
// 그래서 요구를 뒤집는다 — 지금 지켜야 할 규칙은 "장소 상세의 첫 액션은
// Save 이고, 거기에 일반 Like 를 되살리지 않는다" 이다.
test("★L20 장소 상세의 첫 액션은 Save 이고 일반 Like 를 되살리지 않는다", () => {
  const page = read("src", "app", "place", "[id]", "PlaceDetailClient.tsx");
  assert.equal((page.match(/<PlaceLikeButton/g) ?? []).length, 0,
    "장소 상세에 일반 Like 를 다시 넣지 않는다 (4fa94ad)");
  // Save 는 남아 있어야 한다 — 이 화면의 유일한 1차 액션이다
  assert.match(page, /toggleFavorite/, "Save 액션이 사라졌다");
  assert.match(page, /useTranslations\("saved"\)/, "Save 문구는 번역을 거친다");
});

// 컴포넌트 자체는 Story·Memory 쪽 재사용을 위해 남아 있다. 되살릴 때를 대비해
// Saved 와 모양이 겹치지 않는다는 규칙만 컴포넌트 단위로 계속 지킨다.
test("★L20-b Like 버튼은 Saved 북마크와 모양이 겹치지 않는다", () => {
  const ui = read("src", "components", "PlaceLikeButton.tsx");
  assert.match(ui, /min-h-11/);                 // 터치 타깃
  assert.doesNotMatch(ui, /M6\.5 4\.5h11/);     // Saved 북마크 path
  assert.match(ui, /aria-pressed=\{liked\}/);
});

test("★L21·L22 낙관적 갱신은 실패 시 정확히 되돌리고, 연타로 숫자가 어긋나지 않는다", () => {
  const ui = read("src", "components", "PlaceLikeButton.tsx");
  assert.match(ui, /if \(busy\) return;/);                       // 연타 방지
  assert.match(ui, /const prevLiked = liked, prevCount = count;/);
  assert.match(ui, /setLiked\(prevLiked\); setCount\(prevCount\);/);
  // 최종 값은 언제나 서버가 센 것
  assert.match(ui, /setCount\(b\.count\); setLiked\(b\.liked\);/);
  assert.match(ui, /finally \{\s*\n\s*setBusy\(false\);/);
});

test("★043 migration 은 파괴적이지 않다", () => {
  const m = read("supabase", "migrations", "043_place_likes.sql");
  assert.match(m, /create table if not exists public\.place_likes/);
  assert.doesNotMatch(m, /drop table (?!if exists public\.place_likes)/i);
  assert.doesNotMatch(m, /\bdelete from\b|\btruncate\b/i);
  assert.match(m, /place_likes_target_type_chk/);
  assert.match(m, /char_length\(liker_key\) = 64/);
});

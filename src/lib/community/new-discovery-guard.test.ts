// PAGINATION-AND-NEW-DISCOVERY-V1 회귀 가드
// 실행: node --experimental-strip-types src/lib/community/new-discovery-guard.test.ts
//
// §10 계약 고정: 1,005개 fixture 전역 순위·페이지 연속성 / 60일 경계·freshness /
// 신규 pool 1000 / 게시 연결 검증 / SQL 계약(트리거·RLS·비공개) / limit 상한.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { comparePlaceRanked, type PlaceRankInput } from "./community-core.ts";
import {
  clampPublicLimit, clampPage, paginateRanked,
  ageDays, freshnessBonus, isWithinNewWindow, compareNewRanked, newPool,
  DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, NEW_POOL_MAX,
} from "./ranking-page-core.ts";
import { rankStoriesNew, serializeStoryCard, type StoryCandidate } from "./recommendations-server.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const DAY = 86_400_000;
const NOW = Date.parse("2026-09-25T12:00:00Z");

// ── §10-1: 1,005개 후보 — 1,000행 절단 회귀 ────────────────────────────────
test("§10-1 — 1,005개 전 후보가 전역 순위에 포함되고 페이지 rank 가 연속·무중복", () => {
  const mk = (id: number, likes = 0, usage = 0): PlaceRankInput =>
    ({ id: String(id), likes, dislikes: 0, usage, editorialIndex: Infinity });
  const all: PlaceRankInput[] = [];
  for (let i = 1; i <= 1005; i++) all.push(mk(i));
  // 1,003번째(구 절단 구간) 후보에 강한 반응 — 전역 1위로 올라와야 한다
  all[1002] = mk(1003, 1, 2);
  const ranked = [...all].sort(comparePlaceRanked);
  assert.equal(ranked.length, 1005, "후보 누락");
  assert.equal(ranked[0].id, "1003", "1000행 밖 후보가 전역 상위로 오지 못함");

  // 페이지 24개 단위 — rank 연속·중복 0·누락 0
  const seen = new Set<string>();
  let expectedRank = 1;
  for (let page = 1; ; page++) {
    const p = paginateRanked(ranked, page, 24);
    assert.ok(p.items.length <= 24, "limit 초과 반환");
    for (const it of p.items) {
      assert.equal(it.rank, expectedRank++, "rank 불연속");
      assert.ok(!seen.has(it.id), `중복 ID ${it.id}`);
      seen.add(it.id);
    }
    assert.equal(p.total, 1005);
    if (!p.hasMore) break;
  }
  assert.equal(seen.size, 1005, "페이지 합집합에 누락 존재");
  // page 2 첫 rank = page 1 마지막 + 1
  assert.equal(paginateRanked(ranked, 2, 24).items[0].rank, 25);
});

test("§5-2 — public limit 상한 30·기본 24·page clamp", () => {
  assert.equal(clampPublicLimit(undefined), DEFAULT_PAGE_LIMIT);
  assert.equal(clampPublicLimit("2000"), MAX_PAGE_LIMIT);
  assert.equal(clampPublicLimit("30"), 30);
  assert.equal(clampPublicLimit("0"), DEFAULT_PAGE_LIMIT);
  assert.equal(clampPublicLimit("abc"), DEFAULT_PAGE_LIMIT);
  assert.equal(clampPage("0"), 1);
  assert.equal(clampPage("999999"), 1000, "무제한 offset scan 금지");
});

// ── §10-2: 60일 경계 ────────────────────────────────────────────────────────
test("§10-2 — 60일 창: 59d23:59:59 포함·정확히 60일 제외·미래 clamp·불변 시각", () => {
  assert.equal(isWithinNewWindow(NOW, NOW), true, "승인 직후 포함");
  assert.equal(isWithinNewWindow(NOW, NOW - (60 * DAY - 1000)), true, "59일 23:59:59 포함");
  // 경계 정책: 정확히 60×24h 경과 시점부터 제외(엄격 미만 포함)
  assert.equal(isWithinNewWindow(NOW, NOW - 60 * DAY), false, "60일 정각은 제외");
  assert.equal(isWithinNewWindow(NOW, NOW + DAY), true, "미래 시각은 age 0 취급·포함");
  assert.equal(ageDays(NOW, NOW + DAY), 0, "음수 age clamp");
});

test("§10-3 — freshnessBonus 6→0 선형·clamp", () => {
  assert.equal(freshnessBonus(NOW, NOW), 6);
  assert.equal(freshnessBonus(NOW, NOW - 30 * DAY), 3);
  assert.equal(freshnessBonus(NOW, NOW - 60 * DAY), 0);
  assert.equal(freshnessBonus(NOW, NOW - 90 * DAY), 0, "만료 후 음수 금지");
  assert.equal(freshnessBonus(NOW, NOW + 5 * DAY), 6, "미래는 최대 6 으로 clamp");
});

test("§10-3 — 신규 정렬: 반응 0 노출·base 반영(활용=3점)·tie 안정", () => {
  const mk = (id: string, likes: number, dislikes: number, usage: number, ago: number) =>
    ({ id, likes, dislikes, usage, firstAtMs: NOW - ago * DAY });
  const cmp = compareNewRanked(NOW);
  // 반응 0 신규(오늘 승인, bonus 6) vs 오래된 항목의 like 5(base5+bonus≈0.5@55d)
  assert.ok(cmp(mk("fresh", 0, 0, 0, 0), mk("old-liked", 5, 0, 0, 55)) < 0, "새 항목 노출 기회");
  // usage 1(+3) — 같은 나이의 like 2 보다 위
  assert.ok(cmp(mk("u", 0, 0, 1, 10), mk("l", 2, 0, 0, 10)) < 0);
  // dislike 하락
  assert.ok(cmp(mk("clean", 0, 0, 0, 10), mk("down", 0, 1, 0, 10)) < 0);
  // 완전 동점 — id 안정
  const tie = [mk("b", 0, 0, 0, 5), mk("a", 0, 0, 0, 5)];
  assert.deepEqual([...tie].sort(cmp).map(x => x.id), ["a", "b"]);
  assert.deepEqual([...tie].reverse().sort(cmp).map(x => x.id), ["a", "b"], "반복 정렬 안정");
});

test("§10-2 — 신규 pool 은 최신순 상위 1000 만", () => {
  const all = [];
  for (let i = 1; i <= 1001; i++) all.push({ id: String(i).padStart(4, "0"), firstAtMs: NOW - i * 60_000 });
  const pool = newPool(NOW, all);
  assert.equal(pool.length, NEW_POOL_MAX);
  assert.equal(pool[0].id, "0001", "최신 우선");
  assert.ok(!pool.some(x => x.id === "1001"), "1001번째(가장 오래된) 는 pool 밖");
});

// ── §10-5: 신규 Story 자격 ──────────────────────────────────────────────────
test("§10-5 — 신규 Story: first_approved_at 실재 ∩ 공개 moment 필수·소급 금지", () => {
  const mk = (id: string, firstApprovedAtMs: number | null, hasPublicMoment: boolean): StoryCandidate => ({
    id, likes: 0, dislikes: 0, usage: 0, approvedAt: null,
    title: null, days: 2, stops: 3, firstApprovedAtMs, hasPublicMoment,
  });
  const out = rankStoriesNew([
    mk("ok", NOW - DAY, true),
    mk("no-first", null, true),           // 소급(과거 승인분) — 컬럼 없음 → 제외
    mk("no-moment", NOW - DAY, false),    // 공개 moment 0 → 제외
    mk("expired", NOW - 61 * DAY, true),  // 60일 초과 → 제외
  ], NOW);
  assert.deepEqual(out.map(s => s.id), ["ok"]);
  // 카드 직렬화에 dislikes·점수 자리가 없다
  const card = serializeStoryCard(out[0], null) as Record<string, unknown>;
  for (const banned of ["dislikes", "dislikeCount", "score", "newScore", "baseScore", "firstApprovedAtMs"]) {
    assert.ok(!(banned in card), `카드에 금지 필드 ${banned}`);
  }
});

// ── SQL·API 계약(문자열 가드) ───────────────────────────────────────────────
test("070 — 최초 시각 불변 트리거·연결표 RLS·backfill 0", () => {
  const sql = read("supabase/migrations/070_new_discovery_foundations.sql");
  assert.ok(sql.includes("first_approved_at := OLD.first_approved_at"), "최초 승인 불변 강제 소실");
  assert.ok(sql.includes("place_suggestion_publications_immutable"), "연결 불변 트리거 소실");
  assert.ok(/REVOKE ALL ON public\.place_suggestion_publications FROM PUBLIC, anon, authenticated/.test(sql));
  assert.ok(!/INSERT INTO/i.test(sql) && !/UPDATE public\.(story_submissions|city_spots)\s+SET/i.test(sql), "backfill 금지 위반");
  assert.ok(!/DROP TABLE|DROP COLUMN/i.test(sql), "파괴적 변경 금지");
});

test("071 — RPC: 정렬 계약·service_role 전용·score 비반환·60일·pool 1000", () => {
  const sql = read("supabase/migrations/071_community_ranking_rpcs.sql");
  assert.ok(/ORDER BY score DESC, usage_c DESC, like_c DESC, eidx ASC, id ASC/.test(sql), "인기 정렬 계약");
  assert.ok(/ORDER BY \(base \+ bonus\) DESC, base DESC, usage_c DESC, like_c DESC,\s*\n\s*first_published_at DESC, id ASC/.test(sql), "신규 정렬 계약");
  assert.ok(sql.includes("interval '60 days'") && sql.includes("LIMIT 1000"), "60일 창·pool 상한");
  assert.ok((sql.match(/GRANT EXECUTE[^;]+TO service_role/g) ?? []).length === 2, "service_role 전용 권한");
  assert.ok((sql.match(/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon, authenticated/g) ?? []).length === 2);
  // 최종 SELECT 가 점수를 내보내지 않는다
  for (const m of sql.matchAll(/^\s*SELECT tot, rn, id, like_c, usage_c\s*$/gm)) assert.ok(m);
  assert.equal((sql.match(/SELECT tot, rn, id, like_c, usage_c/g) ?? []).length, 2, "RPC 반환 컬럼 계약");
});

test("§6 — admin 연결 endpoint: 검증 5종·중복 409·admin 키 재사용", () => {
  const src = read("functions/api/admin/place-suggestion-publications.ts");
  assert.ok(src.includes("checkAdminAuth"), "admin 키 계약 소실");
  for (const s of ["suggestion_not_accepted", "city_spot_not_published", "city_mismatch", "duplicate_suggestion", "duplicate_spot"]) {
    assert.ok(src.includes(s), `검증 사유 소실: ${s}`);
  }
  assert.ok(!/city_spots`?,?\s*\[?\{/.test(src) && !src.includes("INSERT INTO city_spots"), "자동 city_spots 생성 금지");
});

test("§8 — UI: 탭·URL 상태·신규 표기·공식 무혼합·Hub 신규 진입점", () => {
  const places = read("src/components/quiet/PlacesAllClient.tsx");
  assert.ok(places.includes("tab=new") && places.includes("useSearchParams"), "URL 탭 상태 소실");
  assert.ok(places.includes("communityNewRank") && places.includes("newPlacesEmpty") && places.includes("loadMore"));
  const tripsUi = read("src/components/quiet/TripsAllClient.tsx");
  assert.ok(tripsUi.includes("communityNewRank") && tripsUi.includes("newStoriesEmpty") && tripsUi.includes("backToPopular"));
  assert.ok(tripsUi.includes("communityOfficialRank"), "공식 editorial 순번 소실");
  // 신규 탭 분기에서 공식 코스 렌더 금지 — 빈 상태/스토리 목록만
  const newBranch = tripsUi.slice(tripsUi.indexOf('tab === "new" ?'), tripsUi.indexOf(") : (", tripsUi.indexOf('tab === "new" ?')));
  assert.ok(!newBranch.includes("communityEditorialCourses"), "신규 탭에 공식 코스 혼입");
  const hub = read("src/components/quiet/CityHubClient.tsx");
  assert.equal((hub.match(/tab=new/g) ?? []).length, 2, "Hub 신규 진입점 2곳(장소·코스)");
  for (const loc of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${loc}.json`)) as { quiet: Record<string, string> };
    for (const k of ["tabPopular", "tabNew", "communityNewRank", "newPlacesEmpty", "newStoriesEmpty", "backToPopular", "loadMore"]) {
      assert.ok(m.quiet[k], `${loc}.quiet.${k} 없음`);
    }
    assert.ok(m.quiet.communityNewRank.includes("{n}"));
  }
});

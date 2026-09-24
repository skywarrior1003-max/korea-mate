// COMMUNITY-RECOMMENDATION-RANKING-AND-SUBMISSION-UX-HOTFIX-V1 회귀 가드
// 실행: node --experimental-strip-types src/lib/community/ranking-ux-guard.test.ts
//
// 지키는 계약
//  · 순위 공식·tie-break 불변(§2-2·§6-3) — community-core 를 그대로 쓴다
//  · 응답 보안: dislike 수·내부 score 를 응답 필드로 추가하지 않았다(§11)
//  · 진입점: City Hub 제안 CTA 0 · My Places/본인 Story user_spot 진입점 존재(§4·§5·§10-2)
//  · 서버 중복 pending 차단(409)·sheet 안내(§5-1)
//  · UI: 순위 badge 는 여행자 Story·서버 순위 장소에만, 공식 코스는 무번호(§7·§8·§9)
//  · 4 locale 신규 문구 존재
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { compareRanked, communityScore, type RankInput } from "./community-core.ts";
import { suggestEligibleCity, userSpotIdsFromDays } from "./suggest-entry-core.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

test("§2-2 점수 공식 불변 — like 1=+1 · usage 1=+3 · dislike 1=−1", () => {
  assert.equal(communityScore({ likes: 1, dislikes: 0, usage: 0 }), 1);
  assert.equal(communityScore({ likes: 0, dislikes: 0, usage: 1 }), 3);
  assert.equal(communityScore({ likes: 0, dislikes: 1, usage: 0 }), -1);
  assert.equal(communityScore({ likes: 2, dislikes: 1, usage: 2 }), 7);
});

test("§6-3 tie-break 안정 — usage → like → 기준시각 → ID", () => {
  const mk = (id: string, likes: number, dislikes: number, usage: number, approvedAt: string | null = null): RankInput =>
    ({ id, likes, dislikes, usage, approvedAt });
  // 동점(score 3): usage 우선
  assert.ok(compareRanked(mk("a", 0, 0, 1), mk("b", 3, 0, 0)) < 0);
  // 동점·동 usage: like 우선
  assert.ok(compareRanked(mk("a", 2, 2, 1), mk("b", 0, 0, 1)) < 0);
  // 전부 0: ID 로 안정 정렬(요청마다 흔들리지 않는다)
  const zeros = [mk("c", 0, 0, 0), mk("a", 0, 0, 0), mk("b", 0, 0, 0)];
  const s1 = [...zeros].sort(compareRanked).map(r => r.id);
  const s2 = [...zeros].reverse().sort(compareRanked).map(r => r.id);
  assert.deepEqual(s1, s2);
  assert.deepEqual(s1, ["a", "b", "c"]);
});

test("§11 응답 보안 — recommendations 응답 매핑에 dislike·score 필드가 없다", () => {
  const src = read("functions/api/recommendations/[city].ts");
  // 응답 객체 조립부에 dislikeCount/score 키 금지
  assert.ok(!/dislikeCount\s*:/.test(src), "dislikeCount 가 응답에 추가됨");
  assert.ok(!/\bscore\s*:/.test(src), "score 가 응답에 추가됨");
  assert.ok(!/device_id\s*:/.test(src), "device_id 가 응답에 추가됨");
  // 대표 이미지는 되돌릴 수 없는 ref 프록시 경로만
  assert.ok(src.includes("photoRef") && src.includes("/img/memory/"), "cover 는 photoRef 프록시 경로여야 한다");
  assert.ok(!/storage_path[^,\n]*cover|cover[^,\n]*storage_path/.test(src), "cover 에 저장 경로 노출 금지");
});

test("§4 City Hub — 제안 CTA·sheet 제거, 소비 요소는 유지", () => {
  const hub = read("src/components/quiet/CityHubClient.tsx");
  assert.ok(!hub.includes("SuggestPlaceSheet"), "Hub 에 제안 sheet 잔존");
  assert.ok(!hub.includes("suggestPlaceCta"), "Hub 에 제안 CTA 문구 잔존");
  // 소비 화면 유지: 추천 장소·전체 보기·행사·편의정보·파트너 준비 영역
  for (const keep of ["recommendedPlaces", "viewAll", "whatsHappening", "PartnerOfferRow"]) {
    assert.ok(hub.includes(keep), `Hub 유지 요소 소실: ${keep}`);
  }
});

test("§6·§7 순위 UI — Hub·전체보기가 서버 순위·badge·수치를 그린다", () => {
  const hub = read("src/components/quiet/CityHubClient.tsx");
  assert.ok(hub.includes("communityRank"), "Hub 순위 badge 없음");
  assert.ok(hub.includes("communityUsage"), "Hub 활용 수 문구 없음");
  assert.ok(hub.includes("commPlaces"), "Hub 가 서버 장소 순위를 소비하지 않음");
  assert.ok(hub.includes("communityStoriesSoon"), "Story 0개 안내 없음");
  const placesAll = read("src/components/quiet/PlacesAllClient.tsx");
  assert.ok(placesAll.includes("/api/recommendations/") && placesAll.includes("communityRank"), "장소 전체보기 순위 미연결");
  const tripsAll = read("src/components/quiet/TripsAllClient.tsx");
  assert.ok(tripsAll.includes("communityRank"), "Story 전체보기 순위 없음");
  assert.ok(tripsAll.includes("communityEditorialCourses"), "공식 코스 섹션 라벨 없음");
});

test("§8·§9 공식 코스 — 인기 순위 없음·방문 순서 라벨 존재", () => {
  const hub = read("src/components/quiet/CityHubClient.tsx");
  // 공식 seed trips 렌더 블록에는 rank 를 넘기지 않는다 — trips.map 안에 communityRank 금지
  const start = hub.indexOf("trips.map");
  const officialBlock = hub.slice(start, hub.indexOf("Recommended Places", start));
  assert.ok(!officialBlock.includes("communityRank"), "공식 코스에 순위 badge 가 붙음");
  assert.ok(officialBlock.includes("officialCourse"), "공식 코스 라벨 소실");
  const course = read("src/components/quiet/TripCourseClient.tsx");
  assert.ok(course.includes("visitOrder"), "코스 상세 방문 순서 라벨 없음");
  assert.ok(course.includes("{i + 1}"), "기존 동선 번호가 사라짐");
});

test("§5·§10-2 진입점 — My Places·본인 Story 존재, 타인·Hub 부재", () => {
  const picks = read("src/app/picks/PicksClient.tsx");
  assert.ok(picks.includes("MyPlaceSuggestAction"), "My Places 제안 진입점 없음");
  const itin = read("src/app/itinerary/page.tsx");
  assert.ok(itin.includes("StoryUserSpotSuggest"), "본인 Story user_spot 진입점 없음");
  assert.ok(/isOwner && isPublic[\s\S]{0,400}StoryUserSpotSuggest/.test(itin), "Story 진입점이 소유자·공개 게이트 밖에 있음");
  // 공개(타인) Story 화면·canonical Place 상세에는 제안 진입점이 없다
  for (const p of ["src/app/shared", "src/components/PlaceDetailClient.tsx"]) {
    let found = false;
    try {
      const walk = (dir: string): string[] => {
        const st = statSync(path.join(ROOT, dir));
        if (st.isFile()) return [dir];
        return readdirSync(path.join(ROOT, dir)).flatMap((f: string) => walk(`${dir}/${f}`));
      };
      for (const f of walk(p)) {
        if (/\.(tsx|ts)$/.test(f) && read(f).includes("SuggestPlaceSheet")) found = true;
      }
    } catch { /* 파일 구조가 다르면 아래 단언으로 드러난다 */ }
    assert.equal(found, false, `${p} 에 제안 진입점 존재`);
  }
});

test("§5-1 중복 pending — 서버 409 · sheet 안내", () => {
  const api = read("functions/api/place-suggestion.ts");
  assert.ok(api.includes("duplicate_pending") && api.includes("409"), "서버 중복 차단 없음");
  assert.ok(api.includes("status=eq.pending"), "pending 만 중복 대상이어야 한다");
  const sheet = read("src/components/community/SuggestPlaceSheet.tsx");
  assert.ok(sheet.includes("suggestDuplicate") && sheet.includes("409"), "sheet 중복 안내 없음");
});

test("suggestEligibleCity — §5-1 자격 판정", () => {
  const base = { name: "우리집 앞 국숫집", city: "jeonju", address: "전주시 완산구 어딘가 1", lat: null, lng: null, category: "restaurant", relatedCitySpotId: null };
  assert.equal(suggestEligibleCity(base), "jeonju");
  assert.equal(suggestEligibleCity({ ...base, name: " " }), null, "이름 없음");
  assert.equal(suggestEligibleCity({ ...base, relatedCitySpotId: 776 }), null, "canonical 연결 장소");
  assert.equal(suggestEligibleCity({ ...base, city: "atlantis" }), null, "미지원 도시");
  assert.equal(suggestEligibleCity({ ...base, city: null }, "busan"), "busan", "fallback 도시");
  assert.equal(suggestEligibleCity({ ...base, address: "" }), null, "위치 없음");
  assert.equal(suggestEligibleCity({ ...base, address: "", lat: 35.81, lng: 127.15 }), "jeonju", "좌표만으로 성립");
  assert.equal(suggestEligibleCity({ ...base, address: "", lat: 999, lng: 0 }), null, "무효 좌표");
});

test("userSpotIdsFromDays — user_spot 만, canonical 숫자 id 제외·중복 제거", () => {
  const days = [
    { places: [{ place_id: "user_spot:aaa" }, { place_id: "123" }, { place_id: "user_spot:bbb" }] },
    { places: [{ place_id: "user_spot:aaa" }, {}] },
    null,
  ];
  assert.deepEqual(userSpotIdsFromDays(days).sort(), ["aaa", "bbb"]);
  assert.deepEqual(userSpotIdsFromDays(null), []);
});

test("4 locale — 신규 문구 존재·순위 자리표 보존", () => {
  for (const loc of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${loc}.json`)) as {
      quiet: Record<string, string>; community: Record<string, string>;
    };
    for (const k of ["communityRank", "communityUsage", "communityStoriesSoon", "visitOrder"]) {
      assert.ok(m.quiet[k], `${loc}.quiet.${k} 없음`);
    }
    assert.ok(m.quiet.communityRank.includes("{n}"), `${loc} 순위 자리표 없음`);
    for (const k of ["suggestDuplicate", "myPlaceSuggestCta", "storySpotSuggestCta", "storySpotsSuggestTitle"]) {
      assert.ok(m.community[k], `${loc}.community.${k} 없음`);
    }
  }
});

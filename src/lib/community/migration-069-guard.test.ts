// 069 place_usage — 계약 가드 (COMMUNITY-…-V2 §2)
// 실행: node --experimental-strip-types src/lib/community/migration-069-guard.test.ts
//
// 고정하는 것
//  ① 069 스키마 — actor 고유(usage_key UNIQUE)·원인 2종·RLS·REVOKE·이벤트 누적형
//     (DELETE 경로 없음).
//  ② 배선 — 저장(place-save)과 여행 추가(place-usage + addPlaceToThisTrip)가
//     같은 usage_key 파생('usage' prefix)으로 한 테이블에 기록된다 → 어떤
//     조합도 actor×장소당 1.
//  ③ 순위 — places 활용은 place_usage tally 만 읽는다(place_saves·itinerary
//     스캔 아님). 공개 응답에 score·dislike 없음은 068 가드가 계속 고정한다.
//  ④ 관리자 결정은 pending 에서만(승인 재승인·withdrawn 승인 409).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const MIG = read("supabase/migrations/069_place_usage_signal.sql");
const SQL = MIG.split("\n").map(l => l.replace(/--.*$/, "")).join("\n");

test("① 스키마 — UNIQUE actor 해시·원인 CHECK·RLS·REVOKE·정책 0", () => {
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.place_usage/);
  assert.match(SQL, /usage_key\s+TEXT\s+NOT NULL UNIQUE CHECK \(char_length\(usage_key\) = 64\)/);
  assert.match(SQL, /first_cause IN \('save', 'trip_add'\)/);
  assert.match(SQL, /ALTER TABLE public\.place_usage ENABLE ROW LEVEL SECURITY/);
  assert.match(SQL, /REVOKE ALL ON public\.place_usage FROM anon, authenticated/);
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
  // 068 산출물은 손대지 않는다 — 실행 SQL 에 068 테이블·CHECK 변경이 없다
  assert.ok(!/ALTER TABLE public\.(place_reports|content_dislikes|story_submissions|place_suggestions)/.test(SQL),
    "069 실행 SQL 이 068 산출물을 변경한다");
});

test("② 배선 — 두 원인이 같은 'usage' 해시로 모인다·클라이언트 count 조작 불가", () => {
  const save = read("functions/api/place-save.ts");
  assert.match(save, /actorKey\("usage", r\.device_id, r\.target_type, r\.target_key\)/);
  assert.match(save, /first_cause: "save"/);
  const usage = read("functions/api/place-usage.ts");
  assert.match(usage, /actorKey\("usage", deviceId\.toLowerCase\(\), "city_spot", key\)/);
  assert.match(usage, /first_cause: "trip_add"/);
  // 이벤트 누적형 — 제거·조회 경로가 없다
  assert.ok(!usage.includes("onRequestDelete") && !usage.includes("onRequestGet"));
  // count 를 받는 필드가 없다(서버 unique insert 뿐)
  assert.ok(!/body\.(count|usage)/.test(usage));
  const actions = read("src/lib/place-actions/place-actions-core.ts");
  assert.match(actions, /reportPlaceTripAddSignal\(place\);/);
  const signals = read("src/lib/social/signals.ts");
  assert.match(signals, /parseCitySpotId\(getItemSourceKey\(place\)\)/);
  assert.match(signals, /\/api\/place-usage/);
});

test("③ 순위 — place_usage tally, place_saves·itineraries 스캔 아님", () => {
  // PAGINATION-V1 이후 장소 활용 집계는 DB RPC(071)가 수행한다 — 계약은 그대로:
  // usage = place_usage 의 target 별 행 수(actor 고유·누적형), place_saves 스캔 금지.
  const rpc = read("supabase/migrations/071_community_ranking_rpcs.sql");
  assert.match(rpc, /FROM public\.place_usage\s*\n\s*WHERE target_type = 'city_spot'/);
  assert.ok(!rpc.includes("place_saves"), "순위가 place_saves 를 읽지 않는다");
  const server = read("src/lib/community/recommendations-server.ts");
  assert.match(server, /usageCount: Number\(x\.usage_count\)/);
  assert.ok(!server.includes("saveCount"), "옛 필드명 잔존 없음");
});

test("④ 관리자 결정 — pending 에서만·중복 결정 409", () => {
  for (const p of ["functions/api/admin/story-submissions.ts", "functions/api/admin/place-suggestions.ts"]) {
    const s = read(p);
    assert.match(s, /&status=eq\.pending/, p);
    assert.match(s, /already_decided/, p);
  }
});

// 068 migration ↔ 코드 계약 가드
// 실행: node --experimental-strip-types src/lib/community/migration-068-guard.test.ts
//
// 고정하는 것
//  ① 068 CHECK 가 코드의 신규 사유 7개를 전부 허용하고, 042·054 기존 값을
//     하나도 잃지 않는다(기존 신고 행이 깨지지 않는다).
//  ② 세 신규 테이블은 RLS + anon/authenticated REVOKE — 브라우저 직접 접근 0.
//  ③ 점수에 금지 축(여행 완료·조회수·AI 평가·시간 감쇠)이 스키마로 들어오지 않았다.
//  ④ copy 경로의 개인정보 계약(§2)이 소스에 고정돼 있다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { COMMUNITY_NEW_CATEGORIES } from "./community-core.ts";
import { REPORT_CATEGORIES } from "../reports/place-report-core.ts";
import { STORY_REPORT_CATEGORIES } from "../moderation/story-moderation-core.ts";

const ROOT = process.cwd();
const MIG = readFileSync(path.join(ROOT, "supabase/migrations/068_community_reactions_submissions.sql"), "utf8");
/** `--` 주석을 걷어낸, 실제로 실행되는 SQL 만 */
const SQL = MIG.split("\n").map(l => l.replace(/--.*$/, "")).join("\n");

test("① category CHECK — 신규 7 + 042 15 + 054 4 전부 포함", () => {
  for (const v of COMMUNITY_NEW_CATEGORIES) assert.ok(SQL.includes(`'${v}'`), `신규 누락: ${v}`);
  for (const v of REPORT_CATEGORIES)        assert.ok(SQL.includes(`'${v}'`), `042 유실: ${v}`);
  for (const v of STORY_REPORT_CATEGORIES)  assert.ok(SQL.includes(`'${v}'`), `054 유실: ${v}`);
});

test("① 자기검증 블록 — 새 사유를 막는 옛 CHECK 잔존을 탐지한다", () => {
  assert.match(MIG, /LIKE '%category%'[\s\S]{0,120}NOT LIKE '%''photo_mismatch''%'/);
});

test("② 신규 테이블 3개 — RLS enable + REVOKE + 서비스 전용", () => {
  for (const t of ["content_dislikes", "story_submissions", "place_suggestions"]) {
    assert.ok(SQL.includes(`CREATE TABLE IF NOT EXISTS public.${t}`), t);
    assert.match(SQL, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    assert.match(SQL, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`));
  }
  // CREATE POLICY 없음 — service_role 전용(060 과 동일 자세)
  assert.doesNotMatch(SQL, /CREATE POLICY/i);
});

test("② 핵심 unique — 싫어요 actor 해시·Story 1회 제출", () => {
  assert.match(SQL, /disliker_key\s+TEXT\s+NOT NULL UNIQUE/);
  assert.match(SQL, /itinerary_id\s+UUID\s+NOT NULL UNIQUE/);
});

test("③ 금지 축이 스키마에 없다 — 완료·조회수·AI 점수·감쇠 컬럼 0", () => {
  for (const banned of ["view_count", "completion", "ai_score", "decay", "trip_completed"]) {
    assert.ok(!SQL.toLowerCase().includes(banned), banned);
  }
});

test("④ copy 개인정보 계약 — 원 제목·원 날짜 미복사가 소스에 고정", () => {
  const copySrc = readFileSync(path.join(ROOT, "functions/api/itinerary/copy.ts"), "utf8");
  // 원 제목을 그대로 싣는 코드가 없다
  assert.doesNotMatch(copySrc, /trip_title:\s*optStr\(source\.trip_title/);
  assert.doesNotMatch(copySrc, /"Copied Trip"/);
  assert.match(copySrc, /copiedTripTitle\(/);
  // 원 날짜를 그대로 싣는 코드가 없다
  assert.doesNotMatch(copySrc, /start_date:\s*source\.start_date/);
  assert.doesNotMatch(copySrc, /end_date:\s*source\.end_date/);
  assert.match(copySrc, /copiedDateRange\(/);
  // trip_moments 를 읽지도 쓰지도 않는다(사진·개인 기록 미복사의 구조적 근거)
  // — 주석에는 계약 설명으로 등장하므로 실행 코드만 본다.
  const copyCode = copySrc.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
  assert.ok(!copyCode.includes("trip_moments"));
  // select 에 trip_title 이 없다 — 서버로도 가져오지 않는다
  assert.doesNotMatch(copySrc, /select\("[^"]*trip_title/);
});

test("④ 반응 API — 싫어요 수를 응답에 싣는 코드가 없다", () => {
  const src = readFileSync(path.join(ROOT, "functions/api/content-reaction.ts"), "utf8");
  assert.ok(!/dislikeCount/i.test(src));
  assert.match(src, /reactionState\(/);
});

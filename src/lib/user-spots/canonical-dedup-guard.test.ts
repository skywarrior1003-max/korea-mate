/**
 * TASK-MY-TRIP-TIMELINE-B-AND-DEDUP-V1-R1 — My Places canonical dedup 계약 (source/schema guard)
 * Run: node --experimental-strip-types --test src/lib/user-spots/canonical-dedup-guard.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const API   = read("../../../functions/api/user-spots/from-canonical.ts");
const SQL   = read("../../../supabase/migrations/059_user_spots_related_unique.sql");
const PICKS = read("../../app/picks/PicksClient.tsx");
const PANEL = read("../../components/UserSpotsPanel.tsx");

test("★원본 연결은 기존 related_city_spot_id 하나 — 새 컬럼·backfill·삭제 없음", () => {
  assert.ok(!/ADD COLUMN/i.test(SQL), "새 컬럼을 만들지 않는다");
  assert.ok(!/\b(UPDATE|DELETE|TRUNCATE)\b/i.test(SQL.replace(/--[^\n]*/g, "")), "backfill·삭제 0");
  assert.match(SQL, /CREATE UNIQUE INDEX IF NOT EXISTS user_spots_device_related_uniq/);
  assert.match(SQL, /\(device_id, related_city_spot_id\)\s*\n?\s*WHERE related_city_spot_id IS NOT NULL/, "partial UNIQUE");
  assert.match(SQL, /RAISE EXCEPTION/, "중복이 남아 있으면 명확한 오류로 막는다(조용한 정리 없음)");
});

test("★API: 같은 기기·같은 원본은 기존 행을 돌려준다, 경쟁(23505)도 기존 행", () => {
  assert.match(API, /\.eq\("device_id", deviceId\)\s*\n?\s*\.eq\("related_city_spot_id", citySpotId\)/, "insert 전 기존 행 조회");
  assert.match(API, /if \(existing\) \{/, "있으면 새로 만들지 않는다");
  assert.match(API, /insertErr\?\.code === "23505"/, "UNIQUE 충돌 시 기존 행");
  assert.ok(!/related_city_spot_id IS NULL|ilike|similar/i.test(API), "legacy 행 추정 매칭 0");
});

test("★Picks: '내 장소에 남겼어요' 는 서버의 원본 연결로 판단, 같은 원본은 같은 Day 중복 금지", () => {
  assert.match(PICKS, /citySpotSourceKey\(r\.related_city_spot_id\)/, "세션이 아니라 서버 값");
  assert.match(PANEL, /const canon = spot\.related_city_spot_id \?\? null;/);
  assert.match(PANEL, /const hasCoord\s+= isValidCoordinate\(spot\.lat, spot\.lng\);/, "좌표 없는 내 장소는 담기 불가");
  assert.match(PANEL, /t\("needsLocation"\)/);
  // 보관함 경로로 스케줄된 내 장소는 place_id 가 아니라 sourceKey(user_spot:<uuid>) 로 남는다 — 그것도 "이미 있음"
  assert.match(PANEL, /pp\.sourceKey === userSpotSourceKey\(spot\.id\)/, "보관함 경로 내 장소 중복 판정");
  for (const bad of ["🟡", "✅ {t(\"statusApproved\")}", "❌", "📤", "📍"]) assert.ok(!PANEL.includes(bad), `뱃지 emoji 잔존: ${bad}`);
});

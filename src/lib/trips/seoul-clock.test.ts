/**
 * TASK-MY-TRIPS-FINAL-UI-V1-R1 — 여행 달력은 Asia/Seoul 기준
 * Run: node --experimental-strip-types --test src/lib/trips/seoul-clock.test.ts
 * (TZ=America/Los_Angeles 같은 다른 프로세스 timezone 에서도 결과가 같아야 한다)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seoulClock } from "./seoul-clock.ts";
import { tripBucket } from "./trips-lifecycle.ts";

test("K1: UTC 로는 아직 8/21 인 순간이 한국에서는 8/22 — 날짜가 UTC 로 밀리지 않는다", () => {
  assert.deepEqual(seoulClock(new Date("2026-08-21T15:30:00Z")), { todayISO: "2026-08-22", nowHHMM: "00:30" });
  assert.deepEqual(seoulClock(new Date("2026-08-21T14:59:00Z")), { todayISO: "2026-08-21", nowHHMM: "23:59" });
  assert.deepEqual(seoulClock(new Date("2026-08-21T15:00:00Z")), { todayISO: "2026-08-22", nowHHMM: "00:00" });
  assert.deepEqual(seoulClock(new Date("2026-08-22T03:05:00Z")), { todayISO: "2026-08-22", nowHHMM: "12:05" });
});

test("K2: 8/22~8/24 여행 — 한국 달력 경계 (Upcoming → Traveling → Past)", () => {
  const trip = { startDate: "2026-08-22", endDate: "2026-08-24" };
  const at = (iso: string) => tripBucket(trip, seoulClock(new Date(iso)).todayISO);
  assert.equal(at("2026-08-21T02:00:00Z"), "upcoming");    // 8/21 11:00 KST
  assert.equal(at("2026-08-21T15:10:00Z"), "traveling");   // 8/22 00:10 KST — UTC 는 아직 8/21
  assert.equal(at("2026-08-22T00:00:00Z"), "traveling");   // 8/22 09:00 KST (실측 상황)
  assert.equal(at("2026-08-23T03:00:00Z"), "traveling");   // 8/23
  assert.equal(at("2026-08-24T14:59:00Z"), "traveling");   // 8/24 23:59 KST — 종료일 끝까지
  assert.equal(at("2026-08-24T15:00:00Z"), "past");        // 8/25 00:00 KST → Story
  assert.equal(at("2026-08-25T03:00:00Z"), "past");
});

test("K3: 같은 순간은 프로세스 timezone 과 무관하게 같은 값", () => {
  // Intl 에 timeZone 을 명시하므로 TZ 환경변수에 영향받지 않는다 — 실행 시 TZ 를 바꿔 돌려도 통과해야 한다
  const a = seoulClock(new Date("2026-08-21T15:30:00Z"));
  assert.equal(a.todayISO, "2026-08-22");
  assert.equal(a.nowHHMM, "00:30");
  assert.match(a.todayISO, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(a.nowHHMM, /^\d{2}:\d{2}$/);
});

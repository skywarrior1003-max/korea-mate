// 스케줄러 일원화 — /planner 승계 리다이렉트 계약 (Owner 2026-09-12)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePlannerEntry, PLANNER_CITIES } from "./planner-entry-redirect.ts";

test("★clone 딥링크 — 유효 도시+날짜면 draft 승계 후 /picks", () => {
  const r = resolvePlannerEntry("?city=Busan&from=2026-10-01&to=2026-10-03&style=Solo&ref=clone");
  assert.equal(r.href, "/picks");
  assert.deepEqual(r.draft, { city: "Busan", startDate: "2026-10-01", endDate: "2026-10-03", travelers: "1" });
});

test("★clone 이라도 값이 깨졌으면 draft 를 지어내지 않는다", () => {
  // 날짜 역전
  assert.equal(resolvePlannerEntry("?ref=clone&city=busan&from=2026-10-05&to=2026-10-01").draft, undefined);
  // 날짜 형식 불량
  assert.equal(resolvePlannerEntry("?ref=clone&city=busan&from=10-01&to=2026-10-03").draft, undefined);
  // 도시 없음
  assert.equal(resolvePlannerEntry("?ref=clone&from=2026-10-01&to=2026-10-03").draft, undefined);
  // 모르는 도시
  assert.equal(resolvePlannerEntry("?ref=clone&city=tokyo&from=2026-10-01&to=2026-10-03").draft, undefined);
});

test("★?city= 는 대소문자/slug 무관 canonical 로 /picks 에 승계", () => {
  assert.equal(resolvePlannerEntry("?city=busan").href, "/picks?city=Busan");
  assert.equal(resolvePlannerEntry("?city=JEONJU").href, "/picks?city=Jeonju");
  assert.equal(resolvePlannerEntry("?city=Gyeongju").href, "/picks?city=Gyeongju");
});

test("★모르는 도시/빈 파라미터 — 발명 없이 /picks", () => {
  assert.equal(resolvePlannerEntry("?city=tokyo").href, "/picks");
  assert.equal(resolvePlannerEntry("").href, "/picks");
  assert.equal(resolvePlannerEntry("?ref=clone").href, "/picks");
});

test("★5도시 canonical 집합 유지", () => {
  assert.deepEqual([...PLANNER_CITIES], ["Busan", "Seoul", "Jeju", "Gyeongju", "Jeonju"]);
});

test("★배선 — /planner route 는 V1 폼이 아니라 승계 리다이렉트를 그린다", () => {
  const page = readFileSync(join(process.cwd(), "src/app/planner/page.tsx"), "utf8");
  assert.match(page, /PlannerRedirect/);
  assert.ok(!/from\s+["']\.\/PlannerClient["']/.test(page), "/planner 가 아직 V1 폼을 그린다");
  const redirect = readFileSync(join(process.cwd(), "src/app/planner/PlannerRedirect.tsx"), "utf8");
  assert.match(redirect, /resolvePlannerEntry/);
  assert.match(redirect, /writeTripDraft/);
  // Picks 는 ?city= 승계를 시작 카드 preselect 로 받는다
  const picks = readFileSync(join(process.cwd(), "src/app/picks/PicksClient.tsx"), "utf8");
  assert.match(picks, /window\.location\.search\)\.get\("city"\)/);
  // This Trip 편집 패널에 도시 변경이 있다 (Owner 2026-09-12)
  const panel = readFileSync(join(process.cwd(), "src/components/TripSetupPanel.tsx"), "utf8");
  assert.match(panel, /city:\s*e\.target\.value/);
  assert.match(panel, /startLocation: null/, "도시 변경 시 이전 도시 preset 초기화 누락");
});

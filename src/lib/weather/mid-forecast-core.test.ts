// 중기예보 코어 — TASK: Owner 확정 공공데이터 KMA 적용 (2026-09-09)
// 실행: node --test --experimental-strip-types src/lib/weather/mid-forecast-core.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CITY_MID_REG, latestTmFc, midDayOffset, wxToIcon, extractMidDay } from "./mid-forecast-core.ts";

// ── 구역코드: 공식 xlsx 에서 옮겨 적은 값이 흔들리면 여기서 걸린다 ──────────
test("★5도시 regId 는 공식 표 값 그대로다", () => {
  assert.deepEqual(CITY_MID_REG.busan,    { ta: "11H20201", land: "11H20000" });
  assert.deepEqual(CITY_MID_REG.seoul,    { ta: "11B10101", land: "11B00000" });
  assert.deepEqual(CITY_MID_REG.jeju,     { ta: "11G00201", land: "11G00000" });
  assert.deepEqual(CITY_MID_REG.gyeongju, { ta: "11H10202", land: "11H10000" });
  assert.deepEqual(CITY_MID_REG.jeonju,   { ta: "11F10201", land: "11F10000" });
});

// ── 발표시각(06/18시) 경계 ───────────────────────────────────────────────────
const kst = (iso: string) => new Date(iso + "Z");
test("06시 전엔 전일 1800, 06~18시는 당일 0600, 이후는 당일 1800", () => {
  assert.equal(latestTmFc(kst("2026-09-09T05:59:00")), "202609081800");
  assert.equal(latestTmFc(kst("2026-09-09T06:00:00")), "202609090600");
  assert.equal(latestTmFc(kst("2026-09-09T17:59:00")), "202609090600");
  assert.equal(latestTmFc(kst("2026-09-09T18:00:00")), "202609091800");
  assert.equal(latestTmFc(kst("2026-09-01T03:00:00")), "202608311800"); // 월 경계
});

// ── 제공 창 +4~+10 ──────────────────────────────────────────────────────────
test("창 안(4~10)만 offset, 밖·형식 오류는 null", () => {
  assert.equal(midDayOffset("202609090600", "2026-09-13"), 4);
  assert.equal(midDayOffset("202609090600", "2026-09-19"), 10);
  assert.equal(midDayOffset("202609090600", "2026-09-12"), null); // +3
  assert.equal(midDayOffset("202609090600", "2026-09-20"), null); // +11
  assert.equal(midDayOffset("202609090600", "not-a-date"), null);
});

// ── 문구 → 아이콘 (지어내지 않음: 미지 문구는 cloud 수렴) ───────────────────
test("공식 문구 매핑과 안전 수렴", () => {
  assert.equal(wxToIcon("맑음"), "sun");
  assert.equal(wxToIcon("구름많음"), "cloud");
  assert.equal(wxToIcon("흐림"), "overcast");
  assert.equal(wxToIcon("흐리고 비"), "rain");
  assert.equal(wxToIcon("구름많고 소나기"), "rain");
  assert.equal(wxToIcon("흐리고 눈"), "snow");
  assert.equal(wxToIcon("황사"), "cloud");
  assert.equal(wxToIcon(null), null);
});

// ── item 추출: 실측 응답 shape (경주 taMin4=16 taMax4=27 / wf4Am=맑음) ───────
test("정상 추출 — 오후 우선 아이콘, 8일차 이후는 하루 문구", () => {
  const ta = { taMin4: "16", taMax4: 27, taMin8: 19, taMax8: 25 };
  const land = { wf4Am: "맑음", wf4Pm: "구름많고 비", wf8: "구름많음" };
  const d4 = extractMidDay(ta, land, 4)!;
  assert.deepEqual([d4.taMin, d4.taMax, d4.icon], [16, 27, "rain"]); // 오후(비) 우선
  const d8 = extractMidDay(ta, land, 8)!;
  assert.deepEqual([d8.taMin, d8.taMax, d8.icon, d8.wxAm], [19, 25, "cloud", "구름많음"]);
});

test("malformed 는 null — 기온이 숫자가 아니면 표시하지 않는다", () => {
  assert.equal(extractMidDay({ taMin4: "휴무", taMax4: 27 }, null, 4), null);
  assert.equal(extractMidDay(null, { wf4Am: "맑음" }, 4), null);
  const noLand = extractMidDay({ taMin5: 10, taMax5: 20 }, null, 5)!;
  assert.equal(noLand.icon, "cloud"); // 문구 없음 → 중립 수렴, 기온은 표시
});

// ── 배선 가드 ────────────────────────────────────────────────────────────────
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
test("★서버 함수는 키를 ctx.env 에서만 읽고 실패는 200 available:false 다", () => {
  const src = read("functions", "api", "weather", "mid.ts");
  assert.ok(src.includes("ctx.env.KMA_API_KEY ?? ctx.env.TOUR_API_KEY"));
  assert.ok(src.includes('{ available: false }'));
  assert.ok(!/console\.log/.test(src), "키/응답 로그 금지");
});
test("★칩은 forecast 없으면 기존 STAGE A 링크 표기 그대로다(KEEP 계약)", () => {
  const src = read("src", "components", "planner", "WeatherLinkChip.tsx");
  assert.ok(src.includes("forecast = null"));
  assert.ok(src.includes("KMA_OFFICIAL_URL"), "링크 목적지 유지");
  assert.ok(src.includes("{label}"), "STAGE A 문구 분기 유지");
});

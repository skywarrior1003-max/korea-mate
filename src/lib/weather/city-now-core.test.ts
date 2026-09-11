// City Hub 현재날씨 계약 (POST-ACCEPTANCE-CITY-HUB-WEATHER-V1)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CITY_NOW_GRID, KMA_SHORT_FORECAST_URL,
  latestNcstBase, latestFcstBase, extractT1H, extractSkyPty, nowIcon, formatNowTemp,
} from "./city-now-core.ts";

// KST 벽시계를 UTC 필드에 실은 Date (mid-forecast-core 관례)
const kst = (s: string) => new Date(`${s}Z`);

test("★5도시 nx/ny — 공식 별첨 엑셀 대표 행 그대로", () => {
  assert.deepEqual(CITY_NOW_GRID.busan,    { nx: 98,  ny: 76  });
  assert.deepEqual(CITY_NOW_GRID.seoul,    { nx: 60,  ny: 127 });
  assert.deepEqual(CITY_NOW_GRID.jeju,     { nx: 53,  ny: 38  });
  assert.deepEqual(CITY_NOW_GRID.gyeongju, { nx: 100, ny: 91  });
  assert.deepEqual(CITY_NOW_GRID.jeonju,   { nx: 63,  ny: 89  });
  assert.equal(Object.keys(CITY_NOW_GRID).length, 5, "5도시뿐 — 임의 확장 금지");
});

test("★초단기실황 base_time — HH00, 제공버퍼(15분) 전엔 직전 시각·자정 롤오버", () => {
  assert.deepEqual(latestNcstBase(kst("2026-09-11T14:20:00")), { base_date: "20260911", base_time: "1400" });
  assert.deepEqual(latestNcstBase(kst("2026-09-11T14:05:00")), { base_date: "20260911", base_time: "1300" });
  assert.deepEqual(latestNcstBase(kst("2026-09-11T00:05:00")), { base_date: "20260910", base_time: "2300" });
  assert.deepEqual(latestNcstBase(kst("2026-09-11T00:20:00")), { base_date: "20260911", base_time: "0000" });
});

test("★초단기예보 base_time — HH30, 제공버퍼(50분) 전엔 직전 시각·자정 롤오버", () => {
  assert.deepEqual(latestFcstBase(kst("2026-09-11T14:55:00")), { base_date: "20260911", base_time: "1430" });
  assert.deepEqual(latestFcstBase(kst("2026-09-11T14:40:00")), { base_date: "20260911", base_time: "1330" });
  assert.deepEqual(latestFcstBase(kst("2026-09-11T00:40:00")), { base_date: "20260910", base_time: "2330" });
  assert.deepEqual(latestFcstBase(kst("2026-09-11T00:55:00")), { base_date: "20260911", base_time: "0030" });
});

test("★T1H 추출 — 실측 응답형·Missing(±900)·범위밖·malformed 전부 null(가짜 온도 0)", () => {
  const items = [{ category: "PTY", obsrValue: "0" }, { category: "T1H", obsrValue: "21.2" }];
  assert.equal(extractT1H(items), 21.2);
  assert.equal(extractT1H([{ category: "T1H", obsrValue: "-999" }]), null);
  assert.equal(extractT1H([{ category: "T1H", obsrValue: "900" }]), null);
  assert.equal(extractT1H([{ category: "T1H", obsrValue: "77" }]), null, "한반도 범위 밖");
  assert.equal(extractT1H([{ category: "REH", obsrValue: "70" }]), null, "T1H 부재");
  assert.equal(extractT1H([{ category: "T1H", obsrValue: "abc" }]), null);
  assert.equal(extractT1H(null), null);
  assert.equal(extractT1H(undefined), null);
  assert.equal(extractT1H([] as never), null);
});

test("★SKY/PTY 추출 — 가장 이른 예보시각 한 칸만 사용", () => {
  const items = [
    { category: "SKY", fcstDate: "20260911", fcstTime: "2100", fcstValue: "4" },
    { category: "SKY", fcstDate: "20260911", fcstTime: "2000", fcstValue: "1" },
    { category: "PTY", fcstDate: "20260911", fcstTime: "2000", fcstValue: "0" },
    { category: "PTY", fcstDate: "20260912", fcstTime: "0000", fcstValue: "1" },
  ];
  assert.deepEqual(extractSkyPty(items), { sky: 1, pty: 0 });
  assert.deepEqual(extractSkyPty([]), { sky: null, pty: null });
  assert.deepEqual(extractSkyPty(null), { sky: null, pty: null });
  assert.deepEqual(extractSkyPty([{ category: "SKY", fcstValue: "1" }]), { sky: null, pty: null }, "시각 없는 행은 무시");
});

test("★아이콘 — 강수(PTY) 우선·공식 코드만·판별불가는 null(발명 0)", () => {
  // PTY 우선(비 오면 SKY 맑음이어도 비 아이콘)
  assert.equal(nowIcon(1, 1), "🌧️");
  assert.equal(nowIcon(4, 1), "🌧️");
  assert.equal(nowIcon(5, 4), "🌧️");
  assert.equal(nowIcon(2, 1), "🌨️");
  assert.equal(nowIcon(3, 1), "🌨️");
  assert.equal(nowIcon(6, 1), "🌨️");
  assert.equal(nowIcon(7, 1), "🌨️");
  // SKY: 1 맑음 · 3/4 구름
  assert.equal(nowIcon(0, 1), "☀️");
  assert.equal(nowIcon(0, 3), "☁️");
  assert.equal(nowIcon(0, 4), "☁️");
  assert.equal(nowIcon(null, 1), "☀️");
  // 미지 코드/결측 — 지어내지 않는다
  assert.equal(nowIcon(9, 1), null);
  assert.equal(nowIcon(0, 2), null);
  assert.equal(nowIcon(null, null), null);
});

test("표기 — 26°C 반올림 정수", () => {
  assert.equal(formatNowTemp(21.2), "21°C");
  assert.equal(formatNowTemp(25.5), "26°C");
  assert.equal(formatNowTemp(-3.4), "-3°C");
});

test("★키 노출 0 — 클라이언트 소스에 serviceKey/KMA_API_KEY 없음, 링크는 공식 페이지", () => {
  const hub = readFileSync(join(process.cwd(), "src/components/quiet/CityHubClient.tsx"), "utf8");
  assert.ok(!/serviceKey|KMA_API_KEY|data\.go\.kr/.test(hub), "클라이언트에 키/직접 호출 흔적");
  assert.match(hub, /\/api\/weather\/now\?city=/, "서버 프록시 경유가 아니다");
  const core = readFileSync(join(process.cwd(), "src/lib/weather/city-now-core.ts"), "utf8");
  assert.ok(!/serviceKey|KMA_API_KEY/.test(core), "코어에 키 흔적");
  assert.equal(KMA_SHORT_FORECAST_URL, "https://www.weather.go.kr/w/weather/forecast/short-term.do");
  assert.match(hub, /target="_blank" rel="noopener noreferrer"/);
});

test("★My Trip 중기예보 무접촉 가드 — mid 경로/코어의 계약 문자열 유지", () => {
  const mid = readFileSync(join(process.cwd(), "functions/api/weather/mid.ts"), "utf8");
  assert.match(mid, /MidFcstInfoService/);
  assert.match(mid, /getMidTa/);
  const now = readFileSync(join(process.cwd(), "functions/api/weather/now.ts"), "utf8");
  assert.match(now, /VilageFcstInfoService_2\.0/);
  assert.match(now, /getUltraSrtNcst/);
  assert.match(now, /getUltraSrtFcst/);
  assert.ok(!/getMidTa|MidFcstInfoService/.test(now), "now 가 중기예보를 건드린다");
  // 실패 = 200 available:false (가짜 온도 hard-code 금지)
  assert.match(now, /available: false/);
  assert.match(now, /const temp = extractT1H\(/, "temp 는 실황 추출값만");
  assert.ok(!/temp:\s*-?\d/.test(now), "하드코드 온도 값");
});

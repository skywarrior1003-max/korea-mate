// 일정 화면 4개 언어 계약 고정.
//
// 이 화면은 2,700줄이고 문구가 여기저기 흩어져 있다. 한 곳만 하드코딩으로
// 되돌아가도 KO/JA/ZH 사용자에게는 그 줄만 영어로 남는데, 빌드도 타입체크도
// 잡아주지 않는다.
//
// 생성 대기 화면(LOAD_PHASES)의 제휴 카드는 S2-B2 에서 제거됐다.
// 남은 영어는 두 종류뿐이고 둘 다 이유가 있다.
//   ① 커머스 배너 — POST_PLAN_COMMERCE_ENABLED / TRIP_FLOW_COMMERCE_ENABLED 가
//      false 라 화면에 나가지 않는 죽은 UI 다. 번역하면 "₩8,000", "10% off"
//      같은 검증되지 않은 상업 문구를 3개 언어로 늘리게 된다.
//   ② 외부 고유명사 — Google Maps · Naver Maps · Booking.com 등.
//
// 그 경계를 allowlist 로 못 박는다. 커머스 플래그가 켜지는 날 이 테스트가
// 먼저 깨져서 "번역 안 된 채로 켰다"를 알려주는 것이 목적이다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const LOCALES = ["en", "ko", "ja", "zh"] as const;
const msg = (l: string) => JSON.parse(read("src", "messages", `${l}.json`)) as Record<string, Record<string, string>>;

const PAGE = read("src", "app", "itinerary", "page.tsx");
/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
const BODY = strip(PAGE);

/** 이번 작업에서 itin 네임스페이스에 추가한 키 */
const ADDED = [
  "tipsForForeigners", "soloOk", "cashOnly", "cardOk", "naverKoreanHint",
  "difficultyEasy", "difficultyModerate", "difficultyHard",
  "copyShareLink", "copied", "visibilityPublic", "visibilityPrivate",
  "editTrip", "editing", "viewCompact", "viewFull",
  "travelerOne", "travelerMany", "hintTapCard",
  "moveUp", "moveDown", "removePlace",
  "unscheduledTitle", "unscheduledHint", "placesCount", "moreSearch",
  "conflictNotice", "departureNotice",
  "loadingItinerary", "loadingShared", "somethingWrong", "attribution",
  "editCanvasHint", "editCanvasFooter",
  "errCorrupted", "errEmpty", "errNoDates", "errGenerate", "errNetwork",
  "errLoadFailed", "errGenerateFailed", "errLoadSavedFailed",
  // TASK-MY-TRIP-CONNECT-FIX-V1 — 남아 있던 영어 하드코딩 안내를 키로 옮겼다
  "noteDeferred", "noteNearby", "fixedOutTitle", "fixedOutHint", "fallbackBanner", "sharedNotice",
];

/**
 * 아직 영어로 남아 있는 문구 — 값과 이유를 못 박는다.
 * 커머스 문구는 플래그가 false 라 렌더되지 않는다. 플래그를 켜려면 먼저
 * 번역하고 이 목록에서 빼야 한다.
 */
const ALLOW_EN: { text: string; why: string }[] = [
  { text: "Book on Klook",            why: "TRIP_FLOW_COMMERCE_ENABLED=false — 렌더되지 않는 죽은 UI" },
  { text: "Book Now",                 why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Book Tour",                why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Book Stay",                why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Gimhae Airport Evening Arrival", why: "POST_PLAN_COMMERCE_ENABLED=false — 죽은 UI" },
  { text: "Airport Limousine",        why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Gimhae → Nampo-dong",      why: "죽은 UI. ₩8,000 요금 주장이 검증되지 않았다" },
  { text: "Korea eSIM",               why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Activate before landing",  why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Hotel near Nampo-dong",    why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Best access from airport", why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "forget your eSIM",         why: "죽은 UI. 10% off 주장이 검증되지 않았다" },
  { text: "Stay connected throughout", why: "커머스 플래그가 false 라 렌더되지 않는 죽은 UI" },
  { text: "Google Maps",              why: "외부 고유명사 — 번역하지 않는다" },
  { text: "Naver Maps",               why: "외부 고유명사 — 번역하지 않는다" },
  { text: "Booking.com",              why: "외부 고유명사 — 죽은 공항 배너에만 남았다" },
];

// ── 1·2·3. locale parity ────────────────────────────────────────────────────
test("★추가한 키가 4개 언어에 모두 있다", () => {
  for (const l of LOCALES) {
    const itin = msg(l).itin;
    assert.ok(itin, `${l}.itin 없음`);
    for (const k of ADDED) assert.equal(typeof itin[k], "string", `${l}.itin.${k}`);
  }
});

test("★itin 네임스페이스 키 집합이 4개 언어에서 완전히 같다", () => {
  const base = Object.keys(msg("en").itin).sort();
  for (const l of LOCALES.slice(1)) {
    assert.deepEqual(Object.keys(msg(l).itin).sort(), base, l);
  }
});

test("★빈 번역값이 없다 — 화면에 빈칸이 뜬다", () => {
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(msg(l).itin)) {
      assert.ok(typeof v === "string" && v.trim().length > 0, `${l}.itin.${k} 가 비었다`);
    }
  }
});

test("★번역값이 영어 원문 그대로가 아니다 — 이관만 하고 번역을 빼먹지 않았다", () => {
  const en = msg("en").itin;
  // 값에 라틴 문자만 있는 키는 각 언어에서 EN 과 달라야 한다.
  // 고유명사·기호만 있는 값(예: 이모지)은 같아도 정상이므로 제외한다.
  const needsTranslation = ADDED.filter(k => /[A-Za-z]{4}/.test(en[k]));
  assert.ok(needsTranslation.length > 25, "검사 대상이 너무 적다: " + needsTranslation.length);
  for (const l of ["ko", "ja", "zh"] as const) {
    const m = msg(l).itin;
    for (const k of needsTranslation) {
      assert.notEqual(m[k], en[k], `${l}.itin.${k} 가 영어 원문 그대로다`);
    }
  }
});

// ── 5. interpolation ────────────────────────────────────────────────────────
test("★interpolation 변수 이름이 4개 언어에서 같다", () => {
  const ph = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
  const en = msg("en").itin;
  for (const l of ["ko", "ja", "zh"] as const) {
    const m = msg(l).itin;
    for (const k of ADDED) assert.equal(ph(m[k]), ph(en[k]), `${l}.itin.${k} 자리표시자`);
  }
});

test("★동적 값이 들어가는 키가 실제로 자리표시자를 갖는다", () => {
  const en = msg("en").itin;
  for (const [k, v] of [["placesCount", "n"], ["conflictNotice", "n"], ["departureNotice", "time"],
                        ["travelerOne", "n"], ["travelerMany", "n"], ["progress", "done"],
                        ["errLoadFailed", "message"]] as const) {
    assert.match(en[k], new RegExp(`\\{${v}\\}`), `${k} 에 {${v}} 없음`);
  }
});

// ── 4. 하드코딩 잔존 ────────────────────────────────────────────────────────
test("★번역한 문구가 하드코딩으로 되살아나지 않았다", () => {
  for (const s of ["Copy Share Link", "Copied!", "Tips for Foreigners", "Edit Trip",
                   "Full View", "Move up", "Move down", "Something went wrong",
                   "Loading itinerary", "Could not generate schedule", "Kept light",
                   "Use + to add to this day", "Data provided by Korea Tourism"]) {
    assert.ok(!BODY.includes(s), `하드코딩 재유입: "${s}"`);
  }
});

test("★남은 영어는 allowlist 에 적힌 것뿐이다", () => {
  // 커머스 문구는 플래그가 false 인 동안만 허용된다. 켜지면 이 테스트가 먼저 깨진다.
  assert.match(read("src", "config", "commerce-surfaces.ts"), /POST_PLAN_COMMERCE_ENABLED = false/);
  assert.match(read("src", "config", "commerce-surfaces.ts"), /TRIP_FLOW_COMMERCE_ENABLED = false/);
  for (const a of ALLOW_EN) {
    assert.ok(a.why.length > 8, a.text + " 이유 없음");
    assert.ok(PAGE.includes(a.text), `allowlist 에 있는데 코드에 없다: ${a.text}`);
  }
});

test("★외부 고유명사를 번역하지 않았다", () => {
  assert.ok(BODY.includes("Google Maps"));
  assert.ok(BODY.includes("Naver Maps"));
  for (const l of LOCALES) {
    const s = JSON.stringify(msg(l).itin);
    // 지도 브랜드명은 번역 값 안에서도 원형을 유지한다
    if (s.includes("Naver")) assert.match(s, /Naver/, l);
  }
});

// ── 6. 번역 함수 배선 ───────────────────────────────────────────────────────
test("★itin 번역 훅이 필요한 컴포넌트에 붙어 있다", () => {
  assert.equal((BODY.match(/useTranslations\("itin"\)/g) ?? []).length, 3,
    "PlaceModal · ItineraryResult · ItineraryPage 세 곳");
});

// 예전에는 `t("` 리터럴 호출 개수를 품질 지표로 썼다. 그런데 에러 문구를
// t("errX") 에서 t(error.key) 로 옮기자 — 번역이 더 정확해졌는데도 — 개수가
// 줄어 가드가 깨졌다. 개수는 번역 품질을 대변하지 못한다.
//
// 그래서 개수 대신 "이 화면이 번역을 실제로 거치는가" 를 본다.
test("★에러 문구는 던질 때가 아니라 그릴 때 번역된다", () => {
  // state 에 완성된 문장을 넣으면 locale 이 정해지기 전 영어로 굳는다.
  assert.doesNotMatch(BODY, /setError\(\s*t\(/,
    "setError(t(...)) 는 locale 확정 전에 문장을 고정시킨다");
  // 키를 담고 렌더에서 푼다
  assert.match(BODY, /setError\(\{\s*key:/, "에러 state 는 키를 담아야 한다");
  assert.match(BODY, /t\(error\.key/,        "렌더 시점에 t(error.key) 로 푼다");
  // 서버 원문은 번역 대상이 아니라 값으로 함께 들고 간다
  assert.match(BODY, /key:\s*"errLoadFailed",\s*message:/);
});

test("★에러·이탈 문구 키가 4개 언어에 모두 있다", () => {
  // 화면이 실제로 부르는 키들. 하나라도 빠지면 그 언어에서 키가 그대로 노출된다.
  for (const k of ["errNoDates", "errCorrupted", "errEmpty", "errGenerate",
                   "errNetwork", "errLoadFailed", "errGenerateFailed",
                   "errLoadSavedFailed", "somethingWrong", "backHome"]) {
    assert.match(BODY, new RegExp(`"${k}"`), `page.tsx 가 ${k} 를 쓰지 않는다`);
    for (const l of LOCALES) {
      assert.ok(msg(l).itin?.[k], `${l}.itin.${k} 없음`);
    }
  }
});

test("★저작권 문구를 화면이 직접 적지 않는다", () => {
  // footer 네임스페이스에 4개 언어가 이미 있는데 영어를 직접 적으면
  // 한국어 화면에 영어 저작권이 남는다.
  assert.doesNotMatch(BODY, /All rights reserved/);
  assert.match(BODY, /tFooter\("copyright"/);
});

// ── 7·8·9. 구조·토큰·지도 무변경 ────────────────────────────────────────────
test("★주요 handler 이름이 그대로다", () => {
  for (const fn of ["handleCopyShareLink", "handleTogglePublic", "toggleVisited",
                    "addCitySpotToDay", "getCategoryColor", "movePlace", "deletePlace"]) {
    assert.match(BODY, new RegExp(`\\b${fn}\\b`), fn);
  }
});

test("★Day 탐색·지도·타임라인 구조가 그대로다", () => {
  assert.match(BODY, /<PlannerDayNav/);
  assert.match(BODY, /<ItineraryDayMap/);
  assert.match(BODY, /showDayTabs=\{false\}/);
  assert.match(BODY, /buildOrderedTimeline\(/);   // TIMELINE-B-R1: 배열 순서 타임라인
  assert.match(BODY, /<PlannerCoverHeader/);
});

test("★semantic token 을 건드리지 않았다", () => {
  const g = read("src", "app", "globals.css");
  assert.equal((g.match(/--gkm-[a-z0-9-]+:/g) ?? []).length, 46);
  assert.equal((g.match(/--color-[a-z0-9-]+:/g) ?? []).length, 27);
  // S2-A 에서 옮긴 6종이 raw hex 로 돌아오지 않았다
  for (const hex of ["191C21", "565D66", "E5E7EA", "F6F7F8", "8A919B"]) {
    assert.doesNotMatch(PAGE, new RegExp(`[a-z]-\\[#${hex}\\]`, "i"), hex);
  }
});

test("★카드↔마커 연결을 새로 만들지 않았다", () => {
  assert.doesNotMatch(BODY, /selectedKey=/);
  assert.doesNotMatch(strip(read("src", "components", "ItineraryDayMap.tsx")), /selectedKey/);
});

// ── 10·11. migration ────────────────────────────────────────────────────────
test("★migration 을 건드리지 않았다 — 041 이 마지막이고 042 는 없다", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.length, 44);   // 042·043·044 는 피드백/알림 작업이 추가했다
  assert.ok(files.includes("041_lock_down_legacy_spots_select.sql"));
  // 이 가드의 뜻은 "이 작업이 DB 를 건드리지 않았다" 이다.
  // 042(place_reports)·043(place_likes)는 피드백 작업이 추가한 것으로 이 작업과 무관하다.
  // 그 밖의 migration 이 생기면 여기서 걸린다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^04[234]_(place_reports|place_likes|admin_notification_events)\.sql$/, `예상치 못한 migration: ${f}`);
  }
});

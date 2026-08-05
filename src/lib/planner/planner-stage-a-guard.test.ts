// STAGE A 계약 회귀 방어 (정적 검사).
//
// 순수 로직은 day-window-core.test.ts 가 실제로 실행해서 검증한다. 이 파일이
// 지키는 것은 그 로직이 화면에 실제로 연결돼 있는지, 그리고 재배치 과정에서
// 기존 편집 기능이 조용히 사라지지 않았는지다. 컴포넌트를 새로 넣으면서 ↑↓·
// 삭제·지도·저장·공유 중 하나만 빠져도 사용자는 되돌릴 방법이 없다.
//
// 주석은 검사 대상에서 뺀다 — 설명문에 단어가 들어 있다고 통과하면 안 된다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/**
 * 주석을 걷어낸 본문.
 * 블록 주석을 먼저 지운다. `{`-우선으로 지우면 `interface Props {` 의 `{` 가
 * 시작점으로 잡혀 본문까지 통째로 삼킨다(실제로 그랬다). 남는 빈 `{}` 는
 * 정규식 검사에 영향이 없으므로 그대로 둔다.
 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const PAGE     = strip(read("src", "app", "itinerary", "page.tsx"));
const NAV      = strip(read("src", "components", "planner", "PlannerDayNav.tsx"));
const DIALOG   = strip(read("src", "components", "planner", "DaySelectorDialog.tsx"));
const WEATHER  = strip(read("src", "components", "planner", "WeatherLinkChip.tsx"));
const ICON     = strip(read("src", "components", "planner", "TimelineIcon.tsx"));

// ── Day 탐색이 실제로 붙어 있다 ──────────────────────────────────────────────
test("★Full View 는 선택한 하루만 렌더한다 — 전체를 세로로 쌓지 않는다", () => {
  assert.match(PAGE, /days\.filter\(day => day\.dayNumber === clampDay\(days\.length, plannerDay\)\)\.map\(/);
});

test("★Day 탐색 컴포넌트가 화면에 연결돼 있다", () => {
  assert.match(PAGE, /import PlannerDayNav from "@\/components\/planner\/PlannerDayNav"/);
  assert.match(PAGE, /<PlannerDayNav/);
  assert.match(PAGE, /onSelectDay=\{selectDay\}/);
});

test("★Day 선택은 지도와 같이 움직인다 — 두 곳이 다른 날을 가리키면 안 된다", () => {
  // 날짜 → 지도
  assert.match(PAGE, /setPlannerDay\(d\);\s*\n?\s*setMapDay\(d - 1\);/);
  // 지도 → 날짜
  assert.match(PAGE, /onSelectDay=\{\(i\) => \{ setMapDay\(i\); setPlannerDay\(i \+ 1\); \}\}/);
});

test("★Day 선택 UI 는 화면에 하나뿐이다 — 지도의 Day 칩은 끈다", () => {
  // 실제로 브라우저에서 tablist 가 2개 잡혔다(Days + Day map). 회귀 방어.
  assert.match(PAGE, /showDayTabs=\{false\}/);
  const MAP = strip(read("src", "components", "ItineraryDayMap.tsx"));
  assert.match(MAP, /showDayTabs = true/, "단독 사용처는 기본값으로 그대로 동작해야 한다");
  assert.match(MAP, /\{showDayTabs && \(/);
});

test("★범위 밖 Day 는 항상 clamp 된다 — 빈 화면이 뜨지 않는다", () => {
  const uses = PAGE.match(/clampDay\(days\.length, plannerDay\)/g) ?? [];
  assert.ok(uses.length >= 2, `clampDay 사용 ${uses.length}회`);
});

// ── 이동 수단이 하나로 좁혀지지 않는다 ───────────────────────────────────────
test("★클릭·스와이프·키보드·전체선택 네 경로가 모두 있다", () => {
  assert.match(NAV, /onClick=\{\(\) => onSelectDay\(n\)\}/,        "클릭");
  assert.match(NAV, /swipeIntent\(/,                                "스와이프");
  assert.match(NAV, /ArrowRight/,                                   "키보드");
  assert.match(NAV, /ArrowLeft/,                                    "키보드");
  assert.match(NAV, /<DaySelectorDialog/,                           "전체 선택");
});

test("★스와이프는 경계를 넘지 않는다 — 순환 이동 없음", () => {
  assert.match(NAV, /if \(!canStep\(total, currentDay, dir\)\) return;/);
});

test("★세로 스크롤을 뺏지 않는다", () => {
  assert.match(NAV, /touchAction: "pan-y"/);
});

test("★pointer listener 를 반드시 뗀다 — 누수 방어", () => {
  for (const ev of ["pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
    assert.match(NAV, new RegExp(`addEventListener\\("${ev}"`), `add ${ev}`);
    assert.match(NAV, new RegExp(`removeEventListener\\("${ev}"`), `remove ${ev}`);
  }
});

test("★날짜 3칸은 균등 분할이다 — 세 번째가 잘려 보이면 안 된다", () => {
  assert.match(NAV, /gridTemplateColumns: `repeat\(\$\{windowDays\.length\}, minmax\(0, 1fr\)\)`/);
  assert.doesNotMatch(NAV, /overflow-x-auto/, "가로 스크롤로 잘라 보여주지 않는다");
});

// ── 전체 Day 선택 dialog ─────────────────────────────────────────────────────
test("★dialog 계약 — role·aria-modal·ESC·focus trap·focus 복원", () => {
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(DIALOG, /e\.key === "Escape"/,        "ESC");
  assert.match(DIALOG, /e\.key !== "Tab"/,           "focus trap");
  assert.match(DIALOG, /onClick=\{onClose\}/,        "바깥 클릭");
  assert.match(NAV,    /triggerRef\.current\?\.focus\(\)/, "닫은 뒤 원래 버튼으로 focus 복원");
});

test("★14일 이상도 열람 가능하다 — 목록이 스크롤된다", () => {
  assert.match(DIALOG, /overflow-y-auto/);
  assert.match(DIALOG, /max-h-\[/);
});

test("★dialog 는 이동 전용 — Day 추가·삭제·날짜 변경을 만들지 않았다", () => {
  for (const forbidden of [/onAddDay/, /onDeleteDay/, /onChangeDate/, /setDays\(/]) {
    assert.doesNotMatch(DIALOG, forbidden, String(forbidden));
  }
});

// ── 타임라인 ─────────────────────────────────────────────────────────────────
test("★모든 장소에 아이콘 기준점이 붙는다", () => {
  assert.match(PAGE, /<TimelineIcon category=\{place\.category\}/);
});

test("★점선은 마지막 장소 뒤에 남지 않는다", () => {
  assert.match(PAGE, /rowIdx < slotItems\.length - 1 && \(/);
  assert.match(PAGE, /border-dotted/);
});

test("★아이콘은 장식이다 — category 배지와 중복 낭독하지 않는다", () => {
  assert.match(ICON, /const decorative = !label;/);
  assert.match(ICON, /aria-hidden=\{decorative \? true : undefined\}/);
});

test("★아이콘 폰트를 새로 들이지 않았다 — 인라인 SVG 만 쓴다", () => {
  for (const src of [ICON, NAV, DIALOG, WEATHER]) {
    assert.doesNotMatch(src, /material-symbols|Material\+Symbols|fonts\.googleapis/i);
  }
});

// ── 지어낸 정보를 만들지 않는다 ──────────────────────────────────────────────
test("★가짜 날씨를 만들지 않는다 — 기온·강수확률·날씨 문구가 없다", () => {
  for (const bad of [/\d+\s*°/, /\bhumidity\b/i, /\bfeels like\b/i, /강수확률/, /\bsunny\b/i, /\brainy\b/i]) {
    assert.doesNotMatch(WEATHER, bad, String(bad));
    assert.doesNotMatch(NAV, bad, String(bad));
  }
});

test("★날씨는 검증된 공식 주소 하나만 쓴다 — locale 주소를 지어내지 않는다", () => {
  assert.match(WEATHER, /const KMA_OFFICIAL_URL = "https:\/\/www\.weather\.go\.kr\/w\/index\.do";/);
  const urls = WEATHER.match(/https?:\/\/[^\s"']+/g) ?? [];
  assert.deepEqual([...new Set(urls)], ["https://www.weather.go.kr/w/index.do"]);
  assert.doesNotMatch(WEATHER, /\/w\/eng\//, "영문으로 보이지만 실제로는 한국어인 주소");
});

test("★외부 링크는 새 탭 + noopener + 안내 문구", () => {
  assert.match(WEATHER, /target="_blank"/);
  assert.match(WEATHER, /rel="noopener noreferrer"/);
  assert.match(WEATHER, /aria-label=\{ariaLabel\}/);
});

test("★API key 를 코드에 넣지 않았다", () => {
  for (const src of [WEATHER, NAV, DIALOG, ICON]) {
    assert.doesNotMatch(src, /serviceKey|authKey|API_KEY|apiKey/i);
  }
});

test("★가짜 이동시간·가짜 거리를 새로 만들지 않았다", () => {
  for (const src of [NAV, DIALOG, ICON, WEATHER]) {
    assert.doesNotMatch(src, /\bmin walk\b|\bmins? by\b|도보 \d|\d+\s*km/i);
  }
});

// ── 기존 기능이 살아 있다 ────────────────────────────────────────────────────
test("★순서 변경·삭제·추가가 그대로 있다", () => {
  assert.match(PAGE, /movePlace\(/,        "↑↓ 이동");
  assert.match(PAGE, /deletePlace\(/,      "삭제");
  assert.match(PAGE, /addCartItemToDay/,   "보관함에서 추가");
  assert.match(PAGE, /addUserSpotToDay/,   "내 장소 추가");
  assert.match(PAGE, /addCitySpotToDay/,   "지도에서 추가");
});

test("★지도·저장·공유·제목 편집이 그대로 있다", () => {
  assert.match(PAGE, /<ItineraryDayMap/,          "Day 지도");
  assert.match(PAGE, /apiSaveItinerary/,          "저장");
  assert.match(PAGE, /handleCopyShareLink/,       "공유 링크");
  assert.match(PAGE, /handleTogglePublic/,        "공개 전환");
  assert.match(PAGE, /apiUpdateItineraryTitle/,   "제목 저장");
});

test("★제목 편집 버튼은 소유자에게만 보인다 — 열람자에게 노출되지 않는다", () => {
  assert.match(PAGE, /\(!shareId \|\| isOwner\) && itinId && \(\s*\n?\s*<button\s*\n?\s*onClick=\{\(\) => \{ setTitleInput/);
});

test("★편집 캔버스(compact) 진입 경로가 남아 있다", () => {
  assert.match(PAGE, /setViewMode\("compact"\)/);
});

// ── 문구 ─────────────────────────────────────────────────────────────────────
test("★새 문구는 4개 언어에 모두 있다 — 하드코딩 한국어를 남기지 않는다", () => {
  const KEYS = ["dayOfTotal", "openSelector", "selectorTitle", "dayTabList",
                "close", "weather", "weatherAria", "places", "dayAria"];
  const packs = ["en", "ko", "ja", "zh"].map(l =>
    [l, JSON.parse(read("src", "messages", `${l}.json`)) as Record<string, Record<string, string>>] as const);
  for (const [loc, m] of packs) {
    assert.ok(m.planner, `${loc}: planner namespace 없음`);
    for (const k of KEYS) assert.ok(typeof m.planner[k] === "string" && m.planner[k].length > 0, `${loc}.planner.${k}`);
  }
  // 자리표시자까지 같아야 한다 — 하나만 빠지면 그 언어에서 숫자가 사라진다
  for (const k of KEYS) {
    const shape = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
    const base = shape(packs[0][1].planner[k]);
    for (const [loc, m] of packs) assert.equal(shape(m.planner[k]), base, `${loc}.planner.${k} 자리표시자`);
  }
});

test("★모든 새 컴포넌트 문구는 prop 으로 주입된다 — 컴포넌트 안에 문장을 박지 않는다", () => {
  // 줄 끝 주석까지 뗀다. `//` 앞에 `:` 가 오면 URL 이므로 건드리지 않는다.
  const noTrailing = (s: string) => s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const [name, src] of [["PlannerDayNav", NAV], ["DaySelectorDialog", DIALOG], ["WeatherLinkChip", WEATHER]] as const) {
    assert.doesNotMatch(noTrailing(src), /[가-힣]{2,}/, `${name} 에 한국어 문장이 박혀 있다`);
  }
});

// ── 접근성 ───────────────────────────────────────────────────────────────────
test("★터치 대상이 44px 아래로 내려가지 않는다", () => {
  assert.match(NAV, /min-h-11/,        "Day 선택 버튼");
  assert.match(NAV, /min-h-\[54px\]/,  "날짜 칩");
  assert.match(DIALOG, /min-h-12/,     "목록 항목");
  assert.match(WEATHER, /min-h-11/,    "날씨 칩");
});

test("★키보드 focus 가 보인다", () => {
  for (const src of [NAV, DIALOG, WEATHER]) assert.match(src, /gkm-focus/);
});

test("★선택 상태를 색으로만 전하지 않는다", () => {
  assert.match(NAV, /aria-selected=\{active\}/);
  assert.match(DIALOG, /aria-current=\{active \? "true" : undefined\}/);
});

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

test("★점선의 시작·끝 판정은 하루 전체 기준이다 — 슬롯 경계에서 끊기지 않는다", () => {
  // 판정 자체는 timeline-core 가 하고 그쪽에서 실행 테스트한다.
  // 여기서는 화면이 그 값을 실제로 쓰는지만 지킨다.
  assert.match(PAGE, /row\.railAbove \? "border-l-2 border-dotted/);
  assert.match(PAGE, /row\.railBelow \? "border-l-2 border-dotted/);
  assert.doesNotMatch(PAGE, /rowIdx < slotItems\.length - 1/, "슬롯 안에서만 잇던 옛 판정이 남아 있다");
});

test("★시간대별 불투명 카드를 걷어냈다 — 하루가 한 덩어리로 보인다", () => {
  assert.doesNotMatch(PAGE, /TIME_SLOTS\.map\(\(ts\) => \{/, "슬롯마다 카드를 그리던 구조");
  assert.doesNotMatch(PAGE, /\{ts\.emoji\}/,  "슬롯 대형 헤더");
  assert.doesNotMatch(PAGE, /\{ts\.range\}/,  "슬롯 시간대 범위 헤더");
  // 정렬·분류 로직은 그대로 남아 있어야 한다
  assert.match(PAGE, /const TIME_SLOTS = \[/);
  // TIMELINE-B-R1: 표시는 배열 순서(순서 계약)를 그대로 편다 — 슬롯 정의·assignSlot 은 그대로 남는다.
  assert.match(PAGE, /const rows = buildOrderedTimeline\(/, "배열 순서 타임라인");
  assert.match(PAGE, /function assignSlot\(/);
});

test("★시간대 라벨은 그 시간대 첫 장소에만 붙는다", () => {
  // TIMELINE-B-R1: 시간대 라벨은 행이 아니라 3구간 헤더(오전·오후·저녁)로만 — 기존 slot_* 키를 그대로 쓴다.
  assert.match(PAGE, /row\.showSectionLabel && \(/);
  assert.match(PAGE, /tPlanner\(`slot_\$\{row\.section\}`\)/);
});

test("★타임라인은 정확한 방문 시각을 표시하지 않는다", () => {
  // 타임라인 행에서만 뗀다. 장소 상세 모달의 시각 칩은 이번 범위가 아니라 그대로 둔다.
  const rowStart = PAGE.indexOf("const rows = buildOrderedTimeline(");
  assert.ok(rowStart > 0, "타임라인 블록을 찾지 못했다");
  const timelineBlock = PAGE.slice(rowStart, PAGE.indexOf("</PlannerDayNav", rowStart) + 1 || undefined);
  assert.doesNotMatch(timelineBlock, /🕒 \{place\.time\}/, "타임라인에 시각 칩이 남아 있다");
  assert.doesNotMatch(timelineBlock, /\{place\.duration\}/, "타임라인에 체류시간이 남아 있다");
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
  // 연필은 대표 이미지 헤더로 옮겼다. 권한 판정은 그대로 owner 조건이다.
  assert.match(PAGE, /canEditTitle=\{\(!shareId \|\| isOwner\) && !!itinId\}/);
  const HEADER = strip(read("src", "components", "planner", "PlannerCoverHeader.tsx"));
  assert.match(HEADER, /\{canEditTitle && \(/, "false 면 버튼 자체를 렌더하지 않아야 한다");
  assert.doesNotMatch(HEADER, /opacity-0/, "숨긴 척만 하고 DOM 에 남기지 않는다");
});

test("★제목은 화면에 한 곳에만 있다 — 어느 쪽이 편집 대상인지 헷갈리지 않게", () => {
  const h1 = PAGE.match(/<h1[\s>]/g) ?? [];
  assert.equal(h1.length, 0, "제목은 헤더 컴포넌트가 그린다");
  assert.match(PAGE, /<PlannerCoverHeader/);
});

test("★제목 편집 계약이 그대로다 — Enter 저장·ESC 취소·길이 제한", () => {
  assert.match(PAGE, /if \(e\.key === "Enter"\) handleTitleSave\(\);/);
  assert.match(PAGE, /if \(e\.key === "Escape"\) setEditingTitle\(false\);/);
  assert.match(PAGE, /maxLength=\{60\}/);
  assert.match(PAGE, /onBlur=\{handleTitleSave\}/);
});

// ── 대표 이미지 ──────────────────────────────────────────────────────────────
test("★개인 사진 보안 게이트를 건드리지 않았다", () => {
  const COVER = strip(read("src", "lib", "planner", "cover-source-core.ts"));
  assert.match(COVER, /input\.isPublic === true/, "공개 일정에서만 개인 사진");
  assert.match(COVER, /input\.coverKind === "moment"/);
  // 새 owner 전용 이미지 API 를 만들지 않았다
  assert.doesNotMatch(PAGE, /\/api\/itinerary\/[^\n]*\/cover-image/);
});

test("★도시 대표 비주얼은 KTO manifest·프록시와 분리돼 있다", () => {
  const CV = strip(read("src", "lib", "city-visual.ts"));
  assert.doesNotMatch(CV, /kogl_type1|visitkorea|tong\./i, "허위 라이선스·출처");
  assert.doesNotMatch(CV, /\/img\/cover\//, "KTO 프록시 경로");
});

// My Trips 는 이 목록에 없어서 자기 Unsplash 맵을 오래 들고 있었고, 부산 카드에
// 스마트폰 사진이, 서울 카드에 일본 아사쿠사 사진이 나가고 있었다. 도시 사진을
// 쓰는 화면은 빠짐없이 여기에 적는다.
test("★도시 대표 비주얼 정의는 한 곳뿐이다 — 화면마다 자기 맵을 들지 않는다", () => {
  for (const f of [
    ["src", "components", "CityEntry.tsx"],
    ["src", "components", "home", "PremiumDiscoveryHome.tsx"],
    ["src", "app", "my-trips", "page.tsx"],
  ]) {
    const src = strip(read(...f));
    assert.match(src, /cityVisual\(/, `${f.join("/")}: 공용 resolver 미사용`);
    assert.doesNotMatch(src, /city-(seoul|busan|jeju|gyeongju|jeonju)[\w-]*\.(jpg|png)/,
      `${f.join("/")}: 이미지 경로를 다시 하드코딩했다`);
    // 원격 사진은 원본이 바뀌어도 알 길이 없다 — 실제로 그렇게 어긋났다
    assert.doesNotMatch(src, /images\.unsplash\.com/,
      `${f.join("/")}: 도시 사진을 외부 URL 로 다시 들었다`);
  }
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

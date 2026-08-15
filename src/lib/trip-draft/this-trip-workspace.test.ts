// This Trip 이 이번 여행의 작업대인가.
//
// 장소는 Picks 에서 고르는데 조건은 Home 에만 있었다. "내가 언제 가는 여행이지"
// 를 확인하려면 화면을 옮겨 다녀야 했다. 이제 한 자리에서 본다.
//
// 여기서 지키는 것은 두 가지다.
//   ① 저장소를 새로 만들지 않았다 — TripDraft 하나가 여전히 SSOT 다
//   ② 신규 여행에서 동행(Solo·Couple·Family·Group)을 더 이상 묻지 않는다
//
// 실행: node --experimental-strip-types src/lib/trip-draft/this-trip-workspace.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { TRIP_DRAFT_KEY, readTripDraft, writeTripDraft } from "./trip-draft-core.ts";
import { buildItineraryGenerationUrl, tripDraftGenerationContext } from "../trip-generation/itinerary-url.ts";
import { normalizeTripPace } from "../trip-pace/pace-core.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem:    (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem:    (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  },
};

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const PICKS = strip(read("src", "app", "picks", "PicksClient.tsx"));
const HOME  = strip(read("src", "app", "HomeClient.tsx"));
const PANEL = strip(read("src", "components", "TripSetupPanel.tsx"));
const ITIN  = strip(read("src", "app", "itinerary", "page.tsx"));

// ── A. 동행 질문을 없앴다 ────────────────────────────────────────────────────

test("★★신규 여행에서 Solo·Couple·Family·Group 을 묻지 않는다", () => {
  // 여행 계획에 필요한 것은 몇 명인가와 어떤 속도로 다니는가 둘뿐이다.
  for (const [label, src] of [["Home", HOME], ["Picks", PICKS], ["Panel", PANEL]] as const) {
    assert.doesNotMatch(src, /<option value="(Solo|Couple|Family|Group)">/,
      `★${label} 에 동행 선택이 남아 있다`);
    assert.doesNotMatch(src, /style_Solo|style_Couple|style_Family|style_Group/,
      `★${label} 이 동행 문구를 쓴다`);
  }
});

test("★★고르지 않은 동행을 Solo 로 채우지 않는다", () => {
  // 예전에는 `style || "Solo"` 였다. 넷이 가는 여행에도 "Solo Trip" 이라고 적혔다.
  assert.doesNotMatch(HOME, /style \|\| "Solo"/, "★없는 값을 Solo 로 채운다");
  assert.match(ITIN, /searchParams\.get\("travelStyle"\)\s+\|\| "";/,
    "★일정 화면이 없는 동행을 Solo 로 읽는다");
  assert.match(ITIN, /travelStyle \? `\$\{travelStyle\} Trip` : t\("tripTitleFallback"\)/,
    "비어 있을 때 제목이 ' Trip' 이 된다");
});

test("★legacy travelStyle 은 지우지 않았다", () => {
  // 저장된 여행을 다시 열려면 이 값이 필요하다. UI 만 없앴다.
  assert.match(HOME, /sessionStorage\.getItem\("km_travel_style"\)/, "legacy 읽기가 사라졌다");
  assert.match(HOME, /travelStyle:\s*effectiveStyle/, "생성에서 travelStyle 이 빠졌다");
  assert.match(ITIN, /setTravelStyle\(record\.travel_style\)/, "저장 여행 재현이 깨졌다");
  assert.match(ITIN, /travel_style: tstyle/, "저장 payload 에서 빠졌다");
});

// ── B. 저장소는 하나다 ───────────────────────────────────────────────────────

test("★★This Trip 이 자기 저장소를 만들지 않았다", () => {
  for (const key of ["planning", "setup", "trip_pace", "this_trip_dates",
                     "travelers", "arrival", "departure"]) {
    assert.doesNotMatch(PICKS, new RegExp(`localStorage\\.\\w+\\(\\s*["'\`]koreamate_${key}`),
      `★Picks 가 koreamate_${key} 를 만들었다`);
  }
  assert.doesNotMatch(PANEL, /localStorage|sessionStorage/, "★조건 패널이 직접 저장한다");
  // 고치는 길은 기존 helper 하나다.
  assert.match(PICKS, /writeTripDraft\(\{/, "Picks 가 draft 를 고치지 않는다");
  assert.match(PICKS, /const \[draft, setDraft\] = useState<TripDraft \| null>\(null\)/);
});

test("★★고치지 않은 값은 그대로 둔다", () => {
  // 패널이 한 항목만 바꿔도 나머지가 지워지면 안 된다.
  store.clear();
  writeTripDraft({ city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27",
    travelers: "2", arrivalTime: "13:00", stayArea: "Haeundae (해운대)", tripPace: "active", now: 1 });
  const before = readTripDraft()!;
  writeTripDraft({ city: before.city, startDate: before.startDate, endDate: before.endDate,
    travelers: before.travelers, startLocation: before.startLocation,
    arrivalTime: before.arrivalTime, departurePlace: before.departurePlace,
    departureTime: before.departureTime, stayArea: before.stayArea,
    stay: before.stay ?? null, tripPace: before.tripPace, departureTime2: undefined,
    now: 2 } as never);
  const after = readTripDraft()!;
  assert.equal(after.travelers, "2");
  assert.equal(after.arrivalTime, "13:00");
  assert.equal(after.stayArea, "Haeundae (해운대)");
  assert.equal(after.tripPace, "active");
});

// ── C. 화면 구조 ─────────────────────────────────────────────────────────────

test("★Picks 는 3탭 그대로다", () => {
  assert.match(PICKS, /const TABS: Tab\[\] = \["selected", "saved", "mine"\]/);
});

test("★★조건 패널이 This Trip 에 올라가 있다", () => {
  assert.match(PICKS, /<TripSetupPanel draft=\{draft\} onChange=\{patchDraft\} \/>/,
    "This Trip 에 여행 조건이 없다");
  // 여행이 아직 없으면 조건 패널 대신 무엇이 필요한지 말한다.
  assert.match(PICKS, /tab === "selected" && !draft && \(/);
});

test("★조건 패널이 City·Dates·Travelers 를 보여준다", () => {
  assert.match(PANEL, /\{city\}/, "도시가 없다");
  assert.match(PANEL, /\{draft\.startDate\} – \{draft\.endDate\}/, "날짜가 없다");
  assert.match(PANEL, /travelersCount/, "인원이 없다");
  assert.match(PANEL, /id="trip-travelers" type="number"/, "인원이 숫자 입력이 아니다");
});

test("★★도착·출발·숙박은 접어 두고 요약만 보여준다", () => {
  for (const k of ["arrival", "departure", "stay"]) {
    assert.match(PANEL, new RegExp(`title=\\{t\\("${k}"\\)\\}`), `${k} 칸이 없다`);
  }
  assert.match(PANEL, /aria-expanded=\{open\}/, "펼침 상태를 알 수 없다");
  assert.match(PANEL, /summary=\{draft\.startLocation \?/, "도착 요약이 없다");
});

test("★★숙박은 기존 컴포넌트를 그대로 쓴다", () => {
  // 숙박 트랙은 COMPLETE 다. 여기서 다시 만들지 않는다.
  assert.match(PANEL, /<StayFieldsSection/, "숙박 입력을 새로 만들었다");
  assert.doesNotMatch(PANEL, /stay-name|StayLocationPicker|confirmStayCoordinate/,
    "★숙박 입력을 복제했다");
});

test("★★Trip Pace 3택이 This Trip 에 있다", () => {
  assert.match(PANEL, /TRIP_PACE_CHOICES\.map/, "Pace 3택이 없다");
  assert.match(PANEL, /\(draft\.tripPace \?\? "balanced"\) === p/, "기본값이 balanced 가 아니다");
  assert.equal(normalizeTripPace(undefined), "balanced");
  // 내부 용어를 보여주지 않는다.
  assert.doesNotMatch(PANEL, /packed|dwell|multiplier|"normal"/, "★내부 용어가 화면에 나온다");
});

// ── D. 조건부 섹션 ───────────────────────────────────────────────────────────

test("★★시간이 정해진 일정은 있을 때만 보인다", () => {
  // 0 개면 섹션 자체를 만들지 않는다.
  // 두 묶음으로 나누고, 구간이 시작되는 자리에서만 제목을 놓는다.
  assert.match(PICKS, /const scheduledItems = selected\.filter\(i => i\.fixed\)/);
  assert.match(PICKS, /const freeItems\s+= selected\.filter\(i => !i\.fixed\)/);
  assert.match(PICKS, /scheduledItems\.length > 0 \? tSetup\("scheduled"\)/,
    "★약속이 0 개여도 제목이 나온다");
  assert.match(PICKS, /cardIndex === scheduledItems\.length \? tSetup\("places"\)/);
});

test("★해결되지 않은 예전 선택도 있을 때만 보인다", () => {
  assert.match(PICKS, /tab === "selected" && unresolved\.length > 0 && \(/);
  // 기술 용어를 쓰지 않는다.
  assert.doesNotMatch(PICKS, /orphan|stale|unresolved entity/i);
});

// ── E. 생성 ──────────────────────────────────────────────────────────────────

test("★★Plan My Trip 은 공용 builder 하나만 쓴다", () => {
  assert.match(PICKS, /buildItineraryGenerationUrl\(tripDraftGenerationContext\(draft\)\)/,
    "★This Trip 이 주소를 따로 조립한다");
  assert.doesNotMatch(PICKS, /AI Prep|Build My Trip with AI|Prepare with AI/,
    "★CTA 문구가 바뀌었다");
});

test("★★장소가 0 개여도 만들 수 있다", () => {
  // 자동 후보로 채울 수 있다. 도시·날짜만 진짜 필수다.
  store.clear();
  writeTripDraft({ city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27", now: 1 });
  assert.ok(buildItineraryGenerationUrl(tripDraftGenerationContext(readTripDraft()!)));
  // CTA 가 선택 장소 유무 분기 안에 갇혀 있지 않다.
  const branch = PICKS.slice(PICKS.indexOf('selected.length === 0 ? ('));
  const inBranch = branch.slice(0, branch.indexOf("handleBuild"));
  assert.ok(inBranch.includes("))}"), "★CTA 가 '장소 있을 때' 분기 안에 있다");
});

test("★★여행 조건이 생성 주소로 전달된다", () => {
  store.clear();
  writeTripDraft({ city: "Busan", startDate: "2026-10-24", endDate: "2026-10-27",
    travelers: "3", arrivalTime: "13:00", tripPace: "relaxed", now: 1 });
  const url = buildItineraryGenerationUrl(tripDraftGenerationContext(readTripDraft()!))!;
  for (const p of ["travelers=3", "arrivalTime=13", "pace=relaxed"]) {
    assert.ok(url.includes(p.split("=")[0]!), `${p} 가 빠졌다`);
  }
  assert.ok(url.includes("pace=relaxed"));
});

test("★★Saved 와 This Trip 은 여전히 다른 상태다", () => {
  assert.match(PICKS, /getCityCart\(tripCity\)/, "This Trip 이 도시별 목록이 아니다");
  assert.match(PICKS, /getFavorites\(\)/, "Saved 가 사라졌다");
  assert.doesNotMatch(PICKS, /setSaved\(getCityCart|setSelected\(getSavedSpotsData/,
    "★Saved 와 This Trip 을 한 상태로 합쳤다");
});

console.log(`\n  ${passed} passed`);

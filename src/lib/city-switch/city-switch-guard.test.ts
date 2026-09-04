// 지역 활성 여부는 선언된 값 하나로만 판단한다.
//
// 무엇을 막는가
//   도시 이름을 코드에 적거나 장소 개수로 "열렸는지" 를 판단하는 것. 수집이
//   잠깐 비었다고 계획 도시가 아니게 되고, 몇 개 들어오면 갑자기 계획 도시가
//   되는 규칙은 제품 규칙이 아니다. 나중에 도시가 열릴 때 코드를 고쳐야 하는
//   구조도 같은 문제다 — 값 하나만 바꾸면 되게 둔다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

// 플래너(도시 선택·전환 UI 포함)는 PLANNER-SPOTS-SEPARATION-V1 에서
// Home 섹션 → /planner 로 이사했다. 검사 대상 코드는 그대로 그 파일에 있다.
const HOME = read("src", "app", "planner", "PlannerClient.tsx");
const CODE = strip(HOME);
const CORE = read("src", "lib", "city-switch", "city-switch-core.ts");

// ── 선언이 SSOT 다 ───────────────────────────────────────────────────────────
test("★CityConfig 가 계획 가능 여부를 선언한다", () => {
  assert.match(read("src", "data", "cities", "types.ts"), /planningReady:\s*boolean;/);
});

test("★다섯 도시 모두 값을 명시한다 — 빠뜨린 도시가 없다", () => {
  const dir = join(ROOT, "src", "data", "cities");
  const files = readdirSync(dir).filter(f => /^(busan|seoul|jeju|gyeongju|jeonju)\.ts$/.test(f));
  assert.equal(files.length, 5, files.join(","));
  for (const f of files) {
    assert.match(readFileSync(join(dir, f), "utf8"), /planningReady:\s*(true|false),/, f);
  }
});

test("★판단은 선언된 값으로만 한다 — 개수도 이름도 보지 않는다", () => {
  const s = strip(CORE);
  assert.match(s, /planningReady/);
  assert.doesNotMatch(s, /staticSpots|spots\.length|length\s*===\s*0/, "장소 개수로 판단한다");
  for (const name of [/busan/i, /seoul/i, /jeju/i, /gyeongju/i, /jeonju/i]) {
    assert.doesNotMatch(s, name, `도시 이름을 코드가 안다: ${name}`);
  }
});

// ── 화면 배선 ────────────────────────────────────────────────────────────────
test("★도시 버튼은 setCity 를 직접 부르지 않는다", () => {
  assert.doesNotMatch(CODE, /onClick=\{\(\) => setCity\(/, "확인 없이 도시가 바뀐다");
  // 도시 버튼은 하나의 map 이라 호출 지점도 하나다 — 정의 1 + 버튼 1.
  // 도시를 따로 떼어 버튼을 늘리면 여기서 걸린다.
  assert.equal((CODE.match(/requestCitySwitch\(/g) ?? []).length, 2);
});

test("★열리지 않은 도시를 고르면 아무 상태도 바뀌지 않는다", () => {
  // blocked·noop 은 어떤 setter 도 부르지 않고 그대로 돌아간다
  assert.match(CODE, /if \(action === "blocked" \|\| action === "noop"\) return;/);
  const s = CODE.indexOf("function requestCitySwitch");
  const e = CODE.indexOf("setStartLocation(CITY_ARRIVAL_DEFAULTS");
  assert.ok(s > 0 && e > s, "requestCitySwitch 범위를 못 찾았다");
  const fn = CODE.slice(s, e);
  assert.doesNotMatch(fn, /removeFavorite|clearCityCart|setStartDate/, "판단 함수가 상태를 바꾼다");
});

test("★확인 전에는 아무것도 지우지 않는다", () => {
  const req = CODE.slice(CODE.indexOf("function requestCitySwitch"));
  const head = req.slice(0, req.indexOf("}\n"));
  assert.doesNotMatch(head, /removeFavorite|clearCityCart/);
  // 지우는 일은 applyCitySwitch 안에서만 한다
  assert.equal((CODE.match(/clearCityCart\(city\)/g) ?? []).length, 1);
  assert.equal((CODE.match(/removeFavorite\(r\.id, r\.sourceKey\)/g) ?? []).length, 1);
});

test("★이 도시 것이 확실한 Saved 만 내린다", () => {
  assert.match(CODE, /savedToReleaseForCity\(getSavedSpotsData\(\), city\)/);
  // 전체 비우기를 쓰지 않는다
  assert.doesNotMatch(CODE, /\bclearCart\(\)/);
  assert.doesNotMatch(CODE, /localStorage\.removeItem\("koreamate_favorites/);
});

test("★My Places·My Trip·Trip Memory 는 건드리지 않는다", () => {
  const fn = CODE.slice(CODE.indexOf("function applyCitySwitch"), CODE.indexOf("function requestCitySwitch"));
  for (const bad of [/apiDeleteUserSpot/, /user_spot/, /apiSaveItinerary/, /koreamate_itin/, /koreamate_moments/]) {
    assert.doesNotMatch(fn, bad, String(bad));
  }
});

test("★날짜·도착·출발·숙박은 비우고 인원·속도는 남긴다", () => {
  const fn = CODE.slice(CODE.indexOf("function applyCitySwitch"), CODE.indexOf("function requestCitySwitch"));
  for (const reset of [/setStartDate\(""\)/, /setEndDate\(""\)/, /setArrivalTime\(""\)/,
                       /setDeparturePlace\(""\)/, /setDepartureTime\(""\)/,
                       /setStayArea\(""\)/, /setStayMode\("none"\)/, /setStayDetail\(null\)/]) {
    assert.match(fn, reset, String(reset));
  }
  assert.doesNotMatch(fn, /setTravelers\(/, "인원을 지운다");
  assert.doesNotMatch(fn, /setTripPace\(/, "여행 속도를 지운다");
});

test("★저장된 draft 를 지워야 새 도시가 실제로 남는다", () => {
  // writeTripDraft 는 날짜가 유효할 때만 쓴다. 날짜를 비운 채 두면 그 저장이
  // 조용히 실패해 이전 도시가 그대로 남는다 — 화면과 저장이 어긋난다.
  const fn = CODE.slice(CODE.indexOf("function applyCitySwitch"), CODE.indexOf("function requestCitySwitch"));
  assert.match(fn, /clearTripDraft\(\);[\s\S]{0,400}setStartDate\(""\)/);
  assert.match(HOME, /import \{ readTripDraft, writeTripDraft, clearTripDraft,/);
});

test("★돌아왔을 때 되살려 주는 도시별 바구니를 만들지 않았다", () => {
  for (const bad of [/savedByCity/, /cartByCity/, /restoreCity/, /koreamate_city_/]) {
    assert.doesNotMatch(CODE, bad, String(bad));
  }
});

// ── 안내 문구 ────────────────────────────────────────────────────────────────
test("★확인창은 개수도 Saved/This Trip 구분도 말하지 않는다", () => {
  const start = CODE.indexOf("{pendingCity && (");
  const dlg = CODE.slice(start, CODE.indexOf("{showDeptWarning && ("));
  assert.ok(start > 0 && dlg.length > 0);
  for (const bad of [/\{count\}/, /Saved/, /This Trip/, /selected\.length/, /\.length\}/]) {
    assert.doesNotMatch(dlg, bad, String(bad));
  }
  assert.match(dlg, /tf\("citySwitchTitle"\)/);
  assert.match(dlg, /tf\("citySwitchGo", \{ city:/);
  assert.match(dlg, /tf\("citySwitchCancel"\)/);
});

test("★취소는 아무것도 바꾸지 않는다", () => {
  const start = CODE.indexOf("{pendingCity && (");
  const dlg = CODE.slice(start, CODE.indexOf("{showDeptWarning && ("));
  const cancel = dlg.slice(dlg.indexOf("citySwitchCancel") - 400, dlg.indexOf("citySwitchCancel"));
  assert.match(cancel, /onClick=\{\(\) => setPendingCity\(null\)\}/);
  assert.doesNotMatch(cancel, /applyCitySwitch|removeFavorite|clearCityCart/);
});

test("★새 문구가 4개 언어에 모두 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const tf = JSON.parse(read("src", "messages", `${locale}.json`)).tripForm;
    for (const k of ["citySwitchTitle", "citySwitchBody", "citySwitchGo", "citySwitchCancel"]) {
      assert.equal(typeof tf?.[k], "string", `${locale}.tripForm.${k}`);
      assert.ok(tf[k].trim().length > 0, `${locale}.tripForm.${k} 가 비었다`);
    }
    assert.match(tf.citySwitchGo, /\{city\}/, `${locale} citySwitchGo`);
  }
});

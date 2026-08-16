// 반쯤 만들어진 일정은 My Trip 이 아니다.
//
// 하루씩 만드는 구조라 누락은 마지막 날이 끝나야 알 수 있다. 그전까지는
// "오늘 못 넣었다" 가 정상이다 — 내일 들어가면 되기 때문이다. 그래서 판정은
// 루프가 전부 끝난 뒤 한 번, 클라이언트에서 한다. `/api/trip/plan` 은 하루짜리
// API 라 여행 전체를 알 수 없고, 그 계약은 건드리지 않는다.
//
// 남은 곳이 있으면 화면에 띄우지도 저장하지도 않는다. 화면에 띄우는 순간
// 사용자는 그것을 완성본으로 읽는다.
//
// TSX 렌더 테스트 인프라가 없고 새 package 도 못 넣으므로 여기서는 배선이
// 소스에 남아 있다는 것만 못 박는다. 판정 규칙 자체는 trip-feasibility.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const ITIN = read("src", "app", "itinerary", "page.tsx");
const CODE = strip(ITIN);

test("★판정은 날짜 루프가 끝난 뒤 기존 unplacedPicks 로 한다", () => {
  assert.match(ITIN, /import \{ reduciblePicks \} from "@\/lib\/trip-plan\/trip-feasibility"/);
  // cartHints − usedPlaceIds 차집합은 그대로 쓴다 — 새 신호를 만들지 않았다
  assert.match(CODE, /const placedKeys = new Set\(usedPlaceIds\.map\(String\)\)/);
  assert.match(CODE, /cartHints\s*\n?\s*\.filter\(h => !placedKeys\.has\(String\(h\.place_id\)\)\)/);
});

test("★두 생성 경로 모두에서 판정한다 — 한쪽만 막으면 우회로가 남는다", () => {
  assert.equal((CODE.match(/reduciblePicks\(unplaced, outOfWindow\)/g) ?? []).length, 2);
});

test("★남은 곳이 있으면 일정을 화면에 올리지 않는다", () => {
  // setDays 앞에서 return 한다. days 가 바뀌지 않으면 저장 effect 도 안 돈다.
  const gate = /const reduce = reduciblePicks\(unplaced, outOfWindow\);\s*\n\s*if \(reduce\.length > 0\) \{[\s\S]{0,320}?setNeedsReduction\(reduce\);\s*\n\s*setLoading\(false\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*setDays\(sanitizeDays\(days\)\)/g;
  assert.equal((CODE.match(gate) ?? []).length, 2, "게이트가 setDays 앞에 있지 않다");
});

test("★그 상태에서 저장을 시작하지 않는다", () => {
  // 저장 effect 는 days 로만 깨어난다. 게이트 블록 안에서 저장을 부르지 않는다.
  assert.match(CODE, /useEffect\(\(\) => \{\s*\n\s*if \(days\.length === 0 \|\| !itinId\) return;/);
  const blocks = CODE.match(/if \(reduce\.length > 0\) \{[\s\S]*?\n\s*\}/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    assert.doesNotMatch(b, /apiSaveItinerary/, "미완성 일정을 저장한다");
    assert.doesNotMatch(b, /setDays/,          "미완성 일정을 화면에 올린다");
  }
});

test("★This Trip·Saved·My Places 를 건드리지 않는다", () => {
  const blocks = CODE.match(/if \(reduce\.length > 0\) \{[\s\S]*?\n\s*\}/g) ?? [];
  for (const b of blocks) {
    for (const bad of [/clearCart/, /removeFromCart/, /koreamate_cart/, /koreamate_favorites/, /apiDeleteUserSpot/]) {
      assert.doesNotMatch(b, bad, String(bad));
    }
  }
});

test("★안내 화면은 일정 대신 나오고 This Trip 으로 보낸다", () => {
  assert.match(CODE, /if \(needsReduction\.length > 0\) \{\s*\n\s*return \(/);
  assert.match(CODE, /tPicks\("reduceTitle"\)/);
  assert.match(CODE, /tPicks\("reduceBody"\)/);
  assert.match(CODE, /tPicks\("reduceAction"\)/);
  assert.match(CODE, /href="\/picks\/\?tab=selected"/);
});

test("★어느 장소를 빼라고 정해 주지 않는다", () => {
  const screen = CODE.slice(CODE.indexOf("if (needsReduction.length > 0)"));
  const head   = screen.slice(0, screen.indexOf("if (error)"));
  for (const bad of [/추천/, /권장/, /recommend/i, /suggest/i, /먼저 빼/]) {
    assert.doesNotMatch(head, bad, String(bad));
  }
});

test("★제거 개수를 계산하지 않는다 — 이번 범위가 아니다", () => {
  assert.doesNotMatch(CODE, /reduceCount|minRemove|removeRange|약 \d+~\d+/);
});

test("★새 문구가 4개 언어에 모두 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const picks = JSON.parse(read("src", "messages", `${locale}.json`)).picks;
    for (const k of ["reduceTitle", "reduceBody", "reduceAction"]) {
      assert.equal(typeof picks?.[k], "string", `${locale}.picks.${k}`);
      assert.ok(picks[k].trim().length > 0, `${locale}.picks.${k} 가 비었다`);
    }
  }
});

test("★Scheduler 와 API 계약은 이번에 건드리지 않았다", () => {
  const types = read("src", "lib", "trip-plan", "types.ts");
  assert.doesNotMatch(types, /needs_selection_reduction/);
  const engine = read("src", "lib", "scheduler", "engine.ts");
  assert.match(engine, /runUntilStable\(\(\) => greedyLoop\(true\)\)/);
  assert.match(engine, /runUntilStable\(\(\) => greedyLoop\(\)\)/);
});

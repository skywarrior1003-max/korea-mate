// This Trip 을 비우는 순간은 딱 하나다 — 방금 만든 일정이 실제로 저장된 그때.
//
// 저장 effect 는 세 경우에 똑같이 깨어난다.
//   ① 새로 만들었을 때   ② 저장된 일정을 다시 열었을 때   ③ 편집할 때
// "저장 성공" 만 신호로 쓰면 ②③ 에서도 비워진다 — 저장된 일정을 구경만 해도
// 지금 짜던 This Trip 이 사라진다. 그래서 생성 경로에서만 자격을 세우고
// 한 번 쓰고 내린다.
//
// TSX 렌더 테스트 인프라가 없으므로 배선이 소스에 남아 있다는 것만 못 박는다.
// 도시 범위 규칙 자체는 drop-city.test.ts.

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
const CART = read("src", "lib", "cart.ts");

test("★전체 비우기를 쓰지 않는다 — 도시 범위로만 비운다", () => {
  assert.match(ITIN, /import \{[^}]*clearCityCart[^}]*\} from "@\/lib\/cart"/);
  assert.doesNotMatch(CODE, /\bclearCart\(\)/, "다른 도시 여행까지 비운다");
  assert.match(CODE, /clearCityCart\(paramCity\)/);
  assert.equal((CODE.match(/clearCityCart\(/g) ?? []).length, 1, "비우는 지점은 하나여야 한다");
});

test("★자격은 생성 경로에서만 선다", () => {
  // 두 생성 경로(캐시 오염 재생성 · 신규 생성) 모두에서 세운다
  assert.equal((CODE.match(/clearOnFirstSaveRef\.current = true/g) ?? []).length, 2);
  // 그리고 그 자리는 언제나 setDays 직전이다 — feasibility 게이트를 통과한 뒤다
  const paired = /clearOnFirstSaveRef\.current = true;\s*\n\s*setDays\(sanitizeDays\(days\)\)/g;
  assert.equal((CODE.match(paired) ?? []).length, 2);
});

test("★저장된 일정을 다시 여는 경로에서는 세우지 않는다", () => {
  // Effect 1 — /itinerary?id= 로 여는 My Trips reopen. `if (!shareId) return;`
  // 으로 시작해서 `}, [shareId]);` 로 끝난다.
  const e1s = CODE.indexOf("if (!shareId) return;");
  const e1e = CODE.indexOf("}, [shareId]);", e1s);
  assert.ok(e1s > 0 && e1e > e1s, "Effect 1 을 못 찾았다");
  assert.doesNotMatch(CODE.slice(e1s, e1e), /clearOnFirstSaveRef/,
    "reopen 이 This Trip 을 비울 자격을 갖는다");

  // Effect 2 안에서 저장 레코드를 그대로 쓰는 분기 — 여기도 생성이 아니다.
  const rs = CODE.indexOf("setDays(sanitizeDays(loadedDays));");
  const re = CODE.indexOf("setLoading(false);", rs);
  assert.ok(rs > 0 && re > rs, "레코드 로드 분기를 못 찾았다");
  assert.doesNotMatch(CODE.slice(rs, re), /clearOnFirstSaveRef/);
});

test("★저장에 성공한 그 순간에만, 한 번만 비운다", () => {
  const gate = /if \(ok && clearOnFirstSaveRef\.current\) \{\s*\n\s*clearOnFirstSaveRef\.current = false;[\s\S]{0,240}?clearCityCart\(paramCity\)/;
  assert.match(CODE, gate, "성공 조건·1회 소비·도시 범위 중 하나가 빠졌다");
  // 실패(ok === false)에서는 비우지 않는다
  assert.doesNotMatch(CODE, /if \(!ok\)[^\n]*clearCityCart/);
});

test("★feasibility 로 막힌 생성은 자격을 얻지 못한다", () => {
  // 게이트는 return 으로 끝나고 그 뒤에야 자격이 선다
  const blocks = CODE.match(/if \(reduce\.length > 0\) \{[\s\S]*?\n\s*\}/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const b of blocks) assert.doesNotMatch(b, /clearOnFirstSaveRef/);
});

test("★Saved·My Places 는 건드리지 않는다", () => {
  const save = CODE.slice(CODE.indexOf("const ok = await apiSaveItinerary("));
  const head = save.slice(0, 900);
  for (const bad of [/koreamate_favorites/, /apiDeleteUserSpot/, /uncacheSavedSpot/, /toggleFavorite/]) {
    assert.doesNotMatch(head, bad, String(bad));
  }
});

test("★clearCityCart 는 도시를 모르면 아무것도 지우지 않는다", () => {
  assert.match(CART, /export function clearCityCart/);
  assert.match(CART, /const kept\s*=\s*dropCity\(items, tripCity\)/);
  assert.match(CART, /if \(kept\.length === items\.length\) return;/);
  // 저장소를 직접 비우지 않는다 — 기존 write 경로를 그대로 탄다
  assert.match(CART, /writeStorage\(reindexByCity\(kept\)\)/);
});

test("★기존 clearCart 는 남아 있다 — 사용자가 직접 지우는 버튼이 쓴다", () => {
  assert.match(CART, /export function clearCart\(\): void \{\s*\n\s*writeStorage\(\[\]\);/);
  const picks = read("src", "app", "picks", "PicksClient.tsx");
  assert.match(picks, /clearCart\(\)/);
});

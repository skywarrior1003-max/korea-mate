// 저장된 일정은 지금 짜고 있는 This Trip 의 주인이 아니다.
//
// 예전에 itinerary 화면은 저장 레코드를 열 때 legacy `days.unscheduled` 로
// `koreamate_cart` 를 통째 덮어썼다. 그 필드는 "Scheduler 가 못 넣은 장소" 가
// 아니라 저장 당시 This Trip 전체 snapshot 이다. 그래서 A/B/C 로 일정을 만든 뒤
// D/E 를 더 담고 같은 조건으로 다시 들어가면 D/E 가 조용히 사라졌다.
//
// 결함은 `/itinerary?id=<uuid>`(My Trips reopen, Effect 1)가 아니라 id 없는
// 생성 URL 이 기존 cached itinerary 를 다시 로드하는 Effect 2 에 있었다.
//
// TSX 렌더 테스트 인프라가 없고 새 package 도 못 넣으므로, 여기서는 그 side
// effect 가 소스에서 사라졌다는 것만 못 박는다. 실제 동작은 Playwright E2E 로
// 확인한다. 데이터는 건드리지 않는다 — v2 shape 과 저장 payload 는 그대로다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidDays } from "./itinerary-validate.ts";

const ROOT = process.cwd();
const ITIN = readFileSync(join(ROOT, "src", "app", "itinerary", "page.tsx"), "utf8");

/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const CODE = strip(ITIN);

// ── 소유권 ───────────────────────────────────────────────────────────────────
test("★itinerary 화면은 koreamate_cart 를 직접 쓰지 않는다", () => {
  assert.doesNotMatch(CODE, /setItem\(\s*["'`]koreamate_cart/,
    "저장된 일정이 현재 This Trip 을 덮어쓴다");
  assert.doesNotMatch(CODE, /removeItem\(\s*["'`]koreamate_cart/);
});

test("★legacy unscheduled 를 현재 cart 로 복원하는 binding 이 없다", () => {
  assert.doesNotMatch(CODE, /loadedUnscheduled/,
    "복원용 임시 binding 이 남아 있다");
});

test("★cart 변경 이벤트를 이 화면에서 쏘지 않는다 — 듣기만 한다", () => {
  assert.doesNotMatch(CODE, /dispatchEvent\(\s*new CustomEvent\(\s*CART_EVENT/,
    "reopen 복원용 dispatch 가 남아 있다");
  // 정상 listener 는 그대로 둔다. 이게 사라지면 담기/빼기가 화면에 안 비친다.
  assert.match(CODE, /addEventListener\(CART_EVENT, refreshCart\)/);
  assert.match(CODE, /removeEventListener\(CART_EVENT, refreshCart\)/);
});

// ── legacy 호환 ──────────────────────────────────────────────────────────────
test("★v2 레코드는 계속 읽는다 — shape 을 지우지 않았다", () => {
  // Effect 2: 두 필드를 아는 cast 는 남기고 scheduled 만 쓴다
  assert.match(CODE, /\{\s*scheduled:\s*Day\[\];\s*unscheduled:\s*CartItem\[\];?\s*\}/);
  assert.match(CODE, /loadedDays\s*=\s*v2\.scheduled\s*\?\?\s*\[\]/);
  // Effect 1(공유/`?id=` reopen): 원래도 scheduled 만 읽었다
  assert.match(CODE, /\(rawShareDays as \{ scheduled\?: Day\[\] \}\)\.scheduled/);
});

test("★저장 payload 와 __v 는 그대로다 — migration 을 만들지 않는다", () => {
  assert.match(CODE, /days:\s*\{\s*__v:\s*2,\s*scheduled:\s*snapDays,\s*unscheduled:\s*snapUnscheduled\s*\}/);
  assert.doesNotMatch(CODE, /__v:\s*3/);
  // 그 필드에 This Trip 을 담던 줄은 사라졌다. 공개하면 `days` 전체가 나가서
  // My Place 의 비공개 메모까지 함께 실렸다 — share-payload-privacy-guard 참조.
  // 형식은 그대로이므로 기존 레코드 호환은 유지된다.
  assert.doesNotMatch(CODE, /snapUnscheduled = getCityCart\(/);
  assert.match(CODE, /const snapUnscheduled: CartItem\[\] = \[\];/);
});

test("★legacy v1(Day[]) reopen 경로가 살아 있다", () => {
  assert.match(CODE, /loadedDays = \(raw as Day\[\]\) \?\? \[\]/);
  assert.match(CODE, /sharedDays = rawShareDays/);
});

// ── validator 회귀 ───────────────────────────────────────────────────────────
test("★v2 { scheduled, unscheduled } 는 계속 유효한 저장 형식이다", () => {
  assert.equal(isValidDays({ __v: 2, scheduled: [], unscheduled: [] }), true);
  assert.equal(isValidDays({ __v: 2, scheduled: [{}, {}], unscheduled: [{}] }), true);
  assert.equal(isValidDays({ __v: 2, scheduled: new Array(30).fill({}), unscheduled: new Array(500).fill({}) }), true);
  assert.equal(isValidDays({ __v: 2, scheduled: new Array(31).fill({}), unscheduled: [] }), false);
  assert.equal(isValidDays({ __v: 2, scheduled: [], unscheduled: new Array(501).fill({}) }), false);
  // unscheduled 가 빠진 v2 는 예나 지금이나 유효하지 않다 — 계약을 바꾸지 않았다
  assert.equal(isValidDays({ __v: 2, scheduled: [] }), false);
});

test("★legacy v1(Day[]) 도 계속 유효하다", () => {
  assert.equal(isValidDays([]), true);
  assert.equal(isValidDays([{}, {}]), true);
  assert.equal(isValidDays(new Array(30).fill({})), true);
  assert.equal(isValidDays(new Array(31).fill({})), false);
  assert.equal(isValidDays(null), false);
  assert.equal(isValidDays("x"), false);
});

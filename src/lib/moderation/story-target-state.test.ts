// 관리자 화면이 보는 Story 상태 — 동작 테스트와 배선 확인.
//
// 지키는 것
//   1. 상태는 클릭 기억이 아니라 서버가 저장한 값이다.
//   2. 목록 100건에 조회가 100번 붙지 않는다.
//   3. 대상이 이미 지워진 신고에 차단 버튼을 열어 주지 않는다.
//   4. 모순 상태는 알려 주기만 하고 고치지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  storyTargetKeys, buildStoryStates, attachStoryStates,
  isContradictory, canModerate, MISSING_TARGET,
} from "./story-target-state.ts";

const A = "11111111-2222-3333-4444-555555555555";
const B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const HIDDEN = "2026-08-18T00:00:00Z";

const story = (key: string) => ({ target_type: "shared_story", target_key: key });
const place = (key: string) => ({ target_type: "city_spot",    target_key: key });

// ── K: 물어볼 대상 고르기 ────────────────────────────────────────────────────

test("K1 Story 신고의 대상만, 중복 없이 고른다", () => {
  assert.deepEqual(
    storyTargetKeys([story(A), place("123"), story(A), story(B)]).sort(),
    [A, B].sort());
});

test("K2 장소 신고는 섞이지 않는다 — target_key 가 여행 id 가 아니다", () => {
  assert.deepEqual(storyTargetKeys([place("123"), place("456")]), []);
});

test("K3 이상한 대상은 조회 목록에 넣지 않는다", () => {
  assert.deepEqual(storyTargetKeys([story(""), story("nope"), story(A + "x")]), []);
});

test("K4 Story 신고가 없으면 아무것도 묻지 않는다", () => {
  assert.equal(storyTargetKeys([place("1")]).length, 0);
});

// ── S: 상태 만들기 ───────────────────────────────────────────────────────────

test("S1 가려진 여행", () => {
  const m = buildStoryStates([{ id: A, is_public: false, moderation_hidden_at: HIDDEN }]);
  assert.deepEqual(m.get(A), { targetExists: true, isPublic: false, moderationHidden: true });
});

test("S2 정상 공개 여행", () => {
  const m = buildStoryStates([{ id: A, is_public: true, moderation_hidden_at: null }]);
  assert.deepEqual(m.get(A), { targetExists: true, isPublic: true, moderationHidden: false });
});

test("S3 빈 문자열은 가려진 것이 아니다", () => {
  const m = buildStoryStates([{ id: A, is_public: false, moderation_hidden_at: "   " }]);
  assert.equal(m.get(A)?.moderationHidden, false);
});

test("S4 가려진 시각 자체는 상태에 담기지 않는다", () => {
  const m = buildStoryStates([{ id: A, is_public: false, moderation_hidden_at: HIDDEN }]);
  assert.ok(!JSON.stringify(m.get(A)).includes(HIDDEN), "시각이 그대로 나가면 안 된다");
});

// ── T: 붙이기 ────────────────────────────────────────────────────────────────

test("T1 조회되지 않은 대상은 '없음' 이다", () => {
  const out = attachStoryStates([story(A)], buildStoryStates([]));
  assert.deepEqual(out[0]!.story_state, MISSING_TARGET);
  assert.equal(canModerate(out[0]!.story_state), false, "없는 대상에 차단을 열어 주면 안 된다");
});

test("T2 장소 신고 행은 모양이 그대로다 — 기존 계약 회귀 없음", () => {
  const row = { ...place("123"), id: 1, note: "x" };
  const out = attachStoryStates([row], buildStoryStates([{ id: A, is_public: true, moderation_hidden_at: null }]));
  assert.deepEqual(out[0], row);
  assert.ok(!("story_state" in out[0]!));
});

test("T3 기존 필드를 지우거나 바꾸지 않는다", () => {
  const row = { ...story(A), id: 7, status: "pending", note: "n" };
  const out = attachStoryStates([row], buildStoryStates([{ id: A, is_public: false, moderation_hidden_at: HIDDEN }]));
  assert.equal(out[0]!.id, 7);
  assert.equal(out[0]!.status, "pending");
  assert.equal(out[0]!.note, "n");
  assert.equal(out[0]!.story_state?.moderationHidden, true);
});

// ── C: 모순 / 조작 가능 ──────────────────────────────────────────────────────

test("C1 가려졌는데 공개면 경고 대상이다", () => {
  assert.equal(isContradictory({ targetExists: true, isPublic: true,  moderationHidden: true  }), true);
  assert.equal(isContradictory({ targetExists: true, isPublic: false, moderationHidden: true  }), false);
  assert.equal(isContradictory({ targetExists: true, isPublic: true,  moderationHidden: false }), false);
  assert.equal(isContradictory(MISSING_TARGET), false);
  assert.equal(isContradictory(undefined), false);
});

test("C2 판정만 한다 — 고치는 코드가 없다", () => {
  const src = readFileSync("src/lib/moderation/story-target-state.ts", "utf8");
  assert.ok(!/update|UPDATE|patch|fetch\(/.test(src), "상태를 읽는 자리에서 쓰기를 하면 안 된다");
});

// ── W: 배선 ──────────────────────────────────────────────────────────────────

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const LIST = code(readFileSync("functions/api/admin/place-reports.ts", "utf8"));
const MUT  = code(readFileSync("functions/api/admin/story-moderation.ts", "utf8"));
const UI   = code(readFileSync("src/app/korea-mate-admin/place-reports/page.tsx", "utf8"));

test("W1 목록은 한 번의 bulk 조회로 끝낸다 — N+1 이 아니다", () => {
  assert.match(LIST, /id=in\.\(/);
  const listGet = LIST.slice(LIST.indexOf("onRequestGet"), LIST.indexOf("onRequestPatch"));
  const itinCalls = (listGet.match(/rest\(base, headers, "GET", *[\s\S]{0,40}itineraries/g) ?? []).length;
  assert.equal(itinCalls, 1, `itineraries 조회가 ${itinCalls}번이다`);
  // 반복문 안에서 부르지 않는다
  assert.ok(!/for\s*\([^)]*\)\s*\{[\s\S]{0,300}itineraries/.test(listGet));
});

test("W2 Story 신고가 없으면 아예 묻지 않는다", () => {
  assert.match(LIST, /if \(storyKeys\.length > 0\)/);
});

test("W3 mutation 은 저장된 행을 되받아 판단한다", () => {
  assert.match(MUT, /Prefer:\s*"return=representation"/);
  assert.ok(!/return=minimal/.test(MUT));
  assert.match(MUT, /if \(!updated\) return json\(\{ error: "Story not found" \}, 404\)/);
  // 요청값 echo 로 끝내지 않는다
  assert.ok(!/return json\(\{ hidden: body\.hidden \}\)/.test(MUT));
  assert.match(MUT, /hidden: state\.moderationHidden/);
});

test("W4 확인하려고 두 번째 쓰기를 만들지 않는다", () => {
  const writes = (MUT.match(/method:\s*"(PATCH|POST|PUT|DELETE)"/g) ?? []).length;
  assert.equal(writes, 1, `쓰기 요청이 ${writes}건이다`);
});

test("W5 Hide/Unhide 계약은 그대로다", () => {
  const core = readFileSync("src/lib/moderation/story-moderation-core.ts", "utf8");
  assert.match(core, /moderation_hidden_at: now,\s*is_public: false/);
  const unhide = core.slice(core.indexOf("moderation_hidden_at: null"));
  assert.ok(!/is_public/.test(unhide.slice(0, 80)), "Unhide 가 공개를 켜면 안 된다");
});

test("W6 화면은 저장된 상태로 그린다 — 클릭 기억이 아니다", () => {
  assert.match(UI, /story_state/);
  assert.match(UI, /aria-pressed=\{hidden\}/);
  assert.match(UI, /moderationHidden === true/);
  // 응답을 읽어 카드 상태를 갱신한다
  assert.match(UI, /typeof saved\.hidden === "boolean"/);
});

test("W7 실패하면 성공한 것처럼 남지 않는다", () => {
  // 성공 문구는 저장된 값이 있을 때만 나온다
  assert.match(UI, /saved && typeof saved\.hidden === "boolean"[\s\S]{0,120}공개를 차단했습니다/);
  assert.match(UI, /대상 Story 가 없습니다/);
  // res.ok 만으로 문구를 정하지 않는다
  assert.ok(!/text: res\.ok/.test(UI));
});

test("W8 대상이 없으면 차단 버튼을 열어 주지 않는다", () => {
  assert.match(UI, /disabled=\{busy \|\| !usable\}/);
  assert.match(UI, /canModerate\(st\)/);
  assert.match(UI, /대상 없음/);
});

test("W9 모순 경고는 관리자 화면에만 있다", () => {
  assert.match(UI, /isContradictory\(st\)/);
  assert.match(UI, /어긋납니다/);
  // 공개 응답에 새 상태를 싣지 않는다
  const story = code(readFileSync("functions/api/shared/[id]/story.ts", "utf8"));
  assert.ok(!/story_state|moderationHidden/.test(story), "공개 응답에 moderation 내부 상태가 나갔다");
});

test("W10 운영 QA fixture 의 id 를 테스트에 박아 두지 않는다", () => {
  // 실제 id 를 여기 적으면 그것이 그대로 저장소에 남는다. 조각으로 만들어 찾는다.
  const needle = ["c8822", "cd4-e765"].join("");
  for (const f of [
    "src/lib/moderation/story-target-state.test.ts",
    "src/lib/moderation/story-moderation.test.ts",
    "src/lib/moderation/publish-gate.test.ts",
    "src/lib/moderation/hidden-egress.test.ts",
    "src/lib/reports/admin-place-reports-ui.test.ts",
  ]) {
    assert.ok(!readFileSync(f, "utf8").includes(needle), `운영 fixture id 가 들어 있다: ${f}`);
  }
});

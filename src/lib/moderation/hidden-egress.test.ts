// 모순 상태에서의 공개 방어 — `moderation_hidden_at != null` 인데 `is_public = true`.
//
// 왜 이 상태를 따로 시험하나
//   공개 경로가 `is_public` 만 보고 있으면, 가려진 여행이라도 공개 플래그가 켜진
//   순간 그대로 나간다. 그래서 여섯 경로가 **각자** 숨김을 보는지 확인해야 한다.
//   `is_public=false` 로 시험하면 우연히 막히는 것을 통과로 착각하게 된다.
//
// 왜 운영에서 하지 않나
//   이 상태를 만들려면 운영에 정확히 우리가 막으려는 상태를 심어야 한다.
//   그래서 여기서만 만든다.
//
// 무엇을 어디까지 시험하나
//   판정이 순수 함수인 곳(Story·사진 프록시·Copy·커버)은 모순 행을 직접 넣어
//   **동작**을 본다. 조회 조건으로 거르는 곳(인기 목록·OG)은 호출 없이 확인할
//   방법이 없어 질의 조건이 실제로 붙어 있는지를 본다 — 그 차이를 아래에 적는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isModerationHidden, isPubliclyVisible } from "./story-moderation-core.ts";
import { resolveEffectiveCover } from "../trip-cover/cover-state-core.ts";

/** 문제의 상태: 공개로 켜져 있는데 관리자가 가렸다 */
const CONTRADICTION = { is_public: true, moderation_hidden_at: "2026-08-18T00:00:00Z" };
const NORMAL_PUBLIC = { is_public: true, moderation_hidden_at: null };

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p: string) => code(readFileSync(p, "utf8"));

// ── 판정 자체 ────────────────────────────────────────────────────────────────

test("X0 모순 상태는 '밖에 보여도 되는 것'이 아니다", () => {
  assert.equal(isModerationHidden(CONTRADICTION), true);
  assert.equal(isPubliclyVisible(CONTRADICTION), false, "is_public 이 켜져 있어도 나가면 안 된다");
  assert.equal(isPubliclyVisible(NORMAL_PUBLIC), true, "정상 공개는 그대로 나간다");
});

// ── 1·2·3. Story · 사진 프록시 · Copy ────────────────────────────────────────
// 세 경로 모두 조회한 행을 `isModerationHidden` 에 그대로 넘겨 404 로 끝낸다.
// 판정 결과가 곧 동작이므로, 모순 행에 대한 판정을 확인하고 배선을 함께 본다.

const EGRESS: Array<[string, string]> = [
  ["Story API",        "functions/api/shared/[id]/story.ts"],
  ["Memory 사진 프록시", "functions/img/memory/[itineraryId]/[ref].ts"],
  ["Copy",             "functions/api/itinerary/copy.ts"],
];

for (const [name, path] of EGRESS) {
  test(`X1 ${name} — 모순 행이면 내보내지 않는다`, () => {
    const src = read(path);
    // 조회 결과를 숨김 판정에 넘긴다
    assert.match(src, /isModerationHidden\(/, `${name} 가 숨김을 보지 않는다`);
    // 판정이 참이면 콘텐츠를 만들지 않고 끝낸다
    const idx = src.indexOf("isModerationHidden(");
    const near = src.slice(idx, idx + 260);
    assert.match(near, /404|notFound\(\)/, `${name} 가 숨김일 때 404 로 끝내지 않는다`);
    // 그 판정이 이 모순 행에서 참이다 = 실제로 막힌다
    assert.equal(isModerationHidden(CONTRADICTION), true);
  });

  test(`X2 ${name} — is_public 만 보고 있지 않다`, () => {
    const src = read(path);
    if (!/is_public/.test(src)) return;               // 상위에서 이미 걸러진 경로
    const hidx = src.indexOf("isModerationHidden(");
    assert.ok(hidx > 0, `${name}: 숨김 검사가 없다`);
  });
}

// ── 4. 커버 프록시 — 진짜 동작 테스트 ────────────────────────────────────────
// `resolveEffectiveCover` 는 admin 을 주입받는다. 모순 행을 그대로 넣어 본다.

function fakeAdmin(row: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as unknown as Parameters<typeof resolveEffectiveCover>[1];
}

test("X3 커버 프록시 — 모순 행이면 404 (동작)", async () => {
  const res = await resolveEffectiveCover("itin", fakeAdmin({
    id: "itin", device_id: "d", is_public: true, updated_at: "2026-08-18T00:00:00Z",
    days: [], moderation_hidden_at: "2026-08-18T00:00:00Z",
  }));
  assert.equal(res.status, 404, "가려진 여행의 커버가 나갔다");
});

test("X3-b 커버 프록시 — 가려지지 않은 공개 행은 404 가 아니다 (대조군)", async () => {
  const res = await resolveEffectiveCover("itin", fakeAdmin({
    id: "itin", device_id: "d", is_public: true, updated_at: "2026-08-18T00:00:00Z",
    days: [], moderation_hidden_at: null,
  }));
  assert.notEqual(res.status, 404, "정상 공개까지 막으면 회귀다");
});

// ── 5·6. 인기 목록 · OG — 질의 조건 확인 ─────────────────────────────────────
//
// 이 둘은 판정 함수를 쓰지 않고 **조회 조건**으로 거른다. 그래서 행을 만들어
// 넣어 볼 자리가 없다 — 실제 DB 질의가 필요하다. 조건이 붙어 있는지와,
// 공개 조건과 **같은 질의 안에** 있는지를 본다. 이 한계를 그대로 적어 둔다.

test("X4 인기 목록 — 같은 질의에서 숨김을 함께 거른다", () => {
  const src = read("functions/api/trips/popular.ts");
  const q = src.slice(src.indexOf('.from("itineraries")'), src.indexOf(".order("));
  assert.match(q, /\.eq\("is_public", true\)/);
  assert.match(q, /\.is\("moderation_hidden_at", null\)/, "숨김 조건이 같은 질의에 없다");
});

test("X5 OG 함수 — 같은 URL 에서 숨김을 함께 거른다", () => {
  const src = read("functions/shared/[id].ts");
  const ep = src.slice(src.indexOf("rest/v1/itineraries"), src.indexOf("&select="));
  assert.match(ep, /is_public=eq\.true/);
  assert.match(ep, /moderation_hidden_at=is\.null/, "숨김 조건이 같은 URL 에 없다");
});

test("X6 이 두 경로는 조건을 지우면 곧바로 새 나간다 — 조건이 유일한 방어다", () => {
  // 판정 함수를 쓰지 않으므로 조건이 빠지면 아무것도 막지 않는다.
  // 그래서 위 두 테스트가 이 경로의 회귀 감지 수단이다.
  for (const p of ["functions/api/trips/popular.ts", "functions/shared/[id].ts"]) {
    assert.ok(!/isModerationHidden\(/.test(read(p)),
      `${p} 가 판정 함수를 쓰기 시작했다면 위 테스트를 동작 테스트로 바꿔야 한다`);
  }
});

// ── 그리고 애초에 이 상태가 만들어지지 않게 막는다 ──────────────────────────

test("X7 공개를 켜는 서버 경로가 모두 판정을 거친다 — 모순 상태의 발생원 차단", () => {
  const src = read("functions/api/itinerary/[id].ts");
  const patch = src.slice(src.indexOf("export async function onRequestPatch"));
  const patchBody = patch.slice(0, patch.slice(1).search(/\nexport (async )?function /) + 1);
  assert.match(patchBody, /publishGate\(/, "실제 공개 토글 경로에 판정이 없다");
});

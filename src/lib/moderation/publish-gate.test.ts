// 공개 전환 판정 — 동작 테스트.
//
// 문자열이 있는지 보지 않는다. 가짜 reader 를 넣고 실제로 무엇을 돌려주는지 본다.
// 이전에 이 결함을 놓친 이유가 "파일 어딘가에 publishVerdict 가 있다" 로 끝낸
// 검사였기 때문이다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { publishGate, type ModerationStateReader } from "./publish-gate.ts";

const HIDDEN = "2026-08-18T00:00:00Z";

/** 호출 횟수까지 세는 가짜 reader */
function reader(row: { moderation_hidden_at: string | null } | null, ok = true) {
  const calls: Array<[string, string]> = [];
  const fn: ModerationStateReader = async (id, dev) => { calls.push([id, dev]); return { ok, row }; };
  return { fn, calls };
}

// ── G: 판정 ──────────────────────────────────────────────────────────────────

test("G1 가려진 여행을 다시 켜려 하면 409 로 막는다", async () => {
  const r = reader({ moderation_hidden_at: HIDDEN });
  const g = await publishGate(r.fn, "itin", "dev", true);
  assert.equal(g.allowed, false);
  if (g.allowed) return;
  assert.equal(g.status, 409);
  assert.match(g.error, /not available for sharing/i);
});

test("G2 끄는 요청은 언제나 허용하고, 상태를 읽지도 않는다", async () => {
  const r = reader({ moderation_hidden_at: HIDDEN });
  assert.equal((await publishGate(r.fn, "itin", "dev", false)).allowed, true);
  assert.equal(r.calls.length, 0, "끄는 요청에 불필요한 조회를 붙이지 않는다");
});

test("G3 is_public 이 없는 요청(제목 수정 등)도 그대로 통과한다", async () => {
  const r = reader({ moderation_hidden_at: HIDDEN });
  for (const v of [undefined, null, "true", 1]) {
    assert.equal((await publishGate(r.fn, "itin", "dev", v)).allowed, true, `막히면 안 되는 값: ${String(v)}`);
  }
  assert.equal(r.calls.length, 0);
});

test("G4 가려지지 않은 여행은 정상적으로 공개된다", async () => {
  for (const row of [{ moderation_hidden_at: null }, { moderation_hidden_at: "" }, { moderation_hidden_at: "   " }]) {
    const r = reader(row);
    assert.equal((await publishGate(r.fn, "itin", "dev", true)).allowed, true);
  }
});

test("G5 행이 없으면 막지 않는다 — 뒤따르는 UPDATE 가 0건으로 404 를 낸다", async () => {
  const r = reader(null);
  assert.equal((await publishGate(r.fn, "itin", "dev", true)).allowed, true);
});

test("G6 상태를 못 읽으면 켜 주지 않는다 (fail-closed)", async () => {
  const r = reader(null, false);
  const g = await publishGate(r.fn, "itin", "dev", true);
  assert.equal(g.allowed, false, "확인 실패가 우회 수단이 되면 안 된다");
  if (g.allowed) return;
  assert.equal(g.status, 503);
  assert.ok(!/hidden|moderat|신고/i.test(g.error), "내부 사정을 알려 주지 않는다");
});

test("G7 소유자 조건까지 넘겨 읽는다 — 남의 여행 상태를 알려 주지 않는다", async () => {
  const r = reader({ moderation_hidden_at: null });
  await publishGate(r.fn, "itin-1", "dev-1", true);
  assert.deepEqual(r.calls, [["itin-1", "dev-1"]]);
});

test("G8 새 규칙을 만들지 않는다 — 판정은 publishVerdict 가 한다", () => {
  const src = readFileSync("src/lib/moderation/publish-gate.ts", "utf8");
  assert.match(src, /import \{ publishVerdict \}/);
  assert.ok(!/409/.test(src.replace(/^\s*(--|\/\/).*$/gm, "")), "상태 코드를 여기서 새로 정하지 않는다");
});

// ── W: 배선 — 공개를 켜는 경로가 모두 이 판정을 거치는가 ────────────────────

const HANDLER = readFileSync("functions/api/itinerary/[id].ts", "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** 핸들러 하나의 본문만 잘라 본다. 파일 전체를 보면 옆 핸들러의 호출에 속는다. */
function handlerBody(name: string): string {
  const src = code(HANDLER);
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `핸들러가 없다: ${name}`);
  const next = src.slice(start + 1).search(/\nexport (async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

test("W1 PATCH — 사람이 실제로 쓰는 공개 토글에 판정이 붙어 있다", () => {
  // 이 검사가 파일 전체를 봤기 때문에 결함을 놓쳤다. 이제 핸들러 본문만 본다.
  assert.match(handlerBody("onRequestPatch"), /publishGate\(/);
});

test("W2 PUT 에도 같은 판정이 붙어 있다", () => {
  assert.match(handlerBody("onRequestPut"), /publishGate\(/);
});

test("W3 판정이 update 보다 먼저 온다", () => {
  for (const h of ["onRequestPatch", "onRequestPut"]) {
    const body = handlerBody(h);
    const gate = body.indexOf("publishGate(");
    const upd  = body.indexOf(".update(");
    assert.ok(gate > 0 && upd > gate, `${h}: 판정이 update 뒤에 있다`);
  }
});

test("W4 공개를 **켜는** 서버 경로가 이 둘뿐이다", () => {
  // 읽는 것은 상관없다(GET 은 소유자에게 자기 상태를 보여 준다).
  // 막아야 할 것은 쓰기다 — select 문자열을 걷어내고 남은 곳만 본다.
  const writesPublic = ["onRequestGet", "onRequestPut", "onRequestPatch", "onRequestDelete"]
    .filter(n => code(HANDLER).includes(`export async function ${n}`))
    .filter(n => /is_public/.test(handlerBody(n).replace(/\.select\((["`])[\s\S]*?\1\)/g, ".select()")));
  assert.deepEqual(writesPublic.sort(), ["onRequestPatch", "onRequestPut"]);
});

test("W5 클라이언트의 공개 토글은 여전히 PATCH 하나뿐이다", () => {
  const api = code(readFileSync("src/lib/itinerary-api.ts", "utf8"));
  const setPublic = api.slice(api.indexOf("export async function apiSetPublic"));
  assert.match(setPublic.slice(0, 400), /method:\s*"PATCH"/);
  const senders = [...api.matchAll(/is_public/g)].length;
  assert.equal(senders, 1, "is_public 을 보내는 클라이언트 경로가 늘었다");
});

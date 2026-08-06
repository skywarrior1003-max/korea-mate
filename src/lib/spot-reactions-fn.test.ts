// POST /api/spots/reactions 를 실제로 실행해서 검증한다.
//
// upstream Supabase 는 stub 으로 갈아끼운다. 운영 DB 에 테스트 행을 만들지 않기
// 위해서다. 검증 대상은 "무엇을 upstream 으로 보내는가"와 "무엇을 사용자에게
// 돌려주는가" 두 가지다.

import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../../functions/api/spots/reactions.ts";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface Sent { url: string; init: RequestInit }
function stubFetch(reply: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return reply();
  }) as unknown as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = original; } };
}

function req(body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return new Request("https://gokoreamate.com/api/spots/reactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

// ── 정상 경로 ────────────────────────────────────────────────────────────────
test("★정상 dislike 는 201 recorded", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    const res = await onRequestPost({ request: req({ place_id: "busan-K-00705", reaction: "dislike" },
      { "x-device-id": UUID(1) }), env: ENV });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { status: "recorded" });
    assert.equal(s.sent.length, 1);
    assert.match(s.sent[0].url, /\/rest\/v1\/spot_reactions$/);
    const body = JSON.parse(String(s.sent[0].init.body));
    assert.deepEqual(body, { place_id: "busan-K-00705", reaction: "dislike", device_id: UUID(1) });
    assert.equal((s.sent[0].init.headers as Record<string,string>).Prefer, "return=minimal",
      "INSERT 결과 row 를 돌려받지 않아야 한다");
  } finally { s.restore(); }
});

test("★중복(23505)은 200 already_recorded — 재클릭이 오류로 보이지 않는다", async () => {
  const s = stubFetch(() => new Response(
    JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }),
    { status: 409 }));
  try {
    const res = await onRequestPost({ request: req({ place_id: "p-1", reaction: "dislike" },
      { "x-device-id": UUID(2) }), env: ENV });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "already_recorded" });
  } finally { s.restore(); }
});

test("★038 적용 전(unique index 없음)에도 정상 INSERT 된다", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    const res = await onRequestPost({ request: req({ place_id: "p-2", reaction: "dislike" },
      { "x-device-id": UUID(3) }), env: ENV });
    assert.equal(res.status, 201);
  } finally { s.restore(); }
});

// ── 입력 검증 ────────────────────────────────────────────────────────────────
test("★device id 없음·형식 오류는 400이고 upstream 을 부르지 않는다", async () => {
  const headerCases: Record<string, string>[] = [
    {}, { "x-device-id": "" }, { "x-device-id": "not-a-uuid" }, { "x-device-id": "x".repeat(300) },
  ];
  for (const h of headerCases) {
    const s = stubFetch(() => new Response(null, { status: 201 }));
    try {
      const res = await onRequestPost({ request: req({ place_id: "p", reaction: "dislike" }, h), env: ENV });
      assert.equal(res.status, 400, JSON.stringify(h));
      assert.equal(s.sent.length, 0, "검증 실패인데 upstream 을 불렀다");
    } finally { s.restore(); }
  }
});

test("★place_id 없음·빈 값·너무 김·허용 밖 문자는 400", async () => {
  const bad = [undefined, "", "   ", "a".repeat(129), "bad id", "bad/id", "bad;drop", "한글"];
  for (const p of bad) {
    const s = stubFetch(() => new Response(null, { status: 201 }));
    try {
      const res = await onRequestPost({ request: req({ place_id: p, reaction: "dislike" },
        { "x-device-id": UUID(4) }), env: ENV });
      assert.equal(res.status, 400, `place_id=${JSON.stringify(p)}`);
      assert.equal(s.sent.length, 0);
    } finally { s.restore(); }
  }
});

test("★지원하지 않는 reaction 은 400 — 새 종류를 만들지 않는다", async () => {
  for (const r of ["like", "love", "", undefined, "DISLIKE ", 1 as unknown as string]) {
    const s = stubFetch(() => new Response(null, { status: 201 }));
    try {
      const res = await onRequestPost({ request: req({ place_id: "p", reaction: r },
        { "x-device-id": UUID(5) }), env: ENV });
      // "DISLIKE " 는 trim+lowercase 후 통과가 정상이다
      const expected = String(r).trim().toLowerCase() === "dislike" ? 201 : 400;
      assert.equal(res.status, expected, `reaction=${JSON.stringify(r)}`);
    } finally { s.restore(); }
  }
});

test("★잘못된 JSON 은 400", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    const res = await onRequestPost({ request: req(null, { "x-device-id": UUID(6) }, "{not json"), env: ENV });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid json" });
    assert.equal(s.sent.length, 0);
  } finally { s.restore(); }
});

test("★과도한 body 는 413", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    const res = await onRequestPost({ request: req(null, { "x-device-id": UUID(7) },
      JSON.stringify({ place_id: "p", reaction: "dislike", pad: "x".repeat(4000) })), env: ENV });
    assert.equal(res.status, 413);
    assert.equal(s.sent.length, 0);
  } finally { s.restore(); }
});

test("★예상하지 않은 필드는 무시하고 upstream 에 넘기지 않는다", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    await onRequestPost({ request: req({ place_id: "p", reaction: "dislike",
      device_id: "spoofed", id: 999, created_at: "2000-01-01" }, { "x-device-id": UUID(8) }), env: ENV });
    const body = JSON.parse(String(s.sent[0].init.body));
    assert.deepEqual(Object.keys(body).sort(), ["device_id", "place_id", "reaction"]);
    assert.equal(body.device_id, UUID(8), "body 의 device_id 로 header 검증을 우회하면 안 된다");
  } finally { s.restore(); }
});

// ── method · 설정 · 오류 ────────────────────────────────────────────────────
test("★POST 외 method 는 405", async () => {
  for (const m of ["GET", "PUT", "DELETE", "PATCH"]) {
    const res = await onRequest({ request: new Request("https://x/api/spots/reactions", { method: m }), env: ENV });
    assert.equal(res.status, 405, m);
    assert.equal(res.headers.get("Allow"), "POST");
  }
});

test("★service role 미설정이면 503 fail-closed — anon 으로 폴백하지 않는다", async () => {
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    const res = await onRequestPost({ request: req({ place_id: "p", reaction: "dislike" },
      { "x-device-id": UUID(9) }), env: { NEXT_PUBLIC_SUPABASE_URL: ENV.NEXT_PUBLIC_SUPABASE_URL } });
    assert.equal(res.status, 503);
    assert.equal(s.sent.length, 0);
  } finally { s.restore(); }
});

test("★DB 일반 오류는 502 이고 원문을 노출하지 않는다", async () => {
  const s = stubFetch(() => new Response(
    JSON.stringify({ code: "42501", message: "permission denied for table spot_reactions", hint: "internal" }),
    { status: 403 }));
  try {
    const res = await onRequestPost({ request: req({ place_id: "p", reaction: "dislike" },
      { "x-device-id": UUID(10) }), env: ENV });
    assert.equal(res.status, 502);
    const body = await res.text();
    assert.equal(body, JSON.stringify({ error: "server error" }));
    assert.ok(!body.includes("permission denied") && !body.includes("42501"), "DB 원문 노출");
  } finally { s.restore(); }
});

test("★네트워크 예외도 502 로 흡수한다", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("boom"); }) as unknown as typeof fetch;
  try {
    const res = await onRequestPost({ request: req({ place_id: "p", reaction: "dislike" },
      { "x-device-id": UUID(11) }), env: ENV });
    assert.equal(res.status, 502);
  } finally { globalThis.fetch = original; }
});

test("★응답 본문 어디에도 device id 가 실려 나가지 않는다", async () => {
  const cases: Array<[Record<string,string>, unknown, () => Response]> = [
    [{ "x-device-id": UUID(12) }, { place_id: "p", reaction: "dislike" }, () => new Response(null, { status: 201 })],
    [{ "x-device-id": UUID(13) }, { place_id: "p", reaction: "dislike" }, () => new Response(JSON.stringify({ code: "23505" }), { status: 409 })],
    [{ "x-device-id": UUID(14) }, { place_id: "p", reaction: "nope" },    () => new Response(null, { status: 201 })],
  ];
  for (const [h, b, reply] of cases) {
    const s = stubFetch(reply);
    try {
      const res = await onRequestPost({ request: req(b, h), env: ENV });
      const text = await res.text();
      assert.ok(!text.includes(h["x-device-id"]), `응답에 device id: ${text}`);
    } finally { s.restore(); }
  }
});

// ── 요청 제한 ────────────────────────────────────────────────────────────────
test("한 기기가 짧은 시간에 쏟아부으면 429", async () => {
  const dev = UUID(99);
  const s = stubFetch(() => new Response(null, { status: 201 }));
  try {
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await onRequestPost({ request: req({ place_id: `p-${i}`, reaction: "dislike" },
        { "x-device-id": dev }), env: ENV });
      last = res.status;
    }
    assert.equal(last, 429, "제한이 걸리지 않았다");
  } finally { s.restore(); }
});

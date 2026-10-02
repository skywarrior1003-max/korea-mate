// Production 모델 전환 전 가용성 확인 — admin 경로·Worker /model-check 계약 (2026-10-02)
// node --experimental-strip-types --test src/lib/ai-policy/model-check-guard.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { onRequestPost, MODEL_CHECK_CONFIRM } from "../../../functions/api/admin/ai-model-check.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const W = readFileSync(join(ROOT, "workers", "ai-writing", "src", "index.ts"), "utf8");
const ADMIN = "admin-test-key";
const req = (body: unknown, key: string | null = ADMIN) =>
  new Request("https://x/api/admin/ai-model-check", { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-admin-key": key } : {}) }, body: JSON.stringify(body) });
function worker(reply: { status: number; body: unknown }) {
  const calls: { url: string; body: string }[] = [];
  return { calls, fetch: (async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body ?? "") }); return new Response(JSON.stringify(reply.body), { status: reply.status }); }) as unknown as typeof fetch };
}

test("관리자 키 없으면 Worker 를 부르지 않는다", async () => {
  const w = worker({ status: 200, body: { ok: true } });
  const r = await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-3.5-flash-lite" }, null), env: { ADMIN_KEY: ADMIN, AI_WRITING: w } });
  assert.equal(r.status, 401); assert.equal(w.calls.length, 0);
  const r2 = await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-3.5-flash-lite" }), env: { AI_WRITING: w } });
  assert.equal(r2.status, 503, "ADMIN_KEY 미설정 = fail-closed"); assert.equal(w.calls.length, 0);
});

test("확인 문구·허용 모델이 아니면 Worker 0", async () => {
  const w = worker({ status: 200, body: { ok: true } });
  assert.equal((await onRequestPost({ request: req({ model: "gemini-3.5-flash-lite" }), env: { ADMIN_KEY: ADMIN, AI_WRITING: w } })).status, 400);
  assert.equal((await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-3.8-flash" }), env: { ADMIN_KEY: ADMIN, AI_WRITING: w } })).status, 400);
  assert.equal(w.calls.length, 0);
});

test("가능·불가·Worker 거절을 구분해 알린다(본문·키 없음)", async () => {
  const ok = worker({ status: 200, body: { model: "gemini-3.5-flash-lite", http: 200, ok: true } });
  const a = await (await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-3.5-flash-lite" }), env: { ADMIN_KEY: ADMIN, INTERNAL_KEY: "i", AI_WRITING: ok } })).json() as { ok: boolean; status: string };
  assert.deepEqual([a.ok, a.status], [true, "available"]);
  assert.match(ok.calls[0]!.url, /\/model-check$/); assert.deepEqual(JSON.parse(ok.calls[0]!.body), { model: "gemini-3.5-flash-lite" });
  const no = worker({ status: 200, body: { model: "gemini-2.5-flash", http: 404, ok: false, error_status: "NOT_FOUND" } });
  const b = await (await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-2.5-flash" }), env: { ADMIN_KEY: ADMIN, AI_WRITING: no } })).json() as { ok: boolean; status: string };
  assert.deepEqual([b.ok, b.status], [false, "not_available"]);
  const off = worker({ status: 503, body: { error: "worker_disabled" } });
  const c = await onRequestPost({ request: req({ confirm: MODEL_CHECK_CONFIRM, model: "gemini-3.5-flash-lite" }), env: { ADMIN_KEY: ADMIN, AI_WRITING: off } });
  assert.equal(c.status, 502); assert.equal(((await c.json()) as { status: string }).status, "worker_refused");
});

test("Worker /model-check — kill switch 뒤 · 허용 모델만 · 생성 문장·키를 돌려주지 않는다", () => {
  const gate = W.indexOf('!== "live"');
  const mc = W.indexOf('path === "/model-check"');
  assert.ok(gate > 0 && mc > gate, "kill switch 보다 뒤");
  const block = W.slice(mc, W.indexOf('path === "/probe"'));
  assert.match(block, /MODEL_CHECK_ALLOW\.includes\(pb\.model\)/);
  assert.match(block, /maxOutputTokens: 8/);
  assert.doesNotMatch(block, /candidates\?\.\[0\]/, "생성 문장을 읽지도 돌려주지도 않는다");
  for (const m of block.match(/const res = \{[^}]*\}/g) ?? []) assert.doesNotMatch(m, /apiKey|key|text/, "응답 객체에 키·문장 없음");
  assert.match(W, /export const MODEL_CHECK_ALLOW = \["gemini-2\.5-flash", "gemini-3\.5-flash-lite"\];/);
});

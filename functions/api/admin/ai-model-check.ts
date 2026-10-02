// Cloudflare Pages Function — POST /api/admin/ai-model-check
//
// 무엇인가 (2026-10-02)
//   Production 모델을 바꾸기 **전에**, 이 환경의 AI Worker 키로 대상 모델이 실제로 생성되는지 확인한다.
//   모델 목록에 이름이 있어도 생성은 거절될 수 있다(실측: 2.5 Flash 가 목록엔 있고 생성은 404).
//
// 무엇이 아닌가
//   모델을 바꾸지 않는다. 스위치·DB·사용자 사용권·회사 원장에 닿지 않는다(Supabase 를 import 하지 않는다).
//
// SECURITY CONTRACT
// - 기존 x-admin-key(checkAdminAuth)를 그대로 쓴다. 인증이 binding 호출보다 먼저다.
// - 본문에서 쓰는 것은 confirm·model 둘뿐. model 은 허용 목록만(Worker 도 다시 거른다).
// - Worker 가 아주 작은 요청 1회(수 토큰)만 보낸다. 응답에는 상태만 — 생성 문장·키 값 없음.
// - Worker kill switch(AI_WRITING_WORKER_MODE)가 off 면 Worker 가 거절한다(provider 0).

import { checkAdminAuth } from "../../_lib/admin-auth.ts";

interface Env {
  ADMIN_KEY?: string;
  INTERNAL_KEY?: string;
  AI_WRITING?: { fetch: typeof fetch };
}
type Ctx = { request: Request; env: Env };

export const MODEL_CHECK_CONFIRM = "CHECK-MODEL";
const ALLOW = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const onRequestPost = async ({ request, env }: Ctx): Promise<Response> => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;
  let body: { confirm?: unknown; model?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* 빈 본문 */ }
  if (body.confirm !== MODEL_CHECK_CONFIRM) {
    return json({ ok: false, status: "confirm_required", hint: `send { "confirm": "${MODEL_CHECK_CONFIRM}", "model": "gemini-3.5-flash-lite" }` }, 400);
  }
  const model = typeof body.model === "string" && ALLOW.includes(body.model) ? body.model : null;
  if (!model) return json({ ok: false, status: "model_not_allowed", allowed: ALLOW }, 400);
  if (!env.AI_WRITING || typeof env.AI_WRITING.fetch !== "function") return json({ ok: false, status: "no_worker_binding" }, 503);
  try {
    const r = await env.AI_WRITING.fetch("https://ai-writing.internal/model-check", {
      method: "POST", headers: { "x-internal-auth": env.INTERNAL_KEY ?? "", "content-type": "application/json" }, body: JSON.stringify({ model }),
    });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    // Worker 거절(401 내부 인증·503 kill switch)은 provider 0 — 그대로 알린다
    if (r.status !== 200) return json({ ok: false, status: "worker_refused", worker_http: r.status, worker_error: j?.error ?? null }, 502);
    return json({ ok: j?.ok === true, status: j?.ok === true ? "available" : "not_available", check: j });
  } catch {
    return json({ ok: false, status: "worker_unreachable" }, 502);
  }
};

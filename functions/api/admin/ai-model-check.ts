// Cloudflare Pages Function — POST /api/admin/ai-model-check
//
// 무엇인가 (2026-10-02)
//   Production 모델을 바꾸기 **전에**, 이 환경의 AI Worker 키로 대상 모델이 실제로 생성되는지 확인한다.
//   모델 목록에 이름이 있어도 생성은 거절될 수 있다(실측: 2.5 Flash 가 목록엔 있고 생성은 404).
//
// 무엇이 아닌가
//   모델을 바꾸지 않는다. 스위치·사용자 사용권에 닿지 않는다.
//   (2026-10-02 바뀜) 회사 원장에는 남긴다 — 호출마다 route 'model_check' 한 행(감사 기록)과 일일 상한
//   (20회·2,000µ$, 회사 일·월 상한 포함). AI 스위치가 꺼져 있어도 점검은 되게 스위치는 보지 않는다(aiOpsReserveOpsCheck).
//
// SECURITY CONTRACT
// - 기존 x-admin-key(checkAdminAuth)를 그대로 쓴다. 인증이 binding 호출보다 먼저다.
// - 본문에서 쓰는 것은 confirm·model 둘뿐. model 은 허용 목록만(Worker 도 다시 거른다).
// - Worker 가 아주 작은 요청 1회(수 토큰)만 보낸다. 응답에는 상태만 — 생성 문장·키 값 없음.
// - Worker kill switch(AI_WRITING_WORKER_MODE)가 off 면 Worker 가 거절한다(provider 0).

import { checkAdminAuth } from "../../_lib/admin-auth.ts";
import { aiOpsReserveOpsCheck, aiOpsSettle } from "../../_lib/ai-ops-guard.ts";

interface Env {
  ADMIN_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  INTERNAL_KEY?: string;
  AI_WRITING?: { fetch: typeof fetch };
}
type Ctx = { request: Request; env: Env };

export const MODEL_CHECK_CONFIRM = "CHECK-MODEL";
const ALLOW = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];
/** 점검 1회의 예약액(µ$) — Worker 가 보내는 것은 짧은 문장·출력 8토큰(사고 포함)이라 실제는 수십 µ$ */
export const MODEL_CHECK_RESERVE_USD_MICRO = 100;
export const MODEL_CHECK_DAILY_CALLS = 20;

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
  // 감사 기록·반복 호출 상한 — 원장을 쓰지 못하면 부르지 않는다
  const gate = await aiOpsReserveOpsCheck(env, { route: "model_check", worstUsdMicro: MODEL_CHECK_RESERVE_USD_MICRO, dailyCalls: MODEL_CHECK_DAILY_CALLS, dailyUsdMicro: MODEL_CHECK_RESERVE_USD_MICRO * MODEL_CHECK_DAILY_CALLS });
  if (!gate.ok) {
    console.log(JSON.stringify({ event: "ai_model_check", model, status: "ledger_refused", reason: gate.reason }));
    return json({ ok: false, status: "ledger_refused", reason: gate.reason }, 429);
  }
  try {
    const r = await env.AI_WRITING.fetch("https://ai-writing.internal/model-check", {
      // 원장 예약액 — Worker 가 점검 본문의 최대 비용과 비교한다(원장 밖 호출 금지)
      method: "POST", headers: { "x-internal-auth": env.INTERNAL_KEY ?? "", "content-type": "application/json", "x-gkm-reserved-usd-micro": String(MODEL_CHECK_RESERVE_USD_MICRO) }, body: JSON.stringify({ model }),
    });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    // Worker 가 모델에 보내기 전에 거절했다고 알리면(x-gkm-provider-called: 0 — 내부 인증·kill switch) 되돌린다.
    // 그 밖에는 사용량을 돌려받지 않으므로 예약액 그대로 확정(수십 µ$ 보수 · CORRECTION-V1 §2)
    const notSent = r.headers.get("x-gkm-provider-called") === "0";
    await aiOpsSettle(env, gate.ledgerId, notSent ? "released" : "committed", notSent ? undefined : { usdMicro: MODEL_CHECK_RESERVE_USD_MICRO });
    console.log(JSON.stringify({ event: "ai_model_check", model, status: r.status === 200 ? (j?.ok === true ? "available" : "not_available") : "worker_refused", ledger: gate.ledgerId }));
    if (r.status !== 200) return json({ ok: false, status: "worker_refused", worker_http: r.status, worker_error: j?.error ?? null }, 502);
    return json({ ok: j?.ok === true, status: j?.ok === true ? "available" : "not_available", check: j });
  } catch {
    // 보낸 뒤 결과를 모른다 — 예약액 보존(과금 불확실)
    await aiOpsSettle(env, gate.ledgerId, "unknown_billed");
    console.log(JSON.stringify({ event: "ai_model_check", model, status: "worker_unreachable", ledger: gate.ledgerId }));
    return json({ ok: false, status: "worker_unreachable" }, 502);
  }
};

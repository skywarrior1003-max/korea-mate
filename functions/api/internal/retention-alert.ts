// POST /api/internal/retention-alert — 일일 파기 작업의 운영자 알림 (LEGAL-RETENTION-IMPLEMENTATION-V1)
//
// 호출자는 DB 의 retention_purge_daily()(pg_net) 하나뿐이다. 인증은 기존 Worker 와
// 같은 x-internal-auth 헤더 + 상수 시간 비교다(RETENTION_ALERT_KEY 가 있으면 그것, 없으면 INTERNAL_KEY).
// 본문에는 개인정보가 없다 — 실패 오류 코드 또는 30일 넘게 처리 중인 신고 건수만.
// 메일 설정(RESEND)이 없는 환경(Preview 등)에서는 보내지 않고 502 sent:false 로 답한다.
// kind=probe 는 메일 없이 인증·메일 설정 존재만 확인한다(200 ready / 503 not_configured).

import { sendAdminEmail, type AdminEmailEnv } from "../../_lib/admin-email";

interface Env extends AdminEmailEnv { INTERNAL_KEY?: string; RETENTION_ALERT_KEY?: string; NEXT_PUBLIC_SITE_URL?: string }
type Ctx = { request: Request; env: Env };

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function sha(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function keysMatch(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/** 알림 본문 — 원문·식별자 없이 종류·코드·건수·확인 경로만 */
export function buildRetentionAlert(
  kind: string, detail: { error_code?: unknown; count?: unknown },
): { subject: string; text: string } | null {
  if (kind === "failed") {
    const code = String(detail.error_code ?? "unknown").slice(0, 120);
    return {
      subject: "[gokoreamate Ops] Retention purge FAILED",
      text: [
        "The daily retention purge failed. No records were deleted in this run (it was rolled back).",
        `Error code: ${code}`,
        "It retries automatically on the next daily run. Check public.retention_purge_runs for the run record.",
      ].join("\n"),
    };
  }
  if (kind === "selftest") {
    return {
      subject: "[gokoreamate Ops] Retention alert test",
      text: [
        "This is a test of the retention purge alert path. No action is needed.",
        "If you received this, failure alerts from the daily purge will reach this inbox.",
      ].join("\n"),
    };
  }
  if (kind === "stale_open_reports") {
    const n = Number(detail.count);
    if (!Number.isFinite(n) || n < 1) return null;
    return {
      subject: "[gokoreamate Ops] Reports open for over 30 days",
      text: [
        `${Math.floor(n)} report(s) have been pending or under review for more than 30 days.`,
        "Please review them in the admin dashboard so they are not left unresolved.",
      ].join("\n"),
    };
  }
  return null;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  // 전용 키가 있으면 그것만 받는다. Cloudflare secret 은 읽을 수 없어 기존 INTERNAL_KEY 값을
  // Vault 에 옮길 수 없는 경우를 위한 것이다(Worker 와 키를 나누지 않게 된다).
  const key = ctx.env.RETENTION_ALERT_KEY || ctx.env.INTERNAL_KEY;
  const provided = ctx.request.headers.get("x-internal-auth") ?? "";
  if (!key || !provided || !(await keysMatch(provided, key))) return json({ error: "unauthorized" }, 401);

  let body: { kind?: unknown; error_code?: unknown; count?: unknown };
  try { body = await ctx.request.json(); } catch { return json({ error: "invalid_body" }, 400); }

  const kind = String(body.kind ?? "");
  if (kind === "probe") {
    const ready = !!(ctx.env.RESEND_API_KEY && ctx.env.ADMIN_NOTIFICATION_EMAIL);
    return ready ? json({ ready: true }, 200) : json({ ready: false, reason: "not_configured" }, 503);
  }

  const msg = buildRetentionAlert(kind, body);
  if (!msg) return json({ error: "invalid_kind" }, 400);

  // 202 는 발송 서비스가 메일을 수락했다는 뜻까지만이다. 운영자 수신은 사람이 확인한다.
  const r = await sendAdminEmail(ctx.env, msg);
  if (r.ok) return json({ accepted: true, sent: true }, 202);
  return json({ accepted: true, sent: false, reason: r.reason, ...(r.status ? { provider_status: r.status } : {}) }, 502);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

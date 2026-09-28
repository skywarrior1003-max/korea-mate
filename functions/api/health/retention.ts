// GET /api/health/retention — 일일 파기의 독립 상태 확인 (FINAL-RELEASE-GATES-V1)
//
// 파기 실패 알림은 DB → pg_net → 이 사이트 → 메일 발송 서비스 경로 하나뿐이다. 그 경로가
// 끊기면(blocked_*, cron 미실행, 발송 실패) 알림으로는 알 수 없다. 이 엔드포인트는 메일과
// 무관하게 원장만 읽어 200(정상·비활성) / 503(확인 필요)으로 답한다 — 외부 가동 감시
// 서비스가 주기적으로 호출해 자체 채널로 운영자에게 알리도록 쓰는 것이 목적이다.
//
// 응답에는 상태 코드명만 있다. 건수·시각·오류 원문·개인정보·설정값은 없다.
// 공개 경로이므로 결과를 60초 캐시해 DB 호출을 제한한다.

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }
type Ctx = { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void };

type Run = { run_at: string; status: string; alert_http_status: number | null; probe_request_id: number | null; probe_http_status: number | null };
type Settings = { effective_from: string | null; activated_at: string | null };

const HOUR = 3_600_000;

/** 원장·설정으로 상태를 판정한다(순수 함수 — 가드가 직접 검사한다). */
export function judgeRetentionHealth(settings: Settings | null, runs: Run[], now: number): { ok: boolean; state: string } {
  if (!settings?.activated_at) return { ok: true, state: "not_active" };
  const last = runs[0];
  if (!last || now - Date.parse(last.run_at) > 30 * HOUR) return { ok: false, state: "no_recent_run" };
  if (last.status === "failed") return { ok: false, state: "last_run_failed" };
  if (last.status === "blocked_no_alert" || last.status === "blocked_alert_unverified") return { ok: false, state: last.status };
  const week = runs.filter(r => now - Date.parse(r.run_at) <= 7 * 24 * HOUR);
  if (week.some(r => r.alert_http_status !== null && r.alert_http_status !== 202)) return { ok: false, state: "alert_delivery_failed" };
  const settled = week.filter(r => now - Date.parse(r.run_at) > 2 * HOUR && r.probe_request_id !== null);
  if (settled.some(r => r.probe_http_status === null)) return { ok: false, state: "reconcile_missing" };
  if (settled[0] && settled[0].probe_http_status !== 200) return { ok: false, state: "alert_path_unhealthy" };
  return { ok: true, state: last.status === "inactive" ? "scheduled" : "ok" };
}

const reply = (b: { ok: boolean; state: string }) =>
  new Response(JSON.stringify(b), {
    status: b.ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  });

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(new URL("/api/health/retention", ctx.request.url).toString());
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;

  const base = ctx.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !srk) return reply({ ok: false, state: "not_configured" });
  const h = { apikey: srk, Authorization: `Bearer ${srk}` };

  let res: Response;
  try {
    const [s, r] = await Promise.all([
      fetch(`${base}/rest/v1/retention_purge_settings?select=effective_from,activated_at`, { headers: h }),
      fetch(`${base}/rest/v1/retention_purge_runs?select=run_at,status,alert_http_status,probe_request_id,probe_http_status&order=id.desc&limit=10`, { headers: h }),
    ]);
    if (!s.ok || !r.ok) {
      res = reply({ ok: false, state: "ledger_unreadable" });
    } else {
      const settings = ((await s.json()) as Settings[])[0] ?? null;
      res = reply(judgeRetentionHealth(settings, (await r.json()) as Run[], Date.now()));
    }
  } catch {
    res = reply({ ok: false, state: "ledger_unreadable" });
  }
  if (cache) {
    const p = cache.put(key, res.clone());
    if (ctx.waitUntil) ctx.waitUntil(p); else await p;
  }
  return res;
}

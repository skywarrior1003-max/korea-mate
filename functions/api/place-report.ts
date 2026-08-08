// Cloudflare Pages Function — POST /api/place-report
//
// 사용자가 공개 장소 정보의 문제를 알려 주는 통로.
//
// SECURITY CONTRACT
// - service_role 키는 서버에서만 쓴다. 브라우저로 나가지 않는다.
// - 브라우저가 place_reports 에 직접 INSERT 할 수 없다(042 가 권한을 닫는다).
// - raw device_id 를 저장하지도 로그에 남기지도 않는다. 대상별 해시만 쓴다.
// - 응답에 신고자 키·다른 사람의 신고 수·내부 상태 이력·DB 오류 원문을 넣지 않는다.
// - 신고 하나가 장소를 숨기거나 점수를 바꾸지 않는다. 이 파일에 그런 경로가 없다.
// - 자유 입력은 저장만 하고 어디에도 렌더링하지 않는다.

import { loadReportRows, notifyReportMilestones, getOrOpenIncident } from "../_lib/admin-notify";
import { reportNotificationCandidates } from "../../src/lib/notifications/admin-notification-core";
import {
  validateReportRequest, reporterKey, acceptedResponse,
  INITIAL_REPORT_STATUS, DUPLICATE_WINDOW_MS, RATE_MAX, RATE_WINDOW_MS,
  MAX_BODY_BYTES, type ReportErrorCode,
} from "../../src/lib/reports/place-report-core";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface Ctx {
  request: Request;
  env: Env;
  /** Cloudflare 가 넘겨준다. 알림은 이 안에서 돌려 사용자 응답을 붙잡지 않는다. */
  waitUntil?: (p: Promise<unknown>) => void;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const fail = (error: ReportErrorCode, status: number) => json({ success: false, error }, status);

/** 로그에 개인 식별값을 넣지 않는다. 대상과 사유만 남긴다. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "place-report", ...fields }));
}

// 한 기기가 짧은 시간에 쏟아붓는 것만 막는다. isolate 안에서만 유지되므로
// 완전한 방어가 아니다 — spot-reactions·contact 가 쓰는 방식과 같은 한계이며
// 새 테이블·패키지를 만들지 않기 위한 선택이다. 남은 위험으로 보고한다.
const rateMap = new Map<string, { count: number; resetAt: number }>();
function underRateLimit(key: string): boolean {
  const now = Date.now();
  const hit = rateMap.get(key);
  if (!hit || now > hit.resetAt) { rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (hit.count >= RATE_MAX) return false;
  hit.count += 1;
  return true;
}

async function rest(
  env: Env, method: string, pathQ: string, body?: unknown, prefer?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const res = await fetch(`${url}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    log({ status: "not_configured" });
    return fail("server_error", 503);
  }

  // 본문 크기부터 막는다
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_target", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_target", 400); }

  const deviceId = (request.headers.get("x-device-id") ?? "").trim();
  const parsed = validateReportRequest(body, deviceId);
  if (!parsed.ok) {
    log({ status: "rejected", error: parsed.error });
    return fail(parsed.error, parsed.error === "invalid_device" ? 401 : 400);
  }
  const r = parsed.value;

  if (!underRateLimit(deviceId)) {
    log({ status: "rate_limited", target_type: r.target_type });
    return fail("rate_limited", 429);
  }

  // 대상이 실제로 존재하는 공개 장소인가.
  // city_spots 는 공개 카탈로그다. user_spot 은 애초에 target_type 에 없다.
  const found = await rest(env, "GET", `city_spots?id=eq.${encodeURIComponent(r.target_key)}&select=id&limit=1`);
  if (!found.ok || !Array.isArray(found.data) || found.data.length === 0) {
    log({ status: "invalid_target", target_type: r.target_type });
    return fail("invalid_target", 404);
  }

  const rkey = await reporterKey(r.device_id, r.target_type, r.target_key);

  // 같은 사람이 같은 대상·같은 사유로 최근에 이미 신고했는가.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const dup = await rest(env, "GET",
    `place_reports?reporter_key=eq.${rkey}&target_type=eq.${r.target_type}` +
    `&target_key=eq.${encodeURIComponent(r.target_key)}&category=eq.${r.category}` +
    `&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`);
  if (dup.ok && Array.isArray(dup.data) && dup.data.length > 0) {
    log({ status: "duplicate_recent", target_type: r.target_type, category: r.category });
    return fail("duplicate_recent", 409);
  }

  const ins = await rest(env, "POST", "place_reports", [{
    target_type:  r.target_type,
    target_key:   r.target_key,
    category:     r.category,
    note:         r.note,
    reporter_key: rkey,
    status:       INITIAL_REPORT_STATUS,
  }], "return=minimal");

  if (!ins.ok) {
    // DB 오류 원문을 사용자에게 주지 않는다.
    //
    // 중복은 위의 24시간 창 조회로만 판단한다. 스키마에 영구 unique 를 걸면
    // 창이 지난 뒤에도 영원히 재신고를 막게 되므로 두지 않았다.
    // 그 대가로 **동시에 두 번 제출되는 race** 에서는 두 행이 생길 수 있다.
    // UI 연타 방어와 기기별 rate limit 이 실사용에서 이를 덮고,
    // 독립 신고자 수는 reporter_key distinct 로 세므로 집계는 부풀지 않는다.
    log({ status: "insert_failed", httpStatus: ins.status, target_type: r.target_type });
    return fail("server_error", 500);
  }

  // ── 운영 알림 ─────────────────────────────────────────────────────────────
  // 접수는 이미 끝났다. 아래가 무엇을 하든 이 요청은 201 로 끝난다.
  // 메일이 안 나가도 신고가 사라지면 안 된다 — 순서를 바꾸지 않는다.
  const notify = (async () => {
    try {
      const rows = await loadReportRows(ctx.env, r.target_type, r.target_key);
      // 지금 벌어지고 있는 사건을 먼저 확정한다. 이 id 는 일부 신고가 종결돼도
      // 바뀌지 않으므로, 같은 사건에서 같은 임계 알림이 다시 울리지 않는다.
      const incidentId = await getOrOpenIncident(ctx.env, r.target_type, r.target_key, rows);
      if (incidentId === null) return;   // 사건을 못 열면 알리지 않는다. 접수는 이미 끝났다.
      const candidates = reportNotificationCandidates(r.target_key, rows, incidentId);
      await notifyReportMilestones(ctx.env, r.target_key, candidates, rows);
    } catch {
      // 알림 실패는 신고 접수와 무관하다. 조용히 끝낸다.
      log({ status: "notify_failed", target_type: r.target_type });
    }
  })();
  if (ctx.waitUntil) ctx.waitUntil(notify); else void notify;

  log({ status: "received", target_type: r.target_type, category: r.category });
  return json(acceptedResponse(), 201);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

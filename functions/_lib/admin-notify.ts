// Cloudflare Pages Functions — 관리자 알림 예약·발송
//
// 핵심은 순서다.
//
//   먼저 자리를 잡고(reserve) → 잡은 쪽만 보낸다.
//
// 세고 나서 보내고 나중에 기록하는 구조였다면, 동시에 두 사람이 임계를 넘길 때
// 둘 다 "지금 2명이다" 라고 판단해 메일이 두 통 나간다. 그래서 DB 의 UNIQUE 를
// 마지막 방어선으로 쓴다 — INSERT 에 성공한 요청만 발송한다. 진 쪽은 23505 를
// 받고 조용히 물러난다.
//
// 계약
// - 이 파일은 place_reports·place_likes·city_spots 를 **쓰지 않는다.** 읽기만 한다.
// - 실패해도 던지지 않는다. 사용자의 신고·좋아요 접수를 깨뜨리면 안 된다.
// - 알림은 확인 요청이다. 여기서 장소를 숨기거나 신고를 종결하지 않는다.

import { sendAdminEmail } from "./admin-email";
import {
  buildReportEmail,
  EVENT_REPORT_SAFETY, DELIVERY_IMMEDIATE,
  type NotificationCandidate, type ReportRow,
  activeReports, distinctReporters, anchorReportId, hasActiveReports,
} from "../../src/lib/notifications/admin-notification-core";

export interface NotifyEnv {
  NEXT_PUBLIC_SUPABASE_URL?:  string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?:      string;
  RESEND_API_KEY?:            string;
  ADMIN_NOTIFICATION_EMAIL?:  string;
  CONTACT_FROM_EMAIL?:        string;
}

const TABLE     = "admin_notification_events";
const INCIDENTS = "admin_notification_incidents";

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "admin-notify", ...fields }));
}

function headers(env: NotifyEnv): Record<string, string> | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * 이벤트 한 건을 예약한다.
 *
 * 이미 같은 이벤트가 있으면 UNIQUE 위반(23505)이 나고 false 를 돌려준다.
 * 그게 정상이다 — "이미 알렸다" 는 뜻이지 오류가 아니다.
 */
async function reserve(
  env: NotifyEnv, base: string, h: Record<string, string>, c: NotificationCandidate,
): Promise<{ reserved: boolean; id: number | null }> {
  const res = await fetch(`${base}/rest/v1/${TABLE}?select=id`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify([{
      event_type:    c.event_type,
      target_type:   c.target_type,
      target_key:    c.target_key,
      signal_key:    c.signal_key,
      milestone_key: c.milestone_key,
      incident_id:   c.incident_id,
      delivery_mode: c.delivery_mode,
      delivery_status: "pending",
      metric_value:  c.metric_value,
    }]),
  });
  if (res.status === 409) return { reserved: false, id: null };
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* 무시 */ }
  if ((data as { code?: string } | null)?.code === "23505") return { reserved: false, id: null };
  if (!res.ok) {
    log({ status: "reserve_failed", httpStatus: res.status, event: c.event_type });
    return { reserved: false, id: null };
  }
  const row = Array.isArray(data) ? (data as { id: number }[])[0] : null;
  return { reserved: true, id: row?.id ?? null };
}

/** 보냈는지/실패했는지만 적는다. provider 응답 원문은 남기지 않는다. */
async function markDelivery(
  base: string, h: Record<string, string>, id: number,
  ok: boolean, failureCode?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const patch = ok
    ? { delivery_status: "sent",   sent_at: now }
    : { delivery_status: "failed", failed_at: now, failure_code: (failureCode ?? "unknown").slice(0, 64) };
  await fetch(`${base}/rest/v1/${TABLE}?id=eq.${id}`, {
    method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(patch),
  }).catch(() => { /* 기록 실패가 사용자 요청에 영향을 주지 않는다 */ });
}

/** 공개 정보만 읽는다. 메일에 넣을 장소 이름·도시용이다. */
async function placeLabel(
  base: string, h: Record<string, string>, id: string,
): Promise<{ name: string | null; city: string | null }> {
  try {
    const res = await fetch(
      `${base}/rest/v1/city_spots?id=eq.${encodeURIComponent(id)}&select=name,city&limit=1`,
      { headers: h });
    if (!res.ok) return { name: null, city: null };
    const rows = await res.json() as { name?: string; city?: string }[];
    return { name: rows?.[0]?.name ?? null, city: rows?.[0]?.city ?? null };
  } catch { return { name: null, city: null }; }
}

/**
 * 신고 알림 처리.
 *
 * 호출자는 이 함수를 await 하지 않아도 된다(waitUntil 권장). 던지지 않는다.
 */
export async function notifyReportMilestones(
  env: NotifyEnv, targetKey: string,
  candidates: readonly NotificationCandidate[], rows: readonly ReportRow[],
): Promise<void> {
  if (candidates.length === 0) return;
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const h = headers(env);
  if (!base || !h) { log({ status: "not_configured" }); return; }

  const act = activeReports(rows);
  const categories = [...new Set(act.map(r => r.category))];
  const label = await placeLabel(base, h, targetKey);
  const site = env.NEXT_PUBLIC_SITE_URL ?? "https://gokoreamate.com";

  for (const c of candidates) {
    const r = await reserve(env, base, h, c);
    if (!r.reserved) continue;          // 이미 알렸다. 정상 경로다.
    if (c.delivery_mode !== DELIVERY_IMMEDIATE) continue;

    const mail = buildReportEmail({
      targetKey,
      placeName:    label.name,
      city:         label.city,
      reporters:    c.event_type === EVENT_REPORT_SAFETY ? c.metric_value : distinctReporters(act),
      milestoneKey: c.milestone_key,
      categories,
      occurredAt:   new Date().toISOString(),
      // 해당 장소의 신고만 바로 열리도록 딥링크. target_type 은 후보에서
      // 가져온다 — 하드코딩하면 나중에 대상이 늘 때 조용히 어긋난다.
      adminPath:    `${site}/korea-mate-admin/place-reports/`
                    + `?target_type=${encodeURIComponent(c.target_type)}`
                    + `&target_key=${encodeURIComponent(targetKey)}`,
    });
    const sent = await sendAdminEmail(env, mail);
    if (r.id !== null) await markDelivery(base, h, r.id, sent.ok, sent.ok ? undefined : sent.reason);
    log({ status: "notified", event: c.event_type, milestone: c.milestone_key, sent: sent.ok });
  }
}

/**
 * 좋아요 알림 처리 — 예약만 한다. 메일을 보내지 않는다.
 *
 * 좋아요는 운영이 급히 볼 신호가 아니다. 지금은 모아 보낼 스케줄러가 없으므로
 * 후보만 쌓아 둔다. 스케줄러가 생기기 전에는 이 이벤트로 메일이 나가지 않는다 —
 * 그 사실을 "자동 요약 발송 완료" 로 잘못 말하지 않는다.
 */
export async function reserveLikeMilestones(
  env: NotifyEnv, candidates: readonly NotificationCandidate[],
): Promise<void> {
  if (candidates.length === 0) return;
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const h = headers(env);
  if (!base || !h) { log({ status: "not_configured" }); return; }
  for (const c of candidates) {
    const r = await reserve(env, base, h, c);
    if (r.reserved) log({ status: "digest_queued", event: c.event_type, milestone: c.milestone_key });
  }
}

/**
 * 이 장소에 지금 열려 있는 사건을 가져오거나, 없으면 연다.
 *
 * 조회 → 없으면 생성 → 충돌하면 **다시 조회** 순서다. 마지막 재조회가 핵심이다.
 * 첫 신고 두 건이 동시에 들어오면 둘 다 "열린 사건이 없네" 라고 본다. 그때
 * DB 의 partial unique 가 한쪽만 통과시키고, 진 쪽은 이미 열린 사건을 다시
 * 읽어 **같은 id** 를 쓴다. 애플리케이션 판단만으로는 이걸 막을 수 없다.
 */
export async function getOrOpenIncident(
  env: NotifyEnv, targetType: string, targetKey: string, rows: readonly ReportRow[],
): Promise<number | null> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const h = headers(env);
  if (!base || !h) return null;

  const q = `${INCIDENTS}?target_type=eq.${targetType}` +
            `&target_key=eq.${encodeURIComponent(targetKey)}&status=eq.open&select=id&limit=1`;

  const find = async (): Promise<number | null> => {
    try {
      const res = await fetch(`${base}/rest/v1/${q}`, { headers: h });
      if (!res.ok) return null;
      const arr = await res.json() as { id: number }[];
      return arr?.[0]?.id ?? null;
    } catch { return null; }
  };

  const existing = await find();
  if (existing !== null) return existing;

  try {
    const res = await fetch(`${base}/rest/v1/${INCIDENTS}?select=id`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify([{
        target_type:      targetType,
        target_key:       targetKey,
        status:           "open",
        anchor_report_id: anchorReportId(rows),
      }]),
    });
    if (res.ok) {
      const arr = await res.json() as { id: number }[];
      const id = arr?.[0]?.id ?? null;
      if (id !== null) { log({ status: "incident_opened", target_key: targetKey }); return id; }
    }
    // 진 쪽이다. 이미 열린 사건이 있다는 뜻이므로 그걸 쓴다.
  } catch { /* 아래 재조회로 넘어간다 */ }

  return await find();
}

/**
 * 열려 있는 신고가 하나도 남지 않았으면 사건을 닫는다.
 *
 * 하나라도 남아 있으면 닫지 않는다 — 일부만 처리했다고 사건이 끝난 것이
 * 아니고, 여기서 닫아 버리면 다음 신고가 새 사건을 열어 2/5/10 이 다시 울린다.
 *
 * 이 함수는 place_reports 를 **읽기만** 한다. 신고 상태를 바꾸지 않는다.
 */
export async function closeIncidentIfResolved(
  env: NotifyEnv, targetType: string, targetKey: string,
): Promise<"closed" | "kept" | "none"> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const h = headers(env);
  if (!base || !h) return "none";

  const rows = await loadReportRows(env, targetType, targetKey);
  if (hasActiveReports(rows)) return "kept";

  try {
    const res = await fetch(
      `${base}/rest/v1/${INCIDENTS}?target_type=eq.${targetType}` +
      `&target_key=eq.${encodeURIComponent(targetKey)}&status=eq.open`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() }),
      });
    if (!res.ok) { log({ status: "incident_close_failed", httpStatus: res.status }); return "none"; }
    log({ status: "incident_closed", target_key: targetKey });
    return "closed";
  } catch { return "none"; }
}

/** 열려 있는 신고 목록을 읽는다. 쓰지 않는다. */
export async function loadReportRows(
  env: NotifyEnv, targetType: string, targetKey: string,
): Promise<ReportRow[]> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const h = headers(env);
  if (!base || !h) return [];
  try {
    const res = await fetch(
      `${base}/rest/v1/place_reports?target_type=eq.${targetType}` +
      `&target_key=eq.${encodeURIComponent(targetKey)}` +
      `&select=id,reporter_key,category,status,created_at&limit=2000`,
      { headers: h });
    if (!res.ok) return [];
    return await res.json() as ReportRow[];
  } catch { return []; }
}

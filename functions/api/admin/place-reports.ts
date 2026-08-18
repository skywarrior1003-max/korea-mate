// Cloudflare Pages Function — GET·PATCH /api/admin/place-reports
//
// 접수된 장소 제보를 운영자가 읽고 판단을 기록하는 관리자 전용 경로다.
// 공개 경로가 아니다. 공개 우회 경로(/api/place-reports/... 등)를 만들지 않았다.
//
// SECURITY CONTRACT
// - 기존 x-admin-key 검증(checkAdminAuth)을 그대로 쓴다. 새 인증 체계·새 secret 없음.
//   ADMIN_KEY 미설정이면 503 fail-closed.
// - 인증 실패는 **DB 를 건드리기 전에** 끝난다.
// - service_role 은 서버에서만 쓴다.
// - reporter_key 는 응답에 넣지 않는다. 사람 수는 숫자로만 나간다.
//   (device_id 는 애초에 저장돼 있지 않다.)
// - DB 오류 원문을 응답에 넣지 않는다. 로그에도 status 만 남긴다.
// - 무제한 dump 가 없다. limit 은 서버가 MODERATION_PAGE_MAX 로 자른다.
//
// 가장 중요한 계약
//   resolved_hidden · resolved_removed 는 **운영자의 판단 기록일 뿐이다.**
//   이 파일은 place_reports 밖의 어떤 테이블도 쓰지 않는다. city_spots 를
//   숨기거나 지우지 않고, AI·Like·Saved 에 손대지 않는다. 실제 반영은 오너
//   승인이 있는 별도 작업이다. 판단과 집행을 한 호출에 묶지 않는다.

import { json, checkAdminAuth, getServiceRoleHeaders } from "../../_lib/admin-auth";
import { closeIncidentIfResolved } from "../../_lib/admin-notify";
import {
  storyTargetKeys, buildStoryStates, attachStoryStates,
} from "../../../src/lib/moderation/story-target-state";
import {
  parseModerationListQuery, buildModerationQuery, toModerationRow,
  aggregateReports, validateModerationPatch, isAllowedTransition, buildStatusUpdate,
  MODERATION_FILTER_OPTIONS, MODERATION_PAGE_MAX,
  type ModerationErrorCode, type AggregateRow,
} from "../../../src/lib/reports/report-moderation-core";

interface Env {
  ADMIN_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}
interface Ctx { request: Request; env: Env }

const MAX_BODY_BYTES = 4 * 1024;
/** 집계용으로 읽어 올 상한. 한 장소에 이보다 많이 쌓일 일은 없다. */
const AGGREGATE_MAX_ROWS = 2000;

const fail = (error: ModerationErrorCode, status: number) => json({ success: false, error }, status);

/** 개인 식별값을 로그에 넣지 않는다. */
function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ action: "admin-place-reports", ...fields }));
}

interface Rest { ok: boolean; status: number; data: unknown }

async function rest(
  base: string, headers: Record<string, string>,
  method: string, pathQ: string, body?: unknown, prefer?: string,
): Promise<Rest> {
  const res = await fetch(`${base}/rest/v1/${pathQ}`, {
    method,
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ── GET: 목록 ───────────────────────────────────────────────────────────────

export const onRequestGet: (ctx: Ctx) => Promise<Response> = async ({ request, env }) => {
  // 인증 먼저. 아래 어떤 줄도 DB 를 부르지 않는다.
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const headers = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!headers || !base) return json({ error: "Admin DB client not configured" }, 503);

  const parsed = parseModerationListQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail(parsed.error, 400);
  const q = parsed.value;

  const listRes = await rest(base, headers, "GET", `place_reports?${buildModerationQuery(q)}`);
  if (!listRes.ok || !Array.isArray(listRes.data)) {
    log({ status: "list_failed", httpStatus: listRes.status });
    return fail("server_error", 502);
  }
  // allowlist 로 한 번 더 거른다 — select 를 잘못 고쳐도 reporter_key 가 못 나간다.
  const reports = (listRes.data as Record<string, unknown>[]).map(toModerationRow);

  // 한 장소를 지목한 조회일 때만 집계를 붙인다. 이때만 reporter_key 를 읽고,
  // 읽은 값은 사람 수를 세는 데만 쓰고 응답에는 숫자만 나간다.
  let aggregate = null;
  if (q.target_type && q.target_key) {
    const aggRes = await rest(base, headers, "GET",
      `place_reports?target_type=eq.${q.target_type}` +
      `&target_key=eq.${encodeURIComponent(q.target_key)}` +
      `&select=reporter_key,category,status,created_at&limit=${AGGREGATE_MAX_ROWS}`);
    if (!aggRes.ok || !Array.isArray(aggRes.data)) {
      log({ status: "aggregate_failed", httpStatus: aggRes.status });
      return fail("server_error", 502);
    }
    aggregate = aggregateReports(aggRes.data as AggregateRow[]);
  }

  // 신고가 가리키는 Story 가 지금 가려져 있는지 함께 내려 준다.
  //
  // 왜 여기서 붙이나
  //   관리자 화면이 "내가 눌렀던가" 로 판단하고 있었다. 새로고침하면 그 기억이
  //   사라진다. 서버에 저장된 상태를 정본으로 삼으려면 목록과 함께 와야 한다.
  //
  // 한 번만 묻는다
  //   신고마다 따로 물으면 목록 100건에 조회가 100번 붙는다. 대상 id 를 모아
  //   한 번의 `id=in.(...)` 로 끝낸다. Story 신고가 없으면 아예 묻지 않는다.
  //
  //   가려진 시각은 내보내지 않는다 — 화면이 쓰지 않고, 값이 나가면 언젠가
  //   다른 데 쓰이기 시작한다. 필요한 것은 "가려졌는가" 하나다.
  const storyKeys = storyTargetKeys(reports as { target_type?: unknown; target_key?: unknown }[]);
  let withState: Array<Record<string, unknown>> = reports;
  if (storyKeys.length > 0) {
    const idList = storyKeys.map(k => encodeURIComponent(k)).join(",");
    const itinRes = await rest(base, headers, "GET",
      `itineraries?id=in.(${idList})&select=id,is_public,moderation_hidden_at&limit=${storyKeys.length}`);
    if (!itinRes.ok || !Array.isArray(itinRes.data)) {
      log({ status: "story_state_failed", httpStatus: itinRes.status });
      return fail("server_error", 502);
    }
    withState = attachStoryStates(
      reports,
      buildStoryStates(itinRes.data as Record<string, unknown>[]),
    );
  }

  log({ status: "ok", op: "list", returned: reports.length });
  return json({
    reports: withState,
    page: { limit: q.limit, offset: q.offset, sort: q.sort, max_limit: MODERATION_PAGE_MAX },
    aggregate,
    options: MODERATION_FILTER_OPTIONS,
  });
};

// ── PATCH: 상태 기록 ────────────────────────────────────────────────────────

export const onRequestPatch: (ctx: Ctx) => Promise<Response> = async ({ request, env }) => {
  const authErr = checkAdminAuth(request, env.ADMIN_KEY);
  if (authErr) return authErr;

  const headers = getServiceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!headers || !base) return json({ error: "Admin DB client not configured" }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_query", 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_query", 400); }

  const parsed = validateModerationPatch(body);
  if (!parsed.ok) return fail(parsed.error, parsed.error === "invalid_id" ? 400 : 400);
  const patch = parsed.value;

  // 지금 상태를 먼저 읽는다. 전이 허용 여부는 현재 값을 알아야 판단할 수 있다.
  const curRes = await rest(base, headers, "GET",
    `place_reports?id=eq.${patch.id}&select=id,status,target_type,target_key&limit=1`);
  if (!curRes.ok || !Array.isArray(curRes.data)) {
    log({ status: "read_failed", httpStatus: curRes.status });
    return fail("server_error", 502);
  }
  const current = (curRes.data as
    { id: number; status: string; target_type: string; target_key: string }[])[0];
  if (!current) return fail("not_found", 404);

  if (!isAllowedTransition(current.status, patch.status)) {
    log({ status: "rejected_transition", from: current.status, to: patch.status });
    return fail("invalid_transition", 409);
  }

  const update = buildStatusUpdate(patch);
  const updRes = await rest(base, headers, "PATCH",
    `place_reports?id=eq.${patch.id}&select=${["id", "status", "resolution_note", "updated_at", "resolved_at"].join(",")}`,
    update, "return=representation");
  if (!updRes.ok || !Array.isArray(updRes.data) || updRes.data.length === 0) {
    // DB 오류 원문을 사용자에게 주지 않는다.
    log({ status: "update_failed", httpStatus: updRes.status });
    return fail("server_error", 502);
  }

  // 열려 있는 신고가 하나도 남지 않았으면 알림 사건을 닫는다.
  // 이건 신고 상태를 바꾸는 것이 아니라 "이 건은 끝났다" 를 알림 쪽에 알려
  // 다음에 새 문제가 생기면 다시 알릴 수 있게 하는 것이다. 실패해도 이 요청은
  // 성공으로 끝난다 — 판단 기록이 먼저다.
  const incident = await closeIncidentIfResolved(env, current.target_type, current.target_key)
    .catch(() => "none" as const);

  // 여기서 끝난다. city_spots · place_likes · 개인 Saved 는 건드리지 않는다.
  log({ status: "ok", op: "patch", from: current.status, to: patch.status, incident });
  return json({ success: true, report: toModerationRow((updRes.data as Record<string, unknown>[])[0]) });
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: { Allow: "GET, PATCH, OPTIONS" } });
}

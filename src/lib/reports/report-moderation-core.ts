// 장소 제보 moderation — 순수 로직.
//
// 무엇을 하는 코드인가
//   운영자가 접수된 신고를 **읽고 판단을 기록**하는 데 필요한 것만 있다.
//
// 무엇을 하지 않는 코드인가
//   여기에는 장소를 숨기거나 지우거나 점수를 깎는 함수가 없다. 일부러 없다.
//   resolved_hidden 은 "운영자가 내리기로 판단했다" 는 **기록**이고, 실제로
//   city_spots 를 건드리는 것은 오너 승인이 있는 별도 작업이다. 판단과 집행을
//   한 호출에 묶으면 잘못 누른 한 번이 곧 공개 데이터 손상이 된다.
//
// 이 파일이 지키는 계약
//   · reporter_key 는 밖으로 나가지 않는다. 사람 수는 숫자로만 나간다.
//   · device_id 는 애초에 저장돼 있지 않으므로 나갈 것도 없다.
//   · 신고 수와 Like 수를 합치지 않는다. 여기에 그런 함수가 없다.
//   · 무제한 dump 가 없다. 페이지 크기는 서버가 자른다.

import {
  REPORT_STATUSES, REPORT_CATEGORIES, REPORT_TARGET_TYPES,
  isValidCategory, isValidTargetType, isValidTargetKey,
  countIndependentReporters,
  type ReportStatus, type ReportCategory, type ReportTargetType,
} from "./place-report-core.ts";

// ── 목록 조회 ────────────────────────────────────────────────────────────────

export const MODERATION_PAGE_DEFAULT = 25;
/** 전체 dump 를 막는다. 운영자가 무엇을 요청하든 이 값을 넘지 않는다. */
export const MODERATION_PAGE_MAX = 100;

export const MODERATION_SORTS = ["newest", "oldest"] as const;
export type ModerationSort = typeof MODERATION_SORTS[number];

/**
 * 응답에 담는 컬럼. **allowlist 다.**
 *
 * reporter_key 가 여기 없는 것이 이 기능의 핵심이다. `select=*` 를 쓰면
 * 나중에 컬럼이 하나 늘 때 아무도 모르게 같이 새어 나간다. 그래서 목록도
 * 이 배열로 만들고, 응답 직전에 한 번 더 이 배열로 거른다.
 */
export const MODERATION_FIELDS = [
  "id", "target_type", "target_key", "category", "note",
  "status", "resolution_note",
  "created_at", "updated_at", "resolved_at",
] as const;
export type ModerationField = typeof MODERATION_FIELDS[number];

/** 절대 응답에 실리면 안 되는 컬럼 — 테스트가 이 목록으로 감시한다. */
export const MODERATION_FORBIDDEN_FIELDS = ["reporter_key", "device_id"] as const;

export const MODERATION_SELECT = MODERATION_FIELDS.join(",");

export interface ModerationListQuery {
  status?:      ReportStatus;
  category?:    ReportCategory;
  target_type?: ReportTargetType;
  target_key?:  string;
  limit:        number;
  offset:       number;
  sort:         ModerationSort;
}

export type ModerationErrorCode =
  | "invalid_query" | "invalid_status" | "invalid_transition"
  | "invalid_id" | "resolution_note_too_long" | "not_found" | "server_error";

function parseIntInRange(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null || raw.trim() === "") return fallback;
  if (!/^\d{1,9}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (n < min) return null;
  return Math.min(n, max);
}

/**
 * 조회 조건 해석.
 *
 * limit 은 넘겨도 조용히 MODERATION_PAGE_MAX 로 깎는다 — 거부하면 운영자가
 * 값을 바꿔가며 재시도하게 되고, 그러다 결국 큰 값이 통과하는 경로를 찾게 된다.
 * 반대로 형식이 틀린 값(음수·문자)은 조용히 고치지 않고 거부한다.
 */
export function parseModerationListQuery(
  params: URLSearchParams,
): { ok: true; value: ModerationListQuery } | { ok: false; error: ModerationErrorCode } {
  const q: ModerationListQuery = {
    limit:  MODERATION_PAGE_DEFAULT,
    offset: 0,
    sort:   "newest",
  };

  const status = params.get("status");
  if (status !== null && status !== "") {
    if (!(REPORT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "invalid_status" };
    q.status = status as ReportStatus;
  }

  const category = params.get("category");
  if (category !== null && category !== "") {
    if (!isValidCategory(category)) return { ok: false, error: "invalid_query" };
    q.category = category;
  }

  const targetType = params.get("target_type");
  const targetKey  = params.get("target_key");
  if (targetType !== null && targetType !== "") {
    if (!isValidTargetType(targetType)) return { ok: false, error: "invalid_query" };
    q.target_type = targetType;
  }
  if (targetKey !== null && targetKey !== "") {
    // target_key 만 주고 type 을 빼면 무엇을 찾는지 정해지지 않는다.
    const t = q.target_type ?? "city_spot";
    if (!isValidTargetKey(t, targetKey)) return { ok: false, error: "invalid_query" };
    q.target_type = t;
    q.target_key  = targetKey.trim();
  }

  const limit = parseIntInRange(params.get("limit"), MODERATION_PAGE_DEFAULT, 1, MODERATION_PAGE_MAX);
  if (limit === null) return { ok: false, error: "invalid_query" };
  q.limit = limit;

  const offset = parseIntInRange(params.get("offset"), 0, 0, 100_000);
  if (offset === null) return { ok: false, error: "invalid_query" };
  q.offset = offset;

  const sort = params.get("sort");
  if (sort !== null && sort !== "") {
    if (!(MODERATION_SORTS as readonly string[]).includes(sort)) return { ok: false, error: "invalid_query" };
    q.sort = sort as ModerationSort;
  }

  return { ok: true, value: q };
}

/** PostgREST 질의 문자열. select 는 allowlist 로만 만든다. */
export function buildModerationQuery(q: ModerationListQuery): string {
  const p: string[] = [`select=${MODERATION_SELECT}`];
  if (q.status)      p.push(`status=eq.${q.status}`);
  if (q.category)    p.push(`category=eq.${q.category}`);
  if (q.target_type) p.push(`target_type=eq.${q.target_type}`);
  if (q.target_key)  p.push(`target_key=eq.${encodeURIComponent(q.target_key)}`);
  p.push(`order=created_at.${q.sort === "newest" ? "desc" : "asc"}`);
  p.push(`limit=${q.limit}`);
  if (q.offset > 0) p.push(`offset=${q.offset}`);
  return p.join("&");
}

/**
 * 응답 직전 마지막 방어선.
 *
 * DB 가 무엇을 돌려줬든 allowlist 밖의 키는 버린다. select 를 잘못 고치는
 * 실수 하나로 reporter_key 가 나가는 일이 없도록 두 겹으로 막는다.
 */
export function toModerationRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of MODERATION_FIELDS) {
    if (f in row) out[f] = row[f];
  }
  return out;
}

// ── 집계 ─────────────────────────────────────────────────────────────────────

export interface ModerationAggregate {
  total_reports:         number;
  independent_reporters: number;
  pending_reports:       number;
  recent_reports_24h:    number;
  category_counts:       Record<string, number>;
  latest_report_at:      string | null;
}

export interface AggregateRow {
  reporter_key: string;
  category:     string;
  status:       string;
  created_at:   string;
}

/**
 * 한 장소에 무슨 일이 있었나.
 *
 * total_reports 와 independent_reporters 를 반드시 나눠 센다. 한 사람이 열 번
 * 눌러도 사람은 한 명이다. 이걸 합치면 "10명이 신고했다" 로 읽히고, 그 숫자
 * 하나로 운영 판단이 통째로 뒤집힌다.
 *
 * 여기에 Like 수는 들어오지 않는다. 긍정 신호와 품질 위험은 서로 다른 축이라
 * 한 숫자로 만들 수 없다.
 */
export function aggregateReports(
  rows: readonly AggregateRow[], now: Date = new Date(),
): ModerationAggregate {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const categoryCounts: Record<string, number> = {};
  let pending = 0, recent = 0, latest: number | null = null;

  for (const r of rows) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    if (r.status === "pending") pending += 1;
    const t = new Date(r.created_at).getTime();
    if (!Number.isNaN(t)) {
      if (t >= dayAgo) recent += 1;
      if (latest === null || t > latest) latest = t;
    }
  }

  return {
    total_reports:         rows.length,
    independent_reporters: countIndependentReporters(rows),
    pending_reports:       pending,
    recent_reports_24h:    recent,
    category_counts:       categoryCounts,
    latest_report_at:      latest === null ? null : new Date(latest).toISOString(),
  };
}

// ── 상태 변경 ────────────────────────────────────────────────────────────────

/** 더 볼 것 없다고 판단이 끝난 상태들. */
export const TERMINAL_STATUSES = [
  "resolved_corrected", "resolved_no_change", "resolved_hidden",
  "resolved_removed", "rejected", "duplicate",
] as const;

export function isTerminalStatus(s: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

/**
 * 허용 전이.
 *
 * 종결된 신고를 다른 종결 상태로 바로 바꾸지 못하게 한다. 되돌리려면 반드시
 * reviewing 을 거친다 — 그래야 "다시 들여다봤다" 는 사실이 기록에 남는다.
 * 실제 운영 workflow 가 아직 없으므로 이 이상 복잡하게 만들지 않는다.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  pending:            ["reviewing", ...TERMINAL_STATUSES],
  reviewing:          ["pending", ...TERMINAL_STATUSES],
  resolved_corrected: ["reviewing"],
  resolved_no_change: ["reviewing"],
  resolved_hidden:    ["reviewing"],
  resolved_removed:   ["reviewing"],
  rejected:           ["reviewing"],
  duplicate:          ["reviewing"],
};

export function isAllowedTransition(from: string, to: string): boolean {
  if (!(REPORT_STATUSES as readonly string[]).includes(from)) return false;
  if (!(REPORT_STATUSES as readonly string[]).includes(to)) return false;
  if (from === to) return false;   // 의미 없는 갱신으로 updated_at 만 흔들지 않는다
  return (ALLOWED_TRANSITIONS[from as ReportStatus] as readonly string[]).includes(to);
}

/**
 * 운영자 메모. 신고자 원문(note)과 다른 칸이다.
 * 이것도 공개 렌더링 경로가 없다 — JSON data 로만 오간다.
 */
export const RESOLUTION_NOTE_MAX_CHARS = 1000;

export function normalizeResolutionNote(
  v: unknown,
): { ok: true; note: string | null } | { ok: false; error: ModerationErrorCode } {
  if (v === undefined || v === null) return { ok: true, note: null };
  if (typeof v !== "string") return { ok: true, note: null };
  const t = v.trim();
  if (!t) return { ok: true, note: null };
  if (t.length > RESOLUTION_NOTE_MAX_CHARS) return { ok: false, error: "resolution_note_too_long" };
  return { ok: true, note: t };
}

export function isValidReportId(v: unknown): boolean {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER;
  if (typeof v !== "string") return false;
  return /^[0-9]{1,15}$/.test(v.trim()) && Number(v.trim()) > 0;
}

export interface ValidModerationPatch {
  id:              string;
  status:          ReportStatus;
  resolution_note: string | null;
}

export function validateModerationPatch(
  body: unknown,
): { ok: true; value: ValidModerationPatch } | { ok: false; error: ModerationErrorCode } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_query" };
  const b = body as Record<string, unknown>;

  if (!isValidReportId(b.id)) return { ok: false, error: "invalid_id" };
  if (typeof b.status !== "string" || !(REPORT_STATUSES as readonly string[]).includes(b.status)) {
    return { ok: false, error: "invalid_status" };
  }
  const note = normalizeResolutionNote(b.resolution_note);
  if (!note.ok) return { ok: false, error: note.error };

  return {
    ok: true,
    value: { id: String(b.id).trim(), status: b.status as ReportStatus, resolution_note: note.note },
  };
}

/**
 * 갱신할 컬럼. **place_reports 밖으로 나가지 않는다.**
 *
 * resolved_hidden 이어도 여기에 city_spots 관련 필드가 없다. 그것이 이 기능의
 * 안전 계약이다 — moderation 은 판단을 적을 뿐, 공개 데이터를 바꾸지 않는다.
 */
export function buildStatusUpdate(
  patch: ValidModerationPatch, now: Date = new Date(),
): Record<string, unknown> {
  const iso = now.toISOString();
  const update: Record<string, unknown> = { status: patch.status, updated_at: iso };
  if (patch.resolution_note !== null) update.resolution_note = patch.resolution_note;
  update.resolved_at = isTerminalStatus(patch.status) ? iso : null;
  return update;
}

/** 운영 화면이 고를 수 있는 값들 — 하드코딩 대신 core 가 알려 준다. */
export const MODERATION_FILTER_OPTIONS = {
  statuses:     REPORT_STATUSES,
  categories:   REPORT_CATEGORIES,
  target_types: REPORT_TARGET_TYPES,
  sorts:        MODERATION_SORTS,
} as const;

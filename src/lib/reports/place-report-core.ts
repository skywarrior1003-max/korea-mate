// 장소 제보 — 순수 로직.
//
// 왜 분리했나
//   신고는 법적으로 민감하다. "바가지" 나 "불친절" 같은 말은 신고된 순간 사실이
//   아니다. 검증 전 단계의 데이터를 다루므로 무엇을 받고 무엇을 거부하는지가
//   화면이나 네트워크 없이 전부 테스트로 고정돼야 한다.
//
// 이 파일이 지키는 계약
//   · 신고는 공개하지 않는다. 여기에 렌더링용 함수가 없다.
//   · 신고자를 식별할 수 있는 값을 그대로 저장하지 않는다.
//   · 신고 하나가 장소를 숨기거나 점수를 깎지 않는다 — 그런 코드가 여기 없다.
//   · Like 와 Report 를 한 점수로 합치지 않는다. 서로 다른 축이다.

// ── 신고 대상 ────────────────────────────────────────────────────────────────
//
// 공개된 관광 정보만 신고 대상이다. My Places(user_spot)는 다른 사람이 보는
// 공개 정보가 아니므로 제외한다. 임의 문자열 entity 는 받지 않는다.

export const REPORT_TARGET_TYPES = ["city_spot"] as const;
export type ReportTargetType = typeof REPORT_TARGET_TYPES[number];

/** city_spots 는 bigint PK 다. 문자열로 받되 숫자만 허용한다. */
const CITY_SPOT_KEY_RE = /^[0-9]{1,12}$/;

export function isValidTargetType(v: unknown): v is ReportTargetType {
  return typeof v === "string" && (REPORT_TARGET_TYPES as readonly string[]).includes(v);
}

export function isValidTargetKey(type: ReportTargetType, key: unknown): boolean {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (!k) return false;
  if (type === "city_spot") return CITY_SPOT_KEY_RE.test(k);
  return false;
}

// ── 신고 사유 ────────────────────────────────────────────────────────────────
//
// 사용자에게는 쉬운 말로 보여주고(i18n), 저장은 안정적인 영문 key 로 한다.
// 두 축을 구분해 둔다 — 확인 가능한 사실 오류와, 주관이 섞인 현장 경험은
// 나중에 검토 우선순위가 다르다.

/** 확인 가능한 정보 오류. 공식/공공데이터와 대조할 수 있다. */
export const OBJECTIVE_CATEGORIES = [
  "hours_or_holiday",
  "price_or_fee",
  "location",
  "closed_or_unavailable",
  "construction_or_access",
  "facility_info",
  "accessibility",
] as const;

/** 현장 경험·응대. 주관이 섞이므로 단독으로 사실 확정하지 않는다. */
export const EXPERIENCE_CATEGORIES = [
  "maintenance",
  "cleanliness",
  "facility_broken",
  "staff_service",
  "overcharge_suspected",
  "safety",
  "service_mismatch",
] as const;

export const REPORT_CATEGORIES = [
  ...OBJECTIVE_CATEGORIES, ...EXPERIENCE_CATEGORIES, "other",
] as const;
export type ReportCategory = typeof REPORT_CATEGORIES[number];

export function isValidCategory(v: unknown): v is ReportCategory {
  return typeof v === "string" && (REPORT_CATEGORIES as readonly string[]).includes(v);
}

/** 이 사유가 확인 가능한 사실 축인가 — 검토 우선순위 판단용이며 자동 제재가 아니다 */
export function isObjectiveCategory(c: ReportCategory): boolean {
  return (OBJECTIVE_CATEGORIES as readonly string[]).includes(c);
}

// ── moderation 상태 ─────────────────────────────────────────────────────────
//
// 신고는 접수 시점에 사실이 아니다. 반드시 사람이 거치는 단계를 남긴다.

export const REPORT_STATUSES = [
  "pending",              // 아직 아무도 안 봄
  "reviewing",            // 검토 중
  "resolved_corrected",   // 확인해서 데이터를 고침
  "resolved_no_change",   // 확인했으나 문제 없음
  "resolved_hidden",      // 공개에서 내림
  "resolved_removed",     // 목록에서 제외
  "rejected",             // 잘못된·악의적 신고
  "duplicate",            // 같은 내용 중복
] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];

export const INITIAL_REPORT_STATUS: ReportStatus = "pending";

// ── 자유 입력 ────────────────────────────────────────────────────────────────

export const NOTE_MAX_CHARS = 500;

/**
 * 자유 입력 정규화.
 * 공백만 있으면 null. 길이를 넘으면 거부한다(조용히 자르지 않는다 — 사용자가
 * 쓴 말이 임의로 잘려 저장되면 나중에 그 기록을 신뢰할 수 없다).
 *
 * 이 값은 **어디에도 공개하지 않는다.** 그래서 HTML 을 지우지 않고 원문 그대로
 * 보관한다 — 제보자가 쓴 말을 우리가 고치지 않는 것이 조사에 유리하다.
 * 대신 공개 렌더링 경로가 존재하지 않는 것으로 안전을 확보한다.
 */
export function normalizeNote(v: unknown): { ok: true; note: string | null } | { ok: false; error: "note_too_long" } {
  if (v === undefined || v === null) return { ok: true, note: null };
  if (typeof v !== "string") return { ok: true, note: null };
  const t = v.trim();
  if (!t) return { ok: true, note: null };
  if (t.length > NOTE_MAX_CHARS) return { ok: false, error: "note_too_long" };
  return { ok: true, note: t };
}

// ── 신고자 식별 ──────────────────────────────────────────────────────────────

export const DEVICE_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidDeviceId(v: unknown): boolean {
  return typeof v === "string" && DEVICE_ID_RE.test(v.trim());
}

/**
 * 신고자 가명 키.
 *
 * device_id 를 그대로 저장하지 않는다. 그리고 **대상마다 다른 값**이 나오도록
 * 대상을 해시 입력에 넣는다 — 같은 사람이 여러 장소를 신고해도 그 기록들을
 * 이어 붙여 한 사람의 행적을 재구성할 수 없다.
 *
 * 같은 대상 안에서는 값이 안정적이므로 중복 방지와 "서로 다른 몇 명이
 * 신고했는가" 집계는 그대로 된다.
 *
 * 새 비밀키를 만들지 않는다. 링크 불가만으로 충분한 용도다.
 */
export function reporterKeyInput(
  deviceId: string, targetType: ReportTargetType, targetKey: string,
): string {
  return `${deviceId.trim().toLowerCase()}|${targetType}:${targetKey.trim()}`;
}

export async function reporterKey(
  deviceId: string, targetType: ReportTargetType, targetKey: string,
): Promise<string> {
  const data = new TextEncoder().encode(reporterKeyInput(deviceId, targetType, targetKey));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── 중복·남용 방어 ───────────────────────────────────────────────────────────

/**
 * 같은 사람이 같은 대상·같은 사유로 다시 신고해도 이 안에서는 한 건이다.
 *
 * **창이 지나면 다시 신고할 수 있어야 한다.** 8월에 영업시간 오류를 알려 고쳤는데
 * 10월에 또 바뀌면 같은 사람이 다시 알려줄 수 있어야 한다. 그래서 이 규칙은
 * 스키마의 영구 unique 가 아니라 서버의 시간 판단이다.
 */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 이 시각 이후의 신고만 "최근 중복" 으로 본다. */
export function duplicateWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - DUPLICATE_WINDOW_MS);
}

/** 이전 신고가 아직 중복 창 안에 있는가 — 창 밖이면 다시 신고할 수 있다. */
export function isWithinDuplicateWindow(
  previousCreatedAt: Date | string, now: Date = new Date(),
): boolean {
  const prev = previousCreatedAt instanceof Date ? previousCreatedAt : new Date(previousCreatedAt);
  if (Number.isNaN(prev.getTime())) return false;
  return prev.getTime() >= duplicateWindowStart(now).getTime();
}
/** 한 기기가 짧은 시간에 쏟아붓는 것을 막는다. */
export const RATE_MAX = 10;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

export const MAX_BODY_BYTES = 4 * 1024;

// ── 요청 검증 ────────────────────────────────────────────────────────────────

export type ReportErrorCode =
  | "invalid_target" | "invalid_category" | "note_too_long"
  | "duplicate_recent" | "rate_limited" | "invalid_device" | "server_error";

export interface ValidReport {
  target_type: ReportTargetType;
  target_key:  string;
  category:    ReportCategory;
  note:        string | null;
  device_id:   string;
}

/**
 * 들어온 요청이 받을 만한 신고인가.
 * 대상이 실제로 존재하는지는 DB 조회가 필요하므로 호출자가 따로 확인한다.
 */
export function validateReportRequest(
  body: unknown, deviceId: unknown,
): { ok: true; value: ValidReport } | { ok: false; error: ReportErrorCode } {
  if (!isValidDeviceId(deviceId)) return { ok: false, error: "invalid_device" };
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_target" };
  const b = body as Record<string, unknown>;

  if (!isValidTargetType(b.target_type)) return { ok: false, error: "invalid_target" };
  if (!isValidTargetKey(b.target_type, b.target_key)) return { ok: false, error: "invalid_target" };
  if (!isValidCategory(b.category)) return { ok: false, error: "invalid_category" };

  const note = normalizeNote(b.note);
  if (!note.ok) return { ok: false, error: note.error };

  return {
    ok: true,
    value: {
      target_type: b.target_type,
      target_key:  String(b.target_key).trim(),
      category:    b.category,
      note:        note.note,
      device_id:   String(deviceId).trim(),
    },
  };
}

/**
 * 사용자에게 돌려줄 응답.
 * 다른 사람의 신고 수·신고자 키·내부 상태 이력·DB 오류 원문을 넣지 않는다.
 */
export interface ReportAcceptedResponse { success: true; status: "received" }
export function acceptedResponse(): ReportAcceptedResponse {
  return { success: true, status: "received" };
}

/**
 * 독립 신고자 수. 같은 사람이 열 번 눌러도 한 명이다.
 * 총 신고 수와 반드시 구분한다 — 한 사람의 반복을 여러 명으로 세면
 * 운영 판단이 통째로 왜곡된다.
 */
export function countIndependentReporters(rows: readonly { reporter_key: string }[]): number {
  return new Set(rows.map(r => r.reporter_key)).size;
}

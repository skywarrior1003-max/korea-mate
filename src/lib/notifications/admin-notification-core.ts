// 관리자 알림 — 순수 로직.
//
// 이 파일이 정하는 것
//   언제 알릴 만한가, 그 알림을 어떻게 한 번만 보낼 것인가.
//
// 이 파일이 정하지 않는 것
//   무엇을 할 것인가. 여기에 장소를 숨기거나 지우거나 점수를 깎는 함수가
//   없다. 알림은 "확인해 주세요" 이지 처분이 아니다.
//
// 이 파일이 지키는 계약
//   · 신고 수와 좋아요 수를 한 점수로 합치지 않는다.
//   · 사람 수는 **서로 다른 신고자** 기준이다. 한 사람의 반복은 한 명이다.
//   · 신고 알림은 지금 열려 있는 사건 단위로만 막는다 — 몇 달 뒤 새 문제는
//     다시 알려야 한다.
//   · 좋아요는 급한 신호가 아니다. 즉시 메일을 보내지 않는다.

// ── 신고: 어떤 상태가 "지금 열려 있는" 것인가 ───────────────────────────────
//
// 종결된 신고는 사람 수에 세지 않는다. 그래야 관리자가 처리한 뒤 상황이
// 실제로 가라앉았는지 숫자로 볼 수 있다.

export const ACTIVE_REPORT_STATUSES = ["pending", "reviewing"] as const;
export type ActiveReportStatus = typeof ACTIVE_REPORT_STATUSES[number];

export function isActiveReportStatus(s: string): boolean {
  return (ACTIVE_REPORT_STATUSES as readonly string[]).includes(s);
}

export interface ReportRow {
  id:           number;
  reporter_key: string;
  category:     string;
  status:       string;
  created_at:   string;
}

export function activeReports(rows: readonly ReportRow[]): ReportRow[] {
  return rows.filter(r => isActiveReportStatus(r.status));
}

/**
 * 서로 다른 신고자 수.
 * 한 사람이 열 번 눌러도 한 명이다. 이걸 총 건수로 바꿔 세면
 * "10명이 신고했다" 로 읽히고 운영 판단이 통째로 뒤집힌다.
 */
export function distinctReporters(rows: readonly ReportRow[]): number {
  return new Set(rows.map(r => r.reporter_key)).size;
}

/**
 * 지금 열려 있는 사건의 이름.
 *
 * 열려 있는 신고 중 **가장 먼저 들어온 것의 id** 를 쓴다. 모두 종결되면
 * 사건이 끝나고, 나중에 새 신고가 들어오면 새 id 가 앵커가 되어 임계를
 * 처음부터 다시 쓸 수 있다. 그래서 몇 달 뒤 같은 장소에 새 문제가 생겨도
 * 알림을 받는다.
 *
 * 알아 둘 것: 관리자가 **가장 오래된 신고만** 종결하면 앵커가 다음 신고로
 * 옮겨간다. 그러면 같은 임계 알림이 한 번 더 올 수 있다. 이 방향의 오차는
 * 알림이 더 오는 쪽이지 빠지는 쪽이 아니라서 그대로 둔다 — 관리자가 손을
 * 댄 뒤에도 신고가 계속 들어온다면 그건 다시 볼 만한 일이다.
 */
export function incidentKey(rows: readonly ReportRow[]): string | null {
  const act = activeReports(rows);
  if (act.length === 0) return null;
  return String(act.reduce((min, r) => (r.id < min.id ? r : min)).id);
}

// ── 신고: 언제 알리나 ───────────────────────────────────────────────────────

/** 서로 다른 신고자가 이만큼 모이면 알린다. */
export const REPORT_MILESTONES = [2, 5, 10] as const;

/**
 * 한 건만으로도 바로 알리는 사유.
 * 안전 문제는 사람이 모일 때까지 기다릴 일이 아니다.
 */
export const IMMEDIATE_SINGLE_REPORT_CATEGORIES = ["safety"] as const;

/**
 * 폐업·운영중단은 2명부터 — 일반 임계와 같다.
 * 별도 상수를 두는 이유는 나중에 정책이 갈릴 때 여기만 보면 되게 하기 위해서다.
 */
export const CLOSED_REPORT_MIN_REPORTERS = 2;

export function isImmediateSingleCategory(c: string): boolean {
  return (IMMEDIATE_SINGLE_REPORT_CATEGORIES as readonly string[]).includes(c);
}

export const EVENT_REPORT_THRESHOLD = "report_threshold";
export const EVENT_REPORT_SAFETY    = "report_safety";
export const EVENT_LIKE_MILESTONE   = "like_milestone";
/** 아직 쓰지 않는다. 공개 기여 흐름이 생기면 여기에 붙는다. */
export const EVENT_PUBLIC_PLACE_SUBMISSION = "public_place_submission";

export const DELIVERY_IMMEDIATE = "immediate";
export const DELIVERY_DIGEST    = "digest";

export interface NotificationCandidate {
  event_type:    string;
  target_type:   "city_spot";
  target_key:    string;
  signal_key:    string | null;
  milestone_key: string;
  incident_key:  string;
  delivery_mode: "immediate" | "digest";
  metric_value:  number;
}

/**
 * 지금 이 장소에 대해 만들어야 할 신고 알림 후보들.
 *
 * 후보를 만드는 것과 실제로 보내는 것은 다르다. 여기서는 "보낼 만하다" 까지만
 * 판단하고, 정말 보낼지는 DB 가 자리를 내주는지로 정한다(동시 요청 방어).
 */
export function reportNotificationCandidates(
  targetKey: string, rows: readonly ReportRow[],
): NotificationCandidate[] {
  const act = activeReports(rows);
  if (act.length === 0) return [];
  const incident = incidentKey(rows);
  if (incident === null) return [];

  const out: NotificationCandidate[] = [];
  const base = { target_type: "city_spot" as const, target_key: targetKey, incident_key: incident };

  // 안전 문제는 열려 있는 사건에서 최초 1건이면 바로 알린다.
  const safety = act.filter(r => isImmediateSingleCategory(r.category));
  if (safety.length > 0) {
    out.push({
      ...base,
      event_type:    EVENT_REPORT_SAFETY,
      signal_key:    "safety",
      milestone_key: "safety:1",
      delivery_mode: DELIVERY_IMMEDIATE,
      metric_value:  distinctReporters(safety),
    });
  }

  // 일반 임계 — 서로 다른 신고자 기준. 넘긴 단계는 모두 후보로 만든다.
  // 동시 요청 때문에 한 단계를 건너뛰어도 빠뜨리지 않기 위해서다.
  const reporters = distinctReporters(act);
  for (const m of REPORT_MILESTONES) {
    if (reporters >= m) {
      out.push({
        ...base,
        event_type:    EVENT_REPORT_THRESHOLD,
        signal_key:    null,
        milestone_key: `threshold:${m}`,
        delivery_mode: DELIVERY_IMMEDIATE,
        metric_value:  reporters,
      });
    }
  }
  return out;
}

// ── 좋아요: 언제 기록하나 ───────────────────────────────────────────────────

/** 좋아요는 급하지 않다. 이 단계들만 기록하고, 메일은 나중에 모아 보낸다. */
export const LIKE_MILESTONES = [5, 10, 25, 50, 100] as const;

/**
 * 좋아요 알림 후보.
 *
 * 취소했다가 다시 눌러 같은 단계를 또 넘어도 후보가 다시 생기지 않는다 —
 * 좋아요 이벤트는 incident 없이 평생 한 번이라 DB 의 UNIQUE 가 막는다.
 * 여기서는 넘긴 단계를 전부 후보로 내놓고, 이미 처리된 것은 DB 가 걸러 낸다.
 */
export function likeNotificationCandidates(
  targetKey: string, count: number,
): NotificationCandidate[] {
  return LIKE_MILESTONES.filter(m => count >= m).map(m => ({
    event_type:    EVENT_LIKE_MILESTONE,
    target_type:   "city_spot" as const,
    target_key:    targetKey,
    signal_key:    null,
    milestone_key: `like:${m}`,
    // 평생 한 번이면 되는 알림이라 사건 개념이 없다.
    incident_key:  "",
    // 즉시 보내지 않는다. 좋아요는 운영이 급히 볼 일이 아니다.
    delivery_mode: DELIVERY_DIGEST,
    metric_value:  count,
  }));
}

// ── 이메일 본문 ─────────────────────────────────────────────────────────────

export interface ReportEmailInput {
  targetKey:     string;
  placeName?:    string | null;
  city?:         string | null;
  reporters:     number;
  milestoneKey:  string;
  categories:    readonly string[];
  occurredAt:    string;
  adminPath?:    string | null;
}

/**
 * 관리자에게 보낼 글.
 *
 * 신고는 접수 시점에 사실이 아니다. 그래서 "위험한 곳" · "바가지" 같은
 * 단정하는 말을 쓰지 않는다. 우리가 아는 것은 "몇 명이 무엇에 대해
 * 알려 왔다" 뿐이고, 그 이상은 확인한 뒤에 말한다.
 *
 * 신고자가 누구인지, 무엇을 적었는지는 넣지 않는다. 확인에 필요하면 관리자
 * 화면에서 본다 — 메일함은 그런 것을 두기에 안전한 곳이 아니다.
 */
export function buildReportEmail(i: ReportEmailInput): { subject: string; text: string } {
  const where = [i.placeName, i.city].filter(Boolean).join(" · ") || `city_spot ${i.targetKey}`;
  const subject = `[gokoreamate] 장소 신고 검토 필요 — ${where} (신고자 ${i.reporters}명)`;
  const text = [
    "gokoreamate 운영 알림입니다.",
    "",
    "접수된 신고가 검토 기준에 도달했습니다. 아직 확인 전이며, 사실로 확정된",
    "내용이 아닙니다.",
    "",
    `장소:            ${where}`,
    `place id:        ${i.targetKey}`,
    `서로 다른 신고자: ${i.reporters}명 (같은 사람의 반복은 1명으로 셉니다)`,
    `도달 단계:        ${i.milestoneKey}`,
    `신고 사유:        ${i.categories.length ? i.categories.join(", ") : "(없음)"}`,
    `발생 시각:        ${i.occurredAt}`,
    ...(i.adminPath ? ["", "관리자 확인:", i.adminPath] : []),
    "",
    "이 메일은 확인 요청입니다. 이것만으로 장소가 숨겨지거나 삭제되지 않고,",
    "AI 추천에도 영향을 주지 않습니다.",
  ].join("\n");
  return { subject, text };
}

/** 메일 본문에 절대 들어가면 안 되는 것 — 테스트가 이 목록으로 감시한다. */
export const EMAIL_FORBIDDEN_FIELDS = [
  "reporter_key", "liker_key", "device_id", "note", "RESEND_API_KEY", "ADMIN_KEY",
] as const;

// 공개 Story 신고와 관리자 숨김의 규칙.
//
// 신고는 숨김이 아니다
//   누가 신고했다고 바로 가려지지 않는다. 접수만 되고, 가릴지는 사람이 본 뒤에
//   정한다. 신고 수가 몇을 넘으면 자동으로 가리는 규칙도 두지 않았다 — 그건
//   여러 사람이 몰려와 남의 여행을 지울 수 있게 만드는 것이다.
//
// 가리는 것은 지우는 것이 아니다
//   관리자가 가려도 그 사람의 My Trip·Memory·사진·메모·동의 기록은 그대로
//   남는다. 바깥으로 나가는 길만 닫는다.
//
// 왜 is_public 만으로 부족한가
//   `is_public=false` 로만 내려 두면 만든 사람이 다시 켜서 되돌릴 수 있다.
//   그래서 서버가 구분할 수 있는 상태를 따로 둔다(`moderation_hidden_at`).
//   그 값이 있으면 공개 요청 자체를 거절한다.
//
// 풀어도 저절로 공개되지 않는다
//   관리자가 숨김을 풀면 막힌 것만 풀린다. 다시 공개할지는 만든 사람이 정한다.
//   관리자가 남의 여행을 대신 공개해 주는 일은 없다.

/** 신고 대상 종류. 042 의 'city_spot' 옆에 하나 더 붙였다. */
export const STORY_TARGET_TYPE = "shared_story" as const;

/**
 * 공개 Story 신고 사유.
 *
 * 042 의 사유 15개는 장소 정보 오류용이라(영업시간·요금·공사) 사람이 올린
 * 사진과 글에는 맞지 않는다. 그래서 최소한만 더했다. 더 잘게 나누면 신고하는
 * 사람이 고르다 지친다.
 */
export const STORY_REPORT_CATEGORIES = [
  "inappropriate_content",
  "privacy_concern",
  "rights_concern",
  "spam_or_misleading",
  "other",                 // 042 에 이미 있는 값을 그대로 쓴다
] as const;

export type StoryReportCategory = typeof STORY_REPORT_CATEGORIES[number];

/** 042 가 이미 쓰는 상세 설명 길이 제한. 새로 정하지 않는다. */
export const REPORT_NOTE_MAX = 500 as const;

export function isStoryReportCategory(v: unknown): v is StoryReportCategory {
  return typeof v === "string" && (STORY_REPORT_CATEGORIES as readonly string[]).includes(v);
}

export type ParsedStoryReport =
  | { ok: true;  targetKey: string; category: StoryReportCategory; note: string | null }
  | { ok: false; status: 400; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 신고 요청을 읽는다.
 *
 * 대상은 공유 링크에 이미 들어 있는 여행 id 하나뿐이다. Memory id 도, 사진
 * id 도 받지 않는다 — 이번 신고 단위는 Story 하나 전체다. 관리자가 공개된
 * Story 를 열어 보면 되므로 내부 식별자를 신고에 담을 이유가 없다.
 */
export function parseStoryReport(body: unknown): ParsedStoryReport {
  if (body === null || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;

  const targetKey = typeof b.target_key === "string" ? b.target_key.trim() : "";
  if (!UUID.test(targetKey)) return { ok: false, status: 400, error: "Invalid target" };

  if (!isStoryReportCategory(b.category)) {
    return { ok: false, status: 400, error: "Invalid category" };
  }

  // 길면 조용히 자르지 않고 거절한다 — 쓴 말이 잘려 나가면 신고가 달라진다.
  const rawNote = b.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== "string") {
    return { ok: false, status: 400, error: "Invalid note" };
  }
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > REPORT_NOTE_MAX) {
    return { ok: false, status: 400, error: "Note too long" };
  }

  return { ok: true, targetKey, category: b.category, note: note === "" ? null : note };
}

// ── 공개 자격 ────────────────────────────────────────────────────────────────
/** 신고·공개 판정에 필요한 여행의 상태 */
export interface ItineraryModerationState {
  is_public:            boolean | null;
  moderation_hidden_at: string | null;
}

/** 관리자가 가렸는가 */
export function isModerationHidden(row: Pick<ItineraryModerationState, "moderation_hidden_at">): boolean {
  return typeof row.moderation_hidden_at === "string" && row.moderation_hidden_at.trim() !== "";
}

/**
 * 지금 바깥에 보여도 되는 여행인가.
 *
 * 공개로 켜져 있어야 하고, 관리자가 가리지 않았어야 한다. 둘 중 하나라도
 * 아니면 없는 것처럼 다룬다 — 왜 막혔는지 구분해 알려 주지 않는다.
 */
export function isPubliclyVisible(row: ItineraryModerationState): boolean {
  return row.is_public === true && !isModerationHidden(row);
}

/** 신고를 받을 수 있는 대상인가 — 이미 가려진 것은 더 받을 이유가 없다 */
export function canAcceptReport(row: ItineraryModerationState): boolean {
  return isPubliclyVisible(row);
}

// ── 만든 사람의 공개 요청 ────────────────────────────────────────────────────
export type PublishVerdict =
  | { allowed: true }
  | { allowed: false; status: 409; error: string };

/**
 * 만든 사람이 공개를 켜려 할 때.
 *
 * 가려져 있으면 거절한다 — 이게 없으면 관리자가 가린 것을 그대로 되돌릴 수
 * 있어 가린 의미가 없어진다. **끄는 것은 언제나 허용한다**(공개를 줄이는
 * 방향이다). 제목 수정이나 자기 일정 편집까지 막지 않는다.
 *
 * 왜 그대로 알려 주나
 *   막힌 이유를 완전히 숨기면 만든 사람은 자기 여행이 왜 공개되지 않는지
 *   영영 모른다. 다만 누가 신고했는지·관리자 메모는 알려 주지 않는다.
 */
export function publishVerdict(
  row: Pick<ItineraryModerationState, "moderation_hidden_at">,
  nextIsPublic: boolean,
): PublishVerdict {
  if (!nextIsPublic) return { allowed: true };
  if (isModerationHidden(row)) {
    return { allowed: false, status: 409, error: "This trip is not available for sharing." };
  }
  return { allowed: true };
}

// ── 관리자 조작 ──────────────────────────────────────────────────────────────
export interface ModerationPatch {
  moderation_hidden_at: string | null;
  is_public?:           boolean;
  updated_at:           string;
}

/**
 * 가리기 / 풀기.
 *
 * 가릴 때는 공개도 함께 내린다 — 기존 공개 경로가 전부 `is_public` 을 보고
 * 있어서, 그것까지 내려야 즉시 닫힌다.
 *
 * 풀 때는 **`is_public` 을 건드리지 않는다.** 관리자가 남의 여행을 대신
 * 공개해 주는 일은 없다. 다시 공개할지는 만든 사람이 정한다.
 */
export function buildModerationPatch(hidden: boolean, now: string): ModerationPatch {
  return hidden
    ? { moderation_hidden_at: now,  is_public: false, updated_at: now }
    : { moderation_hidden_at: null,                   updated_at: now };
}

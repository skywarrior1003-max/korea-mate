// 커뮤니티 추천 — 반응·점수·제출 사전검사·장소 제안의 순수 로직 SSOT
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1)
//
// 원칙
//  · 점수의 신뢰원은 서버다. 이 모듈은 서버(Functions)와 테스트가 함께 쓰는
//    순수 함수만 담는다 — DB·fetch·React 의존 0.
//  · 좋아요/싫어요는 상호 배타, actor 당 현재 반응 1개.
//  · 싫어요 수·피드백은 사용자에게 공개하지 않는다(순위·운영 전용).

import { CITY_SLUGS, resolveCitySlug, type CitySlug } from "../../data/cities/identity.ts";

// ── 반응 ────────────────────────────────────────────────────────────────────

export const REACTION_TARGET_TYPES = ["city_spot", "story"] as const;
export type ReactionTargetType = typeof REACTION_TARGET_TYPES[number];

export const REACTION_ACTIONS = ["like", "dislike", "clear"] as const;
export type ReactionAction = typeof REACTION_ACTIONS[number];

export type MyReaction = "like" | "dislike" | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** city_spot 은 숫자 id, story 는 공유 UUID — 042/060 의 기존 key 규약 그대로 */
export function isValidReactionKey(type: ReactionTargetType, key: string): boolean {
  if (type === "city_spot") return /^\d{1,10}$/.test(key);
  return UUID_RE.test(key);
}

export function isReactionTargetType(v: unknown): v is ReactionTargetType {
  return typeof v === "string" && (REACTION_TARGET_TYPES as readonly string[]).includes(v);
}
export function isReactionAction(v: unknown): v is ReactionAction {
  return typeof v === "string" && (REACTION_ACTIONS as readonly string[]).includes(v);
}

export interface ValidReaction {
  target_type: ReactionTargetType;
  target_key:  string;
  action:      ReactionAction;
  device_id:   string;
}
export type ReactionErrorCode =
  | "invalid_target" | "invalid_action" | "invalid_device" | "rate_limited" | "server_error";

export function validateReactionRequest(
  body: unknown, deviceId: string,
): { ok: true; value: ValidReaction } | { ok: false; error: ReactionErrorCode } {
  if (!UUID_RE.test(deviceId.toLowerCase())) return { ok: false, error: "invalid_device" };
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const type = b.target_type;
  const key  = typeof b.target_key === "string" ? b.target_key.trim() : "";
  if (!isReactionTargetType(type) || !isValidReactionKey(type, type === "story" ? key.toLowerCase() : key)) {
    return { ok: false, error: "invalid_target" };
  }
  if (!isReactionAction(b.action)) return { ok: false, error: "invalid_action" };
  return {
    ok: true,
    value: {
      target_type: type,
      target_key:  type === "story" ? key.toLowerCase() : key,
      action:      b.action,
      device_id:   deviceId.toLowerCase(),
    },
  };
}

/** 응답은 좋아요 수와 내 상태뿐 — 싫어요 수는 어떤 공개 응답에도 넣지 않는다. */
export function reactionState(likeCount: number, mine: MyReaction) {
  return { likeCount: Math.max(0, likeCount), myReaction: mine };
}

// ── 싫어요 후 피드백 사유 ──────────────────────────────────────────────────
// 값은 place_reports.category 로 저장된다(068 CHECK). 042/054 의 기존 값은
// place-report-core / story-moderation-core 가 소유하고, 여기는 커뮤니티
// 시트가 노출하는 조합만 정의한다.

export const COMMUNITY_NEW_CATEGORIES = [
  "info_inaccurate", "photo_mismatch", "duplicate_place", "low_value",
  "unrealistic_itinerary", "route_mismatch", "low_quality",
] as const;
export type CommunityNewCategory = typeof COMMUNITY_NEW_CATEGORIES[number];

/** 장소 싫어요 시트의 사유(§4) — 폐업·부적절·기타는 042/054 기존 값 재사용 */
export const PLACE_FEEDBACK_REASONS = [
  "info_inaccurate", "photo_mismatch", "closed_or_unavailable",
  "duplicate_place", "low_value", "inappropriate_content", "other",
] as const;

/** Story 싫어요 시트의 사유(§4) — 스팸·개인정보/저작권·기타는 054 값 재사용 */
export const STORY_FEEDBACK_REASONS = [
  "info_inaccurate", "unrealistic_itinerary", "route_mismatch",
  "low_quality", "spam_or_misleading", "privacy_concern", "other",
] as const;

export function isCommunityNewCategory(v: unknown): v is CommunityNewCategory {
  return typeof v === "string" && (COMMUNITY_NEW_CATEGORIES as readonly string[]).includes(v);
}

// ── 점수 ────────────────────────────────────────────────────────────────────
// score = like - dislike + (고유 활용 × 3). 완료 여부·조회 수·AI 평가·시간
// 감쇠는 반영하지 않는다(§3-2). usage 는 actor 기준 고유 수 — 같은 사람이
// 저장+여행추가/중복 복사를 해도 서버 집계가 1로 센다.

export const USAGE_WEIGHT = 3 as const;

export interface RankInput {
  id:         string;
  likes:      number;
  dislikes:   number;
  usage:      number;
  /** 동점 3순위 — 승인(또는 등재) 시각. 없으면 epoch 0 취급 */
  approvedAt?: string | null;
}

export function communityScore(r: Pick<RankInput, "likes" | "dislikes" | "usage">): number {
  return r.likes - r.dislikes + r.usage * USAGE_WEIGHT;
}

/** §3-4 동점 정렬: score → 고유 활용 → 좋아요 → 최근 승인 → 안정 ID */
export function compareRanked(a: RankInput, b: RankInput): number {
  const s = communityScore(b) - communityScore(a);
  if (s !== 0) return s;
  if (b.usage !== a.usage) return b.usage - a.usage;
  if (b.likes !== a.likes) return b.likes - a.likes;
  const at = Date.parse(a.approvedAt ?? "") || 0;
  const bt = Date.parse(b.approvedAt ?? "") || 0;
  if (bt !== at) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ── 장소 cold-start 순위 (COLD-START-RANKING-POLICY-V1 §2) ─────────────────
//
// V2 최초 공개 시점에는 대부분의 장소에 반응이 없다. 무반응 장소를 순위에서
// 빼지 않고, 도시의 추천 후보 **전체**에 연속 순위를 준다. 정렬 우선순위:
//   ① score 내림차순(공식 불변)  ② usage  ③ like
//   ④ 기존 official/editorial 추천 순서(editorialIndex 오름차순 —
//      목록 밖 장소는 Infinity 로 뒤)  ⑤ 안정적인 숫자 ID
// 전부 0인 초기 상태에서는 ④가 곧 추천 순위가 된다. 반응이 쌓이면
// score 가 자연스럽게 순서를 바꾼다. 최소 반응 수·무반응 분리·신뢰도
// 보정은 이번 정책에서 도입하지 않는다(§5 — 데이터 축적 후 별도 검토).

export interface PlaceRankInput {
  /** city_spots.id — 숫자 문자열 */
  id:       string;
  likes:    number;
  dislikes: number;
  usage:    number;
  /** ④ 기존 추천 순서상의 위치. 목록에 없으면 Number.POSITIVE_INFINITY */
  editorialIndex: number;
}

/** §2-2 cold-start 정렬 — 요청이 반복돼도 동점 순서가 흔들리지 않는다 */
export function comparePlaceRanked(a: PlaceRankInput, b: PlaceRankInput): number {
  const s = communityScore(b) - communityScore(a);
  if (s !== 0) return s;
  if (b.usage !== a.usage) return b.usage - a.usage;
  if (b.likes !== a.likes) return b.likes - a.likes;
  if (a.editorialIndex !== b.editorialIndex) return a.editorialIndex - b.editorialIndex;
  return Number(a.id) - Number(b.id);
}

// ── Story 추천 제출 ─────────────────────────────────────────────────────────

export const SUBMISSION_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

/** 재제출 가능 상태 — pending/approved 는 중복 제출이다 */
export function canResubmit(prev: SubmissionStatus | null): boolean {
  return prev === null || prev === "rejected" || prev === "withdrawn";
}

/** 시스템 사전검사 최소 장소 수 — 한두 곳짜리 일정은 "코스"가 아니다 */
export const MIN_STORY_PLACES = 3 as const;

export interface SubmissionCandidate {
  isPublic:          boolean;
  moderationHidden:  boolean;
  city:              string | null | undefined;
  placeCount:        number;
  hasPublicMoment:   boolean;
}
export type SubmissionRejection =
  | "not_public" | "moderation_hidden" | "unsupported_city"
  | "too_few_places" | "no_public_moment";

export function precheckSubmission(
  c: SubmissionCandidate,
): { ok: true; city: CitySlug } | { ok: false; error: SubmissionRejection } {
  if (!c.isPublic)          return { ok: false, error: "not_public" };
  if (c.moderationHidden)   return { ok: false, error: "moderation_hidden" };
  const city = resolveCitySlug(c.city ?? null);
  if (!city)                return { ok: false, error: "unsupported_city" };
  if (c.placeCount < MIN_STORY_PLACES) return { ok: false, error: "too_few_places" };
  // Story 표면 자체가 공개 moment 를 전제한다(content-like 와 같은 판정 축).
  if (!c.hasPublicMoment)   return { ok: false, error: "no_public_moment" };
  return { ok: true, city };
}

/** days(배열 v1 / {__v:2, scheduled} v2)에서 배치된 장소 수를 센다 */
export function countScheduledPlaces(days: unknown): number {
  const dayList: unknown[] = Array.isArray(days)
    ? days
    : (days && typeof days === "object" && (days as { __v?: unknown }).__v === 2
        && Array.isArray((days as { scheduled?: unknown }).scheduled))
      ? (days as { scheduled: unknown[] }).scheduled
      : [];
  let n = 0;
  for (const d of dayList) {
    const places = (d && typeof d === "object") ? (d as { places?: unknown }).places : null;
    if (Array.isArray(places)) n += places.length;
  }
  return n;
}

// ── 장소 제안 (V1: 텍스트만 — 이미지 URL·업로드 없음 §5-1) ────────────────

export interface ValidSuggestion {
  city: CitySlug; name: string; category: string; address: string;
  reason: string; official_link: string | null;
}
export type SuggestionErrorCode =
  | "invalid_city" | "invalid_name" | "invalid_category" | "invalid_address"
  | "invalid_reason" | "invalid_link" | "invalid_device" | "rate_limited" | "server_error";

const trimmed = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 1 && s.length <= max ? s : null;
};

export function validateSuggestion(
  body: unknown,
): { ok: true; value: ValidSuggestion } | { ok: false; error: SuggestionErrorCode } {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const city = resolveCitySlug(typeof b.city === "string" ? b.city : null);
  if (!city) return { ok: false, error: "invalid_city" };
  const name     = trimmed(b.name, 120);
  if (!name)     return { ok: false, error: "invalid_name" };
  const category = trimmed(b.category, 40);
  if (!category) return { ok: false, error: "invalid_category" };
  const address  = trimmed(b.address, 300);
  if (!address)  return { ok: false, error: "invalid_address" };
  const reason   = trimmed(b.reason, 500);
  if (!reason)   return { ok: false, error: "invalid_reason" };
  let official_link: string | null = null;
  if (b.official_link !== undefined && b.official_link !== null && b.official_link !== "") {
    const link = trimmed(b.official_link, 300);
    if (!link || !/^https?:\/\//i.test(link)) return { ok: false, error: "invalid_link" };
    official_link = link;
  }
  return { ok: true, value: { city, name, category, address, reason, official_link } };
}

export const SUPPORTED_CITY_SLUGS = CITY_SLUGS;

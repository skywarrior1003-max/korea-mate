// whole-trip AI 개인화 프로필 — 타입 · 모드 계약 · 검증기.
//
// 왜 whole-trip 인가
//   /api/trip/plan 은 하루 단위다. 거기서 AI 를 부르면 14일 여행은 14번 부른다.
//   과거 비용 사고가 정확히 그 모양이었다. 그래서 AI 는 여행 전체를 보고 딱
//   한 번만 부르고, 그 결과(프로필)를 각 날짜 스케줄러에 얹는다.
//
// 이 프로필이 할 수 있는 일과 없는 일
//   할 수 있다 — 이미 규칙 검증을 통과한 후보들 사이의 tie-break 에 가중치를 얹는다.
//   할 수 없다 — 장소를 만들거나, 지우거나, 좌표·주소·영업시간·가격을 바꾸는 일.
//   그래서 이 파일에는 사실 데이터 필드가 아예 없다. 스키마에 없으면 만들 수 없다.
//
// 값은 전부 서버가 정한 enum·범위로 좁힌다. 모델이 뭘 뱉든 여기를 통과하지
// 못하면 버리고 규칙 기반 결과를 그대로 쓴다.

/** 스케줄러가 아는 카테고리. 여기 없는 값은 프로필에서 버린다. */
export const PROFILE_CATEGORIES = [
  "attraction", "restaurant", "cafe", "nature", "culture",
  "shopping", "market", "activity", "nightlife",
] as const;
export type ProfileCategory = typeof PROFILE_CATEGORIES[number];

export const TIME_PREFERENCES = ["morning", "afternoon", "evening", "flexible"] as const;
export type TimePreference = typeof TIME_PREFERENCES[number];

export const DENSITY_PREFERENCES = ["lighter", "balanced", "fuller"] as const;
export type DensityPreference = typeof DENSITY_PREFERENCES[number];

export const CLUSTER_PREFERENCES = ["tight", "balanced", "explore"] as const;
export type ClusterPreference = typeof CLUSTER_PREFERENCES[number];

export const PROFILE_VERSION = 1;

/** 모델이 만들 수 없는 값만 담는다 — 전부 가중치·선호도다 */
export interface PersonalizationProfile {
  profile_version:        number;
  category_weights:       Partial<Record<ProfileCategory, number>>;  // 0~1
  preferred_place_ids:    string[];        // 반드시 사용자가 이미 고른 것 중에서만
  time_preferences:       Partial<Record<ProfileCategory, TimePreference>>;
  pace_bias:              number;          // -1~1, 사용자가 고른 pace 안에서만
  day_density_preference: DensityPreference;
  cluster_preference:     ClusterPreference;
  meal_preference:        TimePreference;
  preference_summary:     string;          // 사용자에게 보여줄 수 있는 한 줄
  source:                 "ai" | "fallback";
}

export type AiStatus =
  | "disabled" | "mock" | "applied"
  | "fallback_missing_key" | "fallback_timeout" | "fallback_provider_error"
  | "fallback_invalid_response" | "fallback_duplicate" | "fallback_guard"
  /** 이번 달 무료 개인화(가져오기와 공유) 횟수 소진 — 기본 일정은 그대로 만들어진다 */
  | "fallback_quota";

export interface PersonalizeResponse {
  profile:   PersonalizationProfile | null;
  ai_status: AiStatus;
}

// ── 모드 계약 ────────────────────────────────────────────────────────────────
//
// 하나의 변수만 본다. 두 개를 두면 어느 쪽이 이기는지 매번 헷갈린다.
// 모르는 값·빈 값·미설정은 전부 off 다. 실수로 켜지는 방향이 없어야 한다.

export const AI_MODES = ["off", "mock", "staging-live", "production-live"] as const;
export type AiMode = typeof AI_MODES[number];

export function resolveAiMode(raw: string | undefined | null): AiMode {
  const v = (raw ?? "").trim().toLowerCase();
  return (AI_MODES as readonly string[]).includes(v) ? (v as AiMode) : "off";
}

/** 실제 provider 를 부를 수 있는 모드인가 */
export function modeAllowsProviderCall(mode: AiMode): boolean {
  return mode === "staging-live" || mode === "production-live";
}

// ── 입력 상한 ────────────────────────────────────────────────────────────────
// prompt 가 커지면 비용이 커진다. 장소 수와 문자열 길이를 여기서 자른다.
export const MAX_PROFILE_PLACES     = 40;   // provider 로 보내는 장소 수 상한
export const MAX_SUMMARY_CHARS      = 300;
export const MAX_PREFERRED_IDS      = 40;
export const MAX_PLACE_NAME_CHARS   = 60;   // 원문 description 은 보내지 않는다

// ── 검증 ─────────────────────────────────────────────────────────────────────

const CTRL_OR_MARKUP = /[<>]|[\u0000-\u001F]|```|\bjavascript:|\bdata:|https?:\/\//i;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  if (CTRL_OR_MARKUP.test(s)) return null;   // HTML·script·markdown·URL 차단
  return s;
}

function num01(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return Math.round(v * 100) / 100;
}

/**
 * 모델 응답 → 프로필.
 * 하나라도 계약을 벗어나면 그 필드를 버린다. 전체가 못 쓸 정도면 null 을 준다.
 * null 이면 호출자는 규칙 기반 결과를 그대로 쓴다 — 일정 생성은 실패하지 않는다.
 *
 * allowedPlaceIds 는 사용자가 이미 고른(Selected/liked) 장소뿐이다. 모델이
 * 그 밖의 id 를 넣으면 조용히 버린다 — 없는 장소를 일정에 들일 수 있는 유일한
 * 통로이므로 여기가 가장 중요하다.
 */
export function validateProfile(
  raw: unknown,
  allowedPlaceIds: readonly string[],
): PersonalizationProfile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.profile_version !== PROFILE_VERSION) return null;

  // category_weights — 아는 카테고리·0~1 만
  const weights: Partial<Record<ProfileCategory, number>> = {};
  if (typeof o.category_weights === "object" && o.category_weights !== null) {
    for (const [k, v] of Object.entries(o.category_weights as Record<string, unknown>)) {
      if (!(PROFILE_CATEGORIES as readonly string[]).includes(k)) continue;
      const n = num01(v);
      if (n !== null) weights[k as ProfileCategory] = n;
    }
  }

  // preferred_place_ids — 허용 목록의 부분집합만
  const allowed = new Set(allowedPlaceIds.map(String));
  const preferred: string[] = [];
  if (Array.isArray(o.preferred_place_ids)) {
    for (const v of o.preferred_place_ids.slice(0, MAX_PREFERRED_IDS)) {
      const s = typeof v === "string" ? v.trim() : "";
      if (s && allowed.has(s) && !preferred.includes(s)) preferred.push(s);
    }
  }

  // time_preferences — 아는 카테고리·아는 enum 만
  const times: Partial<Record<ProfileCategory, TimePreference>> = {};
  if (typeof o.time_preferences === "object" && o.time_preferences !== null) {
    for (const [k, v] of Object.entries(o.time_preferences as Record<string, unknown>)) {
      if (!(PROFILE_CATEGORIES as readonly string[]).includes(k)) continue;
      if (typeof v === "string" && (TIME_PREFERENCES as readonly string[]).includes(v)) {
        times[k as ProfileCategory] = v as TimePreference;
      }
    }
  }

  const paceBias =
    typeof o.pace_bias === "number" && Number.isFinite(o.pace_bias)
      ? Math.max(-1, Math.min(1, Math.round(o.pace_bias * 100) / 100))
      : 0;

  const density: DensityPreference =
    typeof o.day_density_preference === "string" &&
    (DENSITY_PREFERENCES as readonly string[]).includes(o.day_density_preference)
      ? (o.day_density_preference as DensityPreference) : "balanced";

  const cluster: ClusterPreference =
    typeof o.cluster_preference === "string" &&
    (CLUSTER_PREFERENCES as readonly string[]).includes(o.cluster_preference)
      ? (o.cluster_preference as ClusterPreference) : "balanced";

  const meal: TimePreference =
    typeof o.meal_preference === "string" &&
    (TIME_PREFERENCES as readonly string[]).includes(o.meal_preference)
      ? (o.meal_preference as TimePreference) : "flexible";

  const summary = cleanText(o.preference_summary, MAX_SUMMARY_CHARS) ?? "";

  // 아무 신호도 못 건졌으면 프로필이라 부를 게 없다
  if (Object.keys(weights).length === 0 && preferred.length === 0 &&
      Object.keys(times).length === 0 && !summary) {
    return null;
  }

  return {
    profile_version:        PROFILE_VERSION,
    category_weights:       weights,
    preferred_place_ids:    preferred,
    time_preferences:       times,
    pace_bias:              paceBias,
    day_density_preference: density,
    cluster_preference:     cluster,
    meal_preference:        meal,
    preference_summary:     summary,
    source:                 "ai",
  };
}

/** mock 모드용 결정론적 프로필 — 실제 provider 를 부르지 않는다 */
export function buildMockProfile(allowedPlaceIds: readonly string[]): PersonalizationProfile {
  return {
    profile_version:        PROFILE_VERSION,
    category_weights:       { restaurant: 0.9, cafe: 0.7, nature: 0.6, culture: 0.5, attraction: 0.4 },
    preferred_place_ids:    allowedPlaceIds.slice(0, 5).map(String),
    time_preferences:       { nature: "morning", restaurant: "evening", nightlife: "evening" },
    pace_bias:              0,
    day_density_preference: "balanced",
    cluster_preference:     "tight",
    meal_preference:        "evening",
    preference_summary:     "[mock] Food-forward with easy pacing and nearby clusters.",
    source:                 "fallback",
  };
}

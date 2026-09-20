// 영구 AI generation cache · 호출 제한 계약 (AI-TREND-PACK-PERSISTENT-CACHE V1 §C·§D·§I)
//
// 이 모듈은 순수 계산(키·해시·제한값·이미지 검증)만 담는다 — DB 접근은
// functions/api/mytrip/writing.ts 가 한다(테이블: mytrip_ai_generations, 063 DRAFT).
//
// cache key = scope(feature) + entity(itinerary) 경계 + locale + 정규화 문맥 해시
//             + image SHA-256 + prompt_version + trend_pack_version
//  · 소유 경계는 itinerary(entity) — 후보는 그 여행 소유자(device 검증 통과자)만
//    읽을 수 있다. 서로 다른 사용자의 여행이면 키가 달라 섞일 수 없고, 읽기 전에
//    device 소유 검증을 거친다(§D RLS/소유권).
//  · 같은 소유자가 다른 브라우저에서 열어도(동일 device identity) 동일 입력이면
//    서버 캐시 hit — sessionStorage 는 빠른 로컬 캐시일 뿐이다.
//  · 사진·메모가 바뀌면 imgSha/contextHash 가 바뀌어 새 입력으로 처리된다.
//  · prompt_version·활성 trend pack version 변경도 새 후보 생성을 허용한다.
//    기존에 저장된 최종 moment/Story 문장은 이 캐시와 무관하다(자동 재생성 0).

import type { WritingContext } from "./writing-core";

/** 캐시 만료 — Production 확정 전 Owner 결정 항목(우선 30일, §D) */
export const AI_CACHE_TTL_DAYS = 30;

/** 제한 기본값(§I Preview 권고) — 최종값은 Owner 결정 항목. env 로 덮어쓸 수 있다. */
export const DEFAULT_LIMITS = {
  regenCooldownSec: 20,
  entityRegenPerHour: 3,
  deviceCallsPerDay: 20,
  globalCallsPerDay: 100,
} as const;

export interface AiLimits {
  regenCooldownSec: number;
  entityRegenPerHour: number;
  deviceCallsPerDay: number;
  globalCallsPerDay: number;
}

/** env 문자열(JSON 아님 — 개별 키) 덮어쓰기. 잘못된 값은 기본값 유지. */
export function resolveLimits(env: Record<string, string | undefined>): AiLimits {
  const n = (v: string | undefined, d: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.floor(x) : d;
  };
  return {
    regenCooldownSec: n(env.MYTRIP_AI_REGEN_COOLDOWN_SEC, DEFAULT_LIMITS.regenCooldownSec),
    entityRegenPerHour: n(env.MYTRIP_AI_ENTITY_REGEN_PER_HOUR, DEFAULT_LIMITS.entityRegenPerHour),
    deviceCallsPerDay: n(env.MYTRIP_AI_DEVICE_CALLS_PER_DAY, DEFAULT_LIMITS.deviceCallsPerDay),
    globalCallsPerDay: n(env.MYTRIP_AI_GLOBAL_CALLS_PER_DAY, DEFAULT_LIMITS.globalCallsPerDay),
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** raw device id 는 저장하지 않는다 — 되돌릴 수 없는 식별 해시만(§D 절대 미저장 목록) */
export function ownerHash(deviceId: string): Promise<string> {
  return sha256Hex(`gkm-owner-v1|${deviceId}`);
}

/**
 * 문맥 정규화 — 키 순서·공백 차이로 캐시가 갈라지지 않게 관련 필드만 고정 순서로.
 * (사진은 imgSha 가, draft/메모는 이 해시가 구분한다.)
 */
export function normalizedContextString(c: WritingContext): string {
  const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return JSON.stringify({
    city: t(c.city), place: t(c.placeName), cat: t(c.category),
    day: typeof c.dayNumber === "number" ? Math.floor(c.dayNumber) : null,
    dates: t(c.dates), photo: c.hasPhoto === true, draft: t(c.draft),
    tripTitle: t(c.tripTitle), facts: (c.tripFacts ?? []).map(f => t(f)).filter(Boolean),
  });
}

export interface CacheKeyParts {
  feature: "moment3" | "storyHero";
  /** storyHero 는 문체별 결과가 다르다 — 키에 반드시 포함(QA 실측: 미포함 시 warm 이 witty 캐시를 받았다). moment3 는 null. */
  direction: string | null;
  itineraryId: string;
  locale: string;
  contextHash: string;
  imageSha: string | null;
  promptVersion: string;
  trendPackVersion: string | null;
}

export function computeCacheKey(p: CacheKeyParts): Promise<string> {
  return sha256Hex([
    "gkm-aigen-v1", p.feature, p.direction ?? "nodir", p.itineraryId, p.locale, p.contextHash,
    p.imageSha ?? "noimg", p.promptVersion, p.trendPackVersion ?? "notrend",
  ].join("|"));
}

// ── 이미지 서버 검증(§I) ─────────────────────────────────────────────────────
// 클라 전처리 실측 23~81KB(base64 31k~110k chars) — 기존 2M chars 상한은 과도했다.
// 400k chars(≈300KB 디코드)로 축소: 정상 fixture 의 3~10배 여유 + 폭주 차단.
export const MAX_IMAGE_BASE64_CHARS_V2 = 400_000;
/** base64 "/9j/" = JPEG SOI(FF D8 FF) — 재인코딩 JPEG 만 받는다 */
export function looksLikeJpegBase64(data: string): boolean {
  return data.startsWith("/9j/");
}
export function decodedByteLength(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** 429 본문 계약 — 기존 200-JSON 계약과 구분되는 명확한 제한 응답(§I) */
export interface RateLimitedBody {
  suggestion: null; moment: null; set: null;
  ai_status: "rate_limited";
  limit: "cooldown" | "entity_hour" | "device_day" | "global_day";
  retryAfterSec: number;
}
export function rateLimitedBody(limit: RateLimitedBody["limit"], retryAfterSec: number): RateLimitedBody {
  return { suggestion: null, moment: null, set: null, ai_status: "rate_limited", limit, retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) };
}

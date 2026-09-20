// My Trip AI 글쓰기 클라이언트 — 서버 함수(/api/mytrip/writing)만 호출한다. secret 없음.
// 실패는 전부 null — 편집기는 사용자가 쓰던 그대로 남는다.
import type { WritingDirection, WritingTarget, WritingLocale, WritingContext, WritingImage } from "./writing-core";

export async function apiSuggestWriting(args: {
  target: WritingTarget;
  direction: WritingDirection;
  locale: string;
  context: WritingContext;
}): Promise<string | null> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  try {
    const res = await fetch("/api/mytrip/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: args.target, direction: args.direction, locale, context: args.context }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { suggestion?: unknown };
    return typeof j.suggestion === "string" && j.suggestion.trim() ? j.suggestion.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 여행 전체 Story 표지 제목+소개문 (STORY-HERO-TONE-SELECTION V2 §3).
 * 사용자가 문체를 **먼저 고른 뒤** 그 방향으로 정확히 1요청 — 세 문체를 미리
 * 만들지 않는다. 실패는 null(화면은 fallback 유지, 재시도 없음).
 */
/** 제한(429) 정보 — 화면은 남은 시간을 안내하고 직접 작성은 계속 허용한다(§I) */
export interface RateLimitInfo { rateLimited: true; retryAfterSec: number }

async function parseRateLimit(res: Response): Promise<RateLimitInfo | null> {
  if (res.status !== 429) return null;
  try {
    const j = (await res.json()) as { retryAfterSec?: unknown };
    return { rateLimited: true, retryAfterSec: typeof j.retryAfterSec === "number" ? j.retryAfterSec : 60 };
  } catch { return { rateLimited: true, retryAfterSec: 60 }; }
}

export async function apiSuggestStoryHero(args: {
  direction: WritingDirection;
  locale: string;
  context: WritingContext;
  /** 영구 캐시·소유 검증(§C·§D) — 서버가 entity 경계로 후보를 보관한다 */
  itineraryId?: string;
  deviceId?: string;
  forceFresh?: boolean;
  signal?: AbortSignal;
}): Promise<{ title: string; intro: string } | RateLimitInfo | null> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  try {
    const timeout = AbortSignal.timeout(12_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
    const res = await fetch("/api/mytrip/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(args.deviceId ? { "x-device-id": args.deviceId } : {}) },
      body: JSON.stringify({ target: "storyHero", direction: args.direction, locale, context: args.context,
        ...(args.itineraryId ? { itineraryId: args.itineraryId } : {}), ...(args.forceFresh ? { forceFresh: true } : {}) }),
      signal,
    });
    const limited = await parseRateLimit(res.clone());
    if (limited) return limited;
    if (!res.ok) return null;
    const j = (await res.json()) as { moment?: { title?: unknown; memo?: unknown } | null };
    const m = j.moment;
    if (m && typeof m.title === "string" && m.title.trim() && typeof m.memo === "string" && m.memo.trim()) {
      return { title: m.title.trim(), intro: m.memo.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 순간 기록 3안 세트 (STORY-MULTICARD-JOURNEY-MAP-AND-AI-COST-PREVIEW-V1 §8-2).
 * 예전에는 방향별 3병렬(=provider 3회)이었다 — 이제 target "moment3" **단일 요청**
 * 으로 세 스타일을 함께 받는다(순간 1건 = provider 1회). 서버가 방향별로 검증해
 * 실패 방향만 빠진다(부분 성공 허용). 재시도 0·timeout 계약은 그대로다.
 */
export type MomentSuggestionSet = Partial<Record<WritingDirection, { title: string; memo: string }>>;

export interface MomentSetResult {
  set: MomentSuggestionSet;
  /** 서버 영구 캐시의 generation id — 선택·저장 메타 보고(§E)에 쓴다 */
  generationId: string | null;
  /** "cache_server"(서버 캐시 hit) 등 서버 ai_status — 계측·표시용 */
  aiStatus: string | null;
  rateLimited?: RateLimitInfo;
}

export async function apiSuggestMomentSet(args: {
  locale: string;
  context: WritingContext;
  /** 멀티모달(§A-1) — 클라 canvas 전처리 JPEG. 서버는 URL 을 fetch 하지 않는다. */
  image?: WritingImage | null;
  itineraryId?: string;
  deviceId?: string;
  forceFresh?: boolean;
  signal?: AbortSignal;
}): Promise<MomentSetResult> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  const empty: MomentSetResult = { set: {}, generationId: null, aiStatus: null };
  try {
    // 멀티모달은 서버 timeout(12s)보다 넉넉히 — 사진 업로드 왕복 포함
    const timeout = AbortSignal.timeout(args.image ? 20_000 : 12_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
    const res = await fetch("/api/mytrip/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(args.deviceId ? { "x-device-id": args.deviceId } : {}) },
      // direction 은 요청 형식상 필수 — moment3 에서는 서버가 무시한다
      body: JSON.stringify({ target: "moment3", direction: "calm", locale, context: args.context,
        ...(args.image ? { image: args.image } : {}),
        ...(args.itineraryId ? { itineraryId: args.itineraryId } : {}),
        ...(args.forceFresh ? { forceFresh: true } : {}) }),
      signal,
    });
    const limited = await parseRateLimit(res.clone());
    if (limited) return { ...empty, rateLimited: limited };
    if (!res.ok) return empty;
    const j = (await res.json()) as {
      set?: Partial<Record<WritingDirection, { title?: unknown; memo?: unknown }>> | null;
      generation_id?: unknown; ai_status?: unknown;
    };
    const set: MomentSuggestionSet = {};
    for (const d of ["calm", "witty", "warm"] as const) {
      const m = j.set?.[d];
      if (m && typeof m.title === "string" && m.title.trim() && typeof m.memo === "string" && m.memo.trim()) {
        set[d] = { title: m.title.trim(), memo: m.memo.trim() };
      }
    }
    return {
      set,
      generationId: typeof j.generation_id === "string" ? j.generation_id : null,
      aiStatus: typeof j.ai_status === "string" ? j.ai_status : null,
    };
  } catch {
    return empty;
  }
}

/**
 * 선택·저장 행동 메타(§E) — best-effort, 실패 무시. 사용자 문장 원문은 보내지
 * 않는다(글자 수 변화만).
 */
export function apiWritingMeta(args: {
  itineraryId: string; deviceId: string; generationId: string;
  event: "select" | "save"; style?: WritingDirection;
  edited?: boolean; titleLenDelta?: number; memoLenDelta?: number;
}): void {
  try {
    void fetch("/api/mytrip/writing-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": args.deviceId },
      body: JSON.stringify({
        itineraryId: args.itineraryId, generationId: args.generationId, event: args.event,
        ...(args.style ? { style: args.style } : {}),
        ...(typeof args.edited === "boolean" ? { edited: args.edited } : {}),
        ...(typeof args.titleLenDelta === "number" ? { titleLenDelta: args.titleLenDelta } : {}),
        ...(typeof args.memoLenDelta === "number" ? { memoLenDelta: args.memoLenDelta } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

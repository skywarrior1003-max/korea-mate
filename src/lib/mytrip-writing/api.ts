// My Trip AI 글쓰기 클라이언트 — 서버 함수(/api/mytrip/writing)만 호출한다. secret 없음.
// 실패는 전부 null — 편집기는 사용자가 쓰던 그대로 남는다.
import type { WritingDirection, WritingTarget, WritingLocale, WritingContext } from "./writing-core";

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
export async function apiSuggestStoryHero(args: {
  direction: WritingDirection;
  locale: string;
  context: WritingContext;
  signal?: AbortSignal;
}): Promise<{ title: string; intro: string } | null> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  try {
    const timeout = AbortSignal.timeout(12_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
    const res = await fetch("/api/mytrip/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "storyHero", direction: args.direction, locale, context: args.context }),
      signal,
    });
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

export async function apiSuggestMomentSet(args: {
  locale: string;
  context: WritingContext;
  signal?: AbortSignal;
}): Promise<MomentSuggestionSet> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  try {
    const timeout = AbortSignal.timeout(12_000);
    const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
    const res = await fetch("/api/mytrip/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // direction 은 요청 형식상 필수 — moment3 에서는 서버가 무시한다
      body: JSON.stringify({ target: "moment3", direction: "calm", locale, context: args.context }),
      signal,
    });
    if (!res.ok) return {};
    const j = (await res.json()) as { set?: Partial<Record<WritingDirection, { title?: unknown; memo?: unknown }>> | null };
    const set: MomentSuggestionSet = {};
    for (const d of ["calm", "witty", "warm"] as const) {
      const m = j.set?.[d];
      if (m && typeof m.title === "string" && m.title.trim() && typeof m.memo === "string" && m.memo.trim()) {
        set[d] = { title: m.title.trim(), memo: m.memo.trim() };
      }
    }
    return set;
  } catch {
    return {};
  }
}

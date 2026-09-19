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
 * 순간 기록 3안 세트 (MYTRIP-AI-STORY-MAP-AND-SHARE-PREVIEW-V1).
 * 방향(calm/witty/warm)별 병렬 3요청 — 서버·Worker 의 "요청당 provider 1회·
 * 재시도 0" 계약은 그대로다. 실패한 방향은 결과에서 빠진다(부분 성공 허용).
 * AbortSignal 로 진행 중 세트를 통째로 취소할 수 있다(입력 변경 시 무한 호출 방지).
 */
export type MomentSuggestionSet = Partial<Record<WritingDirection, { title: string; memo: string }>>;

export async function apiSuggestMomentSet(args: {
  locale: string;
  context: WritingContext;
  signal?: AbortSignal;
}): Promise<MomentSuggestionSet> {
  const locale = (["ko", "en", "ja", "zh"].includes(args.locale) ? args.locale : "en") as WritingLocale;
  const one = async (direction: WritingDirection) => {
    try {
      const timeout = AbortSignal.timeout(12_000);
      const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
      const res = await fetch("/api/mytrip/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "moment", direction, locale, context: args.context }),
        signal,
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { moment?: { title?: unknown; memo?: unknown } | null };
      const m = j.moment;
      if (m && typeof m.title === "string" && m.title.trim() && typeof m.memo === "string" && m.memo.trim()) {
        return { title: m.title.trim(), memo: m.memo.trim() };
      }
      return null;
    } catch {
      return null;
    }
  };
  const [calm, witty, warm] = await Promise.all([one("calm"), one("witty"), one("warm")]);
  const set: MomentSuggestionSet = {};
  if (calm) set.calm = calm;
  if (witty) set.witty = witty;
  if (warm) set.warm = warm;
  return set;
}

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

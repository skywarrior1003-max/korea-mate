"use client";

// 이번 달 무료 AI 사용권을 다 쓴 경우의 안내 (087 · 2026-09-25 Owner 작업 지시 기준)
//  · plan    = AI 일정 만들기(글·링크 가져오기·AI 일정 공통) 월 1회 + 신규 회원 최초 1회
//  · writing = 전체 여행 AI 글쓰기(My Trip·Story 공통) 월 2회
// 직접 작성·수정·저장은 계속 쓸 수 있다는 사실을 함께 알린다. 유료 잔액은 없으므로 말하지 않는다.

import { useLocale, useTranslations } from "next-intl";

export default function FreeAiUsedNote({ nextFreeAt, className, kind = "writing" }: {
  nextFreeAt: string | null; className?: string; kind?: "plan" | "writing";
}) {
  const t = useTranslations("freeAi");
  const locale = useLocale();
  let date = "";
  if (nextFreeAt) {
    try { date = new Date(nextFreeAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }); }
    catch { date = nextFreeAt.slice(0, 10); }
  }
  const key = kind === "plan" ? (date ? "planUsedUntil" : "planUsed") : (date ? "usedUntil" : "used");
  return (
    <p role="status" data-free-ai-used={kind} className={className}>
      {t(key, { date })}
    </p>
  );
}

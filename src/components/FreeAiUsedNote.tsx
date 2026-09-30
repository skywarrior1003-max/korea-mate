"use client";

// 무료 AI 도움을 이미 쓴 경우의 안내 (EXTERNAL-IMPORT-V2 정책 교정 2026-09-30)
// 비용이 드는 AI 도움은 성공 시점부터 30일에 1회 — AI 일정 개인화·스토리 AI 글쓰기·가져오기 공통.
// 직접 작성·수정·저장은 계속 쓸 수 있다는 사실을 함께 알린다. 유료 잔액은 없으므로 말하지 않는다.

import { useLocale, useTranslations } from "next-intl";

export default function FreeAiUsedNote({ nextFreeAt, className }: { nextFreeAt: string | null; className?: string }) {
  const t = useTranslations("freeAi");
  const locale = useLocale();
  let date = "";
  if (nextFreeAt) {
    try { date = new Date(nextFreeAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }); }
    catch { date = nextFreeAt.slice(0, 10); }
  }
  return (
    <p role="status" data-free-ai-used="" className={className}>
      {date ? t("usedUntil", { date }) : t("used")}
    </p>
  );
}

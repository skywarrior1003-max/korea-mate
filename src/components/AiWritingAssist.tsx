"use client";

// My Trip 제목/메모 AI 글 방향 3종 — 공용 어시스트 UI.
// (MYTRIP-AI-WRITING-AND-FIRST-TRIP-JOURNEY-GUIDE-V1)
//
// Story AI 가 아니다. 여기서 만든 문장은 My Trip 의 제목/메모 그 자체이고,
// 사용자가 이어서 고칠 수 있으며, Story 에는 같은 내용이 그대로 보인다.
// 실패는 조용히 안내만 한다 — 저장/기존 기록은 건드리지 않는다.

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { WRITING_DIRECTIONS, type WritingDirection, type WritingTarget, type WritingContext } from "@/lib/mytrip-writing/writing-core";
import { apiSuggestWriting } from "@/lib/mytrip-writing/api";

const ORANGE = "#FF4A2D"; // with AI 계열은 따뜻한 Orange(SSOT) — planner CTA 와 같은 값

export default function AiWritingAssist({ target, buildContext, onSuggestion, dark = false }: {
  target: WritingTarget;
  /** 클릭 시점의 실제 편집 맥락(초안 포함)을 만든다 — 미리 굳히지 않는다 */
  buildContext: () => WritingContext;
  onSuggestion: (text: string) => void;
  /** 어두운 배경(모먼트 캡처 모달) 위 표시용 */
  dark?: boolean;
}) {
  const t = useTranslations("aiWrite");
  const locale = useLocale();
  const [direction, setDirection] = useState<WritingDirection>("calm");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    const suggestion = await apiSuggestWriting({ target, direction, locale, context: buildContext() });
    setBusy(false);
    if (suggestion) onSuggestion(suggestion);
    else setFailed(true);
  };

  const sub = dark ? "text-white/50" : "text-gray-500";
  return (
    <div>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${dark ? "text-white/50" : "text-gray-500"}`}>{t("label")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={t("label")}>
        {WRITING_DIRECTIONS.map(d => (
          <button
            key={d} type="button" onClick={() => setDirection(d)} aria-pressed={direction === d}
            className={`px-2.5 py-1.5 rounded-full text-[12px] font-semibold border transition-colors min-h-8 ${
              direction === d
                ? "text-white"
                : dark ? "border-white/25 text-white/70" : "border-gray-300 text-gray-600"
            }`}
            style={direction === d ? { backgroundColor: ORANGE, borderColor: ORANGE } : undefined}
          >
            {t(`dir_${d}`)}
          </button>
        ))}
        <button
          type="button" onClick={run} disabled={busy}
          className="px-3 py-1.5 rounded-full text-[12px] font-bold border min-h-8 disabled:opacity-60"
          style={{ borderColor: ORANGE, color: dark ? "#ffb3a6" : ORANGE }}
        >
          {busy ? t("busy") : t("go")}
        </button>
      </div>
      {failed && <p className={`mt-1 text-[11.5px] ${sub}`}>{t("failed")}</p>}
      <p className={`mt-1 text-[11px] ${sub}`}>{t("editableHint")}</p>
    </div>
  );
}

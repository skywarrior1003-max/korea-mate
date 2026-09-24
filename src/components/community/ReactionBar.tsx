"use client";

// 좋아요/싫어요 반응 바 — 추천 장소(city_spot)·공개 Story(story) 공용.
// (COMMUNITY-RECOMMENDATION-STORY-REACTION-FEEDBACK-V1 §3·§4)
//
// 계약
//  · 상호 배타: 같은 버튼 재클릭 = 중립, 반대 버튼 = 전환. 서버(/api/content-reaction)
//    가 신뢰원이고 낙관 갱신은 실패 시 원복한다.
//  · 싫어요 **수는 어디에도 없다** — 버튼 상태만. 좋아요 수만 공개.
//  · 싫어요 확정 직후 조용한 피드백 sheet 를 연다(선택 — 닫아도 싫어요 유지 §4).
//  · 상태를 색만으로 구분하지 않는다 — fill + aria-pressed + 라벨.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";
import FeedbackSheet from "@/components/community/FeedbackSheet";

type TargetType = "city_spot" | "story";
type MyReaction = "like" | "dislike" | null;

interface Props {
  targetType: TargetType;
  targetKey:  string;
  className?: string;
  /** 어두운 배경(shared story) 위에서는 밝은 톤을 쓴다 */
  tone?: "light" | "dark";
}

export default function ReactionBar({ targetType, targetKey, className = "", tone = "light" }: Props) {
  const t = useTranslations("community");
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [mine, setMine] = useState<MyReaction>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/content-reaction?target_type=${targetType}&target_key=${encodeURIComponent(targetKey)}`,
          { headers: { "x-device-id": getDeviceId() } },
        );
        if (cancelled) return;
        if (!res.ok) { if (res.status === 404) setGone(true); return; }
        const b = await res.json() as { likeCount: number; myReaction: MyReaction };
        setLikeCount(b.likeCount); setMine(b.myReaction);
      } catch { /* 표시만 포기 */ }
    })();
    return () => { cancelled = true; };
  }, [targetType, targetKey]);

  async function send(action: "like" | "dislike" | "clear") {
    const res = await fetch("/api/content-reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
      body: JSON.stringify({ target_type: targetType, target_key: targetKey, action }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json() as { likeCount: number; myReaction: MyReaction };
  }

  async function react(kind: "like" | "dislike") {
    if (busy) return;
    setBusy(true);
    const prev = { mine, likeCount };
    const action = mine === kind ? "clear" : kind;   // 같은 버튼 재클릭 = 중립
    // 낙관 갱신 — 실패 시 원복(§9: 실패를 낙관 상태로 남겨두지 않는다)
    setMine(action === "clear" ? null : kind);
    setLikeCount(c => {
      if (c === null) return c;
      const wasLike = prev.mine === "like";
      const isLike  = action === "like";
      return Math.max(0, c + (isLike ? 1 : 0) - (wasLike ? 1 : 0));
    });
    try {
      const b = await send(action);
      setLikeCount(b.likeCount); setMine(b.myReaction);
      // 싫어요가 **확정된 뒤에만** 피드백을 제안한다(§4 — 반영 먼저, 제출은 선택)
      if (action === "dislike" && b.myReaction === "dislike") setSheetOpen(true);
    } catch {
      setMine(prev.mine); setLikeCount(prev.likeCount);
    } finally {
      setBusy(false);
    }
  }

  if (gone) return null;

  const base = tone === "dark"
    ? "border-white/25 text-white/85 hover:text-white"
    : "border-line text-sub hover:text-ink";
  const btn = `gkm-focus inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-control border text-sm font-semibold disabled:opacity-60 ${base}`;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} role="group" aria-label={t("reactionGroup")}>
      <button type="button" onClick={() => react("like")} disabled={busy}
        aria-pressed={mine === "like"}
        aria-label={mine === "like" ? t("likedState") : t("likeAction")}
        className={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
             fill={mine === "like" ? "currentColor" : "none"} stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20.5s-7.2-4.7-9.3-9A5.1 5.1 0 0112 6.6a5.1 5.1 0 019.3 4.9c-2.1 4.3-9.3 9-9.3 9z" />
        </svg>
        {mine === "like" ? t("likedState") : t("likeAction")}
        {likeCount !== null && likeCount > 0 && (
          <span className="tabular-nums text-xs opacity-70">{likeCount}</span>
        )}
      </button>
      {/* 싫어요 — 숫자는 표시하지 않는다(§3-4 비공개). 상태는 fill+라벨로. */}
      <button type="button" onClick={() => react("dislike")} disabled={busy}
        aria-pressed={mine === "dislike"}
        aria-label={mine === "dislike" ? t("dislikedState") : t("dislikeAction")}
        className={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
             fill={mine === "dislike" ? "currentColor" : "none"} stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V4M7.6 20.3l3.5-6.3H4.9a1.6 1.6 0 01-1.5-2.1l1.8-6A1.6 1.6 0 016.7 4.8H17v8.9l-4.4 6.9a1.7 1.7 0 01-3-0.3z" transform="rotate(180 12 12)" />
        </svg>
        {mine === "dislike" ? t("dislikedState") : t("dislikeAction")}
      </button>
      <FeedbackSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        targetType={targetType}
        targetKey={targetKey}
      />
    </div>
  );
}

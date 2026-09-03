"use client";

// 공개 Trip / 공개 Story 좋아요 버튼 — Heart = Like.
//
// PlaceLikeButton 과 같은 계약, 다른 대상(/api/content-like · content_likes):
//   · Like 를 눌러도 Saved(북마크)·복사·Helpful 은 변하지 않는다.
//   · 누가 좋아했는지 보여주지 않는다 — 숫자와 내 상태뿐.
//   · 연타로 ±2 되지 않는다. 최종 값은 항상 서버가 다시 센 값이다.
//   · 비공개 여행에서는 이 버튼을 마운트하지 않는다(호출부 책임 + 서버 404).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";
import type { ContentLikeTargetType } from "@/lib/social/social-actions-core";

interface Props {
  targetType: ContentLikeTargetType;
  /** itineraries.id (Story 도 같은 여행 id — 표면이 다를 뿐) */
  targetKey:  string;
  className?: string;
}

export default function ContentLikeButton({ targetType, targetKey, className }: Props) {
  const t = useTranslations("like");
  const [count, setCount] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [gone,  setGone]  = useState(false); // 404(비공개/삭제) — 조용히 숨긴다

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/content-like?target_type=${targetType}&target_key=${encodeURIComponent(targetKey)}`,
          { headers: { "x-device-id": getDeviceId() } },
        );
        if (cancelled) return;
        if (!res.ok) { if (res.status === 404) setGone(true); return; }
        const b = await res.json() as { count: number; liked: boolean };
        setCount(b.count);
        setLiked(b.liked);
      } catch { /* 표시만 포기 — 화면을 깨지 않는다 */ }
    })();
    return () => { cancelled = true; };
  }, [targetType, targetKey]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prevLiked = liked, prevCount = count;
    const next = !liked;
    setLiked(next);
    setCount(c => (c === null ? c : Math.max(0, c + (next ? 1 : -1))));
    try {
      const res = await fetch("/api/content-like", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({ target_type: targetType, target_key: targetKey,
                               action: next ? "like" : "unlike" }),
      });
      if (!res.ok) { setLiked(prevLiked); setCount(prevCount); return; }
      const b = await res.json() as { count: number; liked: boolean };
      setCount(b.count); setLiked(b.liked);
    } catch {
      setLiked(prevLiked); setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  if (gone) return null;

  return (
    <button
      type="button" onClick={toggle} disabled={busy}
      aria-pressed={liked} aria-label={liked ? t("liked") : t("like")}
      className={className ??
        "gkm-focus inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-control border border-line text-sm font-semibold text-sub hover:text-ink disabled:opacity-60"}
    >
      {/* Heart = Like — 전 서비스 공통 문법. Saved(북마크)와 절대 겹치지 않는다 */}
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
           fill={liked ? "currentColor" : "none"} stroke="currentColor"
           strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20.5s-7.2-4.7-9.3-9A5.1 5.1 0 0112 6.6a5.1 5.1 0 019.3 4.9c-2.1 4.3-9.3 9-9.3 9z" />
      </svg>
      {liked ? t("liked") : t("like")}
      {count !== null && count > 0 && (
        <span className="tabular-nums text-xs opacity-70">{count}</span>
      )}
    </button>
  );
}

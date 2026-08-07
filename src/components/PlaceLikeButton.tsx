"use client";

// 장소 좋아요 버튼 — 공개 장소 전체가 함께 쓴다.
//
// Saved 와 시각적으로 겹치지 않게 한다. Saved 가 북마크(리본)라면 여기는
// 엄지다. 사용자가 두 버튼을 같은 것으로 오해하면 둘 다 쓸모가 없어진다.
//
// 무엇을 하지 않나
//   · Like 를 눌러도 Saved 가 바뀌지 않는다.
//   · 누가 좋아했는지 보여주지 않는다. 숫자와 내 상태뿐이다.
//   · 연타로 숫자가 ±2 되지 않는다 — 최종 값은 항상 서버가 다시 센 것이다.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";
import type { LikeTargetType } from "@/lib/likes/place-like-core";

interface Props {
  targetType: LikeTargetType;
  targetKey:  string;
  className?: string;
}

export default function PlaceLikeButton({ targetType, targetKey, className }: Props) {
  const t = useTranslations("like");
  const [count, setCount] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [busy,  setBusy]  = useState(false);

  // 마운트 시 현재 상태를 한 번 읽는다. 장소가 바뀌면 다시 읽는다.
  // 응답이 늦게 와도 이미 떠난 화면에 쓰지 않도록 cancelled 로 막는다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const q = new URLSearchParams({ target_type: targetType, target_key: targetKey });
        const res = await fetch(`/api/place-like?${q}`, { headers: { "x-device-id": getDeviceId() } });
        if (!res.ok || cancelled) return;
        const b = await res.json() as { count: number; liked: boolean };
        if (cancelled) return;
        setCount(b.count);
        setLiked(b.liked);
      } catch { /* 좋아요를 못 읽어도 장소 화면은 그대로 쓸 수 있어야 한다 */ }
    })();
    return () => { cancelled = true; };
  }, [targetType, targetKey]);

  async function toggle() {
    if (busy) return;                       // 연타 방지
    setBusy(true);
    const prevLiked = liked, prevCount = count;
    const next = !liked;
    // 낙관적 갱신 — 실패하면 정확히 되돌린다
    setLiked(next);
    setCount(c => (c === null ? c : Math.max(0, c + (next ? 1 : -1))));
    try {
      const res = await fetch("/api/place-like", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({ target_type: targetType, target_key: targetKey,
                               action: next ? "like" : "unlike" }),
      });
      if (!res.ok) { setLiked(prevLiked); setCount(prevCount); return; }
      const b = await res.json() as { count: number; liked: boolean };
      setCount(b.count); setLiked(b.liked);   // 서버가 센 값으로 확정
    } catch {
      setLiked(prevLiked); setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button" onClick={toggle} disabled={busy}
      aria-pressed={liked} aria-label={liked ? t("liked") : t("like")}
      className={className ??
        "gkm-focus w-full min-h-11 rounded-control border border-line text-sm font-semibold text-sub hover:text-ink disabled:opacity-60"}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        {/* 엄지 — Saved 의 북마크와 겹치지 않는 모양 */}
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
             fill={liked ? "currentColor" : "none"} stroke="currentColor"
             strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 10.5v9H4.5a1 1 0 01-1-1v-7a1 1 0 011-1H7z" />
          <path d="M7 10.5l4-7a2 2 0 013.7 1.3l-.7 3.7h4.3a2 2 0 011.95 2.45l-1.3 6A2 2 0 0117 18.5H7" />
        </svg>
        {liked ? t("liked") : t("like")}
        {count !== null && count > 0 && (
          <span className="tabular-nums text-xs opacity-70">{count}</span>
        )}
      </span>
    </button>
  );
}

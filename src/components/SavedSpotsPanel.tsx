"use client";

import { useState, useEffect, useCallback } from "react";
import { getSavedSpotsData, FAVORITES_EVENT } from "@/lib/favorites";
import { addToCart, isInCart, CART_EVENT } from "@/lib/cart";
import type { EventItem } from "@/lib/cart";

export default function SavedSpotsPanel() {
  const [spots, setSpots] = useState<EventItem[]>([]);
  const [expanded, setExpanded] = useState(false);

  // FAVORITES_EVENT 또는 CART_EVENT 시 전체 재렌더 — isInCart 상태도 갱신됨
  const refresh = useCallback(() => {
    setSpots([...getSavedSpotsData()]);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(FAVORITES_EVENT, refresh);
    window.addEventListener(CART_EVENT, refresh);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, refresh);
      window.removeEventListener(CART_EVENT, refresh);
    };
  }, [refresh]);

  // 저장된 Spot이 없으면 패널 숨김
  if (spots.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-4 z-30 select-none">
      {!expanded ? (
        // ── 접힌 상태: 작은 pill 버튼 ──────────────────────────────
        <button
          onClick={() => setExpanded(true)}
          aria-label="Show saved spots"
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white shadow-lg border border-gray-200 hover:shadow-xl transition-all"
        >
          <span className="text-base leading-none">❤️</span>
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-red-500 text-white px-1 leading-none">
            {spots.length}
          </span>
          <span className="text-xs font-semibold text-gray-600">Saved</span>
          <span className="text-gray-400 text-xs leading-none">▲</span>
        </button>
      ) : (
        // ── 펼친 상태: 스팟 목록 카드 ───────────────────────────────
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-72 max-h-[380px] flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm leading-none">❤️</span>
              <span className="text-sm font-black text-gray-900">Saved Spots</span>
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-red-500 text-white px-1 leading-none">
                {spots.length}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              aria-label="Collapse saved spots panel"
              className="text-gray-400 hover:text-gray-700 font-bold px-1 py-0.5 transition-colors text-sm"
            >
              ▼
            </button>
          </div>

          {/* 스팟 목록 */}
          <ul className="overflow-y-auto flex-1 divide-y divide-gray-50">
            {spots.map(item => {
              const inCart = isInCart(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                >
                  {/* 썸네일 */}
                  <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image ?? "/images/placeholder-spot.svg"}
                      alt={item.shortName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg";
                      }}
                    />
                  </div>

                  {/* 이름 + 지역 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{item.shortName}</p>
                    <p className="text-[10px] text-gray-400 truncate">{item.district || item.city}</p>
                  </div>

                  {/* 일정에 추가 버튼 */}
                  <button
                    onClick={() => addToCart(item)}
                    disabled={inCart}
                    title={inCart ? "이미 보관함에 있음" : "일정 보관함에 추가"}
                    className={`shrink-0 w-7 h-7 rounded-full text-xs font-black flex items-center justify-center transition-all ${
                      inCart
                        ? "bg-emerald-100 text-emerald-600 cursor-default"
                        : "bg-orange-500 text-white hover:bg-orange-600 cursor-pointer active:scale-95"
                    }`}
                  >
                    {inCart ? "✓" : "+"}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 하단 힌트 */}
          <div className="px-4 py-2 border-t border-gray-50 shrink-0">
            <p className="text-[10px] text-gray-400 text-center">
              ❤️ 저장된 Spot · <span className="text-orange-500 font-semibold">+</span> 버튼으로 보관함에 추가
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

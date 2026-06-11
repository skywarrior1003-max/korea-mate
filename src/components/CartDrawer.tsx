"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCart,
  removeFromCart,
  clearCart,
  CART_EVENT,
  type CartItem,
  type EventItem,
} from "@/lib/cart";
import EventDetailModal from "@/components/EventDetailModal";

export default function CartDrawer() {
  const [items,    setItems]    = useState<CartItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CartItem | null>(null);

  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CART_EVENT, refresh);
    return () => window.removeEventListener(CART_EVENT, refresh);
  }, [refresh]);

  if (items.length === 0) return null;

  function handleRemove(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    removeFromCart(id);
  }

  function handleClearAll() {
    clearCart();
    setExpanded(false);
  }

  return (
    <>
      <div className="fixed bottom-6 right-4 z-30 select-none">
        {!expanded ? (
          // ── 접힌 상태: pill 버튼 (모바일에서 더 크게) ──────────────
          <button
            onClick={() => setExpanded(true)}
            aria-label="Show spot cart"
            className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white shadow-lg border border-gray-200 hover:shadow-xl transition-all active:scale-95"
          >
            <span className="text-lg leading-none">🗺️</span>
            <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full text-xs font-black bg-orange-500 text-white px-1.5 leading-none">
              {items.length}
            </span>
            <span className="text-sm font-bold text-gray-700">내 보관함</span>
            <span className="text-gray-400 text-xs leading-none">▲</span>
          </button>
        ) : (
          // ── 펼친 상태: 카드 목록 ─────────────────────────────────
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-72 max-h-[380px] flex flex-col overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">🗺️</span>
                <span className="text-sm font-black text-gray-900">내 보관함</span>
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-orange-500 text-white px-1 leading-none">
                  {items.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition-colors"
                >
                  전체 삭제
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  aria-label="Collapse cart panel"
                  className="text-gray-400 hover:text-gray-700 font-bold px-1 transition-colors text-sm"
                >
                  ▼
                </button>
              </div>
            </div>

            {/* 아이템 리스트 */}
            <ul className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {items.map((item) => (
                <li
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-orange-50/40 transition-colors cursor-pointer group"
                >
                  {/* 썸네일 */}
                  <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image ?? "/images/placeholder-spot.svg"}
                      alt={item.shortName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "/images/placeholder-spot.svg";
                      }}
                    />
                  </div>

                  {/* 이름 + 지역 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                      {item.shortName}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {item.district || item.city}
                    </p>
                  </div>

                  {/* 제거 버튼 — stopPropagation으로 모달 열기와 분리 */}
                  <button
                    onClick={(e) => handleRemove(e, item.id)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors text-base font-bold"
                    aria-label={`Remove ${item.shortName}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            {/* 하단 힌트 */}
            <div className="px-4 py-2 border-t border-gray-50 shrink-0">
              <p className="text-[10px] text-gray-400 text-center">
                Spot을 눌러 상세 보기 · × 버튼으로 삭제
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 상세 모달 — CartItem은 EventItem을 extends하므로 직접 전달 가능 */}
      {selected && (
        <EventDetailModal
          event={selected as unknown as EventItem}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

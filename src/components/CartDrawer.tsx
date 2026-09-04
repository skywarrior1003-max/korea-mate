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
import { getItemSourceKey } from "@/lib/place-identity";
import EventDetailModal from "@/components/EventDetailModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/lib/analytics";

export default function CartDrawer() {
  const [items,    setItems]    = useState<CartItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CartItem | null>(null);
  const t = useTranslations("picks");
  const tModal = useTranslations("modal");
  const router = useRouter();

  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CART_EVENT, refresh);
    return () => window.removeEventListener(CART_EVENT, refresh);
  }, [refresh]);

  if (items.length === 0) return null;

  const count = items.length;

  // 선택 수에 따른 진행 문구. 칭찬이 아니라 "어느 정도 분량인가"를 알려준다 —
  // 다음 행동(일정 만들기)을 판단할 근거가 되는 쪽이 유용하다.
  const progress =
    count >= 5 ? t("countFullDay", { count }) :
    count >= 3 ? t("countHalfDay", { count }) :
    count === 1 ? t("countOne")              :   // 영어는 1개일 때 "place"
                  t("countFew",  { count });

  // 일정 생성은 홈의 플래너 섹션에서 시작한다. /itinerary 로 직행하면 날짜·
  // 도착지 파라미터가 없어 오류 화면이 나온다. 새 라우트를 만들지 않는다.
  function handleBuildTrip(surface: "cart-drawer-collapsed" | "cart-drawer-expanded") {
    trackEvent("build_trip_click", {
      city: items[0]?.city ?? "",
      picked_count: items.length,
      cta_position: surface,
    });
    router.push("/planner");
  }

  // 인자는 sourceKey 다 — id 로 지우면 같은 id 의 다른 장소까지 사라진다.
  function handleRemove(e: React.MouseEvent, sourceKey: string) {
    e.stopPropagation();
    removeFromCart(sourceKey);
  }

  function handleClearAll() {
    clearCart();
    setExpanded(false);
  }

  return (
    <>
      {/* 모바일에서는 BottomNav(3.5rem + safe-area) 위로 올린다.
          예전 값(바닥 1.5rem)은 nav 뒤에 깔려 My Picks·Build 버튼의 중심 탭을
          nav 가 가로챘다 — 높이의 30%만 눌렸다. 4.25rem = nav 3.5rem + 간격 0.75rem.
          z 도 nav(40) 위로 올린다. 단 상단 고정 바(z-50)·토스트(z-55)보다는 낮게 둔다.
          데스크톱은 BottomNav 가 없으므로(md:hidden) 기존 위치를 유지한다. */}
      <div className="fixed right-4 z-[45] select-none bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {!expanded ? (
          // ── 접힌 상태 ────────────────────────────────────────────────
          // 목록 열기와 일정 만들기는 서로 다른 행동이라 버튼을 분리한다.
          // 하나의 버튼 안에 두 동작을 넣으면 어느 쪽이 실행될지 알 수 없다.
          <div className="flex items-stretch gap-2">
            <button
              onClick={() => setExpanded(true)}
              aria-label={t("openPicks", { count })}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white shadow-lg border border-gray-200 hover:shadow-xl transition-all active:scale-95"
            >
              <span className="text-lg leading-none">🗺️</span>
              <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full text-xs font-black bg-orange-500 text-white px-1.5 leading-none">
                {count}
              </span>
              <span className="hidden sm:inline text-sm font-bold text-gray-700">{t("title")}</span>
              <span className="text-gray-400 text-xs leading-none">▲</span>
            </button>
            <button
              onClick={() => handleBuildTrip("cart-drawer-collapsed")}
              className="gkm-focus flex items-center gap-1.5 px-4 py-3 rounded-2xl text-white text-sm font-black shadow-lg transition-opacity hover:opacity-90 active:scale-95"
              style={{ backgroundColor: "#FF4A2D" }}
            >
              {t("buildTrip")}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          // ── 펼친 상태: 카드 목록 ─────────────────────────────────
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-72 max-h-[380px] flex flex-col overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">🗺️</span>
                <span className="text-sm font-black text-gray-900">{t("title")}</span>
                <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[11px] font-black bg-orange-500 text-white px-1 leading-none">
                  {items.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition-colors"
                >
                  {t("clearAll")}
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  aria-label={t("collapse")}
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
                  key={getItemSourceKey(item)}
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
                    onClick={(e) => handleRemove(e, getItemSourceKey(item))}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors text-base font-bold"
                    aria-label={tModal("remove") + " " + item.shortName}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            {/* 하단: 진행 문구 + 일정 만들기 */}
            <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex flex-col gap-2">
              <p className="text-[11px] font-bold text-gray-600 text-center">{progress}</p>
              <button
                onClick={() => handleBuildTrip("cart-drawer-expanded")}
                className="gkm-focus w-full min-h-11 rounded-xl text-white text-sm font-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#FF4A2D" }}
              >
                {t("buildTrip")} →
              </button>
              <p className="text-[10px] text-gray-400 text-center">{t("listHint")}</p>
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

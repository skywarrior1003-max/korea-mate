"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getCart,
  removeFromCart,
  clearCart,
  getTotalDurationMinutes,
  CART_EVENT,
  type CartItem,
  type EventItem,
} from "@/lib/cart";
import EventDetailModal from "@/components/EventDetailModal";

// ── 유틸 함수들 ────────────────────────────────

/** 분 → "Xh Ym" 포맷 */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 장바구니 도시 목록 → "Seoul + Busan" */
function formatCities(items: CartItem[]): string {
  const cities = [...new Set(items.map((i) => i.city))];
  return cities.join(" + ");
}

/** Stage → 작은 색상 점 */
const STAGE_DOT: Record<string, string> = {
  "Early-Bird": "bg-violet-500",
  "Pre-Event":  "bg-blue-500",
  "Event-Day":  "bg-red-500",
  "Post-Event": "bg-emerald-500",
  "Standalone": "bg-gray-400",
};

// ── 컴포넌트 ───────────────────────────────────

export default function CartDrawer() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [items,        setItems]        = useState<CartItem[]>([]);
  const [isExpanded,   setExpanded]     = useState(false);
  const [imgErrors,    setImgErrors]    = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);

  // 장바구니 데이터 새로고침
  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  // 마운트 시 초기 로드 + cart.ts가 보내는 커스텀 이벤트 구독
  useEffect(() => {
    refresh();
    window.addEventListener(CART_EVENT, refresh);
    return () => window.removeEventListener(CART_EVENT, refresh);
  }, [refresh]);

  // 홈·itinerary·planner·my-trips 화면에서는 하단 바 완전 배제
  // startsWith: trailing slash·query string 변형 모두 방어
  // !pathname: Suspense hydration 전 null 방어
  const isExcludedPath =
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/itinerary") ||
    pathname.startsWith("/planner") ||
    pathname.startsWith("/my-trips");
  if (isExcludedPath) return null;

  // 아이템 0개면 드로어 자체를 숨김
  if (items.length === 0) return null;

  const totalMinutes = getTotalDurationMinutes();
  const cityText     = formatCities(items);

  function handleRemove(id: string) {
    removeFromCart(id);
    // writeStorage 안에서 CART_EVENT 발송 → refresh() 자동 호출됨
  }

  function handleClearAll() {
    clearCart();
    setExpanded(false);
  }

  function handleBuildTimeline() {
    // 현재 URL에 startDate / endDate가 있으면 (itinerary 컨텍스트) → planner에 날짜 전달
    const urlStart = searchParams.get("startDate");
    const urlEnd   = searchParams.get("endDate");
    if (urlStart && urlEnd) {
      const start   = new Date(urlStart);
      const end     = new Date(urlEnd);
      const numDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
      router.push(`/planner?startDate=${urlStart}&numDays=${numDays}`);
    } else {
      router.push("/planner");
    }
  }

  return (
    <>
    <div className="fixed bottom-0 left-0 right-0 z-40 select-none">

      {/* ── 확장 패널 (접히면 max-h-0으로 숨김) ── */}
      <div
        className={`
          overflow-hidden
          transition-[max-height] duration-300 ease-in-out
          ${isExpanded ? "max-h-[420px]" : "max-h-0"}
          bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)]
        `}
      >
        <div className="overflow-y-auto max-h-[420px]">

          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-gray-900">
                My Trips
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white">
                  {items.length}
                </span>
              </h3>
              <Link
                href="/my-trips"
                className="text-xs font-bold text-orange-500 hover:text-orange-600 hover:underline transition-colors"
              >
                My Trips →
              </Link>
            </div>
            <button
              onClick={handleClearAll}
              className="text-xs font-semibold text-red-400 hover:text-red-600 transition-colors px-2 py-1"
            >
              Clear All
            </button>
          </div>

          {/* 아이템 리스트 */}
          <ul className="divide-y divide-gray-50">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-orange-50/40 transition-colors cursor-pointer group"
                onClick={() => setSelectedItem(item)}
              >
                {/* 썸네일 */}
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100 relative">
                  {item.image && !imgErrors[item.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.shortName}
                      onError={() =>
                        setImgErrors((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/images/placeholder-spot.svg"
                      alt="No image"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* 이름 + 스테이지 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                    {item.shortName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        STAGE_DOT[item.stage] ?? "bg-gray-400"
                      }`}
                    />
                    <span className="text-xs text-gray-500 truncate">
                      {item.stage} · {item.city}
                    </span>
                  </div>
                </div>

                {/* 소요 시간 */}
                <span className="text-xs text-gray-400 shrink-0">
                  {item.recommendedDurationMinutes}m
                </span>

                {/* 제거 버튼 */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 text-base font-bold"
                  aria-label={`Remove ${item.shortName}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {/* 패널 푸터: 요약 정보 */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{items.length} stops</span>
              {cityText && (
                <>
                  {" · "}
                  <span className="font-semibold text-gray-700">{cityText}</span>
                </>
              )}
              {" · "}
              <span className="font-semibold text-gray-700">
                {formatDuration(totalMinutes)} total
              </span>
            </p>
          </div>

        </div>
      </div>

      {/* ── 항상 표시되는 바 ── */}
      <div
        className="flex items-center gap-3 px-4 h-[68px]"
        style={{ backgroundColor: "#1a1f36" }}
      >

        {/* 왼쪽: 토글 + 아이템 요약 */}
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
          aria-expanded={isExpanded}
          aria-label="Toggle itinerary list"
        >
          {/* 지도 아이콘 */}
          <span className="text-xl shrink-0">🗺️</span>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">My Trips</span>
              {/* 숫자 뱃지 */}
              <span className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-black text-white bg-orange-500 shrink-0">
                {items.length}
              </span>
            </div>
            <p className="text-xs text-white/50 truncate mt-0.5">
              {cityText} · {formatDuration(totalMinutes)}
            </p>
          </div>

          {/* 화살표 (접기/펼치기 방향 표시) */}
          <span
            className={`text-white/40 text-sm transition-transform duration-200 shrink-0 ${
              isExpanded ? "rotate-180" : "rotate-0"
            }`}
          >
            ▲
          </span>
        </button>

        {/* 구분선 */}
        <div className="w-px h-8 bg-white/10 shrink-0" />

        {/* 오른쪽: Build My Timeline CTA */}
        <button
          onClick={handleBuildTimeline}
          className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl font-black text-sm text-white transition-opacity hover:opacity-90 active:scale-95"
          style={{ backgroundColor: "#f97316" }}
        >
          Plan My Trip
          <span className="text-base">→</span>
        </button>

      </div>
    </div>

    {/* My Itinerary 카드 클릭 → 상세 모달 */}
    {selectedItem && (
      <EventDetailModal
        event={selectedItem as unknown as EventItem}
        onClose={() => setSelectedItem(null)}
      />
    )}
  </>
  );
}

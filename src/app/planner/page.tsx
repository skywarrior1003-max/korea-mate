"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import TimelineView from "@/components/TimelineView";
import {
  getCart,
  CART_EVENT,
  type CartItem,
} from "@/lib/cart";

// ── 유틸 ────────────────────────────────────────
/** 날짜 문자열에 n일을 더해 반환 */
function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** 분 → "Xh Ym" */
function fmtDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60), m = mins % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── 타입 ────────────────────────────────────────
interface TripDay {
  label:       string;  // "Day 1"
  date:        string;  // "2026-10-15"
  arrivalTime: string;  // "14:00"
}

// scheduledByDay: { 0: [CartItem,...], 1: [...] }
type ScheduledMap = Record<number, CartItem[]>;

// ── 컴포넌트 ─────────────────────────────────────
export default function PlannerPage() {

  // ── 장바구니 / 여행 설정 상태 ─────────────────
  const [cartItems,    setCartItems]    = useState<CartItem[]>([]);
  const [numDays,      setNumDays]      = useState(3);
  const [startDate,    setStartDate]    = useState("");
  const [arrivalTimes, setArrivalTimes] = useState<string[]>(
    Array.from({ length: 7 }, (_, i) => (i === 0 ? "14:00" : "09:00"))
  );
  const [scheduled,    setScheduled]    = useState<ScheduledMap>({});
  const [activeDay,    setActiveDay]    = useState(0);
  const [dragOver,     setDragOver]     = useState<number | null>(null);

  // ── 장바구니 동기화 ───────────────────────────
  const refreshCart = useCallback(() => setCartItems(getCart()), []);
  useEffect(() => {
    refreshCart();
    window.addEventListener(CART_EVENT, refreshCart);
    return () => window.removeEventListener(CART_EVENT, refreshCart);
  }, [refreshCart]);

  // ── 계산값 (useMemo — 의존값 변경 시에만 재계산) ─
  const tripDays = useMemo<TripDay[]>(
    () => Array.from({ length: numDays }, (_, i) => ({
      label:       `Day ${i + 1}`,
      date:        addDays(startDate, i),
      arrivalTime: arrivalTimes[i] ?? "09:00",
    })),
    [numDays, startDate, arrivalTimes]
  );

  const scheduledIds = useMemo(
    () => new Set(Object.values(scheduled).flat().map((x) => x.id)),
    [scheduled]
  );

  const unscheduled = useMemo(
    () => cartItems.filter((x) => !scheduledIds.has(x.id)),
    [cartItems, scheduledIds]
  );

  const todayItems = useMemo(
    () => scheduled[activeDay] ?? [],
    [scheduled, activeDay]
  );

  const todayMins = useMemo(
    () => todayItems.reduce((s, x) => s + x.recommendedDurationMinutes + 20, 0) - (todayItems.length > 0 ? 20 : 0),
    [todayItems]
  );

  // ── Drag & Drop ───────────────────────────────
  function handleDragStart(e: React.DragEvent, item: CartItem) {
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDropOnDay(e: React.DragEvent, dayIdx: number) {
    e.preventDefault();
    setDragOver(null);
    const id   = e.dataTransfer.getData("itemId");
    const item = cartItems.find((x) => x.id === id);
    if (!item) return;

    setScheduled((prev) => {
      const next: ScheduledMap = {};
      // 다른 날에서 제거
      for (const k in prev) {
        next[Number(k)] = prev[Number(k)].filter((x) => x.id !== id);
      }
      // 대상 날에 추가 (중복 방지)
      const target = next[dayIdx] ?? [];
      if (target.some((x) => x.id === id)) return next;
      next[dayIdx] = [...target, item];
      return next;
    });
  }

  // 타임라인에서 제거 → 미배치 풀로 복귀
  function handleUnschedule(id: string) {
    setScheduled((prev) => {
      const next: ScheduledMap = {};
      for (const k in prev) {
        next[Number(k)] = prev[Number(k)].filter((x) => x.id !== id);
      }
      return next;
    });
  }

  // 순서 위로 이동
  function handleMoveUp(id: string, dayIdx: number) {
    setScheduled((prev) => {
      const arr = [...(prev[dayIdx] ?? [])];
      const i   = arr.findIndex((x) => x.id === id);
      if (i <= 0) return prev;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      return { ...prev, [dayIdx]: arr };
    });
  }

  // 순서 아래로 이동
  function handleMoveDown(id: string, dayIdx: number) {
    setScheduled((prev) => {
      const arr = [...(prev[dayIdx] ?? [])];
      const i   = arr.findIndex((x) => x.id === id);
      if (i < 0 || i >= arr.length - 1) return prev;
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return { ...prev, [dayIdx]: arr };
    });
  }

  // 도착시간 변경
  function setArrivalTime(idx: number, val: string) {
    setArrivalTimes((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  // ── 빈 장바구니 화면 ──────────────────────────
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-gray-50">
        <p className="text-5xl">🗺️</p>
        <h1 className="text-2xl font-black text-gray-900">Your itinerary is empty</h1>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Add events and spots from the main page first, then come back here to build your timeline.
        </p>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl font-bold text-white text-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#f97316" }}
        >
          ← Explore Events
        </Link>
      </div>
    );
  }

  // ── 메인 렌더 ────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── 헤더 ── */}
      <header
        className="sticky top-0 z-30 h-14 flex items-center justify-between px-5 shadow-sm"
        style={{ backgroundColor: "#1a1f36" }}
      >
        <Link href="/" className="text-base font-black text-white flex items-center gap-1.5">
          <span>🇰🇷</span>
          Korea<span style={{ color: "#f97316" }}>Mate</span>
        </Link>
        <h1 className="text-sm font-black text-white">My Planner</h1>
        <Link
          href="/"
          className="text-xs font-semibold text-white/60 hover:text-white transition-colors"
        >
          ← Back
        </Link>
      </header>

      {/* ── 바디: 좌/우 2컬럼 (모바일은 세로 스택) ── */}
      <div className="flex flex-col lg:flex-row flex-1 max-w-7xl mx-auto w-full gap-0 lg:gap-6 p-4 lg:p-6">

        {/* ════════════════════════════════════════
            왼쪽 패널 — 여행 설정 + 미배치 아이템
        ════════════════════════════════════════ */}
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-4">

          {/* Trip Setup 카드 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
              ✈️ Trip Setup
            </h2>

            {/* 여행 시작일 */}
            <label className="block mb-3">
              <span className="text-xs font-bold text-gray-500 block mb-1">Start Date (optional)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </label>

            {/* 여행 일수 */}
            <label className="block mb-4">
              <span className="text-xs font-bold text-gray-500 block mb-1">
                Number of Days: <strong className="text-gray-900">{numDays}</strong>
              </span>
              <input
                type="range"
                min={1}
                max={7}
                value={numDays}
                onChange={(e) => setNumDays(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>1 day</span><span>7 days</span>
              </div>
            </label>

            {/* 일별 도착 시각 */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-500">Arrival Time per Day</span>
              {tripDays.map((day, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700 w-12 shrink-0">
                    {day.label}
                    {day.date ? (
                      <span className="block text-[10px] font-normal text-gray-400">{day.date}</span>
                    ) : null}
                  </span>
                  <input
                    type="time"
                    value={arrivalTimes[i] ?? "09:00"}
                    onChange={(e) => setArrivalTime(i, e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 미배치 이벤트 풀 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-black text-gray-900 mb-1 flex items-center gap-2">
              📦 Unscheduled
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                {unscheduled.length}
              </span>
            </h2>
            <p className="text-[10px] text-gray-400 mb-3">
              Drag items onto a day to schedule them
            </p>

            {unscheduled.length === 0 ? (
              <p className="text-xs text-emerald-600 font-semibold text-center py-4">
                ✅ All events scheduled!
              </p>
            ) : (
              <ul className="space-y-2">
                {unscheduled.map((item) => (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow group"
                  >
                    {/* 썸네일 */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-200">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.shortName}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/images/placeholder-spot.svg";
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/images/placeholder-spot.svg" alt="" className="w-full h-full object-cover" />
                      )}
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{item.shortName}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {item.stage} · {item.recommendedDurationMinutes}min
                      </p>
                    </div>

                    {/* 드래그 핸들 */}
                    <span className="text-gray-300 text-base group-hover:text-gray-500 transition-colors">⠿</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ════════════════════════════════════════
            오른쪽 패널 — Day 탭 + TimelineView
        ════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Day 탭 */}
          <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-1.5 overflow-x-auto">
            {tripDays.map((day, i) => {
              const dayItemCount = (scheduled[i] ?? []).length;
              return (
                <button
                  key={i}
                  onClick={() => setActiveDay(i)}
                  className={`
                    shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all
                    ${activeDay === i
                      ? "text-white shadow-md"
                      : "text-gray-500 hover:bg-gray-50"
                    }
                  `}
                  style={activeDay === i ? { backgroundColor: "#1a1f36" } : {}}
                >
                  <span>{day.label}</span>
                  {day.date && (
                    <span className={`text-[10px] font-normal mt-0.5 ${activeDay === i ? "text-white/60" : "text-gray-400"}`}>
                      {day.date}
                    </span>
                  )}
                  {dayItemCount > 0 && (
                    <span
                      className="mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                      style={
                        activeDay === i
                          ? { backgroundColor: "#f97316", color: "#fff" }
                          : { backgroundColor: "#f3f4f6", color: "#374151" }
                      }
                    >
                      {dayItemCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 현재 날 요약 바 */}
          {todayItems.length > 0 && (
            <div
              className="flex items-center justify-between px-5 py-3 rounded-2xl text-sm"
              style={{ backgroundColor: "#1a1f36" }}
            >
              <div className="flex items-center gap-3 text-white">
                <span className="font-black">{tripDays[activeDay]?.label}</span>
                <span className="text-white/50">·</span>
                <span className="text-white/80">{todayItems.length} stops</span>
                <span className="text-white/50">·</span>
                <span className="text-white/80">{fmtDuration(todayMins)} total</span>
              </div>
              <span className="text-white/60 text-xs">
                Starts {tripDays[activeDay]?.arrivalTime}
              </span>
            </div>
          )}

          {/* TimelineView */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex-1">
            <TimelineView
              items={scheduled[activeDay] ?? []}
              arrivalTime={tripDays[activeDay]?.arrivalTime ?? "09:00"}
              date={tripDays[activeDay]?.date ?? ""}
              onRemoveItem={handleUnschedule}
              onMoveUp={(id) => handleMoveUp(id, activeDay)}
              onMoveDown={(id) => handleMoveDown(id, activeDay)}
              isDragOver={dragOver === activeDay}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(activeDay);
              }}
              onDrop={(e) => handleDropOnDay(e, activeDay)}
            />
          </div>

          {/* 하단 여백 (CartDrawer 가림 방지) */}
          <div className="h-20" />
        </main>
      </div>
    </div>
  );
}
